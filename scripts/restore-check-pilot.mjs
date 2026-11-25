// Restore only into an isolated local project, never the active stack.
// Ports 18091/18092: the active stack uses 18089 (learner) and 18090 (Studio).
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
const backup=process.argv[2];if(!/^_backups\/[a-zA-Z0-9_.-]+$/.test(backup))throw Error('Supply an existing _backups/<name>.');
const source=readFileSync('.local/pilot.env','utf8');
const env=Object.fromEntries(source.trim().split('\n').filter(l=>l.includes('=')&&!l.startsWith('#')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i),l.slice(i+1)];}));
const project=process.env.RESTORE_PROJECT_NAME??'seafoodeck-restore-check';
if(!/^seafoodeck-restore-[a-z0-9-]+$/.test(project))throw Error('Use a separate seafoodeck-restore-* project.');
Object.assign(env,{PILOT_PROJECT_NAME:project,PILOT_ENV_FILE:'.local/restore.env',PUBLIC_ORIGIN:'http://127.0.0.1:18091',S3_PUBLIC_ENDPOINT:'http://127.0.0.1:18091',WEB_PORT:'18091',STUDIO_ORIGIN:'http://localhost:18092',STUDIO_WEB_PORT:'18092'});
writeFileSync('.local/restore.env',Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
const docker=(...args)=>execFileSync('docker',['compose','--env-file','.local/restore.env',...args],{encoding:'utf8',stdio:['pipe','pipe','pipe'],maxBuffer:10*1024*1024});
assert.equal(docker('ps','-aq').trim(),'','Restore check refuses to reuse an existing project.');
mkdirSync('.local/restore-inventory',{recursive:true});
try{
 docker('up','-d','--wait','db','storage');
 execFileSync('docker',['compose','--env-file','.local/restore.env','exec','-T','db','psql','-v','ON_ERROR_STOP=1','-U',env.POSTGRES_USER,'-d',env.POSTGRES_DB],{input:readFileSync(backup+'/db.sql'),stdio:['pipe','pipe','pipe']});
 const restored=JSON.parse(docker('run','--rm','--no-deps','--user','0','-v',process.cwd()+'/'+backup+':/backup:ro','-e','BACKUP_DIR=/backup','api','node','dist/objects.js','restore').trim());
 docker('run','--rm','migrate');docker('up','-d','api','web');
 for(let i=0;i<120;i++){try{if((await fetch(env.PUBLIC_ORIGIN+'/api/v1/health')).ok)break;}catch{}await new Promise(r=>setTimeout(r,500));}
 assert.equal((await fetch(env.PUBLIC_ORIGIN+'/api/v1/health')).status,200);
 docker('run','--rm','--no-deps','--user','0','-v',process.cwd()+'/.local/restore-inventory:/backup','-e','BACKUP_DIR=/backup','api','node','dist/objects.js','inventory');
 const normalize=rows=>rows.map(({key,sha256,mime})=>({key,sha256,mime})).sort((a,b)=>a.key.localeCompare(b.key));
 const expected=JSON.parse(readFileSync(backup+'/objects.json'));assert.deepEqual(normalize(JSON.parse(readFileSync('.local/restore-inventory/objects.json'))),normalize(expected));
 const me=await fetch(env.PUBLIC_ORIGIN+'/api/v1/auth/me');let cookie=me.headers.getSetCookie()[0].split(';')[0],csrf=(await me.json()).csrf;
 const login=await fetch(env.PUBLIC_ORIGIN+'/api/v1/auth/login',{method:'POST',headers:{Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({credential:env.LEARNER_INVITE_CODE})});assert.equal(login.status,201);cookie=login.headers.getSetCookie()[0].split(';')[0];
 const page=await fetch(env.PUBLIC_ORIGIN+'/api/v1/catalog/items?limit=12',{headers:{Cookie:cookie}});assert.equal(page.status,200);const catalog=await page.json();assert.equal(catalog.total,1000);const media=catalog.items.flatMap(i=>i.media)[0];const signed=await(await fetch(env.PUBLIC_ORIGIN+`/api/v1/media/${media.id}/url`,{headers:{Cookie:cookie}})).json();assert.equal((await fetch(signed.url)).status,200);
 const evidence={restoredObjects:restored.restoredObjects,hashesMatch:true,itemCount:catalog.total,releaseId:catalog.releaseId,privateMediaRead:200,isolatedProject:project};writeFileSync('.local/restore-evidence.json',JSON.stringify(evidence,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(evidence));
}finally{docker('stop');}
