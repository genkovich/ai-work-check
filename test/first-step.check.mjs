// Standalone quiz checks. Run: node --test test/first-step.check.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fallback = fs.readFileSync(new URL('../questionnaire.md', import.meta.url), 'utf8');
const source = html.match(/<script id="audit-engine">([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({});
vm.runInContext(source, context);
const A = context.MiniAudit;
const answers = value => Object.fromEntries(A.QUESTIONS.map(q => [q.id, value]));
const exported = value => A.makeExport(answers(value), '2026-09-06T10:00:00.000Z');
const clean = value => JSON.parse(JSON.stringify(value));

test('ten questions in five chain pairs, each mapped to links and a lesson, with Markdown parity', () => {
  assert.equal(A.QUESTIONS.length, 10);
  assert.equal(new Set(A.QUESTIONS.map(q => q.id)).size, 10);
  assert.equal(A.GROUPS.length, 5);
  for (let i = 0; i < 5; i++) assert.equal(A.QUESTIONS.filter(q => q.group === i).length, 2);
  assert.deepEqual(clean(A.GROUPS.map(g => g.links)), [['Intent','Spec'],['Context'],['Plan','Implementation'],['Verification'],['Learning']]);
  assert.deepEqual(clean(A.GROUPS.map(g => g.lessons)), [[1,3],[2],[4],[5],[6]]);
  assert.deepEqual(clean(A.GROUPS.map(A.lessonText)), ['уроки 1 і 3','урок 2','урок 4','урок 5','урок 6']);
  assert.deepEqual(clean(A.CHAIN), ['Intent','Context','Spec','Plan','Implementation','Verification','Learning']);
  for (const g of A.GROUPS) { assert.ok(g.why.length > 20); for (const link of g.links) assert.ok(A.CHAIN.includes(link)); }
  for (const q of A.QUESTIONS) {
    const g = A.GROUPS[q.group];
    assert.ok(fallback.includes('| '+q.number+' | '+q.text+' | '+g.name+' | '+A.linksText(g)+' | '+A.lessonText(g)+' |'), 'parity q'+q.number);
    assert.ok(fallback.includes('### '+q.number+'. '+q.text), 'hint heading q'+q.number);
  }
});

test('five levels 0..4 plus a separate no-experience mark, version v2', () => {
  assert.deepEqual(clean(A.LEVELS.map(l => l.value)), [0,1,2,3,4]);
  assert.deepEqual(clean(A.LEVELS.map(l => l.label)), ['Ніколи','Рідко','У половині випадків','Майже завжди','Завжди']);
  assert.equal(A.MAX_LEVEL, 4);
  assert.equal(A.NONE, 'none'); assert.equal(A.NONE_LABEL, 'Ще не було такої ситуації');
  assert.equal(A.VERSION, 'mini-audit-v2');
  for (const l of A.LEVELS) assert.ok(fallback.includes('**'+l.value+': '+l.label+'**'), 'level '+l.value+' in md');
  assert.equal(A.answerLabel(2), '2 · У половині випадків'); assert.equal(A.answerLabel('none'), A.NONE_LABEL);
});

test('blank and partial answers cannot produce an export', () => {
  assert.equal(A.calculate({}).answered, 0);
  const partial = A.calculate({q1:4, q2:'none', q3:2});
  assert.deepEqual([partial.answered, partial.total, partial.max, partial.applicable, partial.withoutExperience], [3,6,8,2,1]);
  assert.throws(() => A.makeExport({}));
  assert.throws(() => A.makeExport({q1:'none'}));
  const nine = answers(4); delete nine.q10; assert.throws(() => A.makeExport(nine));
  assert.throws(() => A.nextStep(nine));
});

test('all 4 = 40/40, all 2 = 20/40, all 0 = 0/40', () => {
  for (const [level, total] of [[4,40],[2,20],[0,0]]) {
    const r = A.calculate(answers(level));
    assert.equal(r.total, total); assert.equal(r.max, 40); assert.equal(r.applicable, 10); assert.equal(r.withoutExperience, 0);
    assert.equal(A.scoreText(r), total+' / 40');
    for (const g of r.groups) assert.equal(g.max, 8);
  }
});

test('all none is complete and unscored: no weakest group, first habit from question 1, Markdown without 0/0', () => {
  const data = exported('none');
  assert.equal(data.result.answered, 10); assert.equal(data.result.withoutExperience, 10); assert.equal(data.result.max, 0);
  assert.equal(A.scoreText(data.result), 'Поки немає досвіду для порівняння');
  for (const g of data.result.groups) assert.equal(A.scoreText(g), 'Поки немає досвіду для порівняння');
  assert.equal(A.weakestGroup(data.result), null);
  assert.match(A.weakestText(data.result), /Intent/); assert.match(A.weakestText(data.result), /урок 1/);
  assert.equal(A.nextStep(data.answers).question.id, 'q1');
  assert.match(A.nextStep(data.answers).text, /одне речення про бажаний результат/);
  assert.doesNotMatch(A.markdown(data), /NaN|Infinity|0\s*\/\s*0|undefined|null/);
});

test('mixed answers use the applicable denominator per group and overall', () => {
  const mixed = {q1:4, q2:'none', q3:2, q4:0, q5:'none', q6:'none', q7:4, q8:3, q9:1, q10:'none'};
  const r = A.calculate(mixed);
  assert.deepEqual([r.total, r.max, r.applicable, r.withoutExperience], [14,24,6,4]);
  assert.deepEqual(clean(r.groups.map(g => [g.total, g.max, g.applicable, g.withoutExperience])), [[4,4,1,1],[2,8,2,0],[0,0,0,2],[7,8,2,0],[1,4,1,1]]);
});

test('weakest group: lowest share wins, ties go to the earliest link, all-max still names the first group', () => {
  const low = answers(4); low.q7 = 0; low.q8 = 0;
  const w = A.weakestGroup(A.calculate(low));
  assert.equal(w.id, 3); assert.equal(w.name, 'Перевірка результату'); assert.deepEqual(clean(w.links), ['Verification']); assert.deepEqual(clean(w.lessons), [5]);
  assert.match(A.weakestText(A.calculate(low)), /^Перевірка результату \(Verification\), 0 з 8\. У курсі це урок 5\. /);
  const tie = answers(4); tie.q3 = 2; tie.q9 = 2;
  assert.equal(A.weakestGroup(A.calculate(tie)).id, 1);
  const share = answers(4); share.q1 = 'none'; share.q2 = 2; share.q9 = 3; share.q10 = 3;
  assert.equal(A.weakestGroup(A.calculate(share)).id, 0);
  const late = answers(4); late.q1 = 3; late.q9 = 1;
  assert.equal(A.weakestGroup(A.calculate(late)).id, 4);
  assert.equal(A.weakestGroup(A.calculate(answers(4))).id, 0);
  assert.match(A.weakestText(A.calculate(answers(4))), /не просідає/);
  assert.match(A.weakestText(A.calculate(answers(4))), /уроки 1 і 3/);
  assert.throws(() => A.weakestGroup({}));
});

test('first habit: earliest question with the lowest level; all 4 = habits in place; none-only questions skipped', () => {
  const low = answers(4); low.q7 = 0; low.q8 = 0;
  assert.equal(A.nextStep(low).question.id, 'q7'); assert.equal(A.nextStep(low).text, A.QUESTIONS[6].next);
  const later = answers(4); later.q2 = 3; later.q9 = 1;
  assert.equal(A.nextStep(later).question.id, 'q9');
  const skip = answers(4); skip.q1 = 'none'; skip.q4 = 1; skip.q8 = 1;
  assert.equal(A.nextStep(skip).question.id, 'q4');
  const top = A.nextStep(answers(4)); assert.equal(top.question, null); assert.match(top.text, /на місці/);
  const mostlyNone = answers('none'); mostlyNone.q10 = 4;
  assert.equal(A.nextStep(mostlyNone).question, null);
});

test('export is mini-audit-v2 with a v1-shaped result and survives a JSON round trip', () => {
  const data = exported(3);
  assert.equal(data.version, 'mini-audit-v2'); assert.equal(data.date, '2026-09-06T10:00:00.000Z');
  assert.deepEqual(Object.keys(data), ['version','date','answers','result']);
  assert.deepEqual(Object.keys(data.result), ['answered','total','max','applicable','withoutExperience','groups']);
  assert.deepEqual(Object.keys(data.result.groups[0]), ['id','name','total','max','applicable','withoutExperience']);
  const parsed = JSON.parse(JSON.stringify(data));
  assert.deepEqual(clean(A.calculate(A.validateAnswers(parsed.answers, true))), parsed.result);
  assert.deepEqual(clean(A.makeExport(parsed.answers, parsed.date)), parsed);
  assert.deepEqual(Object.keys(parsed.answers), clean(A.QUESTIONS.map(q => q.id)));
  const shuffled = {q10:'none', q1:1, q2:2, q3:3, q4:4, q5:0, q6:1, q7:2, q8:3, q9:4};
  assert.deepEqual(Object.keys(A.makeExport(shuffled, data.date).answers), clean(A.QUESTIONS.map(q => q.id)));
});

test('unknown ids, out-of-range levels, strings and prototype keys are rejected', () => {
  for (const invalid of [null, -1, 5, 1.5, '1', 'A', '', 'constructor', '<img src=x onerror=alert(1)>', true, [], {}, NaN]) assert.throws(() => A.calculate({q1: invalid}), 'accepted '+String(invalid));
  assert.throws(() => A.calculate({q11: 4}));
  assert.throws(() => A.calculate(JSON.parse('{"__proto__":4}')));
  assert.throws(() => A.calculate(null)); assert.throws(() => A.calculate([])); assert.throws(() => A.calculate('q1'));
  assert.throws(() => A.markdown({version:'mini-audit-v1', date:'2026-09-06T10:00:00.000Z', answers: answers('A')}));
  assert.throws(() => A.markdown({...exported(4), version:'future-v3'}));
});

test('Markdown carries the chain, every group with links and lesson, the weakest seam and every answer', () => {
  const low = answers(4); low.q7 = 0; low.q8 = 'none'; low.q10 = 2;
  const md = A.markdown(A.makeExport(low, '2026-09-06T10:00:00.000Z'));
  assert.match(md, /Ланцюг курсу: Intent, Context, Spec, Plan, Implementation, Verification, Learning/);
  for (const q of A.QUESTIONS) assert.ok(md.includes(q.text));
  for (const g of A.GROUPS) assert.ok(md.includes('| '+g.name+' | '+A.linksText(g)+' | '+A.lessonText(g)+' | '));
  assert.match(md, /## Найслабший стик\n\nПеревірка результату \(Verification\), 0 з 4\. У курсі це урок 5\./);
  assert.match(md, /## Перша звичка по ланцюгу\n\n/); assert.ok(md.includes(A.QUESTIONS[6].next));
  assert.ok(md.includes('| 8 | '+A.QUESTIONS[7].text+' | Ще не було такої ситуації | Без бала |'));
  assert.ok(md.includes('| 10 | '+A.QUESTIONS[9].text+' | 2 · У половині випадків | 2 |'));
  assert.match(md, /Бали: 30 \/ 36/); assert.match(md, /Поза підрахунком: 1 із 10/); assert.match(md, /Версія: mini-audit-v2/);
  assert.doesNotMatch(md, /NaN|undefined|null|0\s*\/\s*0/);
});

test('offline UI: no remote resources, storage, HTML sinks or import; motion respects reduced-motion', () => {
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|@import|url\(|\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|indexedDB|innerHTML|outerHTML|insertAdjacentHTML|document\.write|type="file"|parseImport|eval\(/);
  assert.match(html, /default-src 'none'/); assert.match(html, /connect-src 'none'/); assert.match(html, /el\.textContent=text/);
  assert.doesNotMatch(html, /checked\s*=|\.checked\s*=/);
  assert.match(html, /disabled>Завантажити Markdown/); assert.match(html, /disabled>Завантажити result\.json/);
  assert.match(html, /complete=result\.answered===N/);
  assert.match(html, /prefers-reduced-motion: ?reduce/); assert.match(html, /stroke-dashoffset/); assert.match(html, /IntersectionObserver/); assert.match(html, /requestAnimationFrame/);
  assert.match(html, /@media print/);
});

test('page copy: chain intro, shopping-list example before questions, weakest seam block, no import instructions', () => {
  assert.match(html, /Мінікурс · урок 1 · стартова анкета/);
  assert.ok(html.indexOf('списком покупок') < html.indexOf('id="questions"'));
  assert.match(html, /Створювати застосунок зараз не потрібно/);
  assert.match(html, /Найслабший стик/); assert.match(html, /Перша звичка по ланцюгу/);
  assert.doesNotMatch(html, /[Іі]мпорт|попередній результат|Codex/);
  assert.match(html, /фінальній анкеті/);
  assert.match(fallback, /Download ZIP/); assert.ok(/genkovich\.github\.io\/ai-work-check|\.\.\/first-step\.html/.test(fallback));
  assert.doesNotMatch(fallback, /імпортуй|A\/B\/C\/D|Так, зазвичай/);
  assert.match(fallback, /## Як читати результат/);
  for (const q of A.QUESTIONS) { assert.ok(q.hint.length >= 60 && q.hint.length <= 260, 'hint '+q.number); assert.ok(fallback.includes(q.hint), 'hint text q'+q.number+' in md'); }
});
