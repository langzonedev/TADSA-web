import {addDeviceTools} from './device-tools.mjs';
import {installDeviceApi} from './device-api.mjs';
try{
 const storage=await installDeviceApi();
 const info=document.querySelector('.environment-info');if(info){info.replaceChildren();const strong=document.createElement('strong');strong.textContent='Device-only demonstration';const p=document.createElement('p');p.textContent='Fictional records only. Changes stay in this browser on this device. No server synchronisation, staff sign-in, live payments or email delivery. Browser data can be cleared.';info.append(strong,p);for(const [label,action]of[['Export device backup',async()=>{const blob=new Blob([JSON.stringify(await storage.exportData(),null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='tadsa-device-backup.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}],['Reset fictional data',async()=>{if(confirm('Erase all TADSA device records and restore fictional examples? Export a backup first.')){await storage.reset();location.reload();}}]]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>action().catch(e=>alert(e.message));info.append(b);}}
 if(info)addDeviceTools(info);
 document.querySelector('.environment summary span:last-child').textContent='Device demo';
 document.querySelector('.environment-strip').textContent='Fictional data only · Saved on this device · No server synchronisation';
 await import('./app.js');
 if('serviceWorker'in navigator)navigator.serviceWorker.register('./sw.js',{scope:'./'}).catch(()=>{});
}catch(e){const main=document.querySelector('#content');main.replaceChildren();const h=document.createElement('h1');h.textContent='Device storage could not open';const p=document.createElement('p');p.textContent='Your saved data has not been erased. Close other TADSA tabs and try again. Storage must be enabled for this demonstration.';main.append(h,p);console.error('Device storage initialization failed:',e.name);}
