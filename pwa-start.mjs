import {addDeviceTools} from './device-tools.mjs';
import {installDeviceApi} from './device-api.mjs';
try{
 const storage=await installDeviceApi();
 const info=document.querySelector('.environment-info');if(info){info.replaceChildren();const strong=document.createElement('strong');strong.textContent='Device-only demonstration';const p=document.createElement('p');p.textContent='Fictional records only. Changes stay in this browser on this device. Demo credentials simulate sign-in on this device. No server synchronisation, live payments or email delivery. Browser data can be cleared.';info.append(strong,p);for(const [label,action]of[['Export device backup',async()=>{const blob=new Blob([JSON.stringify(await storage.exportData(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tadsa-device-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}],['Reset fictional data',async()=>{if(confirm('Erase all TADSA device records and restore fictional examples? Export a backup first.')){await storage.reset();location.reload();}}]]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>action().catch(e=>alert(e.message));info.append(b);}}
 if(info)addDeviceTools(info);
 document.querySelector('.environment summary span:last-child').textContent='Device demo';
 document.querySelector('.environment-strip').textContent='Fictional data only · Saved on this device · No server synchronisation';
 await import('./app.js');
 if('serviceWorker'in navigator){
  let requestedUpdate=false;
  navigator.serviceWorker.addEventListener('controllerchange',()=>{if(requestedUpdate)location.reload();});
  navigator.serviceWorker.register('./sw.js',{scope:'./'}).then(registration=>{
   const offer=()=>{if(!registration.waiting||document.querySelector('#apply-update'))return;const button=document.createElement('button');button.id='apply-update';button.className='secondary';button.textContent='Update ready — reload app';button.onclick=()=>{requestedUpdate=true;registration.waiting?.postMessage('ACTIVATE_UPDATE');};info?.append(button);document.querySelector('.environment summary span:last-child').textContent='Update ready';};
   offer();registration.addEventListener('updatefound',()=>{const worker=registration.installing;worker?.addEventListener('statechange',()=>{if(worker.state==='installed'&&navigator.serviceWorker.controller)offer();});});
  }).catch(()=>{});
 }
}catch(e){const main=document.querySelector('#auth-form-host')||document.querySelector('#content');main.hidden=false;document.querySelector('#auth-open')?.setAttribute('hidden','');const status=document.querySelector('#auth-status');if(status)status.textContent='';main.replaceChildren();const h=document.createElement('h1');h.textContent='Device storage could not open';const p=document.createElement('p');p.textContent='Your saved data has not been erased. Close other TADSA tabs and try again. Storage must be enabled for this demonstration.';main.append(h,p);console.error('Device storage initialization failed:',e.name);}
