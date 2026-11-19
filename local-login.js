import {node,accountRequest,passwordChange} from './accounts.js';
import {requestInlineConfirmation} from './inline-confirmation.js';
export let sessionEnded=false;

// Only trusted interaction extends a session. Route checks and background requests are read-only.
const activityBatchMs=30000;
let watch=null;
function stopMonitoring(){
 if(!watch)return;
 clearTimeout(watch.timeout);clearTimeout(watch.warning);clearTimeout(watch.batch);
 watch.listeners.abort();
 document.querySelector('#session-expiry-notice')?.remove();
 watch=null;
}
function returnToGate(current){
 if(watch!==current)return;
 stopMonitoring();
 sessionEnded=true;
 lockWorkspace();
 document.querySelector('#auth-form-host').replaceChildren();
 document.querySelector('#auth-status').textContent='Checking workspace access…';
 location.reload();
}
function timeLeft(current){
 return Math.min(current.deadline-Date.now(),current.monotonicDeadline-performance.now());
}
function armDeadline(current,remainingMs,start=Date.now()){
 clearTimeout(current.timeout);clearTimeout(current.warning);
 document.querySelector('#session-expiry-notice')?.remove();
 current.deadline=start+remainingMs;
 const left=current.deadline-Date.now();
 current.monotonicDeadline=performance.now()+left;
 const expire=()=>{
  if(watch!==current)return;
  const remaining=timeLeft(current);
  if(remaining>0)current.timeout=setTimeout(expire,Math.ceil(remaining));
  else checkDeadline(current);
 };
 current.timeout=setTimeout(expire,Math.max(0,left));
 current.warning=setTimeout(()=>{
  if(watch!==current||current.checking||timeLeft(current)<=0)return;
  const notice=node('div','Your session is due to end soon. Save any changes you want to keep.','session-expiry-notice');
  notice.id='session-expiry-notice';notice.setAttribute('role','status');document.body.append(notice);
 },Math.max(0,left-120000));
}
async function checkDeadline(current){
 if(watch!==current||current.checking||timeLeft(current)>0)return;
 current.checking=true;
 const wasReady=document.documentElement.dataset.authState==='ready';
 lockWorkspace();
 try{
  // Another tab may have kept the server session active. Preserve an in-progress form in that case.
  const start=Date.now(),status=await accountRequest('auth/status',undefined,'GET');
  if(watch!==current)return;
  if(!status.authenticated||status.user.id!==current.id||!(status.remainingMs>0))return returnToGate(current);
  current.checking=false;
  armDeadline(current,status.remainingMs,start);
  if(wasReady)unlockWorkspace();
 }catch{returnToGate(current);}
}
async function sendActivity(current){
 current.batch=null;
 if(watch!==current||current.checking||current.sending||current.lastEvent===null)return;
 if(timeLeft(current)<=0)return checkDeadline(current);
 const start=Date.now(),ageMs=Math.max(0,start-current.lastEvent);
 current.lastEvent=null;
 // A suspended page's old event must not keep it signed in on waking.
 if(ageMs>60000)return;
 current.sending=true;current.lastSent=start;
 try{
  const status=await accountRequest('auth/activity',{ageMs});
  if(watch===current&&!current.checking)armDeadline(current,status.remainingMs,start);
 }catch(error){
  if(error.status===401)return returnToGate(current);
 }finally{
  current.sending=false;
  if(watch===current&&current.lastEvent!==null)scheduleActivity(current);
 }
}
function scheduleActivity(current){
 if(current.sending||current.batch!==null)return;
 const delay=Math.max(0,current.lastSent+activityBatchMs-Date.now());
 current.batch=setTimeout(()=>sendActivity(current),delay);
}
function monitor(status,start){
 if(!status.authenticated||!Number.isFinite(status.remainingMs)){stopMonitoring();return;}
 if(watch?.id!==status.user.id){
  stopMonitoring();
  const current={id:status.user.id,listeners:new AbortController(),batch:null,lastEvent:null,lastSent:0};
  watch=current;
  const options={capture:true,signal:current.listeners.signal};
  const check=()=>{if(document.visibilityState==='visible')checkDeadline(current);};
  for(const type of ['pointerdown','pointermove','keydown','input','wheel','touchmove']){
   window.addEventListener(type,event=>{
    if(!event.isTrusted||document.visibilityState==='hidden')return;
    if(timeLeft(current)<=0){checkDeadline(current);return;}
    current.lastEvent=Date.now();scheduleActivity(current);
   },{...options,passive:true});
  }
  window.addEventListener('focus',check,options);
  window.addEventListener('pageshow',check,options);
  document.addEventListener('visibilitychange',check,options);
 }
 armDeadline(watch,status.remainingMs,start);
}

export function lockWorkspace(){document.documentElement.dataset.authState='locked';window.dispatchEvent(new Event('tadsa-auth-locked'));for(const selector of ['.app-shell','.mobile-navigation']){const element=document.querySelector(selector);if(element){element.inert=true;element.hidden=true;}}document.body.classList.remove('drawer-open');}
function unlockWorkspace(){document.documentElement.dataset.authState='ready';for(const selector of ['.app-shell','.mobile-navigation']){const element=document.querySelector(selector);if(element){element.inert=false;element.hidden=false;}}document.querySelector('.skip').hidden=false;document.querySelector('#auth-form-host').replaceChildren();}
function mountGate(form,{focus=true}={}){lockWorkspace();const host=document.querySelector('#auth-form-host');host.replaceChildren(form);host.hidden=false;document.querySelector('#auth-status').textContent='';if(focus)host.querySelector('input,select,button')?.focus();}
export function showAuthFailure(refresh){lockWorkspace();const box=node('div',undefined,'auth-error');box.append(node('h2','Unable to verify access'),node('p','Check the local service or your connection, then try again.'));const retry=node('button','Try again','primary');retry.onclick=refresh;box.append(retry);mountGate(box,{forced:true});}

