import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {chromium} from '@playwright/test';
const env=Object.fromEntries(readFileSync('.local/pilot.env','utf8').trim().split('\n').map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
const origin=env.PUBLIC_ORIGIN,args=['compose','--env-file','.local/pilot.env'];
const docker=(...tail)=>execFileSync('docker',[...args,...tail],{encoding:'utf8',stdio:['pipe','pipe','pipe']});
function db(code){return JSON.parse(docker('exec','-T','api','node','-e',`require('reflect-metadata');const {Db}=require('./dist/db');const db=new Db();(async()=>{try{const result=await(async()=>{${code}})();console.log(JSON.stringify(result));}finally{await db.$disconnect();}})().catch(()=>process.exit(1));`));}
const evidence=[];const pass=(name,details={})=>{evidence.push({name,...details});console.log('PASS',name,JSON.stringify(details));};
let cookie='',csrf='';
async function request(path,body){const response=await fetch(origin+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{...(cookie?{Cookie:cookie}:{}),...(body===undefined?{}:{'Content-Type':'application/json','X-CSRF-Token':csrf})},body:body===undefined?undefined:JSON.stringify(body)});const c=response.headers.getSetCookie()[0];if(c)cookie=c.split(';')[0];const text=await response.text();let data;try{data=JSON.parse(text);}catch{data={text};}if(data.csrf)csrf=data.csrf;return{status:response.status,data};}
await request('/auth/me');assert.equal((await request('/auth/login',{credential:env.LEARNER_INVITE_CODE})).status,201);
const actorId=createHash('sha256').update(cookie.slice(cookie.indexOf('=')+1)).digest('hex');
db(`await db.authSession.update({where:{id:${JSON.stringify(actorId)}},data:{internal:false}});return true;`);
assert.equal((await request('/catalog/items')).status,404);
db(`await db.authSession.update({where:{id:${JSON.stringify(actorId)}},data:{internal:true}});return true;`);
pass('a learner without internal scope cannot read the internal release');
const started=await request('/learning/sessions',{mode:'flashcard'});assert.equal(started.status,201);const game=started.data;
db(`await db.gameSession.update({where:{id:${JSON.stringify(game.id)}},data:{expiresAt:new Date('2000-01-01')}});return true;`);
assert.equal((await request('/learning/sessions/'+game.id)).status,410);assert.equal((await request(`/learning/sessions/${game.id}/questions/${game.questions[0].id}/attempts`,{key:randomUUID(),answer:{rating:'known'}})).status,410);
assert.equal(db(`return db.attempt.count({where:{questionId:${JSON.stringify(game.questions[0].id)}}});`),0);
pass('expired session rejects reads/submits without adding an attempt');
const signed=db(`process.env.SIGNED_URL_TTL_SECONDS='1';const {Catalog}=require('./dist/catalog');const {Media}=require('./dist/media');const asset=await db.mediaAsset.findFirstOrThrow({where:{role:'identification',revokedAt:null}});return new Media(db,new Catalog(db)).url(asset);`);
assert.equal((await fetch(signed.url)).status,200);await new Promise(r=>setTimeout(r,2200));assert.equal((await fetch(signed.url)).status,403);
pass('SeaweedFS enforces real presigned URL expiry');
let stoppedDb=false,stoppedApi=false,browser;
async function ready(){for(let n=0;n<100;n++){try{if((await fetch(origin+'/api/v1/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error('Stack did not recover.');}
try{
 docker('stop','db');stoppedDb=true;const down=await request('/catalog/items?limit=12');assert.ok(down.status>=500);assert.ok(!down.data.items);docker('start','db');stoppedDb=false;await ready();pass('DB failure returns an error, never a synthetic catalogue');
 browser=await chromium.launch();const context=await browser.newContext();const [name,value]=cookie.split('=');await context.addCookies([{name,value,url:origin,httpOnly:true,sameSite:'Strict'}]);const page=await context.newPage();await page.goto(origin+'/#library');await page.locator('.library-card').first().waitFor();
 docker('stop','api');stoppedApi=true;await page.reload();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.library-card').count(),0);docker('start','api');stoppedApi=false;await ready();await page.reload();await page.locator('.library-card').first().waitFor();pass('stopped API produces a visible browser error and recovers without fixture fallback');
 const logs=docker('logs','--no-color','api');assert.ok(!logs.includes('X-Amz-Signature'));assert.ok(!logs.includes(env.S3_SECRET_KEY));assert.ok(!logs.includes(env.ADMIN_PASSWORD));assert.ok(logs.includes('requestId'));pass('request logs contain correlation IDs without secrets or signed URL query strings');
}finally{if(stoppedDb)docker('start','db');if(stoppedApi)docker('start','api');await browser?.close();}
writeFileSync('.local/resilience-evidence.json',JSON.stringify({at:new Date().toISOString(),evidence},null,2)+'\n',{mode:0o600});
