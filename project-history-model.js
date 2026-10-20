// Shared boundary for the small staff-facing historical projection. The full
// Access archive remains private and must never be accepted through this model.
const invalid=()=>{throw new Error('INVALID_PROJECT_HISTORICAL_CONTEXT');};
const exact=(value,keys)=>value!==null&&typeof value==='object'&&!Array.isArray(value)&&[Object.prototype,null].includes(Object.getPrototypeOf(value))&&Object.getOwnPropertySymbols(value).length===0&&Object.keys(value).length===keys.length&&keys.every(key=>Object.hasOwn(value,key))&&Object.values(Object.getOwnPropertyDescriptors(value)).every(d=>Object.hasOwn(d,'value')&&d.enumerable);
const text=(value,max)=>typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value);
const nullableText=(value,max)=>value===null||text(value,max);
const scalar=(value,max)=>value===null||text(value,max)||typeof value==='number'&&Number.isFinite(value);
export function validateProjectHistoricalContext(value){
 const fields=['format','sourceStatus','reviewDate','coordinator','costEstimate','costEstimateDate','work','historicalOnly','approvalsVerified','paymentsVerified'];
 if(value&&Object.hasOwn(value,'pendingParties'))fields.push('pendingParties');
 if(!exact(value,fields))invalid();
 if(value.format!=='tadsa-project-historical-context-v1'||value.historicalOnly!==true||value.approvalsVerified!==false||value.paymentsVerified!==false)invalid();
 if(!nullableText(value.sourceStatus,120)||!nullableText(value.reviewDate,120)||!nullableText(value.coordinator,200)||!scalar(value.costEstimate,120)||!nullableText(value.costEstimateDate,120))invalid();
 if(!Array.isArray(value.work)||value.work.length>10000||Object.keys(value.work).length!==value.work.length||Object.getOwnPropertySymbols(value.work).length||!Object.entries(Object.getOwnPropertyDescriptors(value.work)).every(([key,d])=>Object.hasOwn(d,'value')&&(d.enumerable||key==='length')))invalid();
 const sourceKeys=new Set();
 for(let i=0;i<value.work.length;i++){
  if(!Object.hasOwn(value.work,i))invalid();const work=value.work[i];
  if(!exact(work,['sourceKey','reference','type','status','hours','linkBasis','linkConfidence']))invalid();
  if(typeof work.sourceKey!=='string'||!/^s_[a-f0-9]{64}$/.test(work.sourceKey)||sourceKeys.has(work.sourceKey))invalid();sourceKeys.add(work.sourceKey);
  if(!scalar(work.reference,120)||!scalar(work.type,120)||!scalar(work.status,120)||!(work.hours===null||typeof work.hours==='number'&&Number.isFinite(work.hours))||!text(work.linkBasis,120)||!text(work.linkConfidence,120))invalid();
 }
 if(Object.hasOwn(value,'pendingParties')){
  const parties=value.pendingParties;
  if(!Array.isArray(parties)||parties.length>3||Object.keys(parties).length!==parties.length||Object.getOwnPropertySymbols(parties).length||!Object.entries(Object.getOwnPropertyDescriptors(parties)).every(([key,d])=>Object.hasOwn(d,'value')&&(d.enumerable||key==='length')))invalid();
  const roles=new Set();
  for(let i=0;i<parties.length;i++){
   if(!Object.hasOwn(parties,i))invalid();const party=parties[i];
   if(!exact(party,['role','label','reason','linkBasis'])||!['Contact','Referrer','Funder'].includes(party.role)||roles.has(party.role)||!nullableText(party.label,241)||!['person-or-organisation-unconfirmed','organisation-conversion-required'].includes(party.reason)||party.linkBasis!=='exact-source-reference')invalid();
   roles.add(party.role);
  }
 }
 return value;
}
export function cloneProjectHistoricalContext(value){return structuredClone(validateProjectHistoricalContext(value));}
