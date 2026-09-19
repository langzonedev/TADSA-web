import {node,accountRequest,passwordChange} from './accounts.js';
export let sessionEnded=false;

export function lockWorkspace(){document.documentElement.dataset.authState='locked';window.dispatchEvent(new Event('tadsa-auth-locked'));for(const selector of ['.app-shell','.mobile-navigation']){const element=document.querySelector(selector);if(element){element.inert=true;element.hidden=true;}}document.body.classList.remove('drawer-open');}
function unlockWorkspace(){document.documentElement.dataset.authState='ready';for(const selector of ['.app-shell','.mobile-navigation']){const element=document.querySelector(selector);if(element){element.inert=false;element.hidden=false;}}document.querySelector('.skip').hidden=false;document.querySelector('#auth-form-host').replaceChildren();}
function mountGate(form,{focus=true}={}){lockWorkspace();const host=document.querySelector('#auth-form-host');host.replaceChildren(form);host.hidden=false;document.querySelector('#auth-status').textContent='';if(focus)host.querySelector('input,select,button')?.focus();}
export function showAuthFailure(refresh){lockWorkspace();const box=node('div',undefined,'auth-error');box.append(node('h2','Unable to verify access'),node('p','Check the local service or your connection, then try again.'));const retry=node('button','Try again','primary');retry.onclick=refresh;box.append(retry);mountGate(box,{forced:true});}

export async function requireLocalSession(container,refresh,isCurrent=()=>true,hasDrafts=()=>false){
 const status=await accountRequest('auth/status',undefined,'GET');if(!isCurrent())return false;
 document.querySelector('#local-session')?.remove();document.querySelector('#local-signout')?.remove();
 if(!status.configured){if(!status.setupRequired){unlockWorkspace();return true;}
 const form=node('form',undefined,'panel workflow-panel form-grid');form.append(node('h1','Set up the first administrator'),node('p','Local IT setup: create the first named account administrator. Keep the password private.'));const fields={};for(const [key,label]of [['username','Username'],['displayName','Display name'],['password','Password']]){const wrap=node('label',label),input=node('input');input.required=true;input.type=key==='password'?'password':'text';input.maxLength=key==='password'?128:key==='username'?60:120;if(key==='password'){input.minLength=12;input.autocomplete='new-password';}wrap.append(input);form.append(wrap);fields[key]=input;}const message=node('p');message.setAttribute('role','alert');const submit=node('button','Create first administrator','primary');form.append(message,submit);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await accountRequest('auth/bootstrap',Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])));fields.password.value='';await refresh();}catch(e){message.textContent=e.message;submit.disabled=false;}};mountGate(form);return false;}

 const demo=status.mode==='device-demo';
 if(status.authenticated){
  const bar=node('div',undefined,'session-controls');bar.id='local-session';const name=node('a',(demo?'Demo: ':'')+(status.user.displayName||status.user.username));name.href='#accounts';bar.append(name);
  const signout=node('button','Sign out','primary');signout.type='button';signout.id='local-signout';signout.onclick=async()=>{if(hasDrafts()&&!confirm('Sign out and discard unsaved changes?'))return;signout.disabled=true;try{await accountRequest('auth/logout',{});sessionEnded=true;lockWorkspace();container.replaceChildren();location.reload();}catch{signout.disabled=false;signout.textContent='Retry sign out';}};bar.append(signout);document.querySelector('#sidebar-session').append(bar);
  if(status.user.mustChangePassword&&!demo){const change=node('div');change.append(node('h2','Set your own password'));passwordChange(change,()=>{sessionEnded=true;location.reload();});change.append(signout);mountGate(change,{forced:true});return false;}unlockWorkspace();return true;
 }
 const form=node('form',undefined,'panel workflow-panel form-grid');form.append(node('h1',demo?'Explore the TADSA demonstration':'Sign in to TADSA'));
 const message=node('p');message.setAttribute('role','alert');
 if(demo)form.append(node('p','Demo credentials are prefilled. Use a demo-only password for any account you create. Data stays on this device; this is not secure staff authentication.'));
 if(demo&&status.demoMigrationHint)form.append(node('p',status.demoMigrationHint));
 const fields={};for(const [name,label,type]of [['username','Username','text'],['password','Password','password']]){const wrap=node('label',label),input=node('input');input.type=type;input.required=true;input.autocomplete=name==='username'?'username':'current-password';wrap.append(input);form.append(wrap);fields[name]=input;}
 if(demo&&status.demoDefaults){fields.username.value=status.demoDefaults.username;fields.password.value=status.demoDefaults.password;}
 const button=node('button','Login','primary');form.append(message,button,node('p',demo?'Use your own demo username and password to sign back in.':'For a local password reset, contact your nominated account administrator or IT provider.'));
 form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{await accountRequest('auth/login',{username:fields.username.value,password:fields.password.value});fields.password.value='';await refresh();}catch(e){message.textContent=e.message;button.disabled=false;}};mountGate(form);return false;
}
