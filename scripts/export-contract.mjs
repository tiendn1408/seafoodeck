import {mkdirSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);mkdirSync(new URL('docs/api/',root),{recursive:true});
execFileSync(process.execPath,['apps/api/dist/main.js'],{cwd:fileURLToPath(root),env:{...process.env,EXPORT_OPENAPI:fileURLToPath(new URL('docs/api/openapi.json',root))},stdio:'inherit'});
