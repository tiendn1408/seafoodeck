import { randomBytes } from 'node:crypto';
import { mkdir, writeFile, access } from 'node:fs/promises';
const dir = new URL('../.local/',import.meta.url);
await mkdir(dir,{recursive:true,mode:0o700});
try { await access(new URL('pilot.env',dir)); throw Error('pilot.env already exists; keep existing credentials.'); } catch(e) { if(e.code!=='ENOENT') throw e; }
const production=process.argv.includes('--production');
const originFlag=process.argv.indexOf('--origin');
// Same rule as the API's startup check: a bare http(s) origin; slash, capitals and default port are normalised away, and the
// normalised value is what lands in PUBLIC_ORIGIN/STUDIO_ORIGIN and in the S3 CORS list built from them.
const bareOrigin=(flag,v)=>{
  let u;try{u=new URL(v);}catch{throw Error(`${flag} is not a valid URL.`);}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.pathname!=='/'||u.search||u.hash)throw Error(`${flag} must be a bare http(s) origin (scheme and host, no path, query or credentials).`);
  return u.origin;
};
const origin=originFlag>=0?bareOrigin('--origin',process.argv[originFlag+1]):'http://127.0.0.1:18089';
const studioFlag=process.argv.indexOf('--studio-origin');
// Staff realm: its own origin (local: the second published port, addressed as localhost). Production needs --studio-origin.
const studioOrigin=studioFlag>=0?bareOrigin('--studio-origin',process.argv[studioFlag+1]):production?undefined:'http://localhost:18090';
if(production&&!origin.startsWith('https://'))throw Error('Production origin must use HTTPS.');
if(production&&studioOrigin&&!studioOrigin.startsWith('https://'))throw Error('Production studio origin must use HTTPS.');
if(studioFlag>=0&&process.argv[studioFlag+1]!==studioOrigin)throw Error(`STUDIO_ORIGIN must be written exactly as ${studioOrigin} (it is also the S3 CORS entry).`);
if(studioOrigin===origin)throw Error('Studio origin must differ from the learner origin.');
// Caddy address of the Studio site: production = its host name (automatic HTTPS); local = plain HTTP
// on container port 8090 (local compose.yaml publishes it as 127.0.0.1:STUDIO_WEB_PORT; the VPS compose publishes no Studio port), answering to the origin's host.
const studioSiteAddress=o=>production?new URL(o).hostname:`http://${new URL(o).hostname}:8090`;
const secret=()=>randomBytes(24).toString('hex');
const db=secret(),key='sd'+secret().slice(0,18),s3=secret();
const env={POSTGRES_DB:'seafoodeck',POSTGRES_USER:'seafoodeck',POSTGRES_PASSWORD:db,DATABASE_URL:`postgresql://seafoodeck:${db}@db:5432/seafoodeck`,S3_ENDPOINT:'http://storage:8333',S3_REGION:'us-east-1',S3_BUCKET:'seafoodeck-private',S3_ACCESS_KEY:key,S3_SECRET_KEY:s3,PUBLIC_ORIGIN:origin,...(studioOrigin?{STUDIO_ORIGIN:studioOrigin}:{}),S3_PUBLIC_ENDPOINT:origin,SITE_ADDRESS:production?new URL(origin).hostname:':80',...(studioOrigin?{STUDIO_SITE_ADDRESS:studioSiteAddress(studioOrigin)}:{}),WEB_PORT:'18089',STUDIO_WEB_PORT:'18090',COOKIE_SECURE:String(production),ALLOW_INTERNAL_DEMO:String(!production||process.argv.includes('--internal-demo')),EXPOSE_API_DOCS:'false',LEARNER_INVITE_CODE:secret(),ADMIN_USERNAME:'owner',ADMIN_PASSWORD:secret(),SIGNED_URL_TTL_SECONDS:'120',AUTH_TTL_HOURS:'24',GAME_TTL_MINUTES:'120',WEB_IMAGE_REF:'ghcr.io/tiendn1408/seafoodeck-web:pilot-internal-20261118-r2',API_IMAGE_REF:'ghcr.io/tiendn1408/seafoodeck-api:pilot-internal-20261118-r2'};
await writeFile(new URL('pilot.env',dir),Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n')+'\n',{mode:0o600});
await writeFile(new URL('s3.json',dir),JSON.stringify({identities:[{name:'seafoodeck-api',credentials:[{accessKey:key,secretKey:s3}],actions:['Admin','Read','Write','List','Tagging']}]},null,2),{mode:0o600});
if(!studioOrigin)console.log('Warning: no --studio-origin given; STUDIO_ORIGIN and STUDIO_SITE_ADDRESS are unset: staff and learners share one origin and the Studio app is not served.');
console.log('Created .local/pilot.env and s3.json. Credentials stay local; open the env file privately to use them.');
