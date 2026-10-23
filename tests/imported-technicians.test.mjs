import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import {validateBackup} from '../device-backups.mjs';
import {createProfileDetails} from '../profile-details-model.js';
import '../device-extensions.mjs';
import '../device-iteration.mjs';

test('role-only device technicians retain unknown skills/allocation and use contact postcode without copying it into calendar storage',async()=>{
 const raw=seed({enriched:false}),id='person-970001';raw.people.push({id,name:'Synthetic imported technician',role:'Technician',email:'',phone:''});
 const d=normalise(raw),profile=createProfileDetails();d.sequence=970001;profile.contact.addressLine1='10 Fictional Street';profile.contact.suburb='Synthetic suburb';profile.contact.postcode='5045';d.profileDetails={[id]:{personId:id,version:1,...profile}};
 const call=(path,method='GET',input={})=>dispatch(d,path,method,input),find=()=>call('technicians').items.find(x=>x.id===id);
 assert.equal(call('technicians').items.find(x=>x.id==='person-3').availability,'available');
 assert.equal(find().availability,'unknown');assert.deepEqual(find().skills,[]);assert.equal(find().postcode,'5045');assert.equal(find().locationSource,'person-contact');
 let calendar=call('availability/'+id);assert.equal(calendar.postcode,'5045');assert.equal(calendar.geocode,null);
 calendar=call('availability/'+id+'/entries','POST',{requestId:crypto.randomUUID(),id:null,version:0,calendarVersion:calendar.version,startDate:'2026-10-24',endDate:'2026-10-24',status:'limited',note:'Synthetic availability'});
 assert.equal(calendar.postcode,'5045');assert.equal(d.calendars[id].postcode,'');assert.equal(find().availability,'unknown');
 d.profileDetails[id].contact.postcode='5046';assert.equal(call('availability/'+id).postcode,'5046');assert.equal(find().postcode,'5046');
 calendar=call('availability/'+id+'/location','PUT',{requestId:crypto.randomUUID(),version:calendar.version,baseAddress:'',suburb:'',postcode:'',geocode:null});assert.equal(calendar.locationSource,'technician-base');assert.equal(calendar.postcode,'');assert.equal(d.calendars[id].locationRecorded,true);assert.equal(find().postcode,'');
 calendar=call('availability/'+id+'/areas','PUT',{requestId:crypto.randomUUID(),version:calendar.version,serviceAreas:['metro']});assert.equal(calendar.postcode,'');
 const restored=normalise(await validateBackup(structuredClone(d)));assert.equal(dispatch(restored,'availability/'+id).postcode,'');assert.equal(dispatch(restored,'availability/'+id).locationSource,'technician-base');assert.equal(dispatch(restored,'technicians').items.find(x=>x.id===id).availability,'unknown');
 const bad=structuredClone(d);bad.calendars[id].locationRecorded='yes';await assert.rejects(validateBackup(bad),/location recording state/);
});
