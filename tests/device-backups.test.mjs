import test from 'node:test';
import assert from 'node:assert/strict';
import {handleDeviceBackups} from '../device-backups.mjs';
import {normalise} from '../device-model.mjs';
import {seed} from '../seed.mjs';
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
const bytes=x=>JSON.stringify([...x.entries()]);
const protectedState=db=>bytes(new Map([...db.values].filter(([key])=>key==='data'||key==='generation'||key==='accounts'||key.startsWith('backup:')||key.startsWith('backup-meta:'))));
async function prepare(){const db=new Database(),backup=await call(db,'backups',req()),preview=await call(db,'backups/'+backup.id+'/restore-preview',req());return {db,backup,preview,path:'backups/restore/'+preview.previewId+'/discard'};}
test('device discard deletes only exact preview; same UUID replay survives deletion and changed action/input reuse fails',async()=>{
 const {db,preview,path}=await prepare(),other='backup-preview:'+crypto.randomUUID();db.values.set(other,{marker:'Other preview'});const before=protectedState(db),input=req(),result=await call(db,path,input);assert.deepEqual(result,{discarded:true});assert.equal(db.values.has('backup-preview:'+preview.previewId),false);assert.deepEqual(db.values.get(other),{marker:'Other preview'});assert.equal(protectedState(db),before);assert.deepEqual(db.commits.at(-1).map(([action,key])=>[action,key]),[['delete','backup-preview:'+preview.previewId],['put','backup-receipt:'+input.requestId]]);assert.deepEqual(await call(db,path,input),result);await assert.rejects(call(db,'backups',input),e=>e.status===409);await assert.rejects(call(db,path,{...input,confirm:true}),e=>e.status===422);assert.equal(protectedState(db),before);
});
test('device discard malformed/unknown paths and fields deny without writes; stale legitimate preview can be discarded',async()=>{
 const {db,preview,path}=await prepare();db.values.set('generation',7);db.values.get('data').people[0].name='Synthetic later change';const before=protectedState(db);for(const [route,input]of [[path,{requestId:'invalid'}],[path,{...req(),actor:'Spoof'}],['backups/restore/not-a-uuid/discard',req()],['backups/restore/'+crypto.randomUUID()+'/discard',req()],[path+'/extra',req()]]){const commits=db.commits.length;await assert.rejects(call(db,route,input),e=>[404,422].includes(e.status));assert.equal(db.commits.length,commits);assert.equal(protectedState(db),before);}assert.deepEqual(await call(db,path,req()),{discarded:true});assert.equal(protectedState(db),before);assert.equal(db.values.has('backup-preview:'+preview.previewId),false);
});
test('device committed activation records consumed marker; discard409 preserves active data/generation/backups and successful activation replay',async()=>{
 const {db,preview,path}=await prepare(),input={...req(),confirm:true},result=await call(db,'backups/restore/'+preview.previewId+'/activate',input);assert.equal(result.restored,true);assert.equal(db.values.get('generation'),1);assert.equal(db.values.get('backup-preview:'+preview.previewId).consumed,true);assert.ok(db.values.has('backup:'+result.rollbackBackupId));const before=bytes(db.values),commits=db.commits.length;await assert.rejects(call(db,path,req()),e=>e.status===409);assert.equal(bytes(db.values),before);assert.equal(db.commits.length,commits);assert.deepEqual(await call(db,'backups/restore/'+preview.previewId+'/activate',input),result);assert.equal(bytes(db.values),before);await assert.rejects(call(db,'backups/restore/'+preview.previewId+'/activate',{...req(),confirm:true}),e=>e.status===409);
});
test('device discard before activation commit prevents activation of removed snapshot with no active writes',async()=>{
 const {db,preview,path}=await prepare(),before=protectedState(db),original=globalThis.crypto,descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');let release,reached;const gate=new Promise(r=>release=r),ready=new Promise(r=>reached=r);let count=0;
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:{randomUUID:()=>original.randomUUID(),subtle:{digest:async(...args)=>{if(++count===2){reached();await gate;}return original.subtle.digest(...args);}}}});
 try{const activation=call(db,'backups/restore/'+preview.previewId+'/activate',{...req(),confirm:true});await ready;assert.deepEqual(await call(db,path,req()),{discarded:true});release();await assert.rejects(activation,e=>e.status===404);assert.equal(protectedState(db),before);assert.equal(db.values.get('generation'),0);assert.equal(db.values.has('backup-preview:'+preview.previewId),false);}finally{release();Object.defineProperty(globalThis,'crypto',descriptor);}
});
test('historical unmarked activated-copy ambiguity permits copy-only cleanup, never changes active workspace or existing receipts',async()=>{
 const {db,preview,path}=await prepare(),key='backup-preview:'+preview.previewId,copy=db.values.get(key);db.values.set('data',structuredClone(copy.candidate));db.values.set('generation',copy.generation+1);db.values.set('backup-receipt:historical',{result:{restored:true},identity:'Synthetic unknown provenance'});const before=protectedState(db),receipt=structuredClone(db.values.get('backup-receipt:historical'));assert.equal(Object.hasOwn(copy,'consumed'),false);await call(db,path,req());assert.equal(db.values.has(key),false);assert.equal(protectedState(db),before);assert.deepEqual(db.values.get('backup-receipt:historical'),receipt);
});
test('concurrent same UUID discard requests converge to one exact deletion/receipt and do not affect another preview',async()=>{
 const {db,preview,path}=await prepare(),input=req(),before=protectedState(db),commits=db.commits.length;const results=await Promise.all([call(db,path,input),call(db,path,input)]);assert.deepEqual(results,[{discarded:true},{discarded:true}]);assert.equal(db.values.has('backup-preview:'+preview.previewId),false);assert.equal(protectedState(db),before);assert.equal(db.commits.slice(commits).flat().filter(([action,key])=>action==='delete'&&key==='backup-preview:'+preview.previewId).length,1);await assert.rejects(call(db,path,req()),e=>e.status===404);
});
