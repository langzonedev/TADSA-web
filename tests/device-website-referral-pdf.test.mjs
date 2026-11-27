import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {dispatch,normalise} from '../device-model.mjs';
import {validateWebsiteReferralPdf} from '../device-files.mjs';
import '../device-extensions.mjs';

test('a device enquiry preserves one intact source file across retry and reload',async()=>{
 let data=normalise(seed({enriched:false}));
 const bytes=Buffer.from('%PDF-1.4\nSynthetic only\n%%EOF');
 const file={name:'Website referral.pdf',mime:'application/pdf',dataBase64:bytes.toString('base64')};
 const actor={id:'account-demo',role:'coordinator',referralPdf:await validateWebsiteReferralPdf(file)};
 const call=(path,method='GET',body={})=>dispatch(data,path,method,body,new URLSearchParams(),actor);
 const input={requestId:crypto.randomUUID(),newClient:{name:'Synthetic Document Client',phone:'',email:'',allowDuplicate:false},
  title:'Synthetic enquiry',summary:'Request',kind:'Assessment',requiredSkills:[],technicianId:null,fundingStatus:'unknown',payerId:null,fundingNotes:'',
  intakeChannel:'website',websiteReferral:{receivedOn:'2026-01-06',answers:{client:'Synthetic Document Client',need:'Request'}},websiteReferralPdf:file};
 await assert.rejects(validateWebsiteReferralPdf({...file,unexpected:true}),error=>error.status===422);
 await assert.rejects(validateWebsiteReferralPdf({...file,dataBase64:'YQ=='}),error=>error.status===422);
 const counts=[data.people.length,data.projects.length];
 assert.throws(()=>dispatch(data,'projects','POST',input),/Validate the website enquiry PDF/);
 assert.throws(()=>call('projects','POST',{...input,intakeChannel:'phone'}),error=>error.status===422);
 assert.deepEqual([data.people.length,data.projects.length],counts);
 const project=call('projects','POST',input);
 data=normalise(structuredClone(data));
 assert.equal(call('projects','POST',input).id,project.id);
 const record=call('projects/'+project.id+'/attachments');
 assert.deepEqual(record.items.map(item=>[item.name,item.mime,item.size]),[[file.name,file.mime,bytes.length]]);
 assert.deepEqual(Buffer.from(call('projects/'+project.id+'/attachments/'+record.items[0].id+'/download').bytes),bytes);
 assert.ok(!data.replays[input.requestId].key.includes(file.dataBase64));
 assert.ok(data.replays[input.requestId].key.includes(actor.referralPdf.sha256));
 assert.throws(()=>call('projects','POST',{...input,requestId:crypto.randomUUID(),websiteReferral:{...input.websiteReferral,receivedOn:'2026-01-07'}}),error=>error.status===409&&error.message.includes(project.reference));
 assert.throws(()=>call('projects','POST',{...input,websiteReferralPdf:{...file,name:'A different name.pdf'}}),error=>error.code==='IDEMPOTENCY_MISMATCH');
 assert.deepEqual([data.people.length,data.projects.length],[counts[0]+1,counts[1]+1]);
});
