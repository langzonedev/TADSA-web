import {node,action} from './project-care.js';

export async function renderUpdates(view){
  const response=await fetch('/api/appliance-updates');
  // Device-only development builds do not have an appliance update service.
  if(response.status===404)return;
  let state;try{state=await response.json();}catch{return;}
  if(!response.ok||!state.available)return;
  const section=node('section',null,'panel workflow-panel');
  section.append(node('h2','Application updates'),node('p','Install a signed TADSA update package supplied by your ICT operator. Ask everyone to save their work first. The application will briefly be unavailable while a recovery backup is checked.'));
  const result=node('p',state.message||'Ready for an update.');result.setAttribute('role','status');
  if(state.installed)section.append(node('p',`Installed release: ${state.installed.release}`));
  const label=node('label','Update package'),file=node('input');file.type='file';file.accept='.zip,application/zip';label.append(file);
  const confirmLabel=node('label'),confirm=node('input');confirm.type='checkbox';confirmLabel.append(confirm,node('span','Everyone has saved their work. Install the selected update.'));
  const button=action('Install update',async()=>{
    if(!file.files[0]||!confirm.checked){result.textContent='Choose an update package and confirm that work has been saved.';return;}
    if(file.files[0].size>128*1024*1024){result.textContent='Update packages must be at most 128 MiB.';return;}
    button.disabled=true;result.textContent='Uploading update…';
    try{
      const uploaded=await fetch('/api/appliance-updates',{method:'POST',headers:{'Content-Type':'application/zip'},body:file.files[0]});
      const accepted=await uploaded.json();if(!uploaded.ok)throw Error(accepted.error||'Upload failed.');
      result.textContent='Update accepted. The application may disconnect briefly. Checking progress…';
      const deadline=Date.now()+15*60*1000;
      while(Date.now()<deadline){
        await new Promise(resolve=>setTimeout(resolve,3000));
        try{
          const poll=await fetch('/api/appliance-updates');if(!poll.ok)continue;
          const next=await poll.json();result.textContent=next.message||'Update in progress…';
          if(['complete','rejected','rolled-back','recovery-required'].includes(next.state)){
            if(next.state==='complete')section.append(action('Reload application',()=>location.reload()));
            return;
          }
        }catch{/* Expected while the application service restarts. */}
      }
      result.textContent='The update result is not yet confirmed. Reload to check status or contact your ICT operator. Do not upload another package.';
    }catch(error){result.textContent=error.message+' Reload to check update status before retrying.';}
    finally{button.disabled=false;}
  });
  section.append(label,confirmLabel,button,result);view.append(section);
}
