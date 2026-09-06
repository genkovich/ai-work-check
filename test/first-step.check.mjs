// Standalone quiz checks. Run: node --test test/first-step.check.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

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
  for (const q of A.QUESTIONS) {
    const g = A.GROUPS[q.group];
    assert.ok(!('module' in q), 'start question without module');
    assert.ok(fallback.includes('| '+q.number+' | '+q.text+' | '+g.name+' | '+A.linksText(g)+' | '+A.lessonText(g)+' |'), 'parity q'+q.number);
    assert.ok(fallback.includes('### '+q.number+'. '+q.text), 'hint heading q'+q.number);
    assert.ok(fallback.includes(q.hint), 'hint text q'+q.number+' in md');
  }
});

test('final: 35 questions, seven per seam, every one tagged with a module, all eleven modules covered, Markdown parity', () => {
  assert.equal(F.mode, 'final');
  assert.equal(F.QUESTIONS.length, 35);
  assert.equal(new Set(F.QUESTIONS.map(q => q.id)).size, 35);
  assert.deepEqual(clean(F.QUESTIONS.map(q => q.id)), Array.from({length: 35}, (_, i) => 'q'+(i+1)));
  for (let i = 0; i < 5; i++) assert.equal(F.QUESTIONS.filter(q => q.group === i).length, 7);
  assert.deepEqual(clean(F.GROUPS), clean(A.GROUPS));
  assert.equal(F.MODULES.length, 11);
  assert.deepEqual(clean(F.MODULES.map(m => m.id)), Array.from({length: 11}, (_, i) => 'M'+(i+1)));
  const ids = new Set(F.MODULES.map(m => m.id));
  for (const q of F.QUESTIONS) {
    assert.ok(ids.has(q.module), 'module of q'+q.number);
    assert.ok(finalFallback.includes('| '+q.number+' | '+q.text+' | '+F.GROUPS[q.group].name+' | '+q.module+' |'), 'parity q'+q.number);
  }
  assert.equal(new Set(F.QUESTIONS.map(q => q.module)).size, 11);
  for (const m of F.MODULES) { assert.ok(m.name.length > 2); assert.ok(finalFallback.includes('| '+m.id+' | '+m.name+' |'), 'module row '+m.id); }
  assert.equal(F.moduleLabel('M8'), 'M8 · MCP');
});

test('final.html is index.html in final mode: same engine and UI byte for byte, own header, CTA only there', () => {
  assert.equal(part(finalHtml, 'audit-engine'), part(html, 'audit-engine'));
  assert.equal(part(finalHtml, 'audit-ui'), part(html, 'audit-ui'));
  assert.match(html, /<html lang="uk" data-mode="start">/); assert.match(finalHtml, /<html lang="uk" data-mode="final">/);
  assert.match(finalHtml, /<title>Як я працюю з AI після мінікурсу: 35 запитань<\/title>/);
  assert.match(finalHtml, /Мінікурс · урок 6 · фінальна анкета/);
  assert.match(finalHtml, /href="https:\/\/agenticengineering\.it\.com\/"[^>]*>Залишити анкету</);
  assert.doesNotMatch(html, /agenticengineering\.it\.com|Залишити анкету/);
  assert.match(html, /<!-- cta -->/); assert.doesNotMatch(finalHtml, /<!-- cta -->/);
  assert.match(finalHtml, /final-questionnaire\.md/); assert.doesNotMatch(html, /final-questionnaire\.md/);
  assert.match(html, /href="final(-step)?\.html"/);
  assert.match(html, /html\[data-mode="final"\] \.start-only,html\[data-mode="start"\] \.final-only\{display:none!important\}/);
});

test('five levels 0..4 plus a separate no-experience mark; start is v3, final is final-v1', () => {
  for (const X of [A, F]) {
    assert.deepEqual(clean(X.LEVELS.map(l => l.value)), [0,1,2,3,4]);
    assert.deepEqual(clean(X.LEVELS.map(l => l.label)), ['Ніколи','Рідко','У половині випадків','Майже завжди','Завжди']);
    assert.equal(X.MAX_LEVEL, 4); assert.equal(X.NONE, 'none'); assert.equal(X.NONE_LABEL, 'Ще не було такої ситуації');
    assert.equal(X.answerLabel(2), '2 · У половині випадків'); assert.equal(X.answerLabel('none'), X.NONE_LABEL);
  }
  assert.equal(A.VERSION, 'mini-audit-v3'); assert.equal(F.VERSION, 'mini-audit-final-v1');
  assert.equal(M.SETS.start.version, A.VERSION); assert.equal(M.SETS.final.version, F.VERSION);
  for (const md of [fallback, finalFallback]) for (const l of A.LEVELS) assert.ok(md.includes('**'+l.value+': '+l.label+'**'), 'level '+l.value+' in md');
  assert.throws(() => M.create('other')); assert.throws(() => M.create('constructor'));
  assert.equal(A.moduleScores, undefined); assert.equal(A.ctaText, undefined);
  assert.equal(typeof F.moduleScores, 'function'); assert.equal(typeof F.weakestModules, 'function'); assert.equal(typeof F.ctaText, 'function');
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
  }
  const r = F.calculate(answers(F, 4));
  assert.equal(r.modules.length, 11);
  for (const m of r.modules) assert.equal(m.max, 4 * F.QUESTIONS.filter(q => q.module === m.id).length);
  assert.equal(r.modules.reduce((s, m) => s + m.max, 0), 140);
  assert.ok(!('modules' in A.calculate(answers(A, 4))));
});

