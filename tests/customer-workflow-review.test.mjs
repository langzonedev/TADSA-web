import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import {projectNeedsReview,reviewDay} from '../project-details-model.js';
import {validateBackup} from '../device-backups.mjs';

test('independent device answers 11Ã¢â‚¬â€œ17: creator/default date are recorded and review visibility is shared',()=>{
 const data=normalise(seed({enriched:false})),users=['A','B'].map(label=>({id:crypto.randomUUID(),username:'synthetic-review-'+label,displayName:'Synthetic reviewer '+label,role:'coordinator'}));
 const call=(path,method='GET',body={},user=users[0])=>dispatch(data,path,method,body,new URLSearchParams(),user);
 const project=call('projects','POST',{requestId:crypto.randomUUID(),clientId:'client-1',title:'Synthetic shared review',summary:'Synthetic work',kind:'Technical',technicianId:null,technicianIds:[],requiredSkills:[],fundingStatus:'unknown',payerId:null,fundingNotes:''});
 const initial=call(`projects/${project.id}/admin-details`);assert.equal(initial.followUpOn,reviewDay());assert.equal(initial.coordinatorAccountId,users[0].id);
 const saved=call(`projects/${project.id}/admin-details`,'PUT',{requestId:crypto.randomUUID(),version:initial.version,programme:initial.programme,coordinatorAccountId:initial.coordinatorAccountId,followUpOn:'2001-01-01',enquirySource:initial.enquirySource,freedomWheels:initial.freedomWheels},users[1]);
 const dashboards=users.map(u=>call('dashboard','GET',{},u));assert.equal(dashboards[0].counts.overdueReviews,dashboards[1].counts.overdueReviews);assert.ok(dashboards[0].counts.overdueReviews>=1);assert.ok(dashboards.every(d=>d.projects.some(p=>p.id===project.id&&projectNeedsReview(p))));
 call(`projects/${project.id}/admin-details`,'PUT',{requestId:crypto.randomUUID(),version:saved.version,programme:saved.programme,coordinatorAccountId:saved.coordinatorAccountId,followUpOn:'2099-01-01',enquirySource:saved.enquirySource,freedomWheels:saved.freedomWheels});assert.equal(projectNeedsReview(call(`projects/${project.id}`)),false);
});

test('independent device modern workflow persists explicit authorisation and survives validated backup',async()=>{
 const data=normalise(seed({enriched:false})),actor={id:crypto.randomUUID(),username:'synthetic-review-admin',displayName:'Synthetic administrator',role:'administrator'};
 const call=(path,method='GET',body={})=>dispatch(data,path,method,body,new URLSearchParams(),actor);
 const project=call('projects','POST',{requestId:crypto.randomUUID(),clientId:'client-1',title:'Synthetic modern workflow',summary:'Synthetic only',kind:'Technical',requiredSkills:[],technicianId:null,fundingStatus:'unknown',payerId:null,fundingNotes:''});
 const path=`projects/${project.id}/lifecycle`,act=(action,data={})=>call(path,'PUT',{requestId:crypto.randomUUID(),version:call(`projects/${project.id}`).version,action,data});
 const lines=[{type:'travel',description:'Synthetic travel',quantityMilli:1000,unitPriceCents:100}];
 assert.equal(call(path).state.schema,2);act('assessmentDecision',{required:false,reason:'Synthetic triage'});act('assessmentReview',{approved:true,qualityReviewed:true,safetyReviewed:true,costsReviewed:true,reference:'Synthetic review',reviewedOn:'2026-01-01',notes:'Synthetic check'});act('quote',{lines,notes:'',pricing:{serviceHoursMilli:0,serviceRateCents:5000,serviceChargeCents:0,adjustmentReason:'',approvedBy:'Synthetic manager',approvalReference:'Synthetic manager review',approvedOn:'2026-01-01',invoiceBeforeBuild:false,fundingUncertain:false,invoiceReason:'Synthetic low-risk decision'}});
 assert.throws(()=>act('acceptQuote',{quoteVersion:1,acceptedBy:'Synthetic client',reference:'Synthetic quote',date:'2026-01-01'}));act('issueQuote',{quoteVersion:1,sentOn:'2026-01-01'});act('acceptQuote',{quoteVersion:1,acceptedBy:'Synthetic client',reference:'Synthetic quote',date:'2026-01-01'});assert.equal(call(path).workGate.allowed,false);act('workRequest',{quoteVersion:1,reference:'Synthetic request',sentOn:'2026-01-01',instructions:'Synthetic instructions'});act('work',{status:'complete',notes:'Synthetic completion'});act('signoff',{acceptedBy:'Synthetic client',reference:'Synthetic sign-off',signedOn:'2026-01-01',notes:''});act('costReturn',{lines,notes:''});act('financeHandoff',{costReturnVersion:1,reference:'Synthetic handoff',sentOn:'2026-01-01',notes:''});assert.equal(call(path).state.financeFinalisation,null);
 const restored=await validateBackup(data);assert.deepEqual(restored.lifecycles[project.id],data.lifecycles[project.id]);act('financeFinalise',{reference:'Synthetic finance check',confirmedOn:'2026-01-01',notes:'Synthetic resolved obligations',clientPaymentResolved:true,technicianPaymentResolved:true});act('close',{reason:'Synthetic done'});assert.deepEqual((await validateBackup(data)).lifecycles[project.id],data.lifecycles[project.id]);
});