export async function requireLocalSession(container,refresh,isCurrent=()=>true,hasDrafts=()=>false){
 const start=Date.now(),status=await accountRequest('auth/status',undefined,'GET');if(!isCurrent()||sessionEnded)return false;
 if(watch&&(!status.authenticated||status.user.id!==watch.id)){returnToGate(watch);return false;}
 monitor(status,start);
 document.querySelector('#local-session')?.remove();document.querySelector('#local-signout')?.remove();
 if(!status.configured){if(!status.setupRequired){unlockWorkspace();return true;}
 const form=node('form',undefined,'panel workflow-panel form-grid');form.append(node('h1','Set up the first administrator'),node('p','Local IT setup: create the first named account administrator. Keep the password private.'));const fields={};for(const [key,label]of [['username','Username'],['displayName','Display name'],['password','Password']]){const wrap=node('label',label),input=node('input');input.required=true;input.type=key==='password'?'password':'text';input.maxLength=key==='password'?128:key==='username'?60:120;if(key==='password'){input.minLength=12;input.autocomplete='new-password';}wrap.append(input);form.append(wrap);fields[key]=input;}const message=node('p');message.setAttribute('role','alert');const submit=node('button','Create first administrator','primary');form.append(message,submit);form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await accountRequest('auth/bootstrap',Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,v.value])));fields.password.value='';await refresh();}catch(e){message.textContent=e.message;submit.disabled=false;}};mountGate(form);return false;}

 const demo=status.mode==='device-demo';
 if(status.authenticated){
  const bar=node('div',undefined,'session-controls');bar.id='local-session';const name=node('a',(demo?'Demo: ':'')+(status.user.displayName||status.user.username));name.href='#accounts';bar.append(name);
  const signout=node('button','Sign out','primary');signout.type='button';signout.id='local-signout';signout.onclick=async()=>{if(signout.disabled||!isCurrent()||!signout.isConnected)return;signout.disabled=true;try{if(hasDrafts()&&!await requestInlineConfirmation(signout,{title:'Sign out?',message:'Sign out and discard unsaved changes?',confirmLabel:'Sign out and discard changes',isCurrent:()=>isCurrent()&&signout.isConnected})){if(isCurrent()&&signout.isConnected)signout.disabled=false;signout.focus({preventScroll:true});return;}if(!isCurrent()||!signout.isConnected)return;await accountRequest('auth/logout',{});sessionEnded=true;lockWorkspace();container.replaceChildren();location.reload();}catch{if(isCurrent()&&signout.isConnected){signout.disabled=false;signout.textContent='Retry sign out';}}};bar.append(signout);document.querySelector('#sidebar-session').append(bar);
  const signoutIcon=document.createElementNS('http://www.w3.org/2000/svg','svg'),signoutPath=document.createElementNS('http://www.w3.org/2000/svg','path');signoutIcon.setAttribute('viewBox','0 0 24 24');signoutIcon.setAttribute('aria-hidden','true');signoutIcon.setAttribute('focusable','false');signoutIcon.classList.add('signout-icon');signoutPath.setAttribute('d','M10 3H4v18h6m5-14 5 5-5 5m-8-5h13');signoutIcon.append(signoutPath);signout.setAttribute('aria-label','Sign out');signout.replaceChildren(signoutIcon,node('span','Sign out','signout-label'));
  if(status.user.mustChangePassword&&!demo){const change=node('div');change.append(node('h2','Set your own password'));passwordChange(change,()=>{sessionEnded=true;location.reload();});change.append(signout);mountGate(change,{forced:true});return false;}unlockWorkspace();return true;
 }
 const form=node('form',undefined,'panel workflow-panel form-grid');form.append(node('h1',demo?'Explore the TADSA demonstration':'Sign in to TADSA'));
 const message=node('p');message.setAttribute('role','alert');
 form.append(node('p','You will be signed out after 30 minutes of inactivity.'));
 if(demo)form.append(node('p','Enter the demo password shared with you. This demonstration saves fictional data in this browser only; it is not the live system. Do not enter real information.'));
 if(demo&&status.demoMigrationHint)form.append(node('p',status.demoMigrationHint));
 const fields={};for(const [name,label,type]of [['username','Username','text'],['password','Password','password']]){const wrap=node('label',label),input=node('input');input.type=type;input.required=true;input.autocomplete=name==='username'?'username':'current-password';wrap.append(input);form.append(wrap);fields[name]=input;}
 if(demo&&status.demoDefaults){fields.username.value=status.demoDefaults.username;fields.password.value='';}
 const button=node('button','Login','primary');form.append(message,button,node('p',demo?'Use your own demo username and password to sign back in.':'For a local password reset, contact your nominated account administrator or IT provider.'));
 form.onsubmit=async e=>{e.preventDefault();button.disabled=true;try{await accountRequest('auth/login',{username:fields.username.value,password:fields.password.value});fields.password.value='';await refresh();}catch(e){message.textContent=e.message;button.disabled=false;}};mountGate(form);return false;
}