test('all none is complete and unscored: no weakest group, first habit from question 1, modules without experience, Markdown without 0/0', () => {
  for (const X of [A, F]) {
    const data = exported(X, 'none');
    assert.equal(data.result.answered, X.QUESTIONS.length); assert.equal(data.result.withoutExperience, X.QUESTIONS.length); assert.equal(data.result.max, 0);
    assert.equal(X.scoreText(data.result), 'Поки немає досвіду для порівняння');
    for (const g of data.result.groups) assert.equal(X.scoreText(g), 'Поки немає досвіду для порівняння');
    assert.equal(X.weakestGroup(data.result), null);
    assert.match(X.weakestText(data.result), /Intent/); assert.match(X.weakestText(data.result), /урок 1/);
    assert.equal(X.nextStep(data.answers).question.id, 'q1');
    assert.equal(X.nextStep(data.answers).text, X.QUESTIONS[0].next);
    assert.doesNotMatch(X.markdown(data), /NaN|Infinity|0\s*\/\s*0|undefined|null/);
  }
  const data = exported(F, 'none');
  assert.deepEqual(clean(F.moduleScores(data.result).map(m => m.id)), clean(F.MODULES.map(m => m.id)));
  for (const m of F.moduleScores(data.result)) { assert.equal(m.applicable, 0); assert.equal(m.withoutExperience, m.questions); }
  assert.deepEqual(clean(F.weakestModules(data.result)), []);
  assert.match(F.ctaText(data.result), /Поки немає досвіду/);
});

