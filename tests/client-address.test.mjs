import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import {validateBackup} from '../device-backups.mjs';
import {invoiceDetails} from '../device-business.mjs';
import {residentialAddressText} from '../client-address.js';
test('structured client address retains leading zero, supports reports/search and round-trips backups',async()=>{
 const d=normalise(seed({enriched:false})),call=(path,method='GET',input={})=>dispatch(d,path,method,input);
 const c=call('clients/client-1'),body={version:c.details.version,name:c.person.name,email:'address.test@example.invalid',phone:'',residentialAddress:'Legacy full address, Fictional SA 5000',workAddress:'',sameAsResidential:true,preferredContact:'client',representativePersonId:null,contactNeeds:''};
 const saved=call('clients/client-1/details','PUT',{...body,residentialSuburb:'Example locality',residentialState:'NT',residentialPostcode:'0800'});
 assert.equal(saved.details.residentialPostcode,'0800');assert.equal(saved.details.residentialAddress,body.residentialAddress);
 assert.equal(call('people/'+c.personId).residentialPostcode,'0800');
 assert.ok(dispatch(d,'search','GET',{},new URLSearchParams({q:'0800'})).results.some(r=>r.id===c.id));
 for(const [dataset,field]of [['people','residentialPostcode'],['projects','clientPostcode']]){
  const report=call('reports/query','POST',{dataset,columns:[field],filters:[{field,operator:'eq',value:'0800'}]});assert.ok(report.rows.length);assert.ok(report.rows.every(r=>r[field]==='0800'));
 }
 const restored=await validateBackup(d);assert.equal(restored.clients.find(x=>x.id===c.id).details.residentialPostcode,'0800');
 const retained=call('clients/client-1/details','PUT',{...body,version:saved.details.version});assert.equal(retained.details.residentialPostcode,'0800');
 for(const value of [800,'800','08x0',null])assert.throws(()=>call('clients/client-1/details','PUT',{...body,version:retained.details.version,residentialPostcode:value}),e=>e.status===422);
 assert.throws(()=>call('clients/client-1/details','PUT',{...body,residentialPostcode:'5000'}),e=>e.status===409);
 assert.equal(call('clients/client-1').details.residentialPostcode,'0800');
 const bad=structuredClone(d);bad.clients.find(x=>x.id===c.id).details.residentialPostcode=800;await assert.rejects(validateBackup(bad),/Backup rejected/);
 const padded=structuredClone(d);padded.clients.find(x=>x.id===c.id).details.residentialState=' NT ';await assert.rejects(validateBackup(padded),/Backup rejected/);
 const legacy=normalise(seed({enriched:false}));assert.equal((await validateBackup(legacy)).clients.length,legacy.clients.length);
 const blanks=dispatch(legacy,'reports/query','POST',{dataset:'people',columns:['residentialPostcode'],filters:[{field:'residentialPostcode',operator:'is_empty'}]});assert.ok(blanks.rows.length);assert.ok(blanks.rows.every(r=>r.residentialPostcode===''));
 const cleared=call('clients/client-1/details','PUT',{...body,version:retained.details.version,residentialState:'',residentialPostcode:''});assert.equal(cleared.details.residentialState,'');assert.equal(cleared.details.residentialPostcode,'');
 const address={residentialAddress:'x'.repeat(500),residentialSuburb:'y'.repeat(100),residentialState:'NSW',residentialPostcode:'0800'};d.clients.find(x=>x.id===c.id).details={...cleared.details,...address};
 const invoice=invoiceDetails(d,{payerType:'client',payerId:c.id,lines:[{description:'Synthetic item',amountCents:100}]},{integer:v=>v,str:v=>String(v)});assert.equal(invoice.billingAddress,residentialAddressText(address));assert.equal(invoice.billingAddress.length,611);
});
