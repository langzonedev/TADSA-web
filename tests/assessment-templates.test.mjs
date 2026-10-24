import test from 'node:test';
import assert from 'node:assert/strict';
import {seed} from '../seed.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import '../device-extensions.mjs';
test('template revisions retain bytes, prevent stale replacement and restrict writers',()=>{
 const d=normalise(seed()),admin={role:'administrator',displayName:'Synthetic administrator'},staff={role:'operator',displayName:'Synthetic operator'};
 const get=path=>dispatch(d,path,'GET',{},new URLSearchParams(),staff);
 const upload=(version,text)=>({requestId:crypto.randomUUID(),version,name:'blank.pdf',mime:'application/pdf',dataBase64:btoa('%PDF-1.4\n'+text+'\n%%EOF')});
 const post=input=>dispatch(d,'assessment-templates','POST',input,new URLSearchParams(),admin);
 assert.equal(get('assessment-templates').version,0);const first=upload(0,'first');const saved=post(first);assert.equal(saved.version,1);assert.deepEqual(post(first),saved);
 assert.throws(()=>dispatch(d,'assessment-templates','POST',upload(1,'denied'),new URLSearchParams(),staff),e=>e.status===403);
 post(upload(1,'second'));assert.throws(()=>post(upload(1,'stale')),e=>e.status===409);
 assert.equal(new TextDecoder().decode(get('assessment-templates/1/download').bytes),atob(first.dataBase64));
 assert.equal(get('assessment-templates').items.length,2);assert.equal(get('assessment-templates').items[0].dataBase64,undefined);
 assert.throws(()=>post({...upload(2,'bad'),name:'../blank.pdf'}));
 const restarted=normalise(structuredClone(d));assert.equal(dispatch(restarted,'assessment-templates').version,2);
});
