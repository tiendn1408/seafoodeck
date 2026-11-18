const origin=process.env.PILOT_ORIGIN??'http://127.0.0.1:18089';
for(let attempt=0;attempt<120;attempt++){
  try{const response=await fetch(origin+'/api/v1/health',{signal:AbortSignal.timeout(3000)});if(response.ok){console.log('Pilot API ready.');process.exit(0);}}catch{}
  await new Promise(resolve=>setTimeout(resolve,500));
}
throw Error('Pilot API did not become ready.');