test('mixed answers use the applicable denominator per group, per module and overall', () => {
  const mixed = {q1:4, q2:'none', q3:2, q4:0, q5:'none', q6:'none', q7:4, q8:3, q9:1, q10:'none'};
  const r = A.calculate(mixed);
  assert.deepEqual([r.total, r.max, r.applicable, r.withoutExperience], [14,24,6,4]);
  assert.deepEqual(clean(r.groups.map(g => [g.total, g.max, g.applicable, g.withoutExperience])), [[4,4,1,1],[2,8,2,0],[0,0,0,2],[7,8,2,0],[1,4,1,1]]);
  const fin = answers(F, 3); fin.q17 = 'none'; fin.q21 = 0; fin.q24 = 'none'; fin.q30 = 4;
  const f = F.calculate(fin);
  assert.deepEqual([f.total, f.max, f.applicable, f.withoutExperience], [31*3+0+4, 33*4, 33, 2]);
  const m3 = f.modules.find(m => m.id === 'M3'), m9 = f.modules.find(m => m.id === 'M9');
  assert.deepEqual([m3.total, m3.max, m3.applicable, m3.withoutExperience], [0,0,0,1]);
  assert.deepEqual([m9.total, m9.max, m9.applicable, m9.withoutExperience], [4,8,2,1]);
  assert.equal(f.modules.reduce((s, m) => s + m.total, 0), f.total);
  assert.equal(f.modules.reduce((s, m) => s + m.applicable, 0), f.applicable);
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

test('module scores: sorted from the weakest share, ties keep module order, modules without experience last, up to three weakest for the CTA', () => {
  const a = answers(F, 4);
  for (const q of F.QUESTIONS) { if (q.module === 'M9') a[q.id] = 0; if (q.module === 'M3') a[q.id] = 2; if (q.module === 'M11') a[q.id] = 3; }
  const r = F.calculate(a), scores = F.moduleScores(r);
  assert.deepEqual(clean(scores.slice(0, 3).map(m => m.id)), ['M9','M3','M11']);
  assert.deepEqual(Object.keys(scores[0]), ['id','name','total','max','applicable','withoutExperience','questions']);
  assert.deepEqual(clean(scores[0]), {id:'M9', name:'Code review, PR, CI/CD', total:0, max:12, applicable:3, withoutExperience:0, questions:3});
  assert.deepEqual(clean(scores.slice(3).map(m => m.id)), ['M1','M2','M4','M5','M6','M7','M8','M10']);
  assert.deepEqual(clean(F.weakestModules(r).map(m => m.id)), ['M9','M3','M11']);
  assert.deepEqual(clean(F.weakestModules(r, 1).map(m => m.id)), ['M9']);
  assert.match(F.ctaText(r), /^Найслабші модулі: M9 · Code review, PR, CI\/CD; M3 · Claude Code: старт і безпека; M11 · Production і команда\. Їх розбирає основна програма Agentic Engineering\.$/);
  assert.deepEqual(clean(F.moduleScores(F.calculate(answers(F, 2))).map(m => m.id)), clean(F.MODULES.map(m => m.id)));
  const none = answers(F, 4); none.q17 = 'none'; none.q5 = 1;
  const sorted = F.moduleScores(F.calculate(none));
  assert.equal(sorted[0].id, 'M1'); assert.equal(sorted.at(-1).id, 'M3'); assert.equal(sorted.at(-1).applicable, 0);
  assert.deepEqual(clean(F.weakestModules(F.calculate(none)).map(m => m.id)), ['M1']);
  const one = answers(F, 4); one.q28 = 3;
  assert.deepEqual(clean(F.weakestModules(F.calculate(one)).map(m => m.id)), ['M11']);
  assert.deepEqual(clean(F.weakestModules(F.calculate(answers(F, 4)))), []);
  assert.match(F.ctaText(F.calculate(answers(F, 4))), /всі модулі на максимумі/);
  assert.throws(() => F.moduleScores(A.calculate(answers(A, 4))));
  assert.throws(() => F.moduleScores({}));
});

test('export carries version and mode, keeps the v1-shaped result, survives a JSON round trip and rejects the other mode', () => {
  for (const [X, version] of [[A, 'mini-audit-v3'], [F, 'mini-audit-final-v1']]) {
    const data = exported(X, 3);
    assert.equal(data.version, version); assert.equal(data.mode, X.mode); assert.equal(data.date, DATE);
    assert.deepEqual(Object.keys(data), ['version','mode','date','answers','result']);
    assert.deepEqual(Object.keys(data.result).slice(0, 6), ['answered','total','max','applicable','withoutExperience','groups']);
    assert.deepEqual(Object.keys(data.result.groups[0]), ['id','name','total','max','applicable','withoutExperience']);
    const parsed = JSON.parse(JSON.stringify(data));
    assert.deepEqual(clean(X.calculate(X.validateAnswers(parsed.answers, true))), parsed.result);
    assert.deepEqual(clean(X.makeExport(parsed.answers, parsed.date)), parsed);
    assert.deepEqual(Object.keys(parsed.answers), clean(X.QUESTIONS.map(q => q.id)));
    const shuffled = Object.fromEntries([...X.QUESTIONS].reverse().map((q, i) => [q.id, i % 2 ? 'none' : i % 5]));
    assert.deepEqual(Object.keys(X.makeExport(shuffled, DATE).answers), clean(X.QUESTIONS.map(q => q.id)));
  }
  assert.deepEqual(Object.keys(exported(A, 3).result), ['answered','total','max','applicable','withoutExperience','groups']);
  assert.deepEqual(Object.keys(exported(F, 3).result), ['answered','total','max','applicable','withoutExperience','groups','modules']);
  assert.deepEqual(Object.keys(exported(F, 3).result.modules[0]), ['id','name','total','max','applicable','withoutExperience']);
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
  assert.doesNotMatch(md, /Де це в основній програмі|Найслабші модулі|\| Модуль \|/);
  assert.doesNotMatch(md, /NaN|undefined|null|0\s*\/\s*0/);
});

test('final Markdown adds the module table sorted from the weakest, the weakest modules and a module column in answers', () => {
  const a = answers(F, 4); for (const q of F.QUESTIONS) if (q.module === 'M9') a[q.id] = 0; a.q17 = 'none'; a.q5 = 2;
  const md = F.markdown(F.makeExport(a, DATE));
  assert.match(md, /^# Як я працюю з AI після мінікурсу: 35 запитань\n/);
  assert.match(md, /Версія: mini-audit-final-v1/); assert.match(md, /Бали: 122 \/ 136/); assert.match(md, /Поза підрахунком: 1 із 35/);
  assert.match(md, /## Пʼять стиків\n\n\| Стик \| Ланки \| Урок \| Бали \| Поза підрахунком \|/);
  assert.match(md, /## Де це в основній програмі\n\n\| Модуль \| Запитань \| Бали \| Поза підрахунком \|\n\|---\|---\|---\|---\|\n\| M9 · Code review, PR, CI\/CD \| 3 \| 0 \/ 12 \| 0 \|\n\| M1 · Як працюють LLM \| 2 \| 6 \/ 8 \| 0 \|/);
  assert.match(md, /\| M3 · Claude Code: старт і безпека \| 1 \| Поки немає досвіду для порівняння \| 1 \|\n\n## Найслабші модулі\n\nНайслабші модулі: M9 · Code review, PR, CI\/CD; M1 · Як працюють LLM\. Їх розбирає основна програма Agentic Engineering\./);
  assert.match(md, /## Відповіді\n\n\| № \| Запитання \| Модуль \| Відповідь \| Бали \|/);
  assert.ok(md.includes('| 21 | '+F.QUESTIONS[20].text+' | M9 | 0 · Ніколи | 0 |'));
  assert.ok(md.includes('| 17 | '+F.QUESTIONS[16].text+' | M3 | Ще не було такої ситуації | Без бала |'));
  assert.match(F.weakestText(F.calculate(a)), /У мінікурсі це/);
  assert.doesNotMatch(md, /NaN|undefined|null|0\s*\/\s*0/);
});

test('wording gates on all 45 questions: at most 25 words, no dashes or ellipsis, no "не X, а Y", hint 60-260 characters, module names and hints free of dashes', () => {
  for (const X of [A, F]) for (const q of X.QUESTIONS) {
    const all = q.text+' '+q.hint+' '+q.next;
    assert.ok(words(q.text) <= 25, 'words q'+q.number+' '+X.mode+': '+words(q.text));
    assert.ok(q.text.endsWith('?'), 'question mark q'+q.number+' '+X.mode);
    assert.doesNotMatch(all, /[—–…]/, 'dash q'+q.number+' '+X.mode);
    assert.doesNotMatch(all, /\bне [^,]{1,40}, а /, 'antithesis q'+q.number+' '+X.mode);
    assert.ok(q.hint.length >= 60 && q.hint.length <= 260, 'hint '+q.number+' '+X.mode+': '+q.hint.length);
    assert.ok(q.next.length >= 40 && q.next.length <= 200, 'next '+q.number+' '+X.mode);
  }
  for (const m of F.MODULES) assert.doesNotMatch(m.name, /[—–…]/);
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
    assert.match(page, /transitionDelay=delay\+'ms'/);
  }
});

test('page copy: chain intro, shopping-list example before questions on start, module table and CTA on final, no import instructions anywhere', () => {
  assert.match(html, /Мінікурс · урок 1 · стартова анкета/);
  assert.ok(html.indexOf('списком покупок') < html.indexOf('id="questions"'));
  assert.match(html, /Створювати застосунок зараз не потрібно/);
  assert.match(html, /Найслабший стик/); assert.match(html, /Перша звичка по ланцюгу/);
  assert.match(html, /низький результат на старті очікуваний/);
  assert.match(html, /3 або 4 став лише тоді/);
  assert.match(html, /фінальна анкета на 35 запитань/);
  assert.match(html, /<div class="panel example start-only">/);
  assert.match(html, /<div class="table-wrap final-only"><table id="module-table"><caption>Де це в основній програмі<\/caption>/);
  for (const page of [html, finalHtml]) assert.doesNotMatch(page, /[Іі]мпорт|попередній результат|Codex|A\/B\/C\/D|Так, зазвичай/);
  assert.match(finalHtml, /по сім на кожен стик/);
  assert.match(finalHtml, /<div class="panel cta final-only" id="cta">/);
  assert.match(fallback, /Download ZIP/); assert.ok(/genkovich\.github\.io\/ai-work-check|\.\.\/first-step\.html/.test(fallback));
  assert.match(fallback, /## Як читати результат/); assert.match(fallback, /низький результат на старті очікуваний/);
  assert.ok(/final\.html|\.\.\/final-step\.html/.test(fallback));
  assert.match(finalFallback, /Download ZIP/); assert.ok(/genkovich\.github\.io\/ai-work-check\/final\.html|\.\.\/final-step\.html/.test(finalFallback));
  assert.match(finalFallback, /## Модулі основної програми/); assert.match(finalFallback, /## Як читати результат/); assert.match(finalFallback, /Найслабші модулі/);
  assert.match(finalFallback, /agenticengineering\.it\.com/); assert.doesNotMatch(finalFallback, /Молоко|Куплено/);
  for (const md of [fallback, finalFallback]) { assert.doesNotMatch(md, /імпортуй|[Іі]мпорту? |A\/B\/C\/D|Так, зазвичай|[—–…]/); assert.doesNotMatch(md, /\bне [^,]{1,40}, а /); }
});
