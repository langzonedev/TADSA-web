import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import {validateBackup} from '../device-backups.mjs';
import {createProjectDetails} from '../project-details-model.js';
function fixture(){const d=normalise(seed()),id=d.projects[0].id,actor={id:crypto.randomUUID(),displayName:'Synthetic operator',role:'administrator',coordinatorAccounts:[]};actor.coordinatorAccounts=[{id:actor.id,displayName:actor.displayName,active:true},{id:crypto.randomUUID(),displayName:'Inactive operator',active:false}];const call=(sub,method='GET',input={})=>dispatch(d,`projects/${id}/${sub}`,method,input,new URLSearchParams(),actor);return {d,id,actor,call};}
test('device project details use independent active accounts, preserve idempotence and reject stale writes',()=>{
 const {d,id,actor,call}=fixture(),initial=call('admin-details');assert.equal(dispatch(d,'project-admin-options','GET',{},new URLSearchParams(),actor).coordinators.length,1);
 const input={requestId:crypto.randomUUID(),version:initial.version,...createProjectDetails(),programme:'FW',coordinatorAccountId:actor.id,followUpOn:'2026-10-01',enquirySource:'Community referral'};const saved=call('admin-details','PUT',input);assert.equal(saved.version,initial.version+1);assert.deepEqual(call('admin-details','PUT',input),saved);assert.throws(()=>call('admin-details','PUT',{...input,requestId:crypto.randomUUID()}),/changed/);assert.throws(()=>call('admin-details','PUT',{...input,requestId:crypto.randomUUID(),version:saved.version,coordinatorAccountId:actor.coordinatorAccounts[1].id}),/active application account/);
 assert.deepEqual(dispatch(normalise(structuredClone(d)),`projects/${id}/admin-details`),saved);
});
test('feedback is append-only with actual author, no automatic closure and round-trip backup',async()=>{
 const {d,id,actor,call}=fixture(),before=call('feedback'),status=d.projects[0].status;const input={requestId:crypto.randomUUID(),version:before.version,recordedOn:'2026-09-23',comments:'Synthetic request for a call.',followUpRequired:'yes'};const result=call('feedback','POST',input);assert.equal(result.items.length,1);assert.equal(result.items[0].actor.id,actor.id);assert.equal(call('feedback','POST',input).items.length,1);assert.equal(d.projects[0].status,status);assert.throws(()=>call('feedback','PUT',{...input,requestId:crypto.randomUUID()}),/unavailable/);assert.deepEqual((await validateBackup(d)).projectFeedback,d.projectFeedback);
 for(const change of [v=>v[0].recordedOn='2026-02-30',v=>v.push(structuredClone(v[0])),v=>v[0].actor.id='not-an-account',v=>v[0].at='yesterday',v=>v[0].extra='invalid']){const bad=structuredClone(d);change(bad.projectFeedback[id]);await assert.rejects(validateBackup(bad),/Backup rejected/);}
});
test('backup supports old data and historical account identity without carrying account credentials',async()=>{
 const {d,id,actor,call}=fixture();assert.equal((await validateBackup(d)).projectAdminDetails,undefined);const before=call('admin-details');call('admin-details','PUT',{requestId:crypto.randomUUID(),version:before.version,...createProjectDetails(),coordinatorAccountId:actor.id});assert.deepEqual((await validateBackup(d)).projectAdminDetails,d.projectAdminDetails);
 for(const change of [v=>v.programme='RW',v=>v.followUpOn='2026-02-30',v=>v.coordinatorAccountId='person-1',v=>v.extra='invalid']){const bad=structuredClone(d);change(bad.projectAdminDetails[id]);await assert.rejects(validateBackup(bad),/Backup rejected/);}
 const missing=structuredClone(d);missing.projectAdminDetails['project-missing']=missing.projectAdminDetails[id];await assert.rejects(validateBackup(missing),/Backup rejected/);
 dispatch(d,`device-records/projects/${id}`,'DELETE');assert.equal(d.projectAdminDetails[id],undefined);
});

test('completed response is persisted explicitly while legacy feedback stays unknown',async()=>{const {d,id,call}=fixture();for(const completed of [undefined,false,true]){const before=call('feedback');call('feedback','POST',{requestId:crypto.randomUUID(),version:before.version,recordedOn:'2026-09-24',comments:'Synthetic response',followUpRequired:'no',...(completed===undefined?{}:{completed})});}const items=call('feedback').items;assert.deepEqual(items.map(i=>i.completed),[true,false,undefined]);assert.equal(Object.hasOwn(items[2],'completed'),false);assert.deepEqual((await validateBackup(d)).projectFeedback,d.projectFeedback);const bad=structuredClone(d);bad.projectFeedback[id][0].completed='yes';await assert.rejects(validateBackup(bad),/Backup rejected/);});
