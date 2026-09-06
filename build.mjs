#!/usr/bin/env node
// Builds final.html from index.html; with --kit <dir> also writes the package copies.
// index.html, questionnaire.md, final-questionnaire.md and test/first-step.check.mjs are the sources.
// Every replacement needs its anchor exactly once, so a drifted source fails loudly instead of silently.
// Run: node build.mjs [--kit ../agentic-engineering-mini-kit]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const site = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const kitFlag = args.indexOf('--kit');
const kit = kitFlag === -1 ? null : path.resolve(args[kitFlag + 1] || '');
if (kitFlag !== -1 && (!kit || !fs.existsSync(kit))) { console.error('usage: node build.mjs [--kit <package dir>]'); process.exit(2); }

const read = file => fs.readFileSync(path.join(site, file), 'utf8');
const written = [];
function write(root, file, text) {
  const target = path.join(root, file);
  const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null;
  if (before !== text) fs.writeFileSync(target, text);
  written.push(path.relative(process.cwd(), target) + (before === text ? ' (unchanged)' : ''));
}
function must(text, from, to, label) {
  const parts = text.split(from);
  if (parts.length !== 2) throw new Error('anchor ' + (parts.length === 1 ? 'missing' : 'not unique') + ': ' + label);
  return parts.join(to);
}

const PAGES_SENTENCE = ' На вебсторінці GitHub обробляє звичайні дані відвідування, сама анкета твоїх відповідей не надсилає.';
const NOSCRIPT = name => '<noscript><p>Щоб заповнити анкету тут, увімкни JavaScript у браузері. Або скористайся <a href="https://github.com/genkovich/ai-work-check/blob/main/' + name + '">текстовою версією</a>.</p></noscript>';
const NOSCRIPT_KIT = name => '<noscript><p>Щоб заповнити анкету тут, увімкни JavaScript у браузері. Або скористайся текстовою версією: ' + name + '.</p></noscript>';

// 1. final.html: the same file in final mode with its own header and the CTA block.
const index = read('index.html');
let final = index;
final = must(final, '<html lang="uk" data-mode="start">', '<html lang="uk" data-mode="final">', 'mode');
final = must(final,
  '<meta name="description" content="Стартова анкета мінікурсу: 10 запитань про практики роботи з AI по ланцюгу курсу. Результат показує найслабший стик і урок, з якого починати.">',
  '<meta name="description" content="Фінальна анкета мінікурсу: 35 складніших запитань про роботу з агентами по пʼяти стиках ланцюга. Результат показує, які стики тримаються, а які просідають.">',
  'description');
final = must(final, '<title>Як я працюю з AI: 10 простих запитань</title>', '<title>Як я працюю з AI після мінікурсу: 35 запитань</title>', 'title');
final = must(final, '<div class="eyebrow">Мінікурс · урок 1 · стартова анкета</div>', '<div class="eyebrow">Мінікурс · урок 6 · фінальна анкета</div>', 'eyebrow');
final = must(final, '<h1>Як я працюю з AI: <span class="hl">10 простих запитань</span></h1>', '<h1>Як я працюю з AI після мінікурсу: <span class="hl">35 запитань</span></h1>', 'h1');
final = must(final,
  '<p class="intro">Десять запитань ідуть по ланцюгу курсу, по два на кожен стик між етапами роботи з агентом. Кожне про конкретну практику, якої курс і вчить, тому низький результат на старті очікуваний. Результат покаже, який стик просідає найбільше і з якого уроку його підтягувати.</p>',
  '<p class="intro">Тридцять пʼять запитань про роботу з агентами, складніших за стартові, по сім на кожен стик ланцюга. Результат покаже, які стики тримаються після мінікурсу, а де досвіду ще мало.</p>',
  'intro');
final = must(final, NOSCRIPT('questionnaire.md'), NOSCRIPT('final-questionnaire.md'), 'noscript');
final = must(final, '<!-- cta -->',
  '<div class="panel cta final-only" id="cta"><p class="panel-cap">Що далі</p><p>Основна програма Agentic Engineering проходить ці практики на власному проєкті до релізу і спостереження після нього. Для завершення мінікурсу заповнювати анкету не треба.</p><p><a class="cta-link" href="https://agenticengineering.it.com/" rel="noopener">Залишити анкету</a></p></div>',
  'cta');
write(site, 'final.html', final);

