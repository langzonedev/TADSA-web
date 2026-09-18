import {fail} from './device-model.mjs';
const KEY='tadsa-demo-account';
export const selectedDemoAccount=()=>sessionStorage.getItem(KEY);
export function initialDemoAccounts(){return {items:[{id:crypto.randomUUID(),username:'demo-admin',displayName:'Demo administrator',personId:null,role:'administrator',active:true,version:1,mustChangePassword:false}],receipts:{}};}
export function demoUser(accounts){return accounts.items.find(a=>a.id===selectedDemoAccount()&&a.active)||null;}
export function demoAccountDispatch(accounts,data,path,method,input){
 // Upgrade account links without rewriting historical audit snapshots.
 for(const account of accounts.items)account.personId=null;
 const user=demoUser(accounts),parts=path.split('/');
 if(Object.keys(input).some(k=>/password|token|secret|actor/i.test(k)))fail('Demo profiles do not accept passwords, secrets or actor fields.');
 if(path==='auth/status')return {configured:true,authenticated:!!user,user,mode:'device-demo',demoProfiles:accounts.items.filter(a=>a.active).map(({id,displayName,role})=>({id,displayName,role}))};
 if(path==='auth/demo-entry'&&method==='POST'){const target=input.accountId?accounts.items.find(a=>a.id===input.accountId&&a.active):accounts.items.find(a=>a.role==='administrator'&&a.active);if(!target)fail('Choose an active demo profile.',422);return {demoSelection:target.id,user:target};}
 if(path==='auth/logout'&&method==='POST')return {demoSelection:null,signedOut:true};
 if(!user)fail('Select a demo profile first.',401);if(user.role!=='administrator')fail('Select a demo administrator to manage demo profiles.',403);
 if(path==='accounts'&&method==='GET')return {items:accounts.items};
 if(!['POST','PUT'].includes(method))fail('Demo account action not available.',404);
 const keys=method==='POST'?['requestId','username','displayName','role']:['requestId','version','displayName','role','active'];if(Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k)))fail('Supply exactly the requested staff account fields.');
 if(!/^[0-9a-f-]{36}$/i.test(input.requestId||''))fail('Supply a request ID.');const signature=JSON.stringify({path,method,input});const previous=accounts.receipts[input.requestId];if(previous){if(previous.signature!==signature)fail('This request was already used.',409);return previous.result;}
 const validText=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('Complete the account fields.');return value.trim();};
 const displayName=validText(input.displayName,120);if(!['administrator','coordinator'].includes(input.role))fail('Choose an account permission.');
 let result;if(path==='accounts'&&method==='POST'){const username=validText(input.username,60).toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{2,59}$/.test(username))fail('Use a 3–60 character username.');if(accounts.items.some(a=>a.username===username))fail('Username already exists.',409);result={id:crypto.randomUUID(),username,displayName,personId:null,role:input.role,active:true,version:1,mustChangePassword:false};accounts.items.push(result);}
 else if(parts.length===2&&method==='PUT'){const account=accounts.items.find(a=>a.id===parts[1]);if(!account)fail('Account not found.',404);if(account.version!==input.version)fail('Account changed. Reload before saving.',409);if(typeof input.active!=='boolean')fail('Set the active status.');if(account.role==='administrator'&&account.active&&(!input.active||input.role!=='administrator')&&accounts.items.filter(a=>a.role==='administrator'&&a.active).length===1)fail('Keep at least one active demo administrator.');Object.assign(account,{displayName,personId:null,role:input.role,active:input.active,version:account.version+1});result=account;}
 else fail('Demo account action not available.',404);
 accounts.receipts[input.requestId]={signature,result:structuredClone(result)};return result;
}
export function applyDemoSelection(result){if(Object.hasOwn(result||{},'demoSelection')){if(result.demoSelection)sessionStorage.setItem(KEY,result.demoSelection);else sessionStorage.removeItem(KEY);}}
