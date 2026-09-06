// Standalone quiz checks. Run: node --test test/first-step.check.js
// Deliberately outside *.test.js: the dashboard's existing verify suite is unchanged.
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

test('ten unique questions, five pairs, and exact Markdown question parity', () => {
  assert.equal(A.QUESTIONS.length, 10);
  assert.equal(new Set(A.QUESTIONS.map(q => q.id)).size, 10);
  assert.equal(A.GROUPS.length, 5);
  for (const q of A.QUESTIONS) assert.ok(fallback.includes('| '+q.number+' | '+q.text+' | '+A.GROUPS[q.group]+' |'));
  for (let i=0; i<5; i++) assert.equal(A.QUESTIONS.filter(q=>q.group===i).length, 2);
});

test('answer options retain distinct D=null, C=0', () => {
  assert.deepEqual(clean(Object.values(A.OPTIONS).map(x=>x.points)), [2,1,0,null]);
  assert.equal(A.OPTIONS.D.label, 'Ще не було такої ситуації');
});

test('blank and partial answers cannot produce an export', () => {
  assert.equal(A.calculate({}).answered, 0);
  const partial = A.calculate({q1:'A',q2:'D',q3:'B'});
  assert.deepEqual([partial.answered,partial.total,partial.max,partial.withoutExperience], [3,3,4,1]);
  assert.throws(()=>A.makeExport({}));
  assert.throws(()=>A.makeExport({q1:'D'}));
  const nine=answers('A');delete nine.q10;
  assert.throws(()=>A.makeExport(nine));
});

test('all A=20/20, all B=10/20, all C=0/20', () => {
  for(const [answer,total] of [['A',20],['B',10],['C',0]]) {
    const result=A.calculate(answers(answer));
    assert.equal(result.total,total);assert.equal(result.max,20);
    assert.equal(result.answered,10);assert.equal(result.withoutExperience,0);
    assert.equal(A.scoreText(result),total+' / 20');
  }
});

test('all D is complete and gently unscored, including each group and Markdown', () => {
  const data=exported('D');
  assert.equal(data.result.answered,10);assert.equal(data.result.withoutExperience,10);
  assert.equal(data.result.max,0);
  assert.equal(A.scoreText(data.result),'Поки немає досвіду для порівняння');
  for(const group of data.result.groups)assert.equal(A.scoreText(group),'Поки немає досвіду для порівняння');
  assert.match(A.nextStep(data.answers),/одне речення про бажаний результат/);
  assert.doesNotMatch(A.markdown(data),/NaN|Infinity|0\s*\/\s*0|FAIL/);
  assert.equal(A.parseImport(JSON.stringify(data)).result.withoutExperience,10);
});

test('mixed answers use applicable denominator per group and overall', () => {
  const mixed={q1:'A',q2:'D',q3:'B',q4:'C',q5:'D',q6:'D',q7:'A',q8:'B',q9:'C',q10:'D'};
  const result=A.calculate(mixed);
  assert.deepEqual([result.total,result.max,result.applicable,result.withoutExperience],[6,12,6,4]);
  assert.deepEqual(clean(result.groups.map(g=>[g.total,g.max])),[[2,2],[1,4],[0,0],[3,4],[0,2]]);
});

test('one next habit prioritizes C then B then untried D', () => {
  const value=answers('A');value.q9='D';value.q8='B';value.q4='C';
  assert.equal(A.nextStep(value),A.QUESTIONS[3].next);
  value.q4='A';assert.equal(A.nextStep(value),A.QUESTIONS[7].next);
  value.q8='A';assert.equal(A.nextStep(value),A.QUESTIONS[8].next);
  assert.equal(A.nextStep(answers('A')),A.QUESTIONS[6].next);
});

test('JSON round trip preserves answers, date, version and computed result', () => {
  const data=exported('B');assert.deepEqual(clean(A.parseImport(JSON.stringify(data))),clean(data));
  const reordered={result:data.result,answers:data.answers,date:data.date,version:data.version};
  assert.deepEqual(clean(A.parseImport(JSON.stringify(reordered))),clean(data));
});

test('malformed, oversized, wrong-version and extra-field JSON rejected', () => {
  for(const input of ['', 'not JSON', 'null', '[]', '{}', ' '.repeat(32769)])assert.throws(()=>A.parseImport(input));
  for(const change of [{version:'future-v2'}, {extra:'unexpected'}])assert.throws(()=>A.parseImport(JSON.stringify({...exported('A'),...change})));
});

