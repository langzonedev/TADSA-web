import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-project-contacts.mjs';
test('website referrers use People and the same project contact relationship for new and earlier enquiries',()=>{
 const d=normalise(seed({enriched:false})),actor={id:'account-referral',role:'coordinator'};
 const call=(path,method='GET',body={})=>dispatch(d,path,method,body,new URLSearchParams(),actor);
 const client=d.clients[0],person=d.people.find(p=>p.id===client.personId);
 const raw={receivedOn:'2026-03-01',answers:{client:person.name,need:'A made-up request',referrer:'Fictional Referring Officer',referrerEmail:'office@example.invalid'}};
 const base={clientId:client.id,websiteReferral:raw,title:'Synthetic request',summary:raw.answers.need,kind:'Assessment',requiredSkills:[],technicianId:null,fundingStatus:'unknown',payerId:null,fundingNotes:''};
 const input={...base,requestId:crypto.randomUUID(),websiteReferrer:{create:true,reviewedIds:[]}};
 const created=call('projects','POST',input),link=created.relationships.find(r=>r.role==='Referrer');
 assert.equal(link.name,raw.answers.referrer);assert.notEqual(link.id,person.id);
 assert.equal(call('people/'+link.id).email,raw.answers.referrerEmail);
 assert.deepEqual(call('projects','POST',input),created);
 const matches=call('website-referrer-matches','POST',{name:raw.answers.referrer,email:raw.answers.referrerEmail,phone:''});
 assert.deepEqual(matches.items.map(r=>[r.id,r.nameMatch,r.contactMatch]),[[link.id,true,true]]);
 const old={...base,requestId:crypto.randomUUID(),websiteReferral:{...raw,receivedOn:'2026-03-02'}};
 assert.throws(()=>call('projects','POST',{...old,websiteReferrer:input.websiteReferrer}),e=>e.code==='REFERRER_REVIEW_CHANGED');
 const earlier=call('projects','POST',old),path='projects/'+earlier.id+'/contacts';
 const repair={requestId:crypto.randomUUID(),version:earlier.version,operation:'resolveWebsiteReferrer',websiteReferrer:{personId:link.id}};
 const repaired=call(path,'POST',repair);
 assert.deepEqual(repaired.items.map(({id,role})=>[id,role]),[[link.id,'Referrer']]);
 assert.deepEqual(call(path,'POST',repair),repaired);
 assert.throws(()=>call(path,'POST',{...repair,requestId:crypto.randomUUID(),version:repaired.version}),e=>e.code==='VERSION_CONFLICT');
 assert.deepEqual(dispatch(normalise(structuredClone(d)),path),repaired);
 const other=call('people','POST',{requestId:crypto.randomUUID(),name:'Synthetic Adviser',email:'',phone:'',role:'Carer',allowDuplicate:false});
 const supplied={referrer:other.name,referrerEmail:'adviser@example.invalid',referrerPhone:'(08) 8000 5678'};
 const selected={...base,requestId:crypto.randomUUID(),websiteReferral:{...raw,answers:{...raw.answers,...supplied}},websiteReferrer:{personId:other.id,additions:{email:supplied.referrerEmail,phone:supplied.referrerPhone}}};
 assert.equal(call('projects','POST',selected).relationships.find(r=>r.role==='Referrer').id,other.id);
 const adviser=call('people/'+other.id);
 assert.deepEqual(adviser.roles,['Carer']);assert.equal(adviser.email,supplied.referrerEmail);assert.equal(adviser.phone,supplied.referrerPhone);
});
test('project contacts retain typed identity, retries and unrelated data across restore',()=>{
 const d=normalise(seed({enriched:false})),call=(path,method='GET',input={})=>dispatch(d,path,method,input),path='projects/project-1/contacts',initial=call(path),before={contacts:structuredClone(d.contacts),people:structuredClone(d.people),other:structuredClone(d.relationships.filter(r=>r.projectId!=='project-1'||['Technician','Funder'].includes(r.role)))};
 const input=(version,operation='add',type='person',id='person-1',role='Contact')=>({requestId:crypto.randomUUID(),version,operation,type,id,role});
 const command=input(initial.version),first=call(path,'POST',command);assert.equal(first.version,initial.version+1);assert.deepEqual(call(path,'POST',command),first);assert.deepEqual(call(path,'POST',input(first.version)),first);
 assert.throws(()=>call(path,'POST',{...command,role:'Referrer'}),e=>e.status===409);assert.throws(()=>call(path,'POST',input(initial.version)),e=>e.status===409);
 const second=call(path,'POST',input(first.version,'add','organisation','org-1','Referrer'));assert.ok(second.items.some(r=>r.type==='organisation'&&r.id==='org-1'&&r.role==='Referrer'));
 const third=call(path,'POST',input(second.version,'remove','organisation','org-1','Referrer'));assert.ok(!third.items.some(r=>r.id==='org-1'&&r.role==='Referrer'));
 for(const role of ['Technician','Funder'])assert.throws(()=>call(path,'POST',input(third.version,'add','person','person-1',role)),e=>e.status===422);
 d.organisations.find(o=>o.id==='org-2').directoryStatus='inactive';assert.throws(()=>call(path,'POST',input(third.version,'add','organisation','org-2')),e=>e.status===422);assert.throws(()=>call(path,'POST',input(third.version,'add','person','person-999999')),e=>e.status===422);
 assert.deepEqual(d.contacts,before.contacts);assert.deepEqual(d.people,before.people);assert.deepEqual(d.relationships.filter(r=>r.projectId!=='project-1'||['Technician','Funder'].includes(r.role)),before.other);
 assert.deepEqual(dispatch(normalise(structuredClone(d)),path),third);assert.equal(d.audit.filter(e=>e.action?.startsWith('Project contact ')).length,3);
});
test('retained UUID directory identities support project contacts after reload',()=>{
 const d=normalise(seed({enriched:false})),personId='person-'+crypto.randomUUID(),orgId='org-'+crypto.randomUUID();
 d.people.push({...structuredClone(d.people[0]),id:personId,name:'Synthetic legacy contact'});d.organisations.push({...structuredClone(d.organisations[0]),id:orgId,name:'Synthetic legacy organisation'});
 const restored=normalise(structuredClone(d)),path='projects/project-1/contacts',call=(method='GET',input={})=>dispatch(restored,path,method,input);
 let current=call();
 for(const [type,id]of [['person',personId],['organisation',orgId]]){
  current=call('POST',{requestId:crypto.randomUUID(),version:current.version,operation:'add',type,id,role:'Referrer'});assert.ok(current.items.some(item=>item.type===type&&item.id===id));
 }
 assert.deepEqual(dispatch(normalise(structuredClone(restored)),path),current);
 for(const [type,id]of [['person',personId],['organisation',orgId]]){
  current=call('POST',{requestId:crypto.randomUUID(),version:current.version,operation:'remove',type,id,role:'Referrer'});assert.ok(!current.items.some(item=>item.type===type&&item.id===id));
 }
 assert.throws(()=>call('POST',{requestId:crypto.randomUUID(),version:current.version,operation:'add',type:'person',id:'person-'+crypto.randomUUID(),role:'Contact'}),e=>e.status===422);
});
