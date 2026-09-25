import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise} from '../device-model.mjs';
import {validateBackup} from '../device-backups.mjs';
import {buildManagementReport} from '../management-report.js';
test('rich fresh device workspace survives strict backup validation and has reproducible two-month reports',async()=>{
  const data=normalise(seed({asOf:'2026-09-25'})),restored=await validateBackup(structuredClone(data));assert.deepEqual(restored,data);
  const reportData={projects:data.projects.map(p=>({...p,programme:data.projectAdminDetails[p.id]?.programme,actualMinutes:data.operations[p.id]?.actualMinutes,history:data.lifecycles[p.id]?.history??[]})),events:data.statusEvents.map(e=>({...e,projectId:e.id})),invoices:Object.entries(data.operations).flatMap(([projectId,o])=>o.invoices.map(i=>({...i,projectId}))),feedback:Object.entries(data.projectFeedback).flatMap(([projectId,rows])=>rows.map(f=>({...f,projectId}))),technicians:data.people.filter(p=>p.roles.includes('Technician'))};
  for(const month of ['2026-08','2026-09']){const metrics=Object.fromEntries(buildManagementReport(reportData,month).groups.flatMap(g=>g.metrics).map(m=>[m.key,m.value]));assert.equal(metrics.closed,1);assert.equal(metrics.closedHours,2);assert.equal(metrics.closedInvoices,12500);assert.equal(metrics.closedServiceCharges,10000);assert.equal(metrics.fwBikesDelivered,1);assert.equal(metrics.feedbackCompleted,1);}
  for(const c of data.clients){assert.ok(c.details.residentialAddress);assert.ok(c.details.workAddress);if(c.details.preferredContact==='representative')assert.ok(data.contacts.some(link=>link.clientId===c.id&&link.personId===c.details.representativePersonId));}
  assert.deepEqual(normalise(structuredClone(data)),data,'normalisation does not replace saved fixture dates or records');
});
