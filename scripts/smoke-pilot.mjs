import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const env=Object.fromEntries(readFileSync('.local/pilot.env','utf8').trim().split('\n').map(l=>{const p=l.indexOf('=');return [l.slice(0,p),l.slice(p+1)];}));
const origin=process.env.PILOT_ORIGIN??env.PUBLIC_ORIGIN;
const evidence=[];
function pass(name,details={}){evidence.push({name,...details});console.log('PASS',name,JSON.stringify(details));}
class Client {
 cookie='';csrf='';
 async req(path,body,options={}){const headers={...(this.cookie?{Cookie:this.cookie}:{}),...(body===undefined?{}:{'X-CSRF-Token':this.csrf,...(body instanceof FormData?{}:{'Content-Type':'application/json'})}),...options.headers};const response=await fetch(origin+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers,body:body===undefined?undefined:body instanceof FormData?body:JSON.stringify(body)});const cookie=response.headers.getSetCookie()[0];if(cookie)this.cookie=cookie.split(';')[0];const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={message:text};}if(data.csrf)this.csrf=data.csrf;return {status:response.status,data,bytes:Buffer.byteLength(text),headers:response.headers};}
 async ok(path,body){const r=await this.req(path,body);assert.equal(r.status,body===undefined?200:201,`Unexpected ${r.status} at ${path}: ${r.data.message}`);return r.data;}
 async login(admin=false){await this.ok('/auth/me');return this.ok('/auth/login',admin?{username:env.ADMIN_USERNAME,credential:env.ADMIN_PASSWORD}:{credential:env.LEARNER_INVITE_CODE});}
}
const learner=new Client(),admin=new Client();
assert.equal((await learner.req('/catalog/items')).status,401);
await learner.ok('/auth/me');assert.equal((await learner.req('/auth/login',{credential:env.LEARNER_INVITE_CODE},{headers:{'X-CSRF-Token':''}})).status,403);
await learner.login();assert.equal((await learner.req('/admin/overview')).status,403);
pass('invite, cookie scope, CSRF and learner/admin separation');
let at=performance.now();const page=await learner.req('/catalog/items?limit=12');assert.equal(page.status,200);assert.ok(page.data.total>=1000);assert.equal(page.data.items.length,12);assert.ok(page.bytes<100000);const elapsed=performance.now()-at;
const all=await learner.ok('/catalog/items?learnable=true&limit=50');assert.equal(all.items.length,6);
pass('database-backed pagination and learnable filtering',{total:page.data.total,returned:12,bytes:page.bytes,ms:Math.round(elapsed)});
const media=all.items.flatMap(i=>i.media)[0],signed=await learner.ok(`/media/${media.id}/url?thumbnail=true`);
assert.equal((await fetch(signed.url)).status,200);assert.equal((await fetch(signed.url.split('?')[0])).status,403);assert.equal((await fetch(origin+'/seafoodeck-private/?list-type=2')).status,403);
assert.equal((await learner.req('/does-not-exist')).status,404);
pass('S3 signed read works; unsigned objects/listing denied; API has no SPA fallback');
const flash=await learner.ok('/learning/sessions',{mode:'flashcard',revisionId:all.items[0].revisionId});assert.equal(flash.questions.length,3);assert.ok(!JSON.stringify(flash).includes('Atlantic cod'));
const reveal=await learner.ok(`/learning/sessions/${flash.id}/questions/${flash.questions[0].id}/reveal`,{});assert.equal(reveal.label,'Atlantic cod');assert.equal(reveal.audioAssetId,null);
const answer={key:randomUUID(),answer:{rating:'known'}};const url=`/learning/sessions/${flash.id}/questions/${flash.questions[0].id}/attempts`;
const concurrent=await Promise.all([learner.req(url,answer),learner.req(url,answer)]);assert.ok(concurrent.every(r=>r.status===201));assert.deepEqual(concurrent[0].data,concurrent[1].data);assert.equal((await learner.req(url,{...answer,answer:{rating:'again'}})).status,409);
const other=new Client();await other.login();assert.equal((await other.req('/learning/sessions/'+flash.id)).status,404);
pass('flashcard reveal, simultaneous idempotent submit and cross-session ownership');
const pack=JSON.parse(readFileSync('test-fixtures/pilot-pack.json'));
const match=await learner.ok('/learning/sessions',{mode:'match',kind:'en'});const mq=match.questions[0],pairs={};for(const l of mq.left){const name=pack.names.find(n=>n.kind==='vi'&&n.label===l.label);const en=pack.names.find(n=>n.speciesId===name.speciesId&&n.kind==='en').label;pairs[l.id]=mq.right.find(r=>r.label===en).id;}
const wrong={...pairs},ks=Object.keys(wrong);[wrong[ks[0]],wrong[ks[1]]]=[wrong[ks[1]],wrong[ks[0]]];
const mr=await learner.ok(`/learning/sessions/${match.id}/questions/${mq.id}/attempts`,{key:randomUUID(),answer:{pairs:wrong}});assert.equal(mr.correct,false);assert.equal(mr.items.filter(i=>i.correct).length,1);
const retry=await learner.ok('/learning/sessions',{mode:'review',reviewOf:match.id});assert.notEqual(retry.questions[0].id,mq.id);
const rr=await learner.ok(`/learning/sessions/${retry.id}/questions/${retry.questions[0].id}/attempts`,{key:randomUUID(),answer:{pairs}});assert.equal(rr.correct,true);
const due=await learner.ok('/learning/sessions',{mode:'review',reviewTargets:[{targetId:mr.items[0].targetId,skill:'match:en'}]});assert.equal(due.questions.length,1);
pass('matching per-species scoring, independent retry and due-review reconstruction');
const images=await learner.ok('/learning/sessions',{mode:'image'});assert.equal(images.questions.length,3);assert.equal(new Set(images.questions.map(q=>new URL(q.image.url).pathname)).size,3);assert.ok(!/"(correct|correctOption|targetId|source|explanation|assetId)":/.test(JSON.stringify(images)));
for(const q of images.questions){assert.equal((await fetch(q.image.url)).status,200);const skipped=await learner.ok(`/learning/sessions/${images.id}/questions/${q.id}/attempts`,{key:randomUUID(),answer:{skip:true}});assert.equal(skipped.answered,false);assert.equal(skipped.skipped,true);}
pass('three distinct opaque quiz images, no answer key before submit, skip not answered');
const hs=await learner.ok('/learning/sessions',{mode:'hs'});assert.equal(hs.questions.length,3);
for(const q of hs.questions){const sample=pack.scenarios.find(s=>q.prompt.startsWith(s.title));const code=pack.tariffs.find(t=>t.id===sample.tariffId).code;const option=q.options.find(o=>sample.answerType==='insufficient'?o.label==='Chưa đủ thông tin':o.label===code);const submission={optionId:option.id};if(sample.answerType==='insufficient'){assert.equal((await learner.req(`/learning/sessions/${hs.id}/questions/${q.id}/attempts`,{key:randomUUID(),answer:submission})).status,400);submission.followUpId=q.followUps.find(o=>o.label===sample.followUps.find(f=>f.id===sample.missingFact).label).id;}const result=await learner.ok(`/learning/sessions/${hs.id}/questions/${q.id}/attempts`,{key:randomUUID(),answer:submission});assert.equal(result.correct,true);}
pass('HS whole/fillet distinct codes and mandatory missing-fact follow-up');
await admin.login(true);const overview=await admin.ok('/admin/overview'),original=overview.releases.find(r=>r.id===all.releaseId);assert.ok(original);
const template=(await admin.ok('/admin/csv-template')).csv;const id='qa-'+Date.now();const quote=s=>'"'+s.replaceAll('"','""')+'"';const line=[id,'QA','Cá','SKU kiểm thử nội bộ','Internal QA SKU','','','Synthetic QA data, not customer material','','','Pipeline test only','Not a species claim','','',''].map(quote).join(',');const csv=template+line+'\n';
const bad=await admin.ok('/admin/import/preview',{csv:csv+line+'\n'});assert.equal(bad.errors.length,1);assert.equal((await admin.req('/admin/import',{csv:csv+line+'\n'})).status,400);
const imported=await admin.ok('/admin/import',{csv}),again=await admin.ok('/admin/import',{csv});assert.deepEqual(imported.revisionIds,again.revisionIds);const revisionId=imported.revisionIds[0];assert.equal((await learner.req('/catalog/items/'+revisionId)).status,404);
const upload=async(bytes,name,role='profile')=>{const form=new FormData();form.append('file',new Blob([bytes],{type:'image/jpeg'}),name);for(const [k,v]of Object.entries({source:'Existing licensed fixture, internal pipeline QA only',credit:'QA test; see original fixture NOTICE',rights:'Internal test only; no publication approval',role,aiGenerated:'false',...(role==='pronunciation'?{nameKind:'en'}:{})}))form.append(k,v);return admin.req(`/admin/revisions/${revisionId}/media`,form);};
assert.equal((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),'pretend.jpg')).status,400);assert.equal((await upload(Buffer.from('ID3 broken MP3'),'pretend.mp3','pronunciation')).status,400);
const photo=await upload(readFileSync('test-fixtures/pilot-media/r101-v1.jpg'),'fixture.jpg');assert.equal(photo.status,201);assert.equal((await learner.req(`/media/${photo.data.id}/url`)).status,403);assert.equal((await fetch((await admin.ok(`/media/${photo.data.id}/url`)).url)).status,200);
let audioId=null;try{const audio=await upload(readFileSync('/tmp/seafoodeck-audio-check.mp3'),'internal-tts-test.mp3','pronunciation');assert.equal(audio.status,201);audioId=audio.data.id;assert.equal((await fetch((await admin.ok(`/media/${audioId}/url`)).url)).status,200);}catch(e){if(e.code!=='ENOENT')throw e;}
assert.equal((await admin.req('/admin/releases',{revisionIds:all.items.map(i=>i.revisionId),internal:false})).status,400);
const firstGame=await learner.ok('/learning/sessions/'+flash.id);
const published=await admin.ok('/admin/releases',{revisionIds:[...original.items.map(i=>i.revisionId),revisionId],internal:true});
assert.equal((await learner.ok('/catalog/items?q='+id)).items.length,0); // ID is stable metadata, not an implicit searchable name.
assert.equal((await learner.ok('/catalog/items?q='+encodeURIComponent('SKU kiểm thử nội bộ'))).items.length,1);
assert.equal((await learner.ok('/learning/sessions/'+flash.id)).releaseId,firstGame.releaseId);
await admin.ok(`/admin/releases/${original.id}/rollback`,{});assert.equal((await learner.ok('/catalog/items?limit=1')).releaseId,original.id);
pass('CSV atomicity/idempotence, draft ACL, media validation, internal publish without rebuild and rollback',{audioPipelineDraft:audioId?1:0,approvedCustomerAudio:0});
const clone=await admin.ok(`/admin/revisions/${revisionId}/clone`,{});assert.notEqual(clone.id,revisionId);
await admin.ok(`/admin/media/${photo.data.id}/revoke`,{});assert.equal((await admin.req(`/media/${photo.data.id}/url`)).status,404);
pass('media revision clone and revocation stop new signed URLs');
writeFileSync('.local/smoke-evidence.json',JSON.stringify({at:new Date().toISOString(),origin,evidence,qa:{revisionId,photoId:photo.data.id,audioId,releaseId:published.id}},null,2)+'\n',{mode:0o600});
console.log('All internal smoke checks passed. No real content was approved.');
