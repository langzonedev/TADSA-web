import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';

test('client NDIS edit shares canonical reference, conflict and retry semantics with project edits',()=>{
 const d=normalise(seed({enriched:false})),call=(path,method='GET',input={})=>dispatch(d,path,method,input),path='clients/client-1/ndis',input=(number,version)=>({requestId:crypto.randomUUID(),version,number});
 assert.deepEqual(call(path),{number:'',version:0});const old=call('projects/project-1/work-plan'),projectVersion=old.version,first=input('123 456 789',0);
 assert.deepEqual(call(path,'PUT',first),{number:'123 456 789',version:1});assert.deepEqual(call(path,'PUT',first),{number:'123 456 789',version:1});
 assert.equal(call('clients/client-1').ndis.number,'123 456 789');assert.equal(call('projects/project-1/work-plan').ndisNumber,'123 456 789');assert.equal(call('projects/project-1/work-plan').version,projectVersion);assert.equal(call('projects/project-1/work-plan').ndisApproved,false);
 const audit=d.recordEvents.filter(e=>e.recordId==='client-1'&&e.action==='NDIS number updated');assert.equal(audit.length,1);assert.deepEqual(audit[0].changes,{numberChanged:true});assert.ok(!JSON.stringify(audit).includes(first.number));
 assert.deepEqual(call(path,'PUT',input(first.number,1)),{number:first.number,version:1});assert.equal(d.recordEvents.filter(e=>e.recordId==='client-1'&&e.action==='NDIS number updated').length,1);
 assert.throws(()=>call(path,'PUT',input('222222222',0)),e=>e.status===409);assert.throws(()=>call(path,'PUT',{...first,number:'222222222'}),e=>e.status===409&&e.code==='IDEMPOTENCY_MISMATCH');
 const planBody={requestId:crypto.randomUUID(),version:old.version,clientNdisVersion:old.clientNdisVersion,location:old.location,serviceArea:old.serviceArea,ndisApplicable:false,ndisNumber:old.ndisNumber,ndisApproved:false,ndisApprovedBy:'',ndisApprovedOn:''};
 assert.throws(()=>call('projects/project-1/work-plan','PUT',planBody),e=>e.status===409);
 call('projects/project-1/work-plan','PUT',{...planBody,requestId:crypto.randomUUID(),clientNdisVersion:1,ndisNumber:'333333333'});assert.deepEqual(call(path),{number:'333333333',version:2});assert.throws(()=>call(path,'PUT',input('444444444',1)),e=>e.status===409);
 for(const number of ['a123','12','1'.repeat(31),'123\n456'])assert.throws(()=>call(path,'PUT',input(number,2)),e=>e.status===422);
 assert.throws(()=>call(path,'PUT',{...input('444444444',2),ndisApproved:true}),e=>e.status===422);assert.throws(()=>call(path,'PUT',input('444444444',-1)),e=>e.status===422);assert.throws(()=>call('clients/client-999999/ndis'),e=>e.status===404);
 assert.deepEqual(call(path,'PUT',input('',2)),{number:'',version:3});assert.equal(call('projects/project-1/work-plan').ndisNumber,'');
 const restored=normalise(structuredClone(d));assert.deepEqual(dispatch(restored,path),{number:'',version:3});
});
