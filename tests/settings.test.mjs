import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
test('device settings retain old project prices and capture new rates immediately',()=>{
 const data=normalise(seed()),call=(path,method='GET',body={})=>dispatch(data,path,method,body);
 const before=call('projects/project-1/work-plan');assert.equal(before.labourRateCents,5000);
 const payload={requestId:crypto.randomUUID(),version:1,labourRateCents:6550};
 const updated=call('settings','PUT',payload);assert.equal(updated.version,2);assert.equal(updated.audit.length,1);assert.deepEqual(call('settings','PUT',payload),updated);
 const project=call('projects','POST',{requestId:crypto.randomUUID(),clientId:'client-1',primaryRecordId:null,title:'Synthetic rate snapshot',summary:'Rate verification',kind:'Technical',requiredSkills:[],technicianId:null,fundingStatus:'unknown',payerId:null,fundingNotes:''});
 call('settings','PUT',{requestId:crypto.randomUUID(),version:2,labourRateCents:7000});
 assert.equal(call(`projects/${project.id}/work-plan`).labourRateCents,6550);assert.equal(call('projects/project-1/work-plan').labourRateCents,5000);
 assert.throws(()=>call('settings','PUT',{requestId:crypto.randomUUID(),version:1,labourRateCents:6000}),e=>e.status===409);
 assert.throws(()=>call('settings','PUT',{requestId:crypto.randomUUID(),version:3,labourRateCents:0}),e=>e.status===422);
 assert.equal(call('settings').labourRateCents,7000);
 const recovered=normalise(JSON.parse(JSON.stringify(data)));assert.equal(dispatch(recovered,`projects/${project.id}/work-plan`).labourRateCents,6550);
});
