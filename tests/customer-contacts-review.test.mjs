import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import {validateBackup} from '../device-backups.mjs';
import {recordDirectoryStatus} from '../profile-details-model.js';

function fixture(){const data=normalise(seed({enriched:false})),actor={id:crypto.randomUUID(),displayName:'Synthetic reviewer',role:'administrator'};return {data,call:(path,method='GET',body={})=>dispatch(data,path,method,body,new URLSearchParams(),actor)};}

test('independent device answers 8–10: multiple contacts and labels survive reload without replacing project assignments',async()=>{
 const {data,call}=fixture();for(const id of ['person-5','person-15'])data.people.find(p=>p.id===id).roles=['Occupational therapist'];
 const before=structuredClone(call('projects/project-1'));
 for(const [personId,relationshipLabel]of [['person-5','Assessing clinician'],['person-15','Treating clinician']])call('clients/client-1/contacts','POST',{requestId:crypto.randomUUID(),personId,role:'Occupational therapist',relationshipLabel});
 assert.deepEqual(call('projects/project-1'),before);assert.equal(call('clients/client-1').contacts.filter(c=>c.role==='Occupational therapist').length,2);
 call('clients/client-1/contacts','POST',{requestId:crypto.randomUUID(),personId:'person-15',role:'Occupational therapist'});
 assert.equal(call('clients/client-1').contacts.find(c=>c.personId==='person-15').relationshipLabel,'Treating clinician');
 const restored=normalise(await validateBackup(data));assert.equal(dispatch(restored,'clients/client-1').contacts.find(c=>c.personId==='person-5').relationshipLabel,'Assessing clinician');
 call('clients/client-1/contacts/remove','POST',{requestId:crypto.randomUUID(),personId:'person-15',role:'Occupational therapist'});
 assert.ok(call('clients/client-1').contacts.some(c=>c.personId==='person-5'));assert.deepEqual(call('projects/project-1'),before);
});

test('independent device answers 8–10: directory status preserves identity and roles through old payloads and backup',async()=>{
 const {data,call}=fixture(),path='people/person-3/profile-details',before=call(path),roles=structuredClone(data.people.find(p=>p.id==='person-3').roles);
 const saved=call(path,'PUT',{requestId:crypto.randomUUID(),version:before.version,section:'contact',details:{...before.contact,directoryStatus:'review'}});
 const legacy={...saved.contact};delete legacy.directoryStatus;
 call(path,'PUT',{requestId:crypto.randomUUID(),version:saved.version,section:'contact',details:legacy});assert.equal(call(path).contact.directoryStatus,'review');
 const restored=normalise(await validateBackup(data));assert.equal(dispatch(restored,path).contact.directoryStatus,'review');assert.deepEqual(restored.people.find(p=>p.id==='person-3').roles,roles);
 const invalid=structuredClone(data);invalid.profileDetails['person-3'].contact.directoryStatus='retired';await assert.rejects(validateBackup(invalid),/Backup rejected/);
 const old=structuredClone(data);delete old.profileDetails['person-3'].contact.directoryStatus;await validateBackup(old);
 assert.equal(data.people.filter(p=>p.id==='person-3').length,1);
 const org=call('organisations/org-1');call('organisations/org-1/category','PUT',{requestId:crypto.randomUUID(),version:org.version,category:org.category,directoryStatus:'inactive'});
 const next=call('organisations/org-1');assert.equal(next.active,false);call('organisations/org-1/category','PUT',{requestId:crypto.randomUUID(),version:next.version,category:'Synthetic category'});
 assert.equal(call('organisations/org-1').directoryStatus,'inactive');const savedDirectory=normalise(await validateBackup(data));assert.equal(dispatch(savedDirectory,'organisations/org-1').directoryStatus,'inactive');
 const sourceClient=call('clients/client-1'),clientPath=`people/${sourceClient.personId}/profile-details`,clientProfile=call(clientPath);
 call(clientPath,'PUT',{requestId:crypto.randomUUID(),version:clientProfile.version,section:'contact',details:{...clientProfile.contact,directoryStatus:'inactive'}});
 const listed=call('clients').items.find(c=>c.id==='client-1');assert.equal(recordDirectoryStatus(listed),'inactive');assert.equal(listed.person.directoryStatus,'inactive');assert.ok(listed.projects.length>0);
});
