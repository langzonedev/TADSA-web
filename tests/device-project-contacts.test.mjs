import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-project-contacts.mjs';
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