// 2. Package copies: same pages and texts, links point inside the package, no GitHub Pages sentence.
if (kit) {
  let start = index;
  start = must(start, NOSCRIPT('questionnaire.md'), NOSCRIPT_KIT('templates/01-ai-development-audit.md'), 'kit noscript');
  start = must(start, PAGES_SENTENCE, '', 'kit pages sentence');
  start = must(start, 'href="final.html"', 'href="final-step.html"', 'kit final link');
  write(kit, 'first-step.html', start);

  let end = final;
  end = must(end, NOSCRIPT('final-questionnaire.md'), NOSCRIPT_KIT('templates/07-final-questionnaire.md'), 'kit final noscript');
  end = must(end, PAGES_SENTENCE, '', 'kit final pages sentence');
  write(kit, 'final-step.html', end);

  let md = read('questionnaire.md');
  md = must(md,
    'Відкрий [анкету на окремій сторінці](https://genkovich.github.io/ai-work-check/): там є пояснення до кожного запитання, а бали, найслабший стик і таблиця зʼявляться автоматично. Встановлювати щось або входити в GitHub не потрібно. Для роботи без інтернету можна завантажити цей репозиторій через **Code → Download ZIP**, розпакувати архів і відкрити `index.html` у браузері. Запускати сервер не потрібно. Анкета не надсилає відповіді назовні.',
    'Найзручніше відкрити [анкету в браузері](../first-step.html): вона сама порахує бали, покаже найслабший стик і збере таблицю. На GitHub HTML показується як файл, тому спочатку вибери **Code → Download ZIP**, розпакуй архів і відкрий `first-step.html` у браузері. Встановлювати щось або запускати сервер не потрібно. Анкета працює локально й не надсилає відповіді назовні.',
    'md intro');
  md = must(md,
    'Наприкінці курсу є [фінальна анкета на 35 запитань](https://genkovich.github.io/ai-work-check/final.html), текстова версія в [final-questionnaire.md](final-questionnaire.md).',
    'Наприкінці курсу є [фінальна анкета на 35 запитань](../final-step.html), текстова версія в [07-final-questionnaire.md](07-final-questionnaire.md).',
    'md final link');
  write(kit, 'templates/01-ai-development-audit.md', md);

  let fmd = read('final-questionnaire.md');
  fmd = must(fmd,
    'Відкрий [фінальну анкету на окремій сторінці](https://genkovich.github.io/ai-work-check/final.html): там є підказка до кожного запитання, а бали, найслабший стик і зведення по стиках зʼявляться автоматично. Для роботи без інтернету можна завантажити цей репозиторій через **Code → Download ZIP**, розпакувати архів і відкрити `final.html` у браузері. Анкета не надсилає відповіді назовні.',
    'Найзручніше відкрити [фінальну анкету в браузері](../final-step.html): вона сама порахує бали, покаже найслабший стик і зведення по стиках. На GitHub HTML показується як файл, тому спочатку вибери **Code → Download ZIP**, розпакуй архів і відкрий `final-step.html` у браузері. Анкета працює локально й не надсилає відповіді назовні.',
    'final md intro');
  fmd = must(fmd, 'Стартова анкета: [questionnaire.md](questionnaire.md).', 'Стартова анкета: [01-ai-development-audit.md](01-ai-development-audit.md).', 'final md start link');
  write(kit, 'templates/07-final-questionnaire.md', fmd);

  let t = read('test/first-step.check.mjs');
  t = must(t, 'Run: node --test test/first-step.check.mjs', "Run: node --test test/first-step.check.js\n// Deliberately outside *.test.js: the dashboard's existing verify suite is unchanged.", 'run line');
  t = must(t, "new URL('../index.html', import.meta.url)", "new URL('../first-step.html', import.meta.url)", 'html path');
  t = must(t, "new URL('../final.html', import.meta.url)", "new URL('../final-step.html', import.meta.url)", 'final html path');
  t = must(t, "new URL('../questionnaire.md', import.meta.url)", "new URL('../templates/01-ai-development-audit.md', import.meta.url)", 'md path');
  t = must(t, "new URL('../final-questionnaire.md', import.meta.url)", "new URL('../templates/07-final-questionnaire.md', import.meta.url)", 'final md path');
  write(kit, 'test/first-step.check.js', t);
}

console.log('built: ' + written.join(', '));
