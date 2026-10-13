import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {deviceDirectoryQuery} from '../device-directory-queries.mjs';
import {dispatch} from '../device-model.mjs';
const actor={id:'synthetic-account',displayName:'Synthetic coordinator',role:'coordinator'};
function fixture(){
 const d={people:[],clients:[],organisations:[],projects:[],relationships:[],profileDetails:{}};
 for(let i=1;i<=1037;i++){
  const id='person-'+i,p={id,name:i===231?'ZZ Synthetic Offpage 231':i<4?'Same name':'Synthetic '+String(i).padStart(4,'0'),email:'synthetic'+i+'@example.test',phone:'000'+i,roles:i%5===0?['Client','Occupational therapist']:['Client'],privateSecret:'NEVER_RETURN',technician:i===2?{skills:['Assessment']}:undefined};
  if(i===2)p.roles=['Technician','Administrator'];if(i===3){p.roles=['Technician','Invalid role'];p.technician={skills:['Assessment']};}
  d.people.push(p);d.clients.push({id:'client-'+i,personId:id,details:{residentialAddress:'Synthetic address '+i,residentialSuburb:'Synthetic suburb',residentialState:'SA',residentialPostcode:'5000',workAddress:'Synthetic work '+i,contactNeeds:'NEVER_RETURN'}});
  d.organisations.push({id:'org-'+i,name:p.name,roles:['Funder','Referrer'],directoryStatus:i%11===0?'inactive':i%7===0?'review':'current',email:'organisation'+i+'@example.test',description:'Synthetic description',category:'Synthetic category',privateSecret:'NEVER_RETURN'});
  d.profileDetails[id]={contact:{directoryStatus:i%11===0?'inactive':i%7===0?'review':'current'}};
 }
 d.projects=[{id:'project-1',clientId:'client-231'},{id:'project-2',clientId:'client-1'}];d.relationships=[{projectId:'project-1',type:'person',id:'person-231'},{projectId:'project-2',type:'person',id:'person-231'},{projectId:'project-2',type:'person',id:'person-231'},{projectId:'project-1',type:'organisation',id:'org-231'},{projectId:'project-2',type:'organisation',id:'org-231',active:false}];return d;
}
const call=(d,path,query={},who=actor,method='GET')=>deviceDirectoryQuery(d,path,method,new URLSearchParams(query),who);
test('selection pages reach every identity, retain dual roles and inactive direct identities without hydrating private graphs',()=>{
 const d=fixture(),before=JSON.stringify(d);for(const kind of ['clients','people','organisations']){let after='',ids=[];do{const page=call(d,'selections',{kind,status:'all',limit:'100',after});assert.ok(page.items.length<=100);ids.push(...page.items.map(r=>r.id));after=page.nextAfter;}while(after);assert.equal(ids.length,1037);assert.equal(new Set(ids).size,1037);}
 const dual=call(d,'selections/people/person-5').item;assert.deepEqual(dual.roles,['Client','Occupational therapist']);assert.equal(dual.clientId,'client-5');assert.equal(call(d,'selections/people/person-11').item.directoryStatus,'inactive');
 assert.deepEqual(call(d,'selections',{kind:'people',role:'Technician',status:'all'}).items.map(r=>r.id),['person-2']);
 const missingProfile=structuredClone(d);delete missingProfile.people[1].technician;assert.equal(call(missingProfile,'selections',{kind:'people',role:'Technician',status:'all'}).items.length,0);
 const address=call(d,'selections',{kind:'clients',q:'Synthetic address 231',status:'all'}).items;assert.equal(address[0].id,'client-231');assert.equal(call(d,'selections',{kind:'people',q:'Synthetic address 231',status:'all'}).items.length,0);
 assert.ok(!JSON.stringify(call(d,'selections',{kind:'clients',status:'all'})).includes('NEVER_RETURN'));assert.equal(JSON.stringify(d),before);
});
test('register complete ascending/descending cursor traversal, canonical client fields, global facets and distinct project counts',async()=>{
 const d=fixture(),before=JSON.stringify(d);for(const kind of ['people','organisations'])for(const direction of ['asc','desc']){let after='',ids=[];do{const page=await call(d,'registers',{kind,status:'all',direction,limit:'100',after});assert.equal(page.total,1037);assert.equal(page.statuses.all,1037);ids.push(...page.items.map(r=>r.id));after=page.nextAfter;}while(after);assert.equal(ids.length,1037);assert.equal(new Set(ids).size,1037);const names=d[kind].map(p=>({id:p.id,key:p.name.toLowerCase()})).sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:a.id<b.id?-1:1);assert.deepEqual(ids,(direction==='asc'?names:names.reverse()).map(p=>p.id));}
 const page=await call(d,'registers',{kind:'people',q:'Synthetic address 231',status:'all'}),row=page.items[0];assert.equal(page.total,1);assert.equal(row.id,'person-231');assert.equal(row.clientId,'client-231');assert.equal(row.reference,'CL-231');assert.equal(row.projectCount,2);assert.equal(row.address,'Synthetic address 231');assert.equal((await call(d,'registers',{kind:'people',q:'Synthetic work 231',status:'all'})).items[0].id,row.id);
 assert.equal((await call(d,'registers',{kind:'organisations',q:'org-231',status:'all'})).items[0].projectCount,1);
 const scoped=await call(d,'registers',{kind:'people',role:'Occupational therapist',status:'review'});assert.equal(scoped.roles.find(r=>r.role==='Client').total,1035);assert.equal(scoped.statuses.all,1037);assert.equal(scoped.total,d.people.filter(p=>p.roles.includes('Occupational therapist')&&d.profileDetails[p.id].contact.directoryStatus==='review').length);
 assert.ok(!JSON.stringify(page).includes('NEVER_RETURN'));assert.equal(JSON.stringify(d),before);
});
test('cursor bytes use browser SHA-256 compatible with main scope; mismatched pages and invalid query controls reject',async()=>{
 const d=fixture(),params={kind:'people',status:'all',limit:'2'},page=await call(d,'registers',params),cursor=JSON.parse(Buffer.from(page.nextAfter,'base64url').toString('utf8'));
 assert.equal(cursor.scope,createHash('sha256').update(JSON.stringify({kind:'people',q:'',status:'all',role:'',direction:'asc'})).digest('hex'));
 for(const change of [{kind:'organisations'},{q:'x'},{status:'active'},{role:'Client'},{direction:'desc'}])await assert.rejects(async()=>call(d,'registers',{...params,...change,after:page.nextAfter}),e=>e.status===422);
 for(const query of ['kind=people&kind=people','kind=people&limit=0','kind=people&limit=101','kind=people&limit=01','kind=people&unknown=x','kind=people&q=%00','kind=people&role=%0A','kind=people&after=not-a-cursor'])await assert.rejects(async()=>deviceDirectoryQuery(d,'registers','GET',new URLSearchParams(query),actor),e=>e.status===422);
 for(const query of ['kind=people&kind=people','kind=people&limit=101','kind=people&after=client-1','kind=people&q=x%00'])assert.throws(()=>deviceDirectoryQuery(d,'selections','GET',new URLSearchParams(query),actor),e=>e.status===422);
 assert.equal(call(d,'selections',{kind:'people',q:'%_'}).items.length,0);assert.equal((await call(d,'registers',{kind:'people',q:'%_'})).total,0);
 assert.throws(()=>call(d,'selections/people/person-missing'),e=>e.status===422);assert.throws(()=>call(d,'selections/people/person-999999'),e=>e.status===404);
});
test('dispatch wires named coordinator/admin reads, rejects unsigned and unknown roles and leaves records unchanged',async()=>{
 const d=fixture(),before=JSON.stringify(d);for(const role of ['administrator','coordinator']){const who={...actor,role};assert.equal(dispatch(d,'selections','GET',{},new URLSearchParams({kind:'clients',q:'ZZ Synthetic Offpage 231',status:'all'}),who).items[0].id,'client-231');assert.equal((await dispatch(d,'registers','GET',{},new URLSearchParams({kind:'people',q:'ZZ Synthetic Offpage 231',status:'all'}),who)).items[0].id,'person-231');}
 assert.throws(()=>dispatch(d,'selections','GET',{},new URLSearchParams({kind:'people'})),e=>e.status===401);assert.throws(()=>call(d,'selections',{kind:'people'},{...actor,role:'technician'}),e=>e.status===403);assert.throws(()=>call(d,'registers',{kind:'people'},actor,'POST'),e=>e.status===405);assert.equal(JSON.stringify(d),before);
});
test('inherited object property names are invalid directory kinds on list, register and direct identity dispatch',async()=>{
 const d=fixture(),before=JSON.stringify(d);
 for(const kind of ['toString','constructor','__proto__','hasOwnProperty','valueOf']){
  assert.throws(()=>dispatch(d,'selections','GET',{},new URLSearchParams({kind}),actor),e=>e.status===422);
  assert.throws(()=>dispatch(d,`selections/${kind}/org-1`,'GET',{},new URLSearchParams(),actor),e=>e.status===422);
  await assert.rejects(async()=>dispatch(d,'registers','GET',{},new URLSearchParams({kind}),actor),e=>e.status===422);
 }
 assert.equal(JSON.stringify(d),before);
});
