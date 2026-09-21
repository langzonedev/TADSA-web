import {fail} from './device-model.mjs';
const KEY='tadsa-demo-account';
export const DEMO_PASSWORD='Willow-Lantern-57!';
const DEMO_CREDENTIAL_REVISION=2;
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))):v);
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const salt=()=>hex(crypto.getRandomValues(new Uint8Array(24)));
async function derive(password,value){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new TextEncoder().encode(value),iterations:120000,hash:'SHA-256'},key,256));}
async function verifier(password){const value=salt();return {salt:value,hash:await derive(password,value),iterations:120000};}
const validPassword=value=>{if(typeof value!=='string'||value.length<12||value.length>128)fail('Use a password of 12–128 characters.');return value;};
const publicAccount=account=>Object.fromEntries(['id','username','displayName','personId','role','active','version','mustChangePassword','manageSensitiveDetails'].map(k=>[k,k==='manageSensitiveDetails'?account.role==='administrator'||account[k]===true:account[k]]));
export const selectedDemoAccount=()=>{try{return JSON.parse(sessionStorage.getItem(KEY));}catch{return null;}};
export function initialDemoAccounts(){return {items:[{id:crypto.randomUUID(),username:'demo-admin',displayName:'Demo administrator',personId:null,role:'administrator',active:true,version:1,mustChangePassword:false}],receipts:{},receiptSalt:salt()};}
export function demoUser(accounts){const selected=selectedDemoAccount();const account=accounts.items.find(a=>a.id===selected?.id&&a.active&&a.credentialVersion===selected.credentialVersion);return account?publicAccount(account):null;}
export async function prepareDemoMigration(accounts){const credentials={};for(const account of accounts.items)if(!account.credential||account.username==='demo-admin'&&account.usesPublicDemoPassword&&account.demoCredentialRevision!==DEMO_CREDENTIAL_REVISION)credentials[account.id]=await verifier(DEMO_PASSWORD);return credentials;}
export function applyDemoMigration(accounts,credentials){for(const account of accounts.items){account.personId=null;account.manageSensitiveDetails??=false;if(credentials[account.id]&&(!account.credential||account.username==='demo-admin'&&account.usesPublicDemoPassword&&account.demoCredentialRevision!==DEMO_CREDENTIAL_REVISION)){account.credential=credentials[account.id];account.credentialVersion=(account.credentialVersion??0)+1;account.demoCredentialRevision=DEMO_CREDENTIAL_REVISION;account.usesPublicDemoPassword=true;}}}
// All expensive asynchronous cryptography completes before the write transaction opens.
export async function prepareDemoAccountRequest(accounts,path,method,input){
 const prepared={};if(path==='auth/login'&&method==='POST'){if(typeof input.username!=='string'||typeof input.password!=='string'||input.username.length>60||input.password.length>128)fail('Supply a username and password.');const account=accounts.items.find(a=>a.username===input.username.trim().toLowerCase());const value=account?.credential??{salt:'tadsa-fictional-missing-account',hash:''};const hash=await derive(input.password,value.salt);prepared.login={id:account?.id,credentialVersion:account?.credentialVersion,credentialHash:value.hash,valid:hash===value.hash};}
 if(path==='accounts'&&method==='POST'||/^accounts\/[^/]+\/reset-password$/.test(path)&&method==='POST'){prepared.credential=await verifier(validPassword(input.password));}
 if(path.startsWith('accounts')&&method!=='GET'){const safe={...input};if(Object.hasOwn(safe,'password'))safe.password=await derive(validPassword(safe.password),accounts.receiptSalt);prepared.signature=hex(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical({path,method,input:safe}))));}
 return prepared;
}
export function demoAccountDispatch(accounts,data,path,method,input,prepared={}){
 const user=demoUser(accounts),parts=path.split('/');
 const exact=keys=>{if(!input||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k)))fail('Supply exactly the requested account fields.');};
 if(path==='auth/demo-entry')fail('Use the demonstration username and password to sign in.',404);
 if(path==='auth/status'){const defaults=accounts.items.find(a=>a.username==='demo-admin'&&a.active&&a.usesPublicDemoPassword);return {configured:true,authenticated:!!user,user,mode:'device-demo',demoDefaults:defaults?{username:defaults.username}:null,demoMigrationHint:accounts.items.some(a=>a.username!=='demo-admin'&&a.usesPublicDemoPassword)?'Previously password-free demo accounts require an administrator password reset.':null};}
 if(path==='auth/login'&&method==='POST'){exact(['username','password']);const proof=prepared.login,target=accounts.items.find(a=>a.id===proof?.id);if(!proof?.valid||!target?.active||target.credentialVersion!==proof.credentialVersion||target.credential.hash!==proof.credentialHash)fail('Username or password is incorrect.',401);return {demoSelection:{id:target.id,credentialVersion:target.credentialVersion},user:publicAccount(target)};}
 if(path==='auth/logout'&&method==='POST'){exact([]);return {demoSelection:null,signedOut:true};}
 if(path.startsWith('auth/'))fail('Demo account action not available.',404);
 if(!user)fail('Sign in to the device demonstration first.',401);if(user.role!=='administrator')fail('Sign in as a demo administrator to manage accounts.',403);
 if(path==='accounts'&&method==='GET')return {items:accounts.items.map(publicAccount)};
 if(!['POST','PUT'].includes(method))fail('Demo account action not available.',404);
 const resetting=parts.length===3&&parts[2]==='reset-password'&&method==='POST';
 if(Object.hasOwn(input,'manageSensitiveDetails')&&typeof input.manageSensitiveDetails!=='boolean')fail('Choose a sensitive details permission.');
 const optionalPermission=Object.hasOwn(input,'manageSensitiveDetails')?['manageSensitiveDetails']:[];
 exact(resetting?['requestId','version','password']:method==='POST'?['requestId','username','displayName','role','password',...optionalPermission]:['requestId','version','displayName','role','active',...optionalPermission]);
 if(!/^[0-9a-f-]{36}$/i.test(input.requestId||''))fail('Supply a request ID.');if(!prepared.signature)fail('Account request was not prepared.');const previous=accounts.receipts[input.requestId];if(previous){if(previous.signature!==prepared.signature)fail('This request was already used.',409);return previous.result;}
 const validText=(value,max)=>{if(typeof value!=='string'||!value.trim()||value.trim().length>max)fail('Complete the account fields.');return value.trim();};
 let result;if(resetting){const account=accounts.items.find(a=>a.id===parts[1]);if(!account)fail('Account not found.',404);if(account.version!==input.version)fail('Account changed. Reload before saving.',409);if(!prepared.credential)fail('Password request was not prepared.');account.credential=prepared.credential;account.credentialVersion++;account.usesPublicDemoPassword=false;account.version++;result=publicAccount(account);}
 else {const displayName=validText(input.displayName,120);if(!['administrator','coordinator'].includes(input.role))fail('Choose an account permission.');
 if(path==='accounts'&&method==='POST'){const username=validText(input.username,60).toLowerCase();if(!/^[a-z0-9][a-z0-9._-]{2,59}$/.test(username))fail('Use a 3–60 character username.');if(accounts.items.some(a=>a.username===username))fail('Username already exists.',409);if(!prepared.credential)fail('Password request was not prepared.');const account={id:crypto.randomUUID(),username,displayName,personId:null,role:input.role,manageSensitiveDetails:input.manageSensitiveDetails??false,active:true,version:1,mustChangePassword:false,credential:prepared.credential,credentialVersion:1,usesPublicDemoPassword:false};accounts.items.push(account);result=publicAccount(account);}
 else if(parts.length===2&&method==='PUT'){const account=accounts.items.find(a=>a.id===parts[1]);if(!account)fail('Account not found.',404);if(account.version!==input.version)fail('Account changed. Reload before saving.',409);if(typeof input.active!=='boolean')fail('Set the active status.');if(account.role==='administrator'&&account.active&&(!input.active||input.role!=='administrator')&&accounts.items.filter(a=>a.role==='administrator'&&a.active).length===1)fail('Keep at least one active demo administrator.');if(account.active!==input.active||account.role!==input.role||account.manageSensitiveDetails!==(input.manageSensitiveDetails??account.manageSensitiveDetails??false))account.credentialVersion++;Object.assign(account,{displayName,personId:null,role:input.role,manageSensitiveDetails:input.manageSensitiveDetails??account.manageSensitiveDetails??false,active:input.active,version:account.version+1});result=publicAccount(account);}
 else fail('Demo account action not available.',404);}
 accounts.receipts[input.requestId]={signature:prepared.signature,result:structuredClone(result)};return result;
}
export function applyDemoSelection(result){if(Object.hasOwn(result||{},'demoSelection')){if(result.demoSelection)sessionStorage.setItem(KEY,JSON.stringify(result.demoSelection));else sessionStorage.removeItem(KEY);}}
