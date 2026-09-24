import {installModelExtensions,fail} from './device-model.mjs';
import {createProjectDetails,validateProjectDetails,validateProjectFeedback} from './project-details-model.js';
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(value);
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const exact=(value,keys)=>object(value)&&Object.keys(value).length===keys.length&&keys.every(k=>Object.hasOwn(value,k));
export function validateProjectDetailsBackup(data){
 for(const key of ['projectAdminDetails','projectFeedback']){if(data[key]===undefined)continue;if(!object(data[key]))fail('Backup rejected: invalid '+key+' collection.');for(const [id,value]of Object.entries(data[key])){
  const p=data.projects.find(p=>p.id===id);if(!p)fail('Backup rejected: project details reference a missing project.');
  if(key==='projectAdminDetails'){
   if(!exact(value,Object.keys(createProjectDetails())))fail('Backup rejected: invalid project administration fields.');
   try{validateProjectDetails({requestId:'backup-validation',version:p.version,...value});}catch(error){fail('Backup rejected: '+error.message);}
   if(value.coordinatorAccountId&&!uuid(value.coordinatorAccountId))fail('Backup rejected: invalid coordinator account identity.');
  }else{
   if(!Array.isArray(value))fail('Backup rejected: feedback must be a list.');const ids=new Set();
   for(const entry of value){
    if(!exact(entry,['id','recordedOn','comments','followUpRequired','at','actor',...(Object.hasOwn(entry??{},'completed')?['completed']:[])])||!uuid(entry.id)||ids.has(entry.id))fail('Backup rejected: invalid or repeated feedback identity.');ids.add(entry.id);
    try{validateProjectFeedback({requestId:'backup-validation',version:p.version,recordedOn:entry.recordedOn,comments:entry.comments,followUpRequired:entry.followUpRequired,...(Object.hasOwn(entry,'completed')?{completed:entry.completed}:{})});}catch(error){fail('Backup rejected: '+error.message);}
    if(typeof entry.at!=='string'||!Number.isFinite(Date.parse(entry.at))||new Date(entry.at).toISOString()!==entry.at)fail('Backup rejected: invalid feedback timestamp.');
    if(!exact(entry.actor,['id','displayName'])||entry.actor.id!==null&&!uuid(entry.actor.id)||typeof entry.actor.displayName!=='string'||!entry.actor.displayName.trim()||entry.actor.displayName.length>200)fail('Backup rejected: invalid feedback author.');
   }
  }
 }}
}
installModelExtensions(ctx=>{
 if(ctx.phase==='guard')return;
 const {d,parts,method,input,actorContext,find,version,bump}=ctx,[kind,id,sub]=parts;
 const accounts=actorContext?.coordinatorAccounts??[];
 if(kind==='project-admin-options'&&parts.length===1&&method==='GET')return {coordinators:accounts.filter(a=>a.active).map(a=>({id:a.id,displayName:a.displayName})).sort((a,b)=>a.displayName.localeCompare(b.displayName,'en-AU'))};
 if(kind!=='projects'||parts.length!==3||!['admin-details','feedback'].includes(sub))return;
 const p=find('projects',id),read=()=>({projectId:id,version:p.version,...structuredClone(d.projectAdminDetails?.[id]??createProjectDetails())}),feedback=()=>({projectId:id,version:p.version,items:structuredClone(d.projectFeedback?.[id]??[])});
 if(sub==='admin-details'){
  if(method==='GET')return read();if(method!=='PUT')fail('Project details action unavailable.',404);
  let details;try{details=validateProjectDetails(input);}catch(error){fail(error.message);}version(p,input.version);const before=read();
  if(details.coordinatorAccountId&&details.coordinatorAccountId!==before.coordinatorAccountId&&!accounts.some(a=>a.id===details.coordinatorAccountId&&a.active))fail('Choose an active application account as coordinator.');
  d.projectAdminDetails??={};d.projectAdminDetails[id]=details;bump(p,'Project administration updated',{before:Object.fromEntries(Object.keys(createProjectDetails()).map(k=>[k,before[k]])),after:details});return read();
 }
 if(method==='GET')return feedback();if(method!=='POST')fail('Feedback action unavailable.',404);
 let details;try{details=validateProjectFeedback(input);}catch(error){fail(error.message);}version(p,input.version);
 const entry={id:crypto.randomUUID(),...details,at:new Date().toISOString(),actor:{id:actorContext?.id??null,displayName:actorContext?.displayName??'Device demonstration operator'}};
 d.projectFeedback??={};d.projectFeedback[id]??=[];d.projectFeedback[id].unshift(entry);bump(p,'Customer feedback recorded',{feedbackId:entry.id,followUpRequired:entry.followUpRequired,...(Object.hasOwn(entry,'completed')?{completed:entry.completed}:{})});return feedback();
});
