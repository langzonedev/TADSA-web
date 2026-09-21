import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
test('contacts enforce exact roles, preserve existing links on rejected replacement, and permit unlink after role changes',()=>{
 const d=normalise(seed()),run=(path,input)=>dispatch(d,path,'POST',input);
 const c=d.clients[0];
 const make=role=>{const p={id:crypto.randomUUID(),name:'Fictional '+role,roles:[role],version:1,email:'',phone:''};d.people.push(p);return p;};
 const ot=make('Occupational therapist'),allied=make('Allied-health contact');
 make('Carer');make('Referrer');
 const link=(personId,role)=>({requestId:crypto.randomUUID(),personId,role});
 const path=`clients/${c.id}/contacts`;
 run(path,link(ot.id,'Occupational therapist'));
 const before=structuredClone(d);
 for(const role of ['Carer','Referrer'])assert.throws(()=>run(path,link(ot.id,role)),/selected contact role/);
 assert.throws(()=>run(path,link(c.personId,'Carer')),/another person/);
 assert.throws(()=>run(path,link(allied.id,'Occupational therapist')),/selected contact role/);
 assert.deepEqual(d,before);
 ot.roles=['Allied-health contact'];
 assert.throws(()=>run(path,link(ot.id,'Occupational therapist')),/selected contact role/);
 run(path+'/remove',link(ot.id,'Occupational therapist'));
 assert.ok(!d.contacts.some(x=>x.clientId===c.id&&x.personId===ot.id&&x.role==='Occupational therapist'&&x.active!==false));
 for(const role of ['Carer','Referrer']){
  const p=d.people.find(p=>p.roles.includes(role));assert.ok(p);run(path,link(p.id,role));
  assert.ok(d.contacts.some(x=>x.clientId===c.id&&x.personId===p.id&&x.role===role&&x.active!==false));
 }
});
