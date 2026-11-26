// End-to-end check of phase 2.5a learner accounts against the LOCAL Docker pilot stack.
// Reads .local/pilot.env itself and never prints secrets, passwords, invite codes or tokens.
// Side effects: creates QA users (`qa-student-*`, `qa-student2-*`, `qa-mustchange-*`, `qa-manager-*`,
// and with --stress `qa-stress-*`) with random in-memory passwords that stay in the DB, and publishes one
// internal release with the same revisions as the current one (check f), rolling back right after.
// Refuses non-loopback origins (PILOT_ORIGIN) unless --allow-nonlocal is given. Never run on VPS/production.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomBytes, randomUUID} from 'node:crypto';
import {refuseNonLocal} from './local-origin.mjs';
const origin=process.env.PILOT_ORIGIN??'http://127.0.0.1:18089';
const env=Object.fromEntries(readFileSync('.local/pilot.env','utf8').trim().split('\n').filter(l=>l.includes('=')).map(l=>{const p=l.indexOf('=');return [l.slice(0,p),l.slice(p+1)];}));
// Phase 2.5e: admin and manager sign in on the Studio host (PILOT_STUDIO_ORIGIN, else STUDIO_ORIGIN from the env file).
const studio=process.env.PILOT_STUDIO_ORIGIN??env.STUDIO_ORIGIN??origin;
for(const o of new Set([origin,studio])){const refusal=refuseNonLocal(o,process.argv.slice(2));if(refusal){console.error(refusal);process.exit(2);}}
const results=[];
const secret=()=>randomBytes(18).toString('base64url');
class Client {
 cookie='';csrf='';
 constructor(base=origin){this.base=base;}
 async req(path,body,options={}){const method=options.method??(body===undefined?'GET':'POST');const headers={Origin:this.base,...(this.cookie?{Cookie:this.cookie}:{}),...(method==='GET'?{}:{'X-CSRF-Token':this.csrf,'Content-Type':'application/json'}),...options.headers};const response=await fetch(this.base+'/api/v1'+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const cookie=response.headers.getSetCookie()[0];if(cookie)this.cookie=cookie.split(';')[0];const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={message:text.slice(0,200)};}if(data&&data.csrf)this.csrf=data.csrf;return {status:response.status,data};}
 async ok(path,body,options){const r=await this.req(path,body,options);const want=(options?.method??(body===undefined?'GET':'POST'))==='POST'?201:200;assert.equal(r.status,want,`Unexpected ${r.status} at ${path}: ${JSON.stringify(r.data?.message)}`);return r.data;}
 async login(credential,username){await this.ok('/auth/me');const r=await this.req('/auth/login',username?{username,credential}:{credential});assert.equal(r.status,201,`login ${username??'invite'} -> ${r.status} ${JSON.stringify(r.data?.message)}`);await this.ok('/auth/me');return r.data;}
}
const SKIP=Symbol('skip');
async function check(id,name,fn){
 try{const details=await fn();if(details?.[SKIP]){results.push({id,name,ok:true,skipped:true,details:details.reason});console.log(`SKIP (${id}) ${name}: not applicable: ${details.reason}`);return;}results.push({id,name,ok:true,details});console.log(`PASS (${id}) ${name}`+(details?' '+JSON.stringify(details):''));}
 catch(e){results.push({id,name,ok:false,error:e.message});console.log(`FAIL (${id}) ${name}: ${e.message}`);}
}
const attempt=(c,s,q,answer,key=randomUUID())=>c.req(`/learning/sessions/${s}/questions/${q}/attempts`,{key,answer});
const progress=c=>c.ok('/me/progress');
const stamp=Date.now().toString(36);
const admin=new Client(studio);await admin.login(env.ADMIN_PASSWORD,env.ADMIN_USERNAME);
const users={student:{username:`qa-student-${stamp}`,password:secret(),role:'student'},student2:{username:`qa-student2-${stamp}`,password:secret(),role:'student'},must:{username:`qa-mustchange-${stamp}`,password:secret(),role:'student',mustChangePassword:true},manager:{username:`qa-manager-${stamp}`,password:secret(),role:'manager'}};
for(const u of Object.values(users)){const created=await admin.ok('/admin/users',{username:u.username,password:u.password,role:u.role,displayName:'QA nội bộ',mustChangePassword:u.mustChangePassword??false});assert.equal(created.role,u.role);assert.equal(created.mustChangePassword,u.mustChangePassword??false);}
console.log('Created QA users (passwords random, not printed):',Object.values(users).map(u=>`${u.username}:${u.role}${u.mustChangePassword?'+mustChange':''}`).join(', '));
const student=new Client();await student.login(users.student.password,users.student.username);
let flashA,home,revisionId;
await check('a','/me/home returns a valid cast.kind',async()=>{home=await student.ok('/me/home');assert.ok(['review','flashcard','done'].includes(home.cast?.kind),`cast.kind=${home.cast?.kind}`);assert.equal(home.due,0);assert.equal(home.activeSessionId,null);return {cast:home.cast.kind,learnable:home.learnable,releaseId:home.releaseId};});
await check('b','flashcard self-rating is logged and shows in /me/progress',async()=>{
 revisionId=home.cast.kind==='flashcard'?home.cast.revisionId:(await student.ok('/catalog/items?learnable=true&limit=1')).items[0].revisionId;
 flashA=await student.ok('/learning/sessions',{mode:'flashcard',revisionId});assert.equal(flashA.questions.length,3);
 await student.ok(`/learning/sessions/${flashA.id}/questions/${flashA.questions[0].id}/reveal`,{});
 const r=await attempt(student,flashA.id,flashA.questions[0].id,{rating:'known'});assert.equal(r.status,201);assert.equal(r.data.selfRated,true);assert.equal(r.data.progress?.length,1,'submit response carries progress for students');
 const p=await progress(student);assert.ok(p.sessions.length>=1);assert.ok(p.figures.selfRated>=1);
 return {sessions:p.sessions.length,selfRated:p.figures.selfRated,progressStage:r.data.progress[0].stage};
});
await check('c','concurrent double submit with the same key: same result, one log row',async()=>{
 const before=(await progress(student)).figures.selfRated;const key=randomUUID(),q=flashA.questions[1].id;
 const both=await Promise.all([attempt(student,flashA.id,q,{rating:'again'},key),attempt(student,flashA.id,q,{rating:'again'},key)]);
 assert.deepEqual(both.map(r=>r.status),[201,201],`statuses ${both.map(r=>r.status)} ${JSON.stringify(both.map(r=>r.data?.message))}`);assert.deepEqual(both[0].data,both[1].data);
 const after=(await progress(student)).figures.selfRated;assert.equal(after-before,1,`selfRated grew by ${after-before}`);
 const replay=await attempt(student,flashA.id,q,{rating:'again'},key);assert.equal(replay.status,201);assert.deepEqual(replay.data,both[0].data);
 assert.equal((await progress(student)).figures.selfRated,after,'replay must not log again');
 return {statuses:both.map(r=>r.status),logDelta:after-before};
});
let flashB;
await check('d','different questions of the same item submitted concurrently: no error, all written',async()=>{
 const rounds=[];const p0=(await progress(student)).figures.selfRated;
 // Round 1: last question of session A and all three of a new session on the same item at once,
 // so two writes hit the same (target, skill) row and three hit the same item.
 flashB=await student.ok('/learning/sessions',{mode:'flashcard',revisionId});
 assert.equal(flashB.questions.length,3);
 const batch=[attempt(student,flashA.id,flashA.questions[2].id,{rating:'known'}),...flashB.questions.map(q=>attempt(student,flashB.id,q.id,{rating:'known'}))];
 const r1=await Promise.all(batch);rounds.push(r1.map(r=>r.status));
 // Rounds 2-4: three fresh sessions on one item, all nine answers at once.
 for(let i=0;i<3;i++){const s=await student.ok('/learning/sessions',{mode:'flashcard',revisionId});const r=await Promise.all(s.questions.map(q=>attempt(student,s.id,q.id,{rating:i%2?'again':'known'})));rounds.push(r.map(x=>x.status));}
 const flat=rounds.flat();assert.ok(flat.every(s=>s===201),`statuses ${JSON.stringify(rounds)}`);
 const p1=(await progress(student)).figures.selfRated;assert.equal(p1-p0,flat.length,`expected ${flat.length} new log rows, got ${p1-p0}`);
 const review=await student.ok('/me/review');const rows=[...review.due,...review.scheduled];
 return {rounds,newLogRows:p1-p0,reviewRows:rows.length};
});
let masteryBefore;
await check('i','skipped name-matching question: logged, ReviewProgress and mastery unchanged',async()=>{
 masteryBefore=await student.ok('/me/mastery');const reviewBefore=await student.ok('/me/review');const pBefore=await progress(student);
 const m=await student.ok('/learning/sessions',{mode:'match',kind:'en'});const r=await attempt(student,m.id,m.questions[0].id,{skip:true});
 assert.equal(r.status,201);assert.equal(r.data.skipped,true);assert.deepEqual(r.data.progress,[]);
 const p=await progress(student);const entry=p.sessions.find(s=>s.sessionId===m.id);
 assert.ok(entry,'the skipped match session appears in /me/progress sessions (log rows exist)');assert.equal(entry.answered,0);assert.equal(entry.selfRated,0);
 assert.deepEqual(p.figures,pBefore.figures,'figures ignore skipped rows');
 assert.deepEqual(await student.ok('/me/review'),reviewBefore,'ReviewProgress unchanged');assert.deepEqual(await student.ok('/me/mastery'),masteryBefore,'mastery unchanged');
 const summary=await student.ok(`/learning/sessions/${m.id}/summary`);assert.equal(summary.total,1);assert.equal(summary.entries[0].skipped,true);assert.equal(summary.caught,0);
 return {sessionEntry:{mode:entry.mode,answered:entry.answered},summaryTotal:summary.total};
});
await check('j','listening target logged against its item without breaking /me/mastery',async()=>{
 const s=await student.req('/learning/sessions',{mode:'listening',kind:'en'});
 if(s.status===400)return {[SKIP]:true,reason:s.data.message};
 assert.equal(s.status,201);const q=s.data.questions[0];const r=await attempt(student,s.data.id,q.id,{optionId:q.options[0].id});assert.equal(r.status,201);
 const mastery=await student.ok('/me/mastery');assert.ok(Object.keys(mastery).length>0);const p=await progress(student);assert.ok(p.sessions.some(x=>x.sessionId===s.data.id));
 return {applicable:true,correct:r.data.correct,progress:r.data.progress};
});
await check('k','server-chosen review: nothing due -> 400, client reviewTargets ignored',async()=>{
 const review=await student.ok('/me/review');assert.equal(review.due.length,0);assert.ok(review.scheduled.length>0);
 const plain=await student.req('/learning/sessions',{mode:'review'});assert.equal(plain.status,400);assert.equal(plain.data.message,'Chưa có mục nào đến hạn ôn.');
 const forced=await student.req('/learning/sessions',{mode:'review',reviewTargets:review.scheduled.slice(0,2).map(e=>({targetId:e.targetId,skill:e.skill}))});
 assert.equal(forced.status,400,`client reviewTargets must be ignored, got ${forced.status}`);assert.equal(forced.data.message,'Chưa có mục nào đến hạn ôn.');
 const flashWithTargets=await student.req('/learning/sessions',{mode:'flashcard',reviewTargets:[{targetId:review.scheduled[0].targetId,skill:review.scheduled[0].skill}]});
 assert.equal(flashWithTargets.status,201,'reviewTargets on a non-review mode are dropped for students');assert.equal(flashWithTargets.data.mode,'flashcard');
 return {scheduled:review.scheduled.length};
});
await check('m','session summary of a finished session',async()=>{
 const s=await student.ok(`/learning/sessions/${flashB.id}/summary`);assert.equal(s.total,3);assert.equal(s.entries.length,3);
 for(const e of s.entries){assert.equal(e.skipped,false);assert.equal(typeof e.nextReviewInDays,'number');assert.ok(e.nextReviewInDays>=0);}
 const a=await student.ok(`/learning/sessions/${flashA.id}/summary`);assert.equal(a.total,3);
 return {total:s.total,caught:s.caught,nextReviewInDays:s.entries.map(e=>e.nextReviewInDays)};
});
let snapshot;
await check('e','a new login (new session) still sees the progress',async()=>{
 snapshot={progress:await progress(student),mastery:await student.ok('/me/mastery'),review:await student.ok('/me/review')};
 const again=new Client();await again.login(users.student.password,users.student.username);
 const p=await progress(again);assert.deepEqual(p.figures,snapshot.progress.figures);assert.deepEqual(p.sessions,snapshot.progress.sessions);assert.deepEqual(await again.ok('/me/mastery'),snapshot.mastery);
 assert.equal((await again.req(`/learning/sessions/${flashA.id}`)).status,404,'game sessions stay bound to their own login');
 return {sessions:p.sessions.length,selfRated:p.figures.selfRated};
});
await check('f','new internal release with the same revisions: /me/mastery unchanged',async()=>{
 const current=(await student.ok('/me/home')).releaseId;const overview=await admin.ok('/admin/overview');const original=overview.releases.find(r=>r.id===current);
 assert.ok(original,'overview must list the release learners are served');assert.equal(original.current,true,'overview flags it as current');assert.equal(original.internal,true,'local stack serves an internal release');
 const published=await admin.ok('/admin/releases',{revisionIds:original.items.map(i=>i.revisionId),internal:true});
 try{
  assert.equal((await student.ok('/me/home')).releaseId,published.id,'student now sees the new release');
  assert.deepEqual(await student.ok('/me/mastery'),snapshot.mastery,'mastery must not reset');
  assert.deepEqual(await student.ok('/me/review'),snapshot.review,'review schedule must not reset');
  assert.deepEqual((await progress(student)).mastery,snapshot.progress.mastery);
 } finally {await admin.ok(`/admin/releases/${original.id}/rollback`,{});}
 assert.equal((await student.ok('/me/home')).releaseId,original.id);
 return {original:original.id,published:published.id,rolledBack:true};
});
await check('g','role separation: invite learner, second student, manager',async()=>{
 const learner=new Client();await learner.login(env.LEARNER_INVITE_CODE);
 for(const p of ['/me/home','/me/progress','/me/mastery','/me/review'])assert.equal((await learner.req(p)).status,403,`learner ${p}`);
 const s2=new Client();await s2.login(users.student2.password,users.student2.username);
 const p2=await progress(s2);assert.equal(p2.sessions.length,0);assert.equal(p2.figures.selfRated,0);assert.equal(p2.figures.answered,0);
 const r2=await s2.ok('/me/review');assert.equal(r2.due.length+r2.scheduled.length,0);
 const m2=await s2.ok('/me/mastery');assert.ok(Object.keys(m2).length>0);assert.ok(Object.values(m2).every(m=>m.status==='new'&&m.level===0));
 assert.equal((await s2.req(`/learning/sessions/${flashA.id}`)).status,404);assert.equal((await s2.req(`/learning/sessions/${flashA.id}/summary`)).status,404);
 assert.equal((await attempt(s2,flashA.id,flashA.questions[0].id,{rating:'known'})).status,404);
 const manager=new Client(studio);await manager.login(users.manager.password,users.manager.username);
 for(const p of ['/me/home','/me/progress','/me/mastery','/me/review'])assert.equal((await manager.req(p)).status,403,`manager ${p}`);
 assert.equal((await manager.ok('/me')).role,'manager');
 return {learner403:4,manager403:4,student2Isolated:true};
});
await check('h+l','mustChangePassword: only the password change works until done',async()=>{
 const c=new Client();await c.login(users.must.password,users.must.username);
 const me=await c.ok('/me');assert.equal(me.mustChangePassword,true);
 const blocked=[['/me/home'],['/me/progress'],['/catalog/items?limit=1'],['/learning/sessions',{mode:'flashcard'}],['/me',{displayName:'x'},{method:'PATCH'}]];
 for(const [p,b,o] of blocked){const r=await c.req(p,b,o);assert.equal(r.status,403,`${p} -> ${r.status}`);assert.equal(r.data.code,'MUST_CHANGE_PASSWORD',`${p} code ${r.data.code}`);}
 const same=await c.req('/me/password',{current:users.must.password,next:users.must.password});assert.equal(same.status,400);assert.equal(same.data.message,'Mật khẩu mới phải khác mật khẩu hiện tại.');
 assert.equal((await c.req('/me/password',{current:'wrong-password-x',next:secret()})).status,400);
 assert.equal((await c.req('/me/home')).status,403,'still blocked after failed changes');
 const next=secret();await c.ok('/me/password',{current:users.must.password,next});users.must.password=next;
 assert.equal((await c.ok('/me')).mustChangePassword,false);const h=await c.ok('/me/home');assert.ok(['review','flashcard','done'].includes(h.cast.kind));
 assert.equal((await c.req('/learning/sessions',{mode:'flashcard'})).status,201);
 const fresh=new Client();await fresh.login(next,users.must.username);assert.equal((await fresh.req('/me/home')).status,200);
 return {blocked:blocked.length,afterChange:'normal access'};
});
// Optional `--stress`: one student answers one item 9 at a time (10 rounds), then two students do the
// same at once. Acceptance: no 5xx and every 201 is logged exactly once (no lost or partial writes).
if(process.argv.includes('--stress')){
 const stressUser=async label=>{const u={username:`qa-stress-${label}-${stamp}`,password:secret()};await admin.ok('/admin/users',{username:u.username,password:u.password,role:'student'});const c=new Client();await c.login(u.password,u.username);return c;};
 const hammer=async c=>{const tally={};for(let i=0;i<10;i++){const games=await Promise.all([0,1,2].map(()=>c.ok('/learning/sessions',{mode:'flashcard',revisionId})));const out=await Promise.all(games.flatMap(g=>g.questions.map(q=>attempt(c,g.id,q.id,{rating:'known'}))));for(const o of out)tally[o.status]=(tally[o.status]??0)+1;}const logged=(await progress(c)).figures.selfRated;return {statuses:tally,logged};};
 const verdict=r=>{assert.ok(Object.keys(r.statuses).every(s=>s==='201'||s==='409'),`statuses ${JSON.stringify(r.statuses)}`);assert.equal(r.logged,r.statuses[201]??0,'logged rows must equal 201 responses');};
 await check('s1','stress: one student, 9 concurrent answers x 10 rounds',async()=>{const r=await hammer(await stressUser('a'));verdict(r);return r;});
 await check('s2','stress: two students at once, isolated',async()=>{const [b,c]=await Promise.all([stressUser('b'),stressUser('c')]);const t0=Date.now();const [rb,rc]=await Promise.all([hammer(b),hammer(c)]);verdict(rb);verdict(rc);return {b:rb,c:rc,ms:Date.now()-t0};});
}
console.log('\nSummary:');for(const r of results)console.log(`${r.ok?(r.skipped?'SKIP':'PASS'):'FAIL'} (${r.id}) ${r.name}`);
const failed=results.filter(r=>!r.ok),skipped=results.filter(r=>r.skipped),passed=results.length-failed.length-skipped.length;
const tally=`${passed} passed, ${skipped.length} skipped, ${failed.length} failed`;
if(failed.length){console.log(`${tally}.`);process.exit(1);}
console.log(`${tally}. QA users stay in the local DB; one extra internal release was published and rolled back; no secrets printed.`);
