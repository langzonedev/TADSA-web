import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import '../device-credentials.mjs';
import {initialDemoAccounts,prepareDemoMigration,applyDemoMigration,prepareDemoAccountRequest,demoAccountDispatch,applyDemoSelection,demoUser,DEMO_PASSWORD} from '../device-accounts.mjs';
const memory=new Map();globalThis.sessionStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)};
const admin={id:'test-admin',displayName:'Test administrator',role:'administrator'};
test('multi technician membership, assignments, workload, numbering and category survive reload',()=>{
 let d=normalise(seed({enriched:false}));let run=(path,method='GET',input={})=>dispatch(d,path,method,input,new URLSearchParams(),admin);
 const p=run('projects/project-1'),techs=run('technicians').items.slice(0,2).map(x=>x.id);assert.equal(techs.length,2);
 const updated=run('projects/'+p.id+'/coordination','PUT',{version:p.version,...p.coordination,technicianId:techs[0],technicianIds:techs});
 assert.deepEqual(updated.coordination.technicianIds,techs);assert.equal(updated.relationships.filter(x=>x.role==='Technician').length,2);
 for(const id of techs)assert.ok(run('people/'+id).projects.some(x=>x.id===p.id));
 assert.throws(()=>run('projects/'+p.id+'/coordination','PUT',{version:updated.version,...updated.coordination,technicianIds:[techs[1]]}),/lead/);
 const create=()=>run('projects','POST',{requestId:crypto.randomUUID(),clientId:p.clientId,title:'Fictional new work',summary:'Synthetic',kind:'Assessment',requiredSkills:[],technicianId:techs[0],technicianIds:techs,fundingStatus:'unknown',payerId:null,fundingNotes:''});
 const a=create();run('people','POST',{requestId:crypto.randomUUID(),name:'Fictional Person',email:'',phone:'',allowDuplicate:true,roles:['Carer'],technician:null});const b=create();assert.equal(Number(b.reference.split('-').at(-1)),Number(a.reference.split('-').at(-1))+1);assert.match(a.reference,/^P-\d{4}-5703$/);
 const org=run('organisations').items[0];run('organisations/'+org.id+'/category','PUT',{requestId:crypto.randomUUID(),version:org.version,category:'School'});
 d=normalise(JSON.parse(JSON.stringify(d)));assert.equal(run('organisations/'+org.id).category,'School');assert.deepEqual(run('projects/'+p.id).coordination.technicianIds,techs);
});
test('restricted credentials denied including replay and audit redacted',()=>{
 const d=normalise(seed({enriched:false})),tech=d.people.find(p=>p.roles.includes('Technician')),path='people/'+tech.id+'/credentials';
 const input={requestId:crypto.randomUUID(),version:0,qualifications:[],safetyTraining:[],clearances:[{title:'Synthetic clearance',issuer:'Demo',expiresOn:''}],notes:'Fictional'};
 dispatch(d,path,'PUT',input,new URLSearchParams(),admin);
 const restricted={...admin,role:'coordinator',manageSensitiveDetails:false};
 for(const method of ['GET','PUT'])assert.throws(()=>dispatch(d,path,method,input,new URLSearchParams(),restricted),e=>e.status===403);
 assert.equal(dispatch(d,'people/'+tech.id,'GET',{},new URLSearchParams(),restricted).audit.some(x=>x.action==='Technician credentials updated'),false);
 assert.equal(dispatch(d,path,'GET',{},new URLSearchParams(),{...restricted,manageSensitiveDetails:true}).notes,'Fictional');
 const profile={requestId:crypto.randomUUID(),version:tech.version,name:tech.name,email:tech.email,phone:tech.phone,allowDuplicate:true,roles:tech.roles,technician:tech.technician};const saved=dispatch(d,'people/'+tech.id+'/profile','PUT',profile,new URLSearchParams(),admin);assert.ok(saved.audit.some(x=>x.action==='Technician credentials updated'));const replay=dispatch(d,'people/'+tech.id+'/profile','PUT',profile,new URLSearchParams(),restricted);assert.equal(replay.audit.some(x=>x.action==='Technician credentials updated'),false);
});
test('demo password upgrade revokes legacy default session while preserving custom passwords',async()=>{
 memory.clear();const d=normalise(seed({enriched:false})),a=initialDemoAccounts();applyDemoMigration(a,await prepareDemoMigration(a));
 const run=async(path,method,body)=>demoAccountDispatch(a,d,path,method,body,await prepareDemoAccountRequest(a,path,method,body));
 const login=()=>run('auth/login','POST',{username:'demo-admin',password:DEMO_PASSWORD});applyDemoSelection(await login());
 const defaultAccount=a.items[0];delete defaultAccount.demoCredentialRevision;const oldVersion=defaultAccount.credentialVersion;applyDemoMigration(a,await prepareDemoMigration(a));assert.equal(defaultAccount.credentialVersion,oldVersion+1);assert.equal(demoUser(a),null);
 applyDemoSelection(await login());const reset={requestId:crypto.randomUUID(),version:defaultAccount.version,password:'OwnMemorablePassword57!'};await run('accounts/'+defaultAccount.id+'/reset-password','POST',reset);const hash=defaultAccount.credential.hash;delete defaultAccount.demoCredentialRevision;applyDemoMigration(a,await prepareDemoMigration(a));assert.equal(defaultAccount.credential.hash,hash);
 applyDemoSelection(await run('auth/login','POST',{username:'demo-admin',password:reset.password}));assert.ok(demoUser(a));const status=demoAccountDispatch(a,d,'auth/status','GET',{});assert.ok(!JSON.stringify(status).includes(DEMO_PASSWORD));assert.equal(status.demoDefaults,null);
});

test('account sensitive permission grant and revoke invalidate selected demo sessions',async()=>{
 memory.clear();const d=normalise(seed({enriched:false})),a=initialDemoAccounts();applyDemoMigration(a,await prepareDemoMigration(a));const run=async(path,method,body)=>demoAccountDispatch(a,d,path,method,body,await prepareDemoAccountRequest(a,path,method,body));const loginAdmin=async()=>applyDemoSelection(await run('auth/login','POST',{username:'demo-admin',password:DEMO_PASSWORD}));await loginAdmin();
 const input={requestId:crypto.randomUUID(),username:'limited-test',displayName:'Limited test',role:'coordinator',password:'LimitedUserPassword57!',manageSensitiveDetails:true};let account=await run('accounts','POST',input);assert.equal(account.manageSensitiveDetails,true);applyDemoSelection(await run('auth/login','POST',{username:input.username,password:input.password}));const prior=memory.get('tadsa-demo-account');await loginAdmin();account=await run('accounts/'+account.id,'PUT',{requestId:crypto.randomUUID(),version:account.version,displayName:account.displayName,role:account.role,active:true,manageSensitiveDetails:false});memory.set('tadsa-demo-account',prior);assert.equal(demoUser(a),null);applyDemoSelection(await run('auth/login','POST',{username:input.username,password:input.password}));assert.equal(demoUser(a).manageSensitiveDetails,false);
});