test('missing or unknown IDs and every invalid answer rejected', () => {
  for(const invalid of [null,0,2,'','E','constructor','<img src=x onerror=alert(1)>']) {
    const data=exported('A');data.answers.q1=invalid;
    assert.throws(()=>A.parseImport(JSON.stringify(data)));
  }
  const missing=exported('A');delete missing.answers.q10;assert.throws(()=>A.parseImport(JSON.stringify(missing)));
  const unknown=exported('A');unknown.answers.q11='A';assert.throws(()=>A.parseImport(JSON.stringify(unknown)));
  assert.throws(()=>A.calculate(JSON.parse('{"__proto__":"A"}')));
});

test('invalid dates, forged totals, forged group labels and script payloads rejected', () => {
  for(const date of ['2026-02-30T10:00:00.000Z','<script>alert(1)</script>',null,'2026-09-06'])assert.throws(()=>A.parseImport(JSON.stringify({...exported('A'),date})));
  const totals=exported('A');totals.result.total=999;assert.throws(()=>A.parseImport(JSON.stringify(totals)));
  const label=exported('A');label.result.groups[0].name='<img src=x onerror=alert(1)>';assert.throws(()=>A.parseImport(JSON.stringify(label)));
});

test('per-question comparisons preserve original answers and use same applicability', () => {
  const before=answers('B'),now=answers('A'),original=JSON.stringify(before);
  const result=A.compare(before,now);
  assert.equal(result.rows.length,10);assert.equal(result.delta,10);assert.equal(result.sameApplicable,true);
  assert.ok(result.rows.every(r=>r.delta===1));assert.equal(JSON.stringify(before),original);
});

test('equal denominator but different applicable questions prevents total comparison', () => {
  const before=answers('A'),now=answers('A');before.q1='D';now.q2='D';
  assert.equal(A.calculate(before).max,A.calculate(now).max);
  const result=A.compare(before,now);assert.equal(result.sameApplicable,false);assert.equal(result.delta,null);
  assert.equal(result.rows[0].delta,null);assert.equal(result.rows[1].delta,null);assert.equal(result.rows[2].delta,0);
  assert.equal(A.compare(answers('D'),answers('D')).delta,null);
});

test('Markdown contains all questions, groups and optional question-level comparison', () => {
  const result=A.markdown(exported('A'),exported('B'));
  for(const q of A.QUESTIONS)assert.ok(result.includes(q.text));
  for(const group of A.GROUPS)assert.ok(result.includes(group));
  assert.match(result,/Порівняння з першим результатом/);assert.match(result,/Зміна суми за тим самим набором запитань: \+10/);
});

test('offline UI has no remote resource, storage or unsafe text-to-HTML sinks', () => {
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=|\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|localStorage|sessionStorage|innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.match(html,/connect-src 'none'/);assert.match(html,/el\.textContent=text/);
  assert.doesNotMatch(html,/checked\s*=|\.checked\s*=/);
  assert.match(html,/disabled>Зберегти результат текстом/);assert.match(html,/disabled>Зберегти для повторного проходження/);
  assert.match(html,/complete=result\.answered===10/);
});

test('one shopping-list illustration is explicit and no session/title prerequisite remains', () => {
  assert.ok(html.indexOf('Уявімо невеликий застосунок зі списком покупок.') >= 0);
  assert.ok(html.indexOf('Уявімо невеликий застосунок зі списком покупок.') < html.indexOf('id="questions"'));
  assert.match(html,/Створювати застосунок зараз не потрібно/);
  assert.match(fallback,/Це лише ілюстрація: створювати такий список не потрібно/);
  assert.doesNotMatch(html,/Codex|без заголовка|назву кожної розмови/);
  assert.match(fallback,/Download ZIP/);assert.match(fallback,/https:\/\/genkovich.github.io\/ai-work-check\//);
});

test('questions explain development tasks and have substantial teaching hints', () => {
  assert.match(A.QUESTIONS[0].text,/змінити код/);
  assert.match(A.QUESTIONS[2].text,/потрібний код/);
  for(const q of A.QUESTIONS) assert.ok(q.hint.length >= 140);
  assert.doesNotMatch(html,/Технічні знання для анкети не потрібні|анкета українською/i);
});
