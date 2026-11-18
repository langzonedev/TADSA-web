import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import {validateBackup} from '../device-backups.mjs';

test('mailing classifications and Bikes survive local edits and backup restore',async()=>{
 const d=normalise(seed({enriched:false})),cohorts=['Life member','Staff member','Technical member – active'];
 const request={requestId:crypto.randomUUID(),name:'Synthetic cycle repairer',email:'',phone:'',roles:['Technician','General contact'],technician:{skills:['Bikes'],availability:'unknown'},allowDuplicate:false};
 const person=dispatch(d,'people','POST',{...request,membershipStatus:'Member',cohorts});
 const updated=dispatch(d,'people/'+person.id+'/profile','PUT',{...request,requestId:crypto.randomUUID(),version:1,phone:'0000000000'});
 assert.equal(updated.membershipStatus,'Member');assert.deepEqual(updated.cohorts,cohorts);
 const restored=normalise(await validateBackup(d)),saved=dispatch(restored,'people/'+person.id);
 assert.deepEqual(saved.technician.skills,['Bikes']);assert.deepEqual(saved.cohorts,cohorts);
 const older=dispatch(restored,'people/'+d.people[0].id);assert.equal(older.membershipStatus,'Not recorded');assert.deepEqual(older.cohorts,[]);
 const bad=structuredClone(d);bad.people.find(p=>p.id===person.id).cohorts=['unsupported'];
 await assert.rejects(validateBackup(bad),/mailing groups/);
});
