import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import {validateBackup} from '../device-backups.mjs';
import '../device-extensions.mjs';

test('independent device numbering and organisation roles preserve old payloads, warned duplicates and backups',async()=>{
 let d=normalise(seed({enriched:false}));const before=d.projects.map(p=>({id:p.id,reference:p.reference})),payload={requestId:crypto.randomUUID(),clientId:'client-1',title:'Synthetic numbered project',summary:'Synthetic scope',kind:'Technical',requiredSkills:[],technicianId:null,fundingStatus:'unknown',payerId:null,fundingNotes:''};
 const project=dispatch(d,'projects','POST',payload);assert.equal(project.reference,'6000');assert.equal(dispatch(d,'projects','POST',payload).reference,'6000');d.projects[0].reference='7200';d=normalise(d);assert.equal(dispatch(d,'projects','POST',{...payload,requestId:crypto.randomUUID()}).reference,'7201');for(const old of before.slice(1))assert.equal(d.projects.find(p=>p.id===old.id).reference,old.reference);
 const orgInput={requestId:crypto.randomUUID(),name:'Synthetic dual organisation',role:'Funder',roles:['Funder','Service provider'],description:'Synthetic record',category:'Synthetic category',email:'synthetic-dual@example.invalid',allowDuplicate:false},org=dispatch(d,'organisations','POST',orgInput);assert.deepEqual(org.roles,['Funder','Service provider']);
 for(const patch of [{name:' synthetic   DUAL organisation '},{name:'Synthetic other',email:'SYNTHETIC-DUAL@example.invalid'}])assert.throws(()=>dispatch(d,'organisations','POST',{...orgInput,...patch,requestId:crypto.randomUUID()}),e=>e.status===409&&e.code==='DUPLICATE_CANDIDATE');assert.notEqual(dispatch(d,'organisations','POST',{...orgInput,requestId:crypto.randomUUID(),allowDuplicate:true}).id,org.id);
 const oldInput=Object.fromEntries(['name','role','description','category','email'].map(k=>[k,org[k]]));const edited=dispatch(d,'organisations/'+org.id+'/profile','PUT',{...oldInput,requestId:crypto.randomUUID(),version:org.version,description:'Synthetic update'});assert.deepEqual(edited.roles,org.roles);
 for(const roles of [{},42,null,[],['Funder',' funder ']])assert.throws(()=>dispatch(d,'organisations','POST',{...orgInput,name:'Synthetic invalid role',email:'',roles,requestId:crypto.randomUUID()}),e=>e.status===422);
 const person=dispatch(d,'people','POST',{requestId:crypto.randomUUID(),name:'Synthetic client clinician',email:'',phone:'',allowDuplicate:false,roles:['Client','Allied-health contact'],technician:null});assert.deepEqual([...person.roles].sort(),['Allied-health contact','Client']);assert.ok(person.clientId);
 const huge=normalise(JSON.parse(JSON.stringify(d)));huge.projects[0].reference='9999999999999999999999999999';assert.throws(()=>dispatch(huge,'projects','POST',{...payload,requestId:crypto.randomUUID()}),e=>e.status===422&&/reference/.test(e.message));assert.equal(huge.projects[0].reference,'9999999999999999999999999999');
 const restored=await validateBackup(JSON.parse(JSON.stringify(d)));assert.deepEqual(restored.organisations.find(o=>o.id===org.id).roles,org.roles);const legacy=JSON.parse(JSON.stringify(d));for(const o of legacy.organisations)delete o.roles;const restoredOld=await validateBackup(legacy);assert.deepEqual(restoredOld.organisations.find(o=>o.id===org.id).roles,['Funder']);const bad=JSON.parse(JSON.stringify(d));bad.organisations.find(o=>o.id===org.id).roles=null;await assert.rejects(validateBackup(bad));
});
