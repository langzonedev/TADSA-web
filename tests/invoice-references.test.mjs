import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import {validateBackup} from '../device-backups.mjs';
test('per-invoice references retain snapshot and gates, survive backup, and reject wrong project or stale write',async()=>{
 const d=normalise(seed({enriched:false})),call=(path,method='GET',data={})=>dispatch(d,path,method,data);const op=call('projects/project-1/invoices','POST',{requestId:crypto.randomUUID(),version:1,milestone:'deposit',billingMode:'nominated',payerType:'client',payerId:'client-1',milestoneReached:true,lines:[{description:'Synthetic work',amountCents:100}]});const invoice=op.invoices[0],snapshot=structuredClone(invoice.snapshot),path=`projects/project-1/invoices/${invoice.id}/references`;const initial=call(path);const input={requestId:crypto.randomUUID(),version:initial.version,purchaseOrder:'PO-SYNTHETIC',financeInvoiceReference:'FIN-SYNTHETIC'};const saved=call(path,'PUT',input);assert.equal(saved.purchaseOrder,input.purchaseOrder);assert.deepEqual(call(path,'PUT',input),saved);assert.deepEqual(call('projects/project-1/operations').invoices[0].snapshot,snapshot);assert.throws(()=>call(path,'PUT',{...input,requestId:crypto.randomUUID()}),/changed/);assert.throws(()=>call(`projects/project-2/invoices/${invoice.id}/references`),/not found/);assert.deepEqual((await validateBackup(d)).invoiceReferences,d.invoiceReferences);
 const bad=structuredClone(d);bad.invoiceReferences[invoice.id].projectId='project-2';await assert.rejects(validateBackup(bad),/Backup rejected/);const invalid=structuredClone(d);invalid.invoiceReferences[invoice.id].purchaseOrder='x'.repeat(121);await assert.rejects(validateBackup(invalid),/Backup rejected/);d.projects.find(p=>p.id==='project-1').status='closed';assert.throws(()=>call(path,'PUT',{...input,version:saved.version,requestId:crypto.randomUUID()}),/Reopen/);
});
