// Only a fixed schema of booleans/numbers is printed. Never print logs or inspect JSON.
import {execFileSync} from 'node:child_process';
const compose=['compose','--env-file','.local/pilot.env'];
const run=args=>{try{return execFileSync('docker',args,{encoding:'utf8',stdio:['pipe','pipe','pipe']});}catch{return '';}};
for(const service of ['storage','api','migrate']){
 const id=run([...compose,'ps','-aq',service]).trim();
 if(!/^[a-f0-9]{12,64}$/.test(id))continue;
 const state=run(['inspect','--format','{{.State.OOMKilled}} {{.State.ExitCode}} {{.RestartCount}}',id]).trim().split(' ');
 const logs=run([...compose,'logs','--no-color','--tail','150',service]);
 console.log(JSON.stringify({service,oomKilled:state[0]==='true',exitCode:Number(state[1]),restartCount:Number(state[2]),
 permissionDenied:/permission denied/i.test(logs),diskSpace:/no space|disk.*full|insufficient.*space/i.test(logs),
 memoryFailure:/out of memory|cannot allocate memory|bad_alloc/i.test(logs),bindFailure:/address already in use|cannot assign requested address/i.test(logs),
 unsupportedFlag:/flag provided but not defined|unknown flag/i.test(logs),connectionRefused:/connection refused/i.test(logs),
 resolveFailure:/no such host|lookup .*failed/i.test(logs),levelDbFailure:/leveldb.*error|leveldb.*failed/i.test(logs),
 missingFile:/no such file or directory/i.test(logs),ipv6Failure:/network is unreachable|address family not supported/i.test(logs),
 fatal:/fatal|panic:/i.test(logs)}));
}
