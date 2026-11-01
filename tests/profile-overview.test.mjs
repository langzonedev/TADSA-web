import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import {validateBackup} from '../device-backups.mjs';

test('person overview context survives device retries, old contact payloads and validated backup round-trip',async()=>{
 const d=normalise(seed({enriched:false})),id='person-3',path='people/'+id+'/profile-details',call=(method='GET',body={})=>dispatch(d,path,method,body),initial=call();
 const command={requestId:crypto.randomUUID(),version:initial.version,section:'contact',details:{...initial.contact,disability:'Fictional support context',dateOfBirth:'1970-05-16',additionalComments:'Synthetic additional contact arrangements.'}};
 const saved=call('PUT',command);assert.deepEqual(call('PUT',command),saved);assert.throws(()=>call('PUT',{...command,requestId:crypto.randomUUID()}),e=>e.status===409);
 const legacy={requestId:crypto.randomUUID(),version:saved.version,section:'contact',details:{...saved.contact,language:'English'}};for(const key of ['disability','dateOfBirth','additionalComments'])delete legacy.details[key];
 const updated=call('PUT',legacy);for(const key of ['disability','dateOfBirth','additionalComments'])assert.equal(updated.contact[key],command.details[key]);
 const backup=await validateBackup(structuredClone(d)),restored=normalise(backup);assert.deepEqual(dispatch(restored,path),updated);
 const bad=structuredClone(d);bad.profileDetails[id].contact.dateOfBirth='1970-02-30';await assert.rejects(validateBackup(bad),/Backup rejected/);
});
