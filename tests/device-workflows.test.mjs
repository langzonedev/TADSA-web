import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
const req=()=>crypto.randomUUID();
test('create/edit person, complete intake, project coordination and safe local deletion',()=>{
 const d=normalise(seed()),call=(p,m='GET',b={})=>dispatch(d,p,m,b);
 let p=call('people','POST',{requestId:req(),name:'Fictional Tester',email:'tester@example.invalid',phone:'',roles:['Client'],technician:null,allowDuplicate:false});
 const update={requestId:req(),version:p.version,name:'Fictional Changed',email:p.email,phone:p.phone,roles:p.roles,technician:p.technician,allowDuplicate:false};p=call('people/'+p.id+'/profile','PUT',update);assert.equal(p.name,'Fictional Changed');assert.deepEqual(call('people/'+p.id+'/profile','PUT',update),p);
 const c=call('clients/'+p.clientId);const complete=call('clients/'+c.id+'/details','PUT',{version:p.version,name:p.name,email:p.email,phone:p.phone,residentialAddress:'1 Fictional Lane',workAddress:'',sameAsResidential:true,preferredContact:'client',representativePersonId:null,contactNeeds:'Email first'});assert.equal(complete.details.complete,true);
 const project=call('projects','POST',{requestId:req(),clientId:c.id,title:'Synthetic assessment',summary:'Check posture',kind:'Assessment',requiredSkills:['Assessment'],technicianId:'person-3',fundingStatus:'self',payerId:null,fundingNotes:''});assert.equal(project.clientName,p.name);
 assert.throws(()=>call('device-records/people/'+p.id,'DELETE',{requestId:req()}),e=>e.status===422);
 call('device-records/projects/'+project.id,'DELETE',{requestId:req()});assert.throws(()=>call('projects/'+project.id),e=>e.status===404);call('device-records/people/'+p.id,'DELETE',{requestId:req()});assert.throws(()=>call('people/'+p.id),e=>e.status===404);
});
test('calendar/no-op areas and shared NDIS versions retain contract',()=>{
 const d=normalise(seed()),call=(p,m='GET',b={})=>dispatch(d,p,m,b);
 const empty=call('availability/person-3');assert.equal(empty.version,0);const areas=call('availability/person-3/areas','PUT',{requestId:req(),version:0,serviceAreas:['metro']});assert.equal(areas.version,1);assert.equal(call('availability/person-3/areas','PUT',{requestId:req(),version:1,serviceAreas:['metro']}).version,1);
 const entry=call('availability/person-3/entries','POST',{requestId:req(),id:null,version:0,startDate:'2026-10-01',endDate:'2026-10-02',status:'available',note:''});assert.equal(entry.version,1);assert.equal(entry.entries.length,1);assert.throws(()=>call('availability/person-3/entries','POST',{requestId:req(),id:null,version:0,startDate:'2026-10-02',endDate:'2026-10-03',status:'available',note:''}),e=>e.status===422);
 const admin=call('people','POST',{requestId:req(),name:'Fiona Walker',email:'fiona.walker@example.invalid',phone:'',roles:['Administrator'],technician:null,allowDuplicate:false});
 const plan=call('projects/project-1/work-plan'),body={requestId:req(),version:plan.version,clientNdisVersion:0,location:'Synthetic location',serviceArea:'metro',ndisApplicable:true,ndisNumber:'123 456 789',ndisApproved:true,ndisApprovedBy:admin.id,ndisApprovedOn:'2026-09-18'};const saved=call('projects/project-1/work-plan','PUT',body);assert.equal(saved.clientNdisVersion,1);assert.equal(call('clients/client-1').ndis.number,'123 456 789');assert.equal(call('projects/project-1/work-plan','PUT',{...body,requestId:req(),version:saved.version,clientNdisVersion:1}).version,saved.version);
});
