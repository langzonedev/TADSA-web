import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import {validateBackup} from '../device-backups.mjs';

const fixture=()=>{
 const data=normalise(seed({enriched:false})),person=data.people.find(p=>p.roles.includes('Technician'));
 const call=(method='GET',body={})=>dispatch(data,`people/${person.id}/profile-details`,method,body,new URLSearchParams(),{id:crypto.randomUUID(),displayName:'Synthetic reviewer',role:'administrator'});
 const save=(section,details)=>call('PUT',{requestId:crypto.randomUUID(),version:call().version,section,details});
 return {data,person,call,save};
};

test('independent device review: profession survives backup reload, old-client save and capability update without changing roles',async()=>{
 const {data,person,call,save}=fixture(),roles=structuredClone(person.roles);
 save('contact',{...call().contact,alliedHealthProfession:'other',alliedHealthProfessionOther:'Speech pathologist'});
 const backup=await validateBackup(data),restored=normalise(structuredClone(backup));
 assert.equal(dispatch(restored,`people/${person.id}/profile-details`).contact.alliedHealthProfessionOther,'Speech pathologist');
 const legacy={...call().contact};delete legacy.alliedHealthProfession;delete legacy.alliedHealthProfessionOther;
 save('contact',{...legacy,language:'Synthetic language'});
 save('capabilities',{...call().capabilities,vehicle:'Synthetic van'});
 assert.equal(call().contact.alliedHealthProfessionOther,'Speech pathologist');assert.deepEqual(person.roles,roles);
 assert.equal((await validateBackup(data)).profileDetails[person.id].contact.alliedHealthProfession,'other');
});

test('independent device review: old backups remain valid and accept an explicit profession',async()=>{
 const {data,person,call,save}=fixture();save('contact',{...call().contact,alliedHealthProfession:'physiotherapist',alliedHealthProfessionOther:''});
 const old=structuredClone(data);delete old.profileDetails[person.id].contact.alliedHealthProfession;delete old.profileDetails[person.id].contact.alliedHealthProfessionOther;
 const restored=normalise(await validateBackup(old));
 const initial=dispatch(restored,`people/${person.id}/profile-details`);
 const updated=dispatch(restored,`people/${person.id}/profile-details`,'PUT',{requestId:crypto.randomUUID(),version:initial.version,section:'contact',details:{...initial.contact,alliedHealthProfession:'psychologist',alliedHealthProfessionOther:''}},new URLSearchParams(),{id:crypto.randomUUID(),displayName:'Synthetic reviewer',role:'administrator'});
 assert.equal(updated.contact.alliedHealthProfession,'psychologist');await validateBackup(restored);
});

test('independent device review: invalid and partial profession backups are refused',async()=>{
 const {data,person,call,save}=fixture();save('contact',{...call().contact,alliedHealthProfession:'occupational-therapist',alliedHealthProfessionOther:''});
 for(const mutation of [c=>{c.alliedHealthProfession='unconfirmed';},c=>{c.alliedHealthProfession='other';c.alliedHealthProfessionOther='';},c=>{delete c.alliedHealthProfession;},c=>{c.alliedHealthProfessionOther='unmatched detail';}]){
  const invalid=structuredClone(data);mutation(invalid.profileDetails[person.id].contact);await assert.rejects(validateBackup(invalid),/Backup rejected/);
 }
});
