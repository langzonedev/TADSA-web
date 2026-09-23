import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import {validateBackup} from '../device-backups.mjs';
function fixture(){const d=normalise(seed()),tech=d.people.find(p=>p.roles.includes('Technician')),path=`people/${tech.id}/profile-details`,call=(method='GET',body)=>dispatch(d,path,method,body??{},new URLSearchParams(),{id:crypto.randomUUID(),displayName:'Synthetic operator',role:'administrator'});return {d,tech,path,call};}
test('device profile saves preserve independent sections, replay safely and reject stale writes',()=>{
 const {d,tech,call}=fixture(),initial=call(),request={requestId:crypto.randomUUID(),version:0,section:'contact',details:{...initial.contact,homePhone:'123',preferredPhone:'home'}};
 assert.equal(call('PUT',request).version,1);assert.equal(call('PUT',request).version,1);
 const next=call('PUT',{requestId:crypto.randomUUID(),version:1,section:'capabilities',details:{...initial.capabilities,visitClients:'yes',equipment:['Bandsaw']}});
 assert.equal(next.contact.homePhone,'123');assert.deepEqual(next.capabilities.equipment,['Bandsaw']);
 const reload=normalise(structuredClone(d));assert.deepEqual(dispatch(reload,`people/${tech.id}/profile-details`),next);
 assert.throws(()=>call('PUT',{...request,requestId:crypto.randomUUID()}),/changed/);
});
test('device profile validates organisations and technician role',()=>{
 const {d,call}=fixture(),before=call();assert.throws(()=>call('PUT',{requestId:crypto.randomUUID(),version:0,section:'contact',details:{...before.contact,organisationId:'org-missing'}}),/existing organisation/);
 const person=d.people.find(p=>!p.roles.includes('Technician'));
 assert.throws(()=>dispatch(d,`people/${person.id}/profile-details`,'PUT',{requestId:crypto.randomUUID(),version:0,section:'capabilities',details:before.capabilities}),/active Technician/);
});
test('profile backups round-trip with old export compatibility and strict references/versions/shape',async()=>{
 const {d,tech,call}=fixture();assert.equal((await validateBackup(d)).profileDetails,undefined);
 call('PUT',{requestId:crypto.randomUUID(),version:0,section:'contact',details:{...call().contact,organisationId:d.organisations[0].id,mobilePhone:'0400000000'}});
 assert.deepEqual((await validateBackup(d)).profileDetails,d.profileDetails);
 for(const mutation of [v=>v.version=0,v=>v.contact.organisationId='org-missing',v=>v.extra='unsupported',v=>v.capabilities.drives=false]){const bad=structuredClone(d);mutation(bad.profileDetails[tech.id]);await assert.rejects(validateBackup(bad),/Backup rejected/);}
 const roleChanged=structuredClone(d);roleChanged.people.find(p=>p.id===tech.id).roles=['Administrator'];assert.deepEqual((await validateBackup(roleChanged)).profileDetails,d.profileDetails);
});
