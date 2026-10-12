import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
const requestId=()=>crypto.randomUUID();
test('numeric reference high water survives existing references and replay across years',()=>{
 const d=normalise(seed({enriched:false})),call=(p,m='GET',b={})=>dispatch(d,p,m,b);
 const legacy=d.projects.map(p=>p.reference);d.projects[0].reference='7400';
 const body={requestId:requestId(),clientId:d.clients[0].id,title:'Synthetic numbered enquiry',summary:'',kind:'Assessment',requiredSkills:[],technicianId:null,fundingStatus:'unknown',payerId:null,fundingNotes:''};
 assert.equal(call('projects','POST',body).reference,'7401');assert.equal(call('projects','POST',body).reference,'7401');assert.equal(call('projects','POST',{...body,requestId:requestId()}).reference,'7402');assert.deepEqual(d.projects.slice(1,legacy.length).map(p=>p.reference),legacy.slice(1));
 d.projects[0].reference='9007199254740991';assert.throws(()=>call('projects','POST',{...body,requestId:requestId()}),/exhausted/);
});
test('organisation multi roles, duplicate confirmation and omitted old-client roles retain evidence',()=>{
 const d=normalise(seed({enriched:false})),call=(p,m='GET',b={})=>dispatch(d,p,m,b),body={requestId:requestId(),name:'Synthetic dual role',role:'Funder',roles:['Funder','Business','Sponsor'],description:'',category:'',email:'synthetic-dual@example.invalid',allowDuplicate:false};
 const o=call('organisations','POST',body);assert.deepEqual(o.roles,body.roles);
 assert.throws(()=>call('organisations','POST',{...body,requestId:requestId(),name:' SYNTHETIC  dual role '}),e=>e.code==='DUPLICATE_CANDIDATE');
 const distinct=call('organisations','POST',{...body,requestId:requestId(),allowDuplicate:true});assert.notEqual(distinct.id,o.id);
 const {roles,...old}=body;const saved=call('organisations/'+o.id+'/profile','PUT',{...old,requestId:requestId(),version:o.version,description:'Updated synthetic record'});assert.deepEqual(saved.roles,roles);
 for(const invalid of [null,{},42,[],['Funder','funder']])assert.throws(()=>call('organisations','POST',{...body,requestId:requestId(),name:'Synthetic malformed roles',email:'',roles:invalid}),/distinct organisation roles/);
 assert.deepEqual(normalise(structuredClone(d)).organisations.find(x=>x.id===o.id).roles,roles);
});
test('one person can be client, technician, funder and referrer without a new account',()=>{
 const d=normalise(seed({enriched:false})),call=(p,m='GET',b={})=>dispatch(d,p,m,b),p=call('people','POST',{requestId:requestId(),name:'Synthetic combined person',email:'',phone:'',roles:['Client','Technician','Funder','Referrer'],technician:{skills:['Woodworking'],availability:'available'},allowDuplicate:false});
 assert.ok(p.clientId);assert.equal(p.roleConflict,false);assert.ok(call('technicians').items.some(x=>x.id===p.id));assert.equal(d.people.filter(x=>x.id===p.id).length,1);assert.equal(d.clients.filter(x=>x.personId===p.id).length,1);
 const project=call('projects','POST',{requestId:requestId(),clientId:p.clientId,title:'Synthetic mixed role work',summary:'',kind:'Technical',requiredSkills:[],technicianId:p.id,fundingStatus:'person',payerId:p.id,fundingNotes:''});assert.equal(project.coordination.technicianId,p.id);assert.equal(project.coordination.payerId,p.id);
});
