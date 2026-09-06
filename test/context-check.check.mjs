// Public standalone checklist tests: node --test test/context-check.check.mjs
// Private code and rule contracts are checked separately in the course kit.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root=new URL('../',import.meta.url);
const read=path=>fs.readFileSync(new URL(path,root),'utf8');
const html=read('context-check.html');
const engine=html.match(/<script id="context-engine">([\s\S]*?)<\/script>/)[1];
const context=vm.createContext({});vm.runInContext(engine,context);
const C=context.ContextCheck;
const clean=value=>JSON.parse(JSON.stringify(value));
const all=value=>Array(10).fill(value);
function memory(initial={}){
  const values=new Map(Object.entries(initial));const calls=[];
  return {values,calls,getItem(key){calls.push(['get',key]);return values.get(key)??null;},setItem(key,value){calls.push(['set',key]);values.set(key,value);},removeItem(key){calls.push(['remove',key]);values.delete(key);}};
}

test('ten ordered steps and matching export titles, no checkbox preselected',()=>{
  const steps=[...html.matchAll(/<article class="step" id="step-(\d+)" data-step="(\d+)">\s*<h2>(\d+)\. ([^<]+)<\/h2>/g)];
  assert.equal(steps.length,10);
  steps.forEach((s,i)=>{assert.equal(Number(s[1]),i+1);assert.equal(s[1],s[2]);assert.equal(s[2],s[3]);assert.equal(s[4],C.TITLES[i]);});
  assert.equal([...html.matchAll(/data-check="\d+"/g)].length,10);
  assert.doesNotMatch(html,/<input[^>]*\schecked(?:[\s=>])/);
});

test('every step has an action, expected observation and checkbox condition',()=>{
  const steps=[...html.matchAll(/<article class="step"[\s\S]*?<\/article>/g)];
  for(const [step]of steps){assert.match(step,/Що робити\./);assert.match(step,/Що має бути видно\./);assert.match(step,/<label class="check">[\s\S]*?Познач/);}
});

test('initial progress is empty, opt-in and does not write browser storage',()=>{
  const storage=memory(),state=C.createProgress(()=>storage),value=state.load();
  assert.equal(value.count,0);assert.equal(value.remember,false);assert.equal(value.warning,'');
  assert.deepEqual(clean(value.checked),all(false));
  state.update(0,true);assert.equal(storage.calls.filter(x=>x[0]==='set').length,0);
});

test('partial and complete progress count only explicit boolean checkmarks',()=>{
  const state=C.createProgress(()=>memory());
  state.update(0,true);state.update(9,true);assert.equal(state.snapshot().count,2);
  for(let i=0;i<10;i++)state.update(i,true);
  assert.equal(state.snapshot().count,10);
  state.update(4,false);assert.equal(state.snapshot().count,9);
  for(const args of [[-1,true],[10,true],[1,'true'],[1,null],[NaN,true]])assert.throws(()=>state.update(...args));
});

test('snapshots do not allow accidental mutation of the saved state',()=>{
  const state=C.createProgress(()=>memory());const snapshot=state.snapshot();snapshot.checked[0]=true;
  assert.equal(state.snapshot().count,0);
});

test('opt-in saves only version and ten booleans; reload restores them',()=>{
  const storage=memory(),state=C.createProgress(()=>storage);
  state.update(3,true);state.setRemember(true);state.update(8,true);
  const payload=JSON.parse(storage.values.get(C.KEY));
  assert.deepEqual(Object.keys(payload).sort(),['checked','version']);assert.equal(payload.checked.length,10);
  assert.ok(payload.checked.every(x=>typeof x==='boolean'));
  const fresh=C.createProgress(()=>storage).load();assert.equal(fresh.count,2);assert.equal(fresh.remember,true);
});

test('turning off saving preserves current checkmarks and removes only its own key',()=>{
  const storage=memory({unrelated:'keep'}),state=C.createProgress(()=>storage);
  state.update(2,true);state.setRemember(true);state.setRemember(false);
  assert.equal(state.snapshot().count,1);assert.equal(state.snapshot().remember,false);
  assert.equal(storage.values.has(C.KEY),false);assert.equal(storage.values.get('unrelated'),'keep');
});

