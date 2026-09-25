import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import {validateBackup} from '../device-backups.mjs';
test('invoice reporting categories preserve amounts and legacy unknown values through backup',async()=>{
 const d=normalise(seed({enriched:false}));const input={requestId:crypto.randomUUID(),version:1,milestone:'deposit',billingMode:'nominated',payerType:'client',payerId:'client-1',milestoneReached:true,lines:[{description:'Synthetic service',quantityMilli:1500,unitPriceCents:2000,category:'service_charge'},{description:'Synthetic item',amountCents:400,category:'other'},{description:'Synthetic legacy item',amountCents:100},{description:'Synthetic unclassified item',amountCents:200,category:'unclassified'}]};
 const saved=dispatch(d,'projects/project-1/invoices','POST',input),snapshot=saved.invoices[0].snapshot;assert.equal(snapshot.totalCents,3700);assert.deepEqual(snapshot.lines.map(l=>l.category),['service_charge','other',undefined,'unclassified']);assert.equal(Object.hasOwn(snapshot.lines[2],'category'),false);assert.deepEqual(dispatch(d,'projects/project-1/invoices','POST',input),saved);assert.deepEqual((await validateBackup(d)).operations['project-1'].invoices[0].snapshot,snapshot);
 const bad=structuredClone(d);bad.operations['project-1'].invoices[0].snapshot.lines[0].category='invented';await assert.rejects(validateBackup(bad),/category/);
 assert.throws(()=>dispatch(d,'projects/project-1/invoices','POST',{...input,requestId:crypto.randomUUID(),version:saved.version,lines:[{description:'Synthetic item',amountCents:100,category:'invented'}]}),/category/);
});
