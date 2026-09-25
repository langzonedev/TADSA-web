import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch,operationDefaults} from '../device-model.mjs';
test('technician remaining workload distinguishes missing from explicitly recorded zero',()=>{const d=normalise(seed({enriched:false}));d.operations={};const technician=()=>dispatch(d,'technicians').items.find(p=>p.id==='person-3');assert.equal(technician().remainingMinutes,null);assert.ok(technician().remainingWorkUnrecordedCount>0);const originalMissing=technician().remainingWorkUnrecordedCount;const project=d.projects.find(p=>p.status!=='closed'&&p.coordination.technicianIds.includes('person-3'));assert.ok(project);d.operations[project.id]={remainingMinutes:0};assert.equal(technician().remainingMinutes,0);assert.equal(technician().remainingWorkUnrecordedCount,originalMissing-1);d.operations[project.id].remainingMinutes=90;assert.equal(technician().remainingMinutes,90);project.status='closed';assert.equal(technician().remainingMinutes,null);});

test('project operations distinguish an absent work estimate from explicit zero',()=>{const d=normalise(seed({enriched:false}));d.operations={};const read=()=>dispatch(d,'projects/project-1/operations');assert.equal(read().workEstimateRecorded,false);d.operations['project-1']={remainingMinutes:0};assert.equal(read().workEstimateRecorded,true);assert.equal(read().remainingMinutes,0);d.operations['project-1'].remainingMinutes=90;assert.equal(read().workEstimateRecorded,true);assert.equal(read().remainingMinutes,90);});

import {randomUUID} from 'node:crypto';
import {validateBackup} from '../device-backups.mjs';
import '../device-extensions.mjs';
test('notes and unrelated saves preserve unknown, first explicit zero persists and backups/replay retain it',async()=>{
 let d=normalise(seed({enriched:false}));d.operations={};const read=()=>dispatch(d,'projects/project-1/operations');
 dispatch(d,'projects/project-1/notes','POST',{requestId:randomUUID(),text:'Note without estimate'});
 assert.equal(read().workEstimateRecorded,false);assert.equal(dispatch(d,'technicians').items.find(t=>t.id==='person-3').remainingMinutes,null);
 d=await validateBackup(d);assert.equal(read().workEstimateRecorded,false);
 const put=patch=>({requestId:randomUUID(),version:read().version,...operationDefaults,...patch});
 dispatch(d,'projects/project-1/operations','PUT',put({onHold:true,workEstimateRecorded:false}));assert.equal(read().workEstimateRecorded,false);
 dispatch(d,'projects/project-1/operations','PUT',put({fundingContributors:[{type:'client',id:'client-1',amountCents:100}],workEstimateRecorded:false}));assert.equal(read().workEstimateRecorded,false);
 assert.throws(()=>dispatch(d,'projects/project-1/operations','PUT',put({remainingMinutes:60,workEstimateRecorded:false})));
 const input=put({fundingContributors:[{type:'client',id:'client-1',amountCents:100}],reviewRequired:true,workEstimateRecorded:true});const result=dispatch(d,'projects/project-1/operations','PUT',input);assert.equal(result.workEstimateRecorded,true);assert.equal(result.remainingMinutes,0);assert.deepEqual(dispatch(d,'projects/project-1/operations','PUT',input),result);
 d=await validateBackup(d);assert.equal(read().workEstimateRecorded,true);const bad=structuredClone(d);bad.operations['project-1'].workEstimateRecorded='false';await assert.rejects(validateBackup(bad));
 const clean=normalise(seed({enriched:false}));clean.operations={};const before=dispatch(clean,'projects/project-1/operations');const zero=dispatch(clean,'projects/project-1/operations','PUT',{requestId:randomUUID(),version:before.version,...operationDefaults});assert.equal(zero.workEstimateRecorded,true);assert.equal(zero.remainingMinutes,0);assert.equal(zero.version,before.version+1);
});

test('backup operation estimate flags reject malformed and unsupported fields',async()=>{
 const original=normalise(seed());
 for(const flag of [false,true]){const d=structuredClone(original);d.operations['project-13'].remainingMinutes=0;d.operations['project-13'].workEstimateRecorded=flag;assert.equal((await validateBackup(d)).operations['project-13'].workEstimateRecorded,flag);}
 for(const flag of ['false',0,null,{}]){const d=structuredClone(original);d.operations['project-13'].workEstimateRecorded=flag;await assert.rejects(validateBackup(d));}
 const inconsistent=structuredClone(original);inconsistent.operations['project-13'].workEstimateRecorded=false;assert.ok(inconsistent.operations['project-13'].remainingMinutes>0);await assert.rejects(validateBackup(inconsistent),/unrecorded work estimate/);
 const bad=structuredClone(original);bad.operations['project-13'].unknownOperationField=true;await assert.rejects(validateBackup(bad),/unsupported operational field/);
 assert.equal((await validateBackup(original)).operations['project-13'].workEstimateRecorded,undefined,'flagless legacy shape preserved');
});

import {deviceReportRows} from '../device-reports.mjs';
import '../device-iteration.mjs';
test('custom and monthly reports preserve missing, explicit zero and partial known workload',()=>{
 const d=normalise(seed({enriched:false}));d.operations={};const project=d.projects.find(p=>p.status!=='closed'&&p.coordination.technicianId==='person-3');assert.ok(project);
 const row=()=>deviceReportRows(d,'projects').find(p=>p.id===project.id);
 const monthly=()=>dispatch(d,'reports','GET',{},new URLSearchParams({month:'2026-09'})).workload.find(p=>p.id==='person-3');
 assert.equal(row().hoursRemaining,null);assert.equal(monthly().remainingMinutes,null);const missing=monthly().remainingWorkUnrecordedCount;
 d.operations[project.id]={remainingMinutes:0,workEstimateRecorded:false};assert.equal(row().hoursRemaining,null);assert.equal(monthly().remainingMinutes,null);assert.equal(monthly().remainingWorkUnrecordedCount,missing);
 d.operations[project.id].workEstimateRecorded=true;assert.equal(row().hoursRemaining,0);assert.equal(monthly().remainingMinutes,0);assert.equal(monthly().remainingWorkUnrecordedCount,missing-1);
 d.operations[project.id].remainingMinutes=90;assert.equal(row().hoursRemaining,1.5);assert.equal(monthly().remainingMinutes,90);delete d.operations[project.id].workEstimateRecorded;assert.equal(row().hoursRemaining,1.5);
});