test('denied storage getter or read leaves a working in-memory checklist',()=>{
  for(const get of [()=>{throw Error('denied');},()=>({getItem(){throw Error('read denied');}})]){
    const state=C.createProgress(get),loaded=state.load();assert.equal(loaded.count,0);assert.match(loaded.warning,/недоступні/);
    assert.equal(state.update(4,true).count,1);
    assert.match(state.setRemember(true).warning,/не дозволив зберегти/);
    assert.equal(state.update(5,true).count,2);
  }
});

test('write quota failure keeps new progress and warns that only this tab has it',()=>{
  const storage=memory();storage.setItem=()=>{throw Error('quota exceeded');};
  const state=C.createProgress(()=>storage);state.setRemember(true);const next=state.update(7,true);
  assert.equal(next.count,1);assert.match(next.warning,/цій вкладці/);assert.match(next.warning,/завантаж чекліст/);
});

test('malformed, oversized, wrong-version or unsafe saved content is not restored',()=>{
  for(const raw of ['oops','null','[]','{}',' '.repeat(2049),JSON.stringify({version:'old',checked:all(true)}),JSON.stringify({version:C.VERSION,checked:all('<img src=x onerror=alert(1)>')}),JSON.stringify({version:C.VERSION,checked:[true]}),JSON.stringify({version:C.VERSION,checked:all(true),html:'<script>alert(1)</script>'})]){
    assert.throws(()=>C.parse(raw));const state=C.createProgress(()=>memory({[C.KEY]:raw}));
    assert.equal(state.load().count,0);assert.equal(state.snapshot().remember,false);
  }
});

test('reset cancellation leaves current and saved values unchanged',()=>{
  const storage=memory(),state=C.createProgress(()=>storage);state.update(0,true);state.setRemember(true);
  const before=storage.values.get(C.KEY),count=storage.calls.length;
  assert.equal(state.reset(()=>false).reset,false);assert.equal(state.snapshot().count,1);
  assert.equal(storage.values.get(C.KEY),before);assert.equal(storage.calls.length,count);
});

test('confirmed reset clears checks and saving preference, not unrelated browser data',()=>{
  const storage=memory({other:'untouched'}),state=C.createProgress(()=>storage);state.update(0,true);state.setRemember(true);
  const reset=state.reset(()=>true);assert.equal(reset.reset,true);assert.equal(reset.count,0);assert.equal(reset.remember,false);
  assert.equal(storage.values.has(C.KEY),false);assert.equal(storage.values.get('other'),'untouched');
});

test('failed reset removal admits stale stored checks may return after reload',()=>{
  const storage=memory(),state=C.createProgress(()=>storage);state.update(0,true);state.setRemember(true);
  storage.removeItem=()=>{throw Error('remove denied');};
  const result=state.reset(()=>true);assert.equal(result.count,0);assert.match(result.warning,/можуть повернутися/);
  assert.equal(C.createProgress(()=>storage).load().count,1);
});

test('Markdown supports partial and complete progress without verified-proof claims',()=>{
  const checked=all(false);checked[0]=true;
  const partial=C.markdown(checked,'2026-09-06T12:00:00.000Z');assert.match(partial,/Позначено: 1 із 10/);
  assert.equal([...partial.matchAll(/^- \[x\]/gm)].length,1);assert.equal([...partial.matchAll(/^- \[ \]/gm)].length,9);
  const complete=C.markdown(all(true));assert.equal([...complete.matchAll(/^- \[x\]/gm)].length,10);
  for(const text of [partial,complete]){assert.match(text,/не підтвердження виконання команд або якості коду/);assert.match(text,/Фактичні результати нижче записані мною/);assert.doesNotMatch(text,/PASS|APPROVED|NaN|score|балів/);}
  assert.throws(()=>C.markdown([true]));assert.throws(()=>C.markdown(all(true),'<img src=x>'));
});

