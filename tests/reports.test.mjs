import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
import {validateBackup} from '../device-backups.mjs';
const query=(d,input)=>dispatch(d,'reports/query','POST',input);

test('organisation contact email is explicit, versioned, validated and survives backup',async()=>{
 const d=normalise(seed({enriched:false})),o=d.organisations[0];
 const updated=dispatch(d,`organisations/${o.id}/category`,'PUT',{requestId:crypto.randomUUID(),version:o.version,category:'Government',email:'contact@example.invalid'});
 assert.equal(updated.email,'contact@example.invalid');
 dispatch(d,`organisations/${o.id}/category`,'PUT',{requestId:crypto.randomUUID(),version:o.version,category:'Government'});
 assert.equal(o.email,'contact@example.invalid');
 const result=query(d,{dataset:'organisations',filters:[{field:'category',operator:'eq',value:'Government'}]});
 assert.equal(result.rows.length,1);assert.equal(result.rows[0].email,o.email);
 assert.equal((await validateBackup(d)).organisations.find(x=>x.id===o.id).email,o.email);
 assert.throws(()=>dispatch(d,`organisations/${o.id}/category`,'PUT',{requestId:crypto.randomUUID(),version:o.version,category:'Government',email:'bad address'}),e=>e.status===422);
 const invalid=structuredClone(d);invalid.organisations[0].email='bad address';await assert.rejects(validateBackup(invalid),e=>e.status===422);
});

test('role filters use exact active roles and expose only selected safe fields',()=>{
 const d=normalise(seed({enriched:false}));d.people[0].roles=['Occupational therapist'];d.people[1].roles=['Occupational therapist'];d.people[1].active=false;
 d.people[0].bankDetails='never';d.people[0].credentials={clearance:'never'};
 const before=JSON.stringify(d),result=query(d,{dataset:'people',filters:[{field:'roles',operator:'eq',value:'Occupational therapist'}],columns:['name','email']});
 assert.deepEqual(result.rows.map(r=>r.id),[d.people[0].id]);assert.deepEqual(Object.keys(result.rows[0]),['id','name','email']);assert.equal(JSON.stringify(d),before);
 assert.throws(()=>query(d,{dataset:'people',columns:['credentials']}),e=>e.status===422);
});

test('project hours and amounts are distinct; missing values do not become zero',()=>{
 const d=normalise(seed({enriched:false})),[a,b,c]=d.projects;
 d.operations[a.id]={actualMinutes:1199,remainingMinutes:300,invoices:[{snapshot:{totalCents:7000}},{snapshot:{totalCents:13000}}]};
 d.operations[b.id]={actualMinutes:1200,remainingMinutes:0,invoices:[]};delete d.operations[c.id];
 d.lifecycles[a.id]={quotes:[{totalCents:40000},{totalCents:19999}]};
 const under=query(d,{dataset:'projects',filters:[{field:'hoursWorked',operator:'lt',value:20}],columns:['hoursWorked','hoursRemaining','quoteTotal','invoicedTotal']});
 const row=under.rows.find(x=>x.id===a.id);assert.equal(row.hoursWorked,1199/60);assert.equal(row.hoursRemaining,5);assert.equal(row.quoteTotal,199.99);assert.equal(row.invoicedTotal,200);
 assert.equal(under.rows.some(x=>x.id===b.id||x.id===c.id),false);
 const cheap=query(d,{dataset:'projects',filters:[{field:'quoteTotal',operator:'lt',value:200}]});assert.deepEqual(cheap.rows.map(r=>r.id),[a.id]);
 const missing=query(d,{dataset:'projects',filters:[{field:'invoicedTotal',operator:'is_empty'}],columns:['invoicedTotal']});assert.ok(missing.rows.some(x=>x.id===b.id));
});

test('reports are bounded, ordered, literal and reject arbitrary query language',()=>{
 const d=normalise(seed({enriched:false})),full=query(d,{dataset:'people',sort:{field:'name',direction:'desc'},limit:100});
 const first=query(d,{dataset:'people',sort:{field:'name',direction:'desc'},limit:2}),next=query(d,{dataset:'people',sort:{field:'name',direction:'desc'},limit:2,offset:2});
 assert.equal(first.hasMore,true);assert.deepEqual([...first.rows,...next.rows],full.rows.slice(0,4));
 assert.equal(query(d,{dataset:'people',filters:[{field:'name',operator:'contains',value:'%'}]}).rows.length,0);
 for(const invalid of [{dataset:'people',sql:'DROP TABLE people'},{dataset:'people',limit:101},{dataset:'people',offset:10001},{dataset:'people',filters:Array(9).fill({field:'name',operator:'eq',value:'x'})}])assert.throws(()=>query(d,invalid),e=>e.status===422);
 d.people=Array.from({length:10001},(_,i)=>({id:String(i),name:'Synthetic',roles:[]}));assert.throws(()=>query(d,{dataset:'people'}),/10,000/);
});


test('monthly report caps details but retains complete counts and amounts',()=>{
 const d=normalise(seed({enriched:false})),base=d.projects[0];
 d.projects=Array.from({length:105},(_,i)=>({...structuredClone(base),id:'project-'+i,reference:'P-'+i,status:'open'}));
 d.statusEvents=d.projects.map(p=>({id:p.id,at:'2026-09-10T00:00:00Z',fromStatus:null,toStatus:'open'}));
 for(const p of d.projects){d.operations[p.id]={actualMinutes:0,remainingMinutes:60,invoices:[{id:'invoice-'+p.id,number:'INV-'+p.id,at:'2026-09-10T00:00:00Z',snapshot:{invoiceDate:'2026-09-10',totalCents:1000}}]};d.workPlans[p.id]={payments:[{invoiceId:'invoice-'+p.id,receivedOn:'2026-09-11',amountCents:500}]};}
 const result=dispatch(d,'reports','GET',{},new URLSearchParams({month:'2026-09'}));
 assert.equal(result.currentOpen.count,105);assert.equal(result.currentOpen.items.length,100);assert.equal(result.created.count,105);assert.equal(result.created.items.length,100);
 assert.equal(result.billing.invoicedCents,105000);assert.equal(result.billing.receivedCents,52500);assert.equal(result.billing.invoices.length,100);assert.equal(result.billing.payments.length,100);assert.equal(result.detailLimit,100);
 d.statusEvents=Array(100001).fill(d.statusEvents[0]);assert.throws(()=>dispatch(d,'reports','GET',{},new URLSearchParams({month:'2026-09'})),/too many activity/);
});
