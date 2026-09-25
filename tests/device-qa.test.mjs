import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
test('independent: representative unlink makes intake incomplete',()=>{
 const d=normalise(seed({enriched:false})),run=(path,method='GET',input={})=>dispatch(d,path,method,input);
 run('clients/client-1/contacts','POST',{requestId:randomUUID(),personId:'person-4',role:'Carer'});
 const c=run('clients/client-1');
 const saved=run('clients/client-1/details','PUT',{version:c.details.version,name:c.person.name,email:'',phone:'',residentialAddress:'18 Wattle Crescent',workAddress:'24 Fern Avenue',sameAsResidential:false,preferredContact:'representative',representativePersonId:'person-4',contactNeeds:''});
 assert.equal(saved.details.complete,true);
 run('clients/client-1/contacts/remove','POST',{requestId:randomUUID(),personId:'person-4',role:'Carer'});
 assert.equal(run('clients/client-1').details.complete,false);
});
test('independent: phone duplicate matching ignores formatting',()=>{
 const d=normalise(seed({enriched:false}));d.people[0].phone='0400 123 456';
 assert.throws(()=>dispatch(d,'clients','POST',{requestId:randomUUID(),name:'Frances Mason',email:'frances.mason@example.invalid',phone:'0400123456',allowDuplicate:false}),e=>e.status===409&&e.code==='DUPLICATE_CANDIDATE');
});
test('independent: note replay across serialised reload remains once and detects changed payload',()=>{
 let d=normalise(seed({enriched:false}));const input={requestId:randomUUID(),text:'Please call in the afternoon.'};
 const before=dispatch(d,'projects/project-1/notes','POST',input);d=normalise(JSON.parse(JSON.stringify(d)));
 assert.deepEqual(dispatch(d,'projects/project-1/notes','POST',input),before);
 assert.throws(()=>dispatch(d,'projects/project-1/notes','POST',{...input,text:'Changed message'}),e=>e.status===409);
 assert.equal(dispatch(d,'projects/project-1/operations').notes.length,1);
});
const operations=(d,id,patch={})=>{const {projectId,notes,invoices,approvedByName,approvalLegacy,...body}=dispatch(d,`projects/${id}/operations`);return {...body,requestId:randomUUID(),...patch};};
test('independent: technical unpaid time denied, full receipt unlocks approved time at fixed rate',()=>{
 const d=normalise(seed({enriched:false})),id='project-1';const approver=dispatch(d,'people','POST',{requestId:randomUUID(),name:'Cameron Irving',email:'cameron.irving@example.invalid',phone:'',roles:['Administrator'],technician:null,allowDuplicate:false});
 assert.throws(()=>dispatch(d,`projects/${id}/operations`,'PUT',operations(d,id,{actualMinutes:1})),e=>e.status===422);
 const p=dispatch(d,`projects/${id}`),o=dispatch(d,`projects/${id}/invoices`,'POST',{requestId:randomUUID(),version:p.version,milestone:'deposit',billingMode:'nominated',payerType:'client',payerId:'client-1',lines:[{description:'Preparation',amountCents:5000}],milestoneReached:true});
 const i=o.invoices[0];let plan=dispatch(d,`projects/${id}/invoices/${i.id}/payments`,'POST',{requestId:randomUUID(),version:o.version,amountCents:4999,receivedOn:'2026-09-18',reference:'Partial receipt'});assert.equal(plan.workGate.allowed,false);
 plan=dispatch(d,`projects/${id}/invoices/${i.id}/payments`,'POST',{requestId:randomUUID(),version:plan.version,amountCents:1,receivedOn:'2026-09-18',reference:'Balance'});assert.equal(plan.workGate.allowed,true);
 dispatch(d,`projects/${id}/operations`,'PUT',operations(d,id,{actualMinutes:1,remainingMinutes:2,workEstimateRecorded:true,assessmentComplete:true,workApproved:true,approvedBy:approver.id,approvedOn:'2026-09-18'}));
 plan=dispatch(d,`projects/${id}/work-plan`);assert.equal(plan.actualLabourCents,83);assert.equal(plan.remainingLabourCents,167);assert.equal(plan.estimatedTotalLabourCents,250);
});
test('independent: assessment free and approval date is validated',()=>{
 const d=normalise(seed({enriched:false})),id='project-2';
 assert.throws(()=>dispatch(d,`projects/${id}/operations`,'PUT',operations(d,id,{assessmentComplete:true,workApproved:true,approvedBy:'Morgan Ellis',approvedOn:'2026-02-30'})),e=>e.status===422);
 dispatch(d,`projects/${id}/operations`,'PUT',operations(d,id,{actualMinutes:60}));assert.equal(dispatch(d,`projects/${id}/work-plan`).actualLabourCents,0);
 const p=dispatch(d,`projects/${id}`);assert.throws(()=>dispatch(d,`projects/${id}/invoices`,'POST',{requestId:randomUUID(),version:p.version,milestone:'deposit',billingMode:'nominated',payerType:'client',payerId:'client-1',lines:[{description:'Assessment',amountCents:5000}],milestoneReached:true}),e=>e.status===422);
});