test('safe rendering and copy fallback use text, not HTML injection',()=>{
  assert.doesNotMatch(html,/innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(/);
  assert.match(html,/\.textContent=/);assert.match(html,/range\.selectNodeContents\(block\)/);
  assert.match(html,/window\.confirm\(/);assert.match(html,/Браузер не дозволив автоматичне копіювання/);
});

test('page has no uploads, external assets or network calls',()=>{
  assert.doesNotMatch(html,/<script[^>]+src=|<link[^>]+href=|<iframe|type="(?:file|email|tel)"|\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket/);
  assert.ok(html.includes("connect-src 'none'"));
  for(const [,href] of html.matchAll(/href="([^"]+)"/g))assert.match(href,/^https:\/\//);
});

test('new semantic version never restores old exercise checkmarks',()=>{
  assert.equal(C.VERSION,'context-check-v3-curated');
  const storage=memory({'ai-work-check:context-check-v1':JSON.stringify({version:'context-check-v1',checked:all(true)})});
  assert.equal(C.createProgress(()=>storage).load().count,0);
  assert.ok(storage.values.has('ai-work-check:context-check-v1'));
  assert.match(html,/старі позначки попередньої вправи не переносяться/);
});

test('all copy controls and evidence fields have real unique DOM targets',()=>{
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const [,target]of html.matchAll(/data-copy="([^"]+)"/g))assert.ok(html.includes('<pre id="'+target+'">'));
  for(const id of ['completion','evidence','evidence-agent','evidence-checks','evidence-fresh','evidence-limits','remember','progress','progress-text','storage-status','copy-status','download','reset'])assert.ok(ids.includes(id),id);
  const exported=C.markdown(all(false),'2026-09-06T12:00:00.000Z',{agent:'Codex',checks:'tests 2',fresh:'Явно прочитано views/AGENTS.md',limits:'Автозавантаження не перевірено'});
  for(const text of ['Codex','tests 2','Явно прочитано views/AGENTS.md','Автозавантаження не перевірено'])assert.ok(exported.includes(text));
  assert.throws(()=>C.markdown(all(false),undefined,{agent:'x'.repeat(3001)}));
  assert.throws(()=>C.markdown(all(false),undefined,{other:'x'}));
  assert.throws(()=>C.markdown(all(false),undefined,{fresh:42}));
  assert.ok(html.includes("if(result.reset)evidenceFields.forEach"));
  assert.ok(html.includes("field.value=''"));
});


test('public setup covers one selected host and a real Git baseline',()=>{
  for(const value of ['git clone https://github.com/genkovich/agentic-engineering-mini-kit.git','Code → Download ZIP','File → Open Folder','Terminal → New Terminal','node --version','git init','git rev-parse --show-toplevel','git config user.name','git config user.email','git rev-parse HEAD','npm ci','npm run verify','npm run demo'])assert.ok(html.includes(value),value);
  for(const value of ['/sdd:survey','$sdd-survey','bash -s -- codex','bash -s -- cursor','/reload-plugins'])assert.ok(html.includes(value),value);
  assert.doesNotMatch(html,/\/sdd:interview|\/init/);
});

test('public lesson names one canonical policy and short adapters without exposing private code',()=>{
  for(const value of ['AGENTS.md','views/AGENTS.md','docs/rules/session-data.md','.claude/rules/session-index.md','.cursor/rules/session-data.mdc','@../../docs/rules/session-data.md','@docs/rules/session-data.md','lib/claude/**/*.js'])assert.ok(html.includes(value),value);
  assert.ok(html.includes('docs/architecture-map.md'));
  assert.doesNotMatch(html,/docs\/idea-brief\.md|docs\/practice\/handoff\.md|02-context\.md/);
});

test('fresh session explicitly distinguishes reading from automatic loading',()=>{
  for(const value of ['/exit','/new','resume або continue','новий чат','залиш крок 9 незавершеним','що довелося прочитати явно'])assert.ok(html.includes(value),value);
  assert.ok(C.markdown(all(false)).includes('Крок 9 лишається незавершеним'));
  assert.ok(C.markdown(all(false)).includes('Явне читання файлів не доводить автоматичного завантаження'));
});

test('evidence remains ephemeral while export includes learner-entered results',()=>{
  assert.equal([...html.matchAll(/data-evidence=/g)].length,4);
  assert.ok(html.includes('Поля не зберігаються автоматично'));
  assert.ok(html.includes('Object.fromEntries(evidenceFields.map'));
  assert.ok(html.includes("link.download='lesson-2-context-result.md'"));
  const text=C.markdown(all(false),'2026-09-06T12:00:00.000Z',{agent:'Cursor',checks:'2 tests passed',fresh:'Вкладений файл прочитано явно',limits:'Claude не запускався'});
  for(const value of ['Cursor','2 tests passed','Вкладений файл прочитано явно','Claude не запускався'])assert.ok(text.includes(value));
  assert.equal([...html.matchAll(/maxlength="3000"/g)].length,4);
  const storage=memory(),state=C.createProgress(()=>storage);state.setRemember(true);
  assert.deepEqual(Object.keys(JSON.parse(storage.values.get(C.KEY))).sort(),['checked','version']);
});
