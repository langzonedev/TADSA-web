import {validateAssessmentPack} from './assessment-pack-model.js';
import {createProjectDetails} from './project-details-model.js';
import {installModelExtensions,fail} from './device-model.mjs';
import {awaitingInvoicePayment,outstandingInvoiceMessage} from './finance-status-model.js';
import {createLifecycle,applyLifecycle,lifecycleGate,lifecycleEffectiveStage,canCancelEnquiryWithoutFinance,assertCostTeamChange} from './lifecycle-model.js';
export {createLifecycle,lifecycleGate};
const eligible=p=>p&&p.active!==false&&p.roles.includes('Technician')&&p.roles.every(r=>['Administrator','Technician','Client','Occupational therapist','Carer','Referrer','Allied-health contact','Funder','General contact'].includes(r));
function hasFinanceEvidence(data,id){
 const facts=data.financeStatuses?.[id];
 return Boolean(data.operations?.[id]?.invoices?.length||facts?.invoiceSentOn||facts?.reimbursedOn||facts?.paidStatusOn);
}
function assignedTechnicians(data,project){
 const ids=new Set(project.coordination?.technicianIds??[]);
 return data.people.filter(person=>ids.has(person.id)).map(({id,name})=>({id,name})).sort((a,b)=>a.id.localeCompare(b.id));
}
export function lifecycleProjection(d,p){const state=d.lifecycles?.[p.id]??null;const gate=lifecycleGate(state,{programme:d.projectAdminDetails?.[p.id]?.programme??''}),flags=d.operations?.[p.id]??{};if(flags.onHold||flags.clientStopped){gate.allowed=false;gate.reasons.push('This project is on hold.');}return {projectId:p.id,assignedTechnicians:assignedTechnicians(d,p),quotePolicyRequired:true,programme:d.projectAdminDetails?.[p.id]?.programme??'',effectiveStage:lifecycleEffectiveStage(state,{programme:d.projectAdminDetails?.[p.id]?.programme??''}),version:p.version,canCancelEnquiryWithoutFinance:canCancelEnquiryWithoutFinance(state,{...flags,hasInvoice:hasFinanceEvidence(d,p.id),invoiceRequired:p.invoiceRequired}),managed:!!state,legacy:!state,state:structuredClone(state),workGate:gate,labourRateCents:p.labourRateCents??5000};}
installModelExtensions(ctx=>{const {d,parts,method,find,version,bump,ops,actorContext,event}=ctx;let {input}=ctx;const [kind,id,sub]=parts;if(kind!=='projects'||!id)return;const p=find('projects',id),state=d.lifecycles?.[id]??null;
 if(ctx.phase==='guard'&&sub==='coordination'&&method==='PUT')assertCostTeamChange(state,input.technicianIds??(input.technicianId?[input.technicianId]:[]));
 if(ctx.phase==='guard'&&method==='PATCH'&&parts.length===2&&input.status==='closed'&&p.status!=='closed'&&awaitingInvoicePayment(d.financeStatuses?.[id]))fail(outstandingInvoiceMessage);
 if(ctx.phase==='guard'){if(sub==='invoices'&&method==='POST'){if(state?.closed||p.status==='closed')fail('The project is closed. Reopen it through its workflow before recording financial changes.');const receipt=parts.length===5&&parts[4]==='payments';if(state?.financeFinalisation&&!receipt)fail('Finance is finalised. Return to final Finance review through the workflow before changing invoice records. Receipts can still be recorded while the project is open.');}if(!state)return;if(method==='PATCH'&&input.status!==p.status&&(input.status==='closed'||p.status==='closed'))fail('Use the guided lifecycle to close or reopen this project.');if(sub==='operations'&&method==='PUT'){const before=ops(id);if(input.actualMinutes!==before.actualMinutes&&(state.signoff||state.financeFinalisation||state.closed||p.status==='closed'))fail('Reopen or revise the lifecycle before changing time after sign-off, finance finalisation or closure.');if(before.clientStopped&&(!input.clientStopped||!input.onHold)&&(!input.resumeClientConsent||(actorContext?.role??'administrator')!=='administrator'))fail('Resuming requires client consent and an administrator.');if(input.actualMinutes>before.actualMinutes||(input.workApproved&&!before.workApproved&&!(input.clientStopped&&!before.clientStopped))){const gate=lifecycleGate(state,{programme:d.projectAdminDetails?.[p.id]?.programme??''});if(!gate.allowed)fail(gate.reasons.join(' '));if(input.onHold||input.clientStopped)fail('Resolve the hold and client stop before continuing work.');}}return;}
 let packFiles,alreadyPrepared=false;
 if(sub==='assessment-pack'&&method==='POST'&&parts.length===3){
  validateAssessmentPack(input);
  if(!actorContext?.assessmentHashes)fail('Validate the assessment documents before saving.');
  version(p,input.version);
  const latest=d.assessmentTemplates?.at(-1);
  if(input.reportTemplateRevision>0&&latest?.revision!==input.reportTemplateRevision)fail('The office assessment template changed. Review the current form before saving the pack.',409);
  const files=d.attachments?.[id]??[],report=input.reportTemplateRevision?latest:input.reportFile;
  const current=state?.assessmentPack,instructions=input.instructions.trim();
  let requestFileId,reportFileId;
  alreadyPrepared=current?.instructions===instructions&&current.reportTemplateRevision===input.reportTemplateRevision&&
   files.some(f=>!f.removed&&f.id===current.requestFileId&&f.dataBase64===input.requestFile.dataBase64)&&
   files.some(f=>!f.removed&&f.id===current.reportFileId&&f.dataBase64===report.dataBase64);
  if(alreadyPrepared)({requestFileId,reportFileId}=current);
  else{
   if(files.filter(f=>!f.removed).length+2>20)fail('The assessment pack needs two free places in Project files. Remove obsolete files before saving.');
   const projectFile=file=>({id:crypto.randomUUID(),version:1,name:file.name.trim(),mime:file.mime,size:atob(file.dataBase64).length,createdAt:new Date().toISOString(),dataBase64:file.dataBase64});
   packFiles=[projectFile(input.requestFile),projectFile(report)];
   [requestFileId,reportFileId]=packFiles.map(file=>file.id);
  }
  const data={instructions,reportTemplateRevision:input.reportTemplateRevision,requestFileId,reportFileId};
  input={action:'assessmentPackPrepared',data};
 }else{
  if(sub!=='lifecycle')return;if(method==='GET')return lifecycleProjection(d,p);if(method!=='PUT')fail('Lifecycle action unavailable.',404);
  const keys=['requestId','version','action','data'];if(Object.keys(input).length!==4||keys.some(k=>!Object.hasOwn(input,k))||!/^[a-f\d-]{36}$/i.test(input.requestId||''))fail('Supply requestId, current version, action and data.');
  if(input.action==='assessmentPackPrepared')fail('Save the assessment documents together using the assessment pack form.');
  version(p,input.version);
 }
 if(input.action==='assessmentRequestSent'){
  const person=d.people.find(x=>x.id===input.data?.technicianId);
  if(!eligible(person)||!p.coordination.technicianIds.includes(person.id)||person.name!==input.data.technicianName)fail('Select a current technician assigned to this project and review their name.');
 }
 if(input.action==='peerReview'&&!eligible(d.people.find(x=>x.id===input.data?.reviewerId)))fail('Select an eligible existing technician for peer review.');if(input.action==='reopen'&&p.coordination.technicianIds.some(id=>!eligible(d.people.find(x=>x.id===id))))fail('Reassign or clear the inactive technician before reopening.');const flags=ops(id),actor=actorContext?{id:actorContext.id,displayName:actorContext.displayName,role:actorContext.role}:{id:null,displayName:'Synthetic demonstration operator',role:'administrator'},at=new Date().toISOString();
 const costReturnFile=input.action==='costReturn'&&input.data?.sourceFileId?d.attachments?.[id]?.find(file=>!file.removed&&file.id===input.data.sourceFileId):undefined;
 if(['close','financeFinalise'].includes(input.action)&&awaitingInvoicePayment(d.financeStatuses?.[id]))fail(outstandingInvoiceMessage);
 const next=applyLifecycle(state,input.action,input.data,{actor,costReturnFile,assignedTechnicians:assignedTechnicians(d,p),at,enforceQuotePolicy:true,labourRateCents:p.labourRateCents??5000,programme:d.projectAdminDetails?.[id]?.programme??'',projectStatus:p.status,actualMinutes:flags.actualMinutes,assessmentComplete:flags.assessmentComplete,workApproved:flags.workApproved,closeEnquiryWithoutFinance:input.action==='cancel'&&canCancelEnquiryWithoutFinance(state,{...flags,hasInvoice:hasFinanceEvidence(d,p.id),invoiceRequired:p.invoiceRequired}),onHold:flags.onHold,clientStopped:flags.clientStopped});
 if(alreadyPrepared){
  if(d.projectAdminDetails?.[id]?.assessmentInstructions!==input.data.instructions){
   d.projectAdminDetails??={};(d.projectAdminDetails[id]??=createProjectDetails()).assessmentInstructions=input.data.instructions;
   bump(p,'Assessment instructions updated',{assessmentInstructions:input.data.instructions});
  }
  return lifecycleProjection(d,p);
 }
 if(packFiles){
  d.attachments??={};(d.attachments[id]??=[]).push(...packFiles);
  for(const file of packFiles)event('projects',id,'Attachment added',{attachmentId:file.id,name:file.name,size:file.size});
  d.projectAdminDetails??={};(d.projectAdminDetails[id]??=createProjectDetails()).assessmentInstructions=input.data.instructions;
 }
 d.lifecycles??={};d.lifecycles[id]=next;const oldStatus=p.status;if(input.action==='close'||input.action==='cancel'&&next.cancellation.closedWithoutFinance)p.status='closed';if(input.action==='reopen')p.status='open';if(p.status!==oldStatus)d.statusEvents.push({id:p.id,fromStatus:oldStatus,toStatus:p.status,at});if((['quote','revise','begin','cancel','returnTo'].includes(input.action)||input.action==='peerReview'&&!input.data.approved)&&d.operations[id]){d.operations[id].workApproved=false;}bump(p,'Project lifecycle: '+input.action,{stage:{from:state?.stage??'legacy',to:next.stage},event:next.history.at(-1)});return lifecycleProjection(d,p);
});
