export let sessionEnded=false;
export async function requireLocalSession(container,refresh,isCurrent=()=>true){
  const status=await fetch('/api/auth/status').then(r=>{if(!r.ok)throw Error('Account service unavailable');return r.json();});
  if(!isCurrent())return false;
  document.querySelector('#local-signout')?.remove();
  if(!status.configured)return true;
  if(status.authenticated){const b=document.createElement('button');b.id='local-signout';b.className='secondary';b.textContent='Sign out';b.onclick=async()=>{b.disabled=true;try{const r=await fetch('/api/auth/logout',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});if(!r.ok)throw Error();sessionEnded=true;container.replaceChildren();location.reload();}catch{b.disabled=false;b.textContent='Retry sign out';}};document.querySelector('.topbar').append(b);return true;}
  const form=document.createElement('form');form.className='panel workflow-panel form-grid';const heading=document.createElement('h1');heading.textContent='Sign in to TADSA';form.append(heading);
  const fields={};for(const[name,label,type]of[['username','Username','text'],['password','Password','password']]){const l=document.createElement('label');l.textContent=label;const n=document.createElement('input');n.type=type;n.required=true;n.autocomplete=name==='username'?'username':'current-password';n.setAttribute('aria-label',label);l.append(n);form.append(l);fields[name]=n;}
  const message=document.createElement('p');message.setAttribute('role','alert');const button=document.createElement('button');button.textContent='Sign in';button.className='primary';button.type='submit';form.append(message,button);const help=document.createElement('p');help.textContent='For a password reset, contact your nominated administrator or IT provider.';form.append(help);
  form.onsubmit=async e=>{e.preventDefault();button.disabled=true;message.textContent='';try{const r=await fetch('/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:fields.username.value,password:fields.password.value})});const d=await r.json();if(!r.ok)throw Error(d.error);fields.password.value='';await refresh();}catch(e){message.textContent=e.message||'Sign-in failed. Try again.';button.disabled=false;}};
  container.replaceChildren(form);fields.username.focus();return false;
}
