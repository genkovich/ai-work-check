// Standalone quiz checks. Run: node --test test/first-step.check.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const finalHtml = fs.readFileSync(new URL('../final.html', import.meta.url), 'utf8');
const fallback = fs.readFileSync(new URL('../questionnaire.md', import.meta.url), 'utf8');
const finalFallback = fs.readFileSync(new URL('../final-questionnaire.md', import.meta.url), 'utf8');
const part = (page, id) => page.match(new RegExp('<script id="' + id + '">([\\s\\S]*?)</script>'))[1];
const context = vm.createContext({});
vm.runInContext(part(html, 'audit-engine'), context);
const M = context.MiniAudit;
const A = M.create('start'), F = M.create('final');
const answers = (X, value) => Object.fromEntries(X.QUESTIONS.map(q => [q.id, value]));
const exported = (X, value) => X.makeExport(answers(X, value), '2026-09-06T10:00:00.000Z');
const clean = value => JSON.parse(JSON.stringify(value));
const words = s => s.replace(/[«»()"?:;.,]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
const DATE = '2026-09-06T10:00:00.000Z';
const parity = (X, md) => { for (const q of X.QUESTIONS) { const g = X.GROUPS[q.group]; assert.ok(md.includes('| '+q.number+' | '+q.text+' | '+g.name+' | '+X.linksText(g)+' | '+X.lessonText(g)+' |'), 'parity '+X.mode+' q'+q.number); } };

test('start: ten questions in five chain pairs, each mapped to links and a lesson, with Markdown parity', () => {
  assert.equal(A.mode, 'start');
  assert.equal(A.QUESTIONS.length, 10);
  assert.equal(new Set(A.QUESTIONS.map(q => q.id)).size, 10);
  assert.equal(A.GROUPS.length, 5);
  for (let i = 0; i < 5; i++) assert.equal(A.QUESTIONS.filter(q => q.group === i).length, 2);
  assert.deepEqual(clean(A.GROUPS.map(g => g.links)), [['Intent','Spec'],['Context'],['Plan','Implementation'],['Verification'],['Learning']]);
  assert.deepEqual(clean(A.GROUPS.map(g => g.lessons)), [[1,3],[2],[4],[5],[6]]);
  assert.deepEqual(clean(A.GROUPS.map(A.lessonText)), ['уроки 1 і 3','урок 2','урок 4','урок 5','урок 6']);
  assert.deepEqual(clean(A.CHAIN), ['Intent','Context','Spec','Plan','Implementation','Verification','Learning']);
  for (const g of A.GROUPS) { assert.ok(g.why.length > 20); for (const link of g.links) assert.ok(A.CHAIN.includes(link)); }
  parity(A, fallback);
  for (const q of A.QUESTIONS) {
    assert.ok(fallback.includes('### '+q.number+'. '+q.text), 'hint heading q'+q.number);
    assert.ok(fallback.includes(q.hint), 'hint text q'+q.number+' in md');
  }
});

test('final: 35 questions, seven per seam, same seams as the start, no module tags, Markdown parity', () => {
  assert.equal(F.mode, 'final');
  assert.equal(F.QUESTIONS.length, 35);
  assert.equal(new Set(F.QUESTIONS.map(q => q.id)).size, 35);
  assert.deepEqual(clean(F.QUESTIONS.map(q => q.id)), Array.from({length: 35}, (_, i) => 'q'+(i+1)));
  for (let i = 0; i < 5; i++) assert.equal(F.QUESTIONS.filter(q => q.group === i).length, 7);
  assert.deepEqual(clean(F.GROUPS), clean(A.GROUPS));
  for (const X of [A, F]) for (const q of X.QUESTIONS) assert.deepEqual(Object.keys(q), ['id','number','group','text','hint','next']);
  assert.ok(!('MODULES' in M)); assert.ok(!('MODULES' in F)); assert.ok(!('moduleScores' in F));
  parity(F, finalFallback);
});

test('final.html is index.html in final mode: same engine and UI byte for byte, own header, CTA only there', () => {
  assert.equal(part(finalHtml, 'audit-engine'), part(html, 'audit-engine'));
  assert.equal(part(finalHtml, 'audit-ui'), part(html, 'audit-ui'));
  assert.match(html, /<html lang="uk" data-mode="start">/); assert.match(finalHtml, /<html lang="uk" data-mode="final">/);
  assert.match(finalHtml, /<title>Як я працюю з AI після мінікурсу: 35 запитань<\/title>/);
  assert.match(finalHtml, /Мінікурс · урок 6 · фінальна анкета/);
  assert.match(finalHtml, /href="https:\/\/agenticengineering\.it\.com\/"[^>]*>Подати заявку на консультацію</);
  assert.match(finalHtml, /для завершення мінікурсу заявку подавати не потрібно/i);
  assert.doesNotMatch(html, /agenticengineering\.it\.com|Залишити анкету|Основна програма/);
  assert.match(html, /<!-- cta -->/); assert.doesNotMatch(finalHtml, /<!-- cta -->/);
  assert.match(finalHtml, /final-questionnaire\.md/); assert.doesNotMatch(html, /final-questionnaire\.md/);
  assert.match(html, /href="final(-step)?\.html"/);
  assert.match(html, /html\[data-mode="final"\] \.start-only,html\[data-mode="start"\] \.final-only\{display:none!important\}/);
});

test('five levels 0..4 plus a separate no-experience mark; start is v3, final is final-v2', () => {
  for (const X of [A, F]) {
    assert.deepEqual(clean(X.LEVELS.map(l => l.value)), [0,1,2,3,4]);
    assert.deepEqual(clean(X.LEVELS.map(l => l.label)), ['Ніколи','Рідко','У половині випадків','Майже завжди','Завжди']);
    assert.equal(X.MAX_LEVEL, 4); assert.equal(X.NONE, 'none'); assert.equal(X.NONE_LABEL, 'Ще не було такої ситуації');
    assert.equal(X.answerLabel(2), '2 · У половині випадків'); assert.equal(X.answerLabel('none'), X.NONE_LABEL);
    assert.equal(X.STRONG_SHARE, 0.75); assert.equal(X.WEAK_SHARE, 0.5);
  }
  assert.equal(A.VERSION, 'mini-audit-v3'); assert.equal(F.VERSION, 'mini-audit-final-v2');
  assert.equal(M.SETS.start.version, A.VERSION); assert.equal(M.SETS.final.version, F.VERSION);
  for (const md of [fallback, finalFallback]) for (const l of A.LEVELS) assert.ok(md.includes('**'+l.value+': '+l.label+'**'), 'level '+l.value+' in md');
  assert.throws(() => M.create('other')); assert.throws(() => M.create('constructor'));
});

test('blank and partial answers cannot produce an export', () => {
  for (const X of [A, F]) {
    assert.equal(X.calculate({}).answered, 0);
    const partial = X.calculate({q1:4, q2:'none', q3:2});
    assert.deepEqual([partial.answered, partial.total, partial.max, partial.applicable, partial.withoutExperience], [3,6,8,2,1]);
    assert.throws(() => X.makeExport({}));
    assert.throws(() => X.makeExport({q1:'none'}));
    const short = answers(X, 4); delete short[X.QUESTIONS.at(-1).id]; assert.throws(() => X.makeExport(short));
    assert.throws(() => X.nextStep(short));
  }
});

test('all 4 = 40/40 on start and 140/140 on final; all 2 and all 0 scale with it', () => {
  for (const [X, full, perGroup] of [[A, 40, 8], [F, 140, 28]]) for (const [level, share] of [[4,1],[2,.5],[0,0]]) {
    const r = X.calculate(answers(X, level));
    assert.equal(r.total, full*share); assert.equal(r.max, full); assert.equal(r.applicable, X.QUESTIONS.length); assert.equal(r.withoutExperience, 0);
    assert.equal(X.scoreText(r), full*share+' / '+full);
    for (const g of r.groups) assert.equal(g.max, perGroup);
    assert.deepEqual(Object.keys(r), ['answered','total','max','applicable','withoutExperience','groups']);
  }
});

test('all none is complete and unscored: no weakest group, empty seam summary, first habit from question 1, Markdown without 0/0', () => {
  for (const X of [A, F]) {
    const data = exported(X, 'none');
    assert.equal(data.result.answered, X.QUESTIONS.length); assert.equal(data.result.withoutExperience, X.QUESTIONS.length); assert.equal(data.result.max, 0);
    assert.equal(X.scoreText(data.result), 'Поки немає досвіду для порівняння');
    for (const g of data.result.groups) assert.equal(X.scoreText(g), 'Поки немає досвіду для порівняння');
    assert.equal(X.weakestGroup(data.result), null);
    assert.match(X.weakestText(data.result), /Intent/); assert.match(X.weakestText(data.result), /урок 1/);
    assert.deepEqual(clean(X.seamSummary(data.result)), {strong:[], middle:[], weak:[]});
    assert.match(X.seamText(data.result), /^Поки немає досвіду/);
    assert.equal(X.nextStep(data.answers).question.id, 'q1');
    assert.equal(X.nextStep(data.answers).text, X.QUESTIONS[0].next);
    assert.doesNotMatch(X.markdown(data), /NaN|Infinity|0\s*\/\s*0|undefined|null/);
  }
});

test('mixed answers use the applicable denominator per group and overall', () => {
  const mixed = {q1:4, q2:'none', q3:2, q4:0, q5:'none', q6:'none', q7:4, q8:3, q9:1, q10:'none'};
  const r = A.calculate(mixed);
  assert.deepEqual([r.total, r.max, r.applicable, r.withoutExperience], [14,24,6,4]);
  assert.deepEqual(clean(r.groups.map(g => [g.total, g.max, g.applicable, g.withoutExperience])), [[4,4,1,1],[2,8,2,0],[0,0,0,2],[7,8,2,0],[1,4,1,1]]);
  const fin = answers(F, 3); fin.q17 = 'none'; fin.q21 = 0; fin.q24 = 'none'; fin.q30 = 4;
  const f = F.calculate(fin);
  assert.deepEqual([f.total, f.max, f.applicable, f.withoutExperience], [31*3+0+4, 33*4, 33, 2]);
  assert.deepEqual(clean(f.groups.map(g => [g.total, g.max, g.applicable, g.withoutExperience])), [[21,28,7,0],[21,28,7,0],[15,24,6,1],[18,24,6,1],[22,28,7,0]]);
});

test('weakest group: lowest share wins, ties go to the earliest link, all-max still names the first group', () => {
  const low = answers(A, 4); low.q7 = 0; low.q8 = 0;
  const w = A.weakestGroup(A.calculate(low));
  assert.equal(w.id, 3); assert.equal(w.name, 'Перевірка результату'); assert.deepEqual(clean(w.links), ['Verification']); assert.deepEqual(clean(w.lessons), [5]);
  assert.match(A.weakestText(A.calculate(low)), /^Перевірка результату \(Verification\), 0 з 8\. У курсі це урок 5\. /);
  const tie = answers(A, 4); tie.q3 = 2; tie.q9 = 2;
  assert.equal(A.weakestGroup(A.calculate(tie)).id, 1);
  const share = answers(A, 4); share.q1 = 'none'; share.q2 = 2; share.q9 = 3; share.q10 = 3;
  assert.equal(A.weakestGroup(A.calculate(share)).id, 0);
  const late = answers(A, 4); late.q1 = 3; late.q9 = 1;
  assert.equal(A.weakestGroup(A.calculate(late)).id, 4);
  assert.equal(A.weakestGroup(A.calculate(answers(A, 4))).id, 0);
  assert.match(A.weakestText(A.calculate(answers(A, 4))), /не просідає/);
  assert.match(A.weakestText(A.calculate(answers(A, 4))), /уроки 1 і 3/);
  assert.throws(() => A.weakestGroup({}));
  const fin = answers(F, 4); for (let i = 22; i <= 28; i++) fin['q'+i] = 1;
  assert.equal(F.weakestGroup(F.calculate(fin)).id, 3);
  assert.match(F.weakestText(F.calculate(fin)), /^Перевірка результату \(Verification\), 7 з 28\. У мінікурсі це урок 5\. /);
});

test('seam summary: three quarters and up holds, under a half sags, the rest in between, chain order inside each bucket, unrated seams skipped', () => {
  const a = answers(F, 4);
  for (let i = 8; i <= 14; i++) a['q'+i] = 2;
  for (let i = 22; i <= 28; i++) a['q'+i] = 1;
  for (let i = 29; i <= 35; i++) a['q'+i] = 'none';
  a.q33 = 1;
  const r = F.calculate(a), s = F.seamSummary(r);
  assert.deepEqual(clean(s.strong.map(g => [g.id, g.total, g.max])), [[0,28,28],[2,28,28]]);
  assert.deepEqual(clean(s.middle.map(g => [g.id, g.total, g.max])), [[1,14,28]]);
  assert.deepEqual(clean(s.weak.map(g => [g.id, g.total, g.max])), [[3,7,28],[4,1,4]]);
  assert.deepEqual(Object.keys(clean(s.strong[0])), ['id','name','total','max','applicable','withoutExperience','links','lessons','why','share']);
  assert.equal(F.seamText(r), 'Сильні: Зрозуміла задача (28 з 28), Робота по кроках (28 з 28). Посередині: Потрібна інформація (14 з 28). Слабкі: Перевірка результату (7 з 28), Корисні висновки (1 з 4).');
  const edge = answers(F, 4); for (let i = 1; i <= 7; i++) edge['q'+i] = 3; for (let i = 8; i <= 14; i++) edge['q'+i] = i === 8 ? 0 : 2;
  const e = F.seamSummary(F.calculate(edge));
  assert.deepEqual(clean(e.strong.map(g => g.id)), [0,2,3,4]);
  assert.deepEqual(clean(e.middle.map(g => g.id)), []);
  assert.deepEqual(clean(e.weak.map(g => g.id)), [1]);
  assert.match(F.seamText(F.calculate(answers(F, 4))), /^Сильні: .*Корисні висновки \(28 з 28\)\.$/);
  assert.doesNotMatch(F.seamText(F.calculate(answers(F, 4))), /Посередині|Слабкі/);
  assert.match(F.seamText(F.calculate(answers(F, 0))), /^Слабкі: /);
  const onlyOne = answers(F, 'none'); onlyOne.q15 = 3;
  assert.equal(F.seamText(F.calculate(onlyOne)), 'Сильні: Робота по кроках (3 з 4).');
  assert.equal(A.seamText(A.calculate(answers(A, 2))), 'Посередині: Зрозуміла задача (4 з 8), Потрібна інформація (4 з 8), Робота по кроках (4 з 8), Перевірка результату (4 з 8), Корисні висновки (4 з 8).');
  assert.throws(() => F.seamSummary({}));
});

test('first habit: earliest question with the lowest level; all 4 = habits in place; none-only questions skipped', () => {
  const low = answers(A, 4); low.q7 = 0; low.q8 = 0;
  assert.equal(A.nextStep(low).question.id, 'q7'); assert.equal(A.nextStep(low).text, A.QUESTIONS[6].next);
  const later = answers(A, 4); later.q2 = 3; later.q9 = 1;
  assert.equal(A.nextStep(later).question.id, 'q9');
  const skip = answers(A, 4); skip.q1 = 'none'; skip.q4 = 1; skip.q8 = 1;
  assert.equal(A.nextStep(skip).question.id, 'q4');
  const top = A.nextStep(answers(A, 4)); assert.equal(top.question, null); assert.match(top.text, /на місці/);
  const mostlyNone = answers(A, 'none'); mostlyNone.q10 = 4;
  assert.equal(A.nextStep(mostlyNone).question, null);
  const fin = answers(F, 3); fin.q35 = 0; fin.q12 = 0;
  assert.equal(F.nextStep(fin).question.id, 'q12'); assert.equal(F.nextStep(fin).text, F.QUESTIONS[11].next);
});

test('export carries version and mode, keeps the v1-shaped result, survives a JSON round trip and rejects the other mode', () => {
  for (const [X, version] of [[A, 'mini-audit-v3'], [F, 'mini-audit-final-v2']]) {
    const data = exported(X, 3);
    assert.equal(data.version, version); assert.equal(data.mode, X.mode); assert.equal(data.date, DATE);
    assert.deepEqual(Object.keys(data), ['version','mode','date','answers','result']);
    assert.deepEqual(Object.keys(data.result), ['answered','total','max','applicable','withoutExperience','groups']);
    assert.deepEqual(Object.keys(data.result.groups[0]), ['id','name','total','max','applicable','withoutExperience']);
    const parsed = JSON.parse(JSON.stringify(data));
    assert.deepEqual(clean(X.calculate(X.validateAnswers(parsed.answers, true))), parsed.result);
    assert.deepEqual(clean(X.makeExport(parsed.answers, parsed.date)), parsed);
    assert.deepEqual(Object.keys(parsed.answers), clean(X.QUESTIONS.map(q => q.id)));
    const shuffled = Object.fromEntries([...X.QUESTIONS].reverse().map((q, i) => [q.id, i % 2 ? 'none' : i % 5]));
    assert.deepEqual(Object.keys(X.makeExport(shuffled, DATE).answers), clean(X.QUESTIONS.map(q => q.id)));
  }
  assert.throws(() => F.markdown(exported(A, 3))); assert.throws(() => A.markdown(exported(F, 3)));
  assert.throws(() => A.markdown({...exported(A, 3), mode:'final'}));
});

test('unknown ids, out-of-range levels, strings, prototype keys and foreign versions are rejected', () => {
  for (const X of [A, F]) {
    for (const invalid of [null, -1, 5, 1.5, '1', 'A', '', 'constructor', '<img src=x onerror=alert(1)>', true, [], {}, NaN]) assert.throws(() => X.calculate({q1: invalid}), 'accepted '+String(invalid));
    assert.throws(() => X.calculate({['q'+(X.QUESTIONS.length+1)]: 4}));
    assert.throws(() => X.calculate(JSON.parse('{"__proto__":4}')));
    assert.throws(() => X.calculate(null)); assert.throws(() => X.calculate([])); assert.throws(() => X.calculate('q1'));
    assert.throws(() => X.markdown({version:'mini-audit-v2', mode:X.mode, date:DATE, answers: answers(X, 3)}));
    assert.throws(() => X.markdown({version:'mini-audit-v1', mode:X.mode, date:DATE, answers: answers(X, 'A')}));
    assert.throws(() => X.markdown({...exported(X, 4), version:'future-v9'}));
  }
  assert.throws(() => A.calculate({q11: 4})); assert.throws(() => F.calculate({q36: 4}));
});

test('start Markdown carries the chain, every group with links and lesson, the weakest seam and every answer', () => {
  const low = answers(A, 4); low.q7 = 0; low.q8 = 'none'; low.q10 = 2;
  const md = A.markdown(A.makeExport(low, DATE));
  assert.match(md, /^# Як я працюю з AI: 10 простих запитань\n/);
  assert.match(md, /Ланцюг курсу: Intent, Context, Spec, Plan, Implementation, Verification, Learning/);
  for (const q of A.QUESTIONS) assert.ok(md.includes(q.text));
  for (const g of A.GROUPS) assert.ok(md.includes('| '+g.name+' | '+A.linksText(g)+' | '+A.lessonText(g)+' | '));
  assert.match(md, /## Найслабший стик\n\nПеревірка результату \(Verification\), 0 з 4\. У курсі це урок 5\./);
  assert.match(md, /## Перша звичка по ланцюгу\n\n/); assert.ok(md.includes(A.QUESTIONS[6].next));
  assert.ok(md.includes('| 8 | '+A.QUESTIONS[7].text+' | Ще не було такої ситуації | Без бала |'));
  assert.ok(md.includes('| 10 | '+A.QUESTIONS[9].text+' | 2 · У половині випадків | 2 |'));
  assert.match(md, /Бали: 30 \/ 36/); assert.match(md, /Поза підрахунком: 1 із 10/); assert.match(md, /Версія: mini-audit-v3/);
  assert.doesNotMatch(md, /Сильні й слабкі стики|модул/i);
  assert.doesNotMatch(md, /NaN|undefined|null|0\s*\/\s*0/);
});

test('final Markdown adds the seam summary between the weakest seam and the first habit, answers without extra columns', () => {
  const a = answers(F, 4); for (let i = 22; i <= 28; i++) a['q'+i] = 1; a.q17 = 'none'; a.q5 = 2;
  const md = F.markdown(F.makeExport(a, DATE));
  assert.match(md, /^# Як я працюю з AI після мінікурсу: 35 запитань\n/);
  assert.match(md, /Версія: mini-audit-final-v2/); assert.match(md, /Бали: 113 \/ 136/); assert.match(md, /Поза підрахунком: 1 із 35/);
  assert.match(md, /## Найслабший стик\n\nПеревірка результату \(Verification\), 7 з 28\. У мінікурсі це урок 5\. [^\n]+\n\n## Сильні й слабкі стики\n\nСильні: Зрозуміла задача \(26 з 28\), Потрібна інформація \(28 з 28\), Робота по кроках \(24 з 24\), Корисні висновки \(28 з 28\)\. Слабкі: Перевірка результату \(7 з 28\)\.\n\n## Перша звичка по ланцюгу\n\n/);
  assert.match(md, /## Пʼять стиків\n\n\| Стик \| Ланки \| Урок \| Бали \| Поза підрахунком \|/);
  assert.match(md, /## Відповіді\n\n\| № \| Запитання \| Відповідь \| Бали \|\n\|---\|---\|---\|---\|\n/);
  assert.ok(md.includes('| 22 | '+F.QUESTIONS[21].text+' | 1 · Рідко | 1 |'));
  assert.ok(md.includes('| 17 | '+F.QUESTIONS[16].text+' | Ще не було такої ситуації | Без бала |'));
  assert.doesNotMatch(md, /\bM\d{1,2}\b|основн(а|ої) програм|Де це в основній програмі|Найслабші модулі|\| Модуль \|/i);
  assert.doesNotMatch(md, /NaN|undefined|null|0\s*\/\s*0/);
});

test('wording gates on all 45 questions: at most 25 words, no dashes or ellipsis, no "не X, а Y", hint 60-260 characters, final free of course map', () => {
  for (const X of [A, F]) for (const q of X.QUESTIONS) {
    const all = q.text+' '+q.hint+' '+q.next;
    assert.ok(words(q.text) <= 25, 'words q'+q.number+' '+X.mode+': '+words(q.text));
    assert.ok(q.text.endsWith('?'), 'question mark q'+q.number+' '+X.mode);
    assert.doesNotMatch(all, /[—–…]/, 'dash q'+q.number+' '+X.mode);
    assert.doesNotMatch(all, /\bне [^,]{1,40}, а /, 'antithesis q'+q.number+' '+X.mode);
    assert.ok(q.hint.length >= 60 && q.hint.length <= 260, 'hint '+q.number+' '+X.mode+': '+q.hint.length);
    assert.ok(q.next.length >= 40 && q.next.length <= 200, 'next '+q.number+' '+X.mode);
    assert.doesNotMatch(all, /основн(а|ої) програм|\bM\d{1,2}\b|\/sdd:|Ralph|4D|idea-brief|LEGACY\.md|files_hint|test-author|implementer/, 'course map leak q'+q.number+' '+X.mode);
  }
  for (const g of A.GROUPS) assert.doesNotMatch(g.why, /[—–…]/);
  assert.doesNotMatch(html.replace(/<style>[\s\S]*?<\/style>/, ''), /[—–…]/);
});

test('offline UI on both pages: no remote resources, storage, HTML sinks or file import; motion respects reduced-motion', () => {
  for (const page of [html, finalHtml]) {
    assert.doesNotMatch(page, /<script[^>]+src=|<link[^>]+href=|@import|url\(|\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|innerHTML|outerHTML|insertAdjacentHTML|document\.write|type="file"|parseImport|eval\(/);
    assert.match(page, /default-src 'none'/); assert.match(page, /connect-src 'none'/); assert.match(page, /el\.textContent=text/);
    assert.doesNotMatch(page, /checked\s*=|\.checked\s*=/);
    assert.match(page, /disabled>Завантажити Markdown/); assert.match(page, /disabled>Завантажити result\.json/);
    assert.match(page, /complete=result\.answered===N/);
    assert.match(page, /prefers-reduced-motion: ?reduce/); assert.match(page, /stroke-dashoffset/); assert.match(page, /IntersectionObserver/); assert.match(page, /requestAnimationFrame/);
    assert.match(page, /@media print/);
  }
});

test('page copy: chain intro, shopping-list example before questions on start, seam summary and CTA on final, no module map or import anywhere', () => {
  assert.match(html, /Мінікурс · урок 1 · стартова анкета/);
  assert.ok(html.indexOf('списком покупок') < html.indexOf('id="questions"'));
  assert.match(html, /Створювати застосунок зараз не потрібно/);
  assert.match(html, /Найслабший стик/); assert.match(html, /Перша звичка по ланцюгу/);
  assert.match(html, /низький результат на старті очікуваний/);
  assert.match(html, /3 або 4 став лише тоді/);
  assert.match(html, /фінальна анкета на 35 запитань/);
  assert.match(html, /<div class="panel example start-only">/);
  assert.match(html, /<div class="panel seams-panel final-only"><p class="panel-cap">Сильні й слабкі стики<\/p><p id="seams"><\/p><\/div>/);
  for (const page of [html, finalHtml]) assert.doesNotMatch(page, /[Іі]мпорт|попередній результат|A\/B\/C\/D|Так, зазвичай|Де це в основній програмі|Найслабші модулі|тег модуля|\bM1\b|M11/);
  assert.match(finalHtml, /необовʼязковий огляд тем/);
  assert.match(finalHtml, /<div class="panel cta final-only" id="cta"><p class="panel-cap">Що далі<\/p>/);
  assert.match(fallback, /Download ZIP/); assert.ok(/genkovich\.github\.io\/ai-work-check|\.\.\/first-step\.html/.test(fallback));
  assert.match(fallback, /## Як читати результат/); assert.match(fallback, /низький результат на старті очікуваний/);
  assert.ok(/final\.html|\.\.\/final-step\.html/.test(fallback));
  assert.match(finalFallback, /Download ZIP/); assert.ok(/genkovich\.github\.io\/ai-work-check\/final\.html|\.\.\/final-step\.html/.test(finalFallback));
  assert.match(finalFallback, /## Як читати результат/); assert.match(finalFallback, /Сильні й слабкі стики/); assert.match(finalFallback, /необовʼязковий огляд тем/);
  assert.match(finalFallback, /agenticengineering\.it\.com/); assert.doesNotMatch(finalFallback, /Молоко|Куплено|\bM\d{1,2}\b|Де це в основній програмі|Найслабші модулі|таблиц[яі] модулів|\| Модуль \||основн(а|ої) програми біля/i);
  for (const md of [fallback, finalFallback]) { assert.doesNotMatch(md, /імпортуй|[Іі]мпорту? |A\/B\/C\/D|Так, зазвичай|[—–…]/); assert.doesNotMatch(md, /\bне [^,]{1,40}, а /); }
});

test('FINAL35 v2 is an optional topic inventory, not a progress metric or a mandate to add tools', () => {
  assert.equal(createHash('sha256').update(JSON.stringify(M.SETS.start)).digest('hex'), '8a942e401ababd09f7b566bfce84c682a29f06a0ee170920c73f84bdcf349058', 'START10 remains byte-stable as data');
  const q = number => F.QUESTIONS[number - 1].text + ' ' + F.QUESTIONS[number - 1].hint + ' ' + F.QUESTIONS[number - 1].next;
  assert.match(q(7), /SAD/); assert.match(q(7), /OpenAPI потрібен не завжди/);
  for (const tool of ['AGENTS.md', 'CLAUDE.md', 'Cursor']) assert.ok(q(8).includes(tool));
  assert.match(q(12), /MCP є одним зі способів/);
  assert.match(q(19), /послідовно/); assert.match(q(21), /послідовну роботу/);
  assert.match(q(20), /не гарантує зупинки/);
  assert.match(q(23), /наявність CI сама цього не гарантує/);
  assert.match(q(29), /достатньо короткого шаблону/);
  assert.match(q(31), /сам не доводить причину/);
  for (const page of [html, finalHtml]) {
    assert.match(page, /START10 та FINAL35 мають різні запитання/);
    assert.match(page, /Один навчальний випадок ще не доводить/);
    assert.doesNotMatch(page, /складніших за стартові|по них видно, що змінилось/);
  }
  for (const text of [finalFallback, F.markdown(exported(F, 3))]) {
    assert.match(text, /mini-audit-final-v2/);
    assert.match(text, /не порівню/);
    assert.match(text, /необовʼязковий огляд тем/);
  }
  assert.throws(() => F.markdown({...exported(F, 3), version:'mini-audit-final-v1'}));
});
