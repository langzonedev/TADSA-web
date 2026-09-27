import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch,operationDefaults} from '../device-model.mjs';
import '../device-extensions.mjs';
import {addressKey} from '../location-geocode.js';
import {validateBackup} from '../device-backups.mjs';
const match=values=>({latitude:-34.9,longitude:138.6,provider:'photon',matchedAt:'2026-09-27T00:00:00.000Z',addressKey:addressKey(values)});
test('device technician/project geocodes survive backup and clear on current and legacy address writes',async()=>{
 const d=normalise(seed({enriched:false})),call=(path,method='GET',input={})=>dispatch(d,path,method,input),tech=call('technicians').items[0];
 const base={baseAddress:'7 Fictional Workshop Street',suburb:'Example suburb',postcode:'5000'},geo=match(Object.values(base));
 let saved=call('availability/'+tech.id);assert.equal(saved.geocode,null);
 saved=call('availability/'+tech.id+'/location','PUT',{requestId:crypto.randomUUID(),version:saved.version,...base,geocode:geo});assert.deepEqual(saved.geocode,geo);assert.deepEqual(call('technicians').items.find(x=>x.id===tech.id).geocode,geo);
 const same=call('availability/'+tech.id+'/location','PUT',{requestId:crypto.randomUUID(),version:saved.version,...base});assert.equal(same.version,saved.version);
 const areaInput={requestId:crypto.randomUUID(),version:saved.version,serviceAreas:['metro']};saved=call('availability/'+tech.id+'/areas','PUT',areaInput);assert.deepEqual(saved.geocode,geo);assert.deepEqual(call('availability/'+tech.id),saved);assert.deepEqual(call('availability/'+tech.id+'/areas','PUT',areaInput),saved);
 const entryInput={requestId:crypto.randomUUID(),id:null,version:0,calendarVersion:saved.version,startDate:'2028-01-02',endDate:'2028-01-03',status:'available',note:'Synthetic geocode preservation'};saved=call('availability/'+tech.id+'/entries','POST',entryInput);assert.deepEqual(saved.geocode,geo);assert.deepEqual(call('availability/'+tech.id),saved);assert.deepEqual(call('availability/'+tech.id+'/entries','POST',entryInput),saved);
 assert.throws(()=>call('availability/'+tech.id+'/location','PUT',{requestId:crypto.randomUUID(),version:saved.version,...base,geocode:{...geo,longitude:181}}),e=>e.status===422);
 const place={address:'12 Fictional Project Lane',suburb:'Example suburb',postcode:'5000',serviceArea:''},projectGeo=match([place.address,place.suburb,place.postcode]);
 let location=call('projects/project-1/location');location=call('projects/project-1/location','PUT',{requestId:crypto.randomUUID(),version:location.version,...place,geocode:projectGeo});assert.deepEqual(location.geocode,projectGeo);
 const backup=await validateBackup(d);assert.deepEqual(backup.calendars[tech.id].geocode,geo);assert.deepEqual(backup.workPlans['project-1'].geocode,projectGeo);
 for(const broken of [x=>x.calendars[tech.id].geocode.latitude=91,x=>x.workPlans['project-1'].geocode.addressKey='different']){const bad=structuredClone(d);broken(bad);await assert.rejects(validateBackup(bad),/Backup rejected/);}
 const plan=call('projects/project-1/work-plan');call('projects/project-1/work-plan','PUT',{requestId:crypto.randomUUID(),version:plan.version,clientNdisVersion:plan.clientNdisVersion,location:'13 Fictional Project Lane',serviceArea:'',ndisApplicable:false,ndisNumber:'',ndisApproved:false,ndisApprovedBy:'',ndisApprovedOn:''});assert.equal(call('projects/project-1/location').geocode,null);
 saved=call('availability/'+tech.id+'/location','PUT',{requestId:crypto.randomUUID(),version:saved.version,...base,suburb:'Changed suburb'});assert.equal(saved.geocode,null);
 location=call('projects/project-1/location');location=call('projects/project-1/location','PUT',{requestId:crypto.randomUUID(),version:location.version,...place,geocode:projectGeo});
 d.operations['project-1']={...operationDefaults,...d.operations['project-1'],workApproved:true,reviewRequired:false};
 location=call('projects/project-1/location','PUT',{requestId:crypto.randomUUID(),version:location.version,...place,geocode:null});assert.equal(location.geocode,null);assert.equal(d.operations['project-1'].workApproved,true);
 call('projects/project-1/location','PUT',{requestId:crypto.randomUUID(),version:location.version,...place,address:'14 Fictional Project Lane'});assert.equal(d.operations['project-1'].workApproved,false);
});
