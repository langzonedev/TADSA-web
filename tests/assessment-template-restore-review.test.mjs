import test from 'node:test';
import assert from 'node:assert/strict';
import {handleDeviceBackups} from '../device-backups.mjs';
import {normalise,dispatch} from '../device-model.mjs';
import {seed} from '../seed.mjs';
import '../device-extensions.mjs';
// Serialized transactional storage double, not a real installed IndexedDB/browser.
class Database{
 constructor(){this.values=new Map([['data',normalise(seed({enriched:false}))],['generation',0],['accounts',{marker:'Synthetic accounts retained'}]]);this.queue=[];this.running=false;this.commits=[];}
 transaction(store,mode='readonly'){
  assert.equal(store,'workspace');const db=this,ops=[],changes=[],tx={started:false,aborted:false,error:null,abort(){this.aborted=true;},objectStore(){return {
   get(key){return read(()=>structuredClone(tx.work.get(key)));},getAllKeys(){return read(()=>[...tx.work.keys()]);},
   put(value,key){assert.equal(mode,'readwrite');tx.work.set(key,structuredClone(value));changes.push(['put',key]);},delete(key){assert.equal(mode,'readwrite');tx.work.delete(key);changes.push(['delete',key]);}
  };}};
  function read(value){const r={},run=()=>{if(tx.aborted)return;r.result=value();r.onsuccess?.();};if(tx.started)queueMicrotask(run);else ops.push(run);return r;}
  this.queue.push(()=>{tx.started=true;tx.work=structuredClone(db.values);for(const op of ops)queueMicrotask(op);setImmediate(()=>{if(tx.aborted)tx.onabort?.();else{if(mode==='readwrite'){db.values=tx.work;db.commits.push(changes);}tx.oncomplete?.();}db.running=false;db.next();});});this.next();return tx;
 }
 next(){if(!this.running&&this.queue.length){this.running=true;setImmediate(this.queue.shift());}}
}
const call=(db,path,input,method='POST')=>handleDeviceBackups(db,path,method,input);
const req=()=>({requestId:crypto.randomUUID()});

test('review: exported device backup restores both assessment template revision bytes and retains accounts',async()=>{
 const db=new Database(),actor={role:'administrator',displayName:'Synthetic reviewer'},data=db.values.get('data');
 const payloads=[0,1].map(version=>({requestId:crypto.randomUUID(),version,name:'synthetic-blank-'+(version+1)+'.pdf',mime:'application/pdf',dataBase64:btoa('%PDF-1.4\nSynthetic revision '+(version+1)+'\n%%EOF')}));
 for(const payload of payloads)dispatch(data,'assessment-templates','POST',payload,new URLSearchParams(),actor);
 const original=structuredClone(data.assessmentTemplates),accounts=structuredClone(db.values.get('accounts'));
 const backup=await call(db,'backups',req()),file=await call(db,'backups/'+backup.id+'/download',undefined,'GET'),envelope=JSON.parse(new TextDecoder().decode(file.bytes));
 assert.deepEqual(envelope.data.assessmentTemplates,original);
 dispatch(db.values.get('data'),'assessment-templates','POST',{...payloads[0],requestId:crypto.randomUUID(),version:2,name:'later.pdf'},new URLSearchParams(),actor);
 const imported=await call(db,'backups/import',{...req(),name:'synthetic-template-backup.json',data:envelope}),preview=await call(db,'backups/'+imported.id+'/restore-preview',req());
 const activated=await call(db,'backups/restore/'+preview.previewId+'/activate',{...req(),confirm:true});assert.equal(activated.restored,true);assert.deepEqual(db.values.get('accounts'),accounts);
 const restored=normalise(structuredClone(db.values.get('data')));assert.deepEqual(restored.assessmentTemplates,original);
 for(const payload of payloads){const result=dispatch(restored,'assessment-templates/'+(payload.version+1)+'/download','GET',{},new URLSearchParams(),actor);assert.equal(new TextDecoder().decode(result.bytes),atob(payload.dataBase64));}
 const before=JSON.stringify([...db.values]);const malformed=structuredClone(envelope.data);malformed.assessmentTemplates[0].dataBase64=btoa('not a PDF');await assert.rejects(call(db,'backups/import',{...req(),name:'invalid-template.json',data:malformed}),e=>e.status===422);assert.equal(JSON.stringify([...db.values]),before);
});
