import {node,request,field,editor,renderRetainedReferenceDraft} from './project-care.js';
import {adelaideToday} from './credential-expiry.js';
import {requiresBuildPayment} from './lifecycle-model.js';

const notRecorded='Not recorded';
const dollars=new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'});
const calendar=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Adelaide',day:'numeric',month:'short',year:'numeric'});
const recordedDate=value=>value?calendar.format(new Date(value+'T12:00:00Z')):notRecorded;

export function financeStatusRows(lifecycle,finance){
 const state=lifecycle.state,quote=state?.quotes?.at(-1),costReturn=state?.costReturns?.at(-1);
 const sent=quote&&state.history.findLast(event=>event.action==='issueQuote'&&event.data.quoteVersion===quote.version);
 const approval=quote&&state.acceptance?.quoteVersion===quote.version?state.acceptance.date:null;
 const handoff=costReturn&&state.financeHandoff?.costReturnVersion===costReturn.version?state.financeHandoff.sentOn:null;
 const beforeBuild=requiresBuildPayment(state,{programme:lifecycle.programme})?'Yes':quote?.pricing?.invoiceBeforeBuild===false?'No':notRecorded;
 return [
  ['Quote',quote?dollars.format(quote.totalCents/100):notRecorded],
  ['Quote Sent',recordedDate(sent?.data.sentOn)],
  ['Invoice Before Build',beforeBuild],
  ['Quote Approved',recordedDate(approval)],
  ['Cost Return Received',costReturn&&!costReturn.receivedOn?'Received date not recorded':recordedDate(costReturn?.receivedOn)],
  ['Cost Summary Sent to Finance',recordedDate(handoff)],
  ['Invoice Sent to Client',finance.invoiceSentOn?recordedDate(finance.invoiceSentOn)+' · Invoice '+finance.invoiceNumber:notRecorded],
  ['Technician Reimbursed',finance.reimbursedOn?recordedDate(finance.reimbursedOn)+' · Payment '+finance.paymentNumber:notRecorded],
  ['Invoice Paid in Full',typeof finance.paidInFull==='boolean'?(finance.paidInFull?'Yes':'No')+' · '+recordedDate(finance.paidStatusOn):notRecorded]
 ];
}

export function renderFinanceStatusForm(parent,projectId,saved,paymentOnly=false){
 const initial={...saved,paidInFull:saved.paidInFull==null?'':saved.paidInFull?'yes':'no'};
 return editor(parent,'finance-status/'+projectId,initial,'Invoice and payment details',(form,draft)=>{
  const today=adelaideToday();
  function pair(title,dateLabel,dateKey,otherLabel,otherKey,options){
   const group=node('fieldset');group.append(node('legend',title));form.append(group);
   const day=field(group,dateLabel,draft,dateKey,'date');day.min='1900-01-01';day.max=today;
   const other=field(group,otherLabel,draft,otherKey,'text',options);
   if(!options)other.maxLength=120;
   if(paymentOnly&&otherKey!=='paidInFull')group.disabled=true;
   function requirePair(){day.required=Boolean(other.value.trim());other.required=Boolean(day.value);}
   group.addEventListener('input',requirePair);group.addEventListener('change',requirePair);requirePair();
  }
  pair('Invoice Sent to Client','Invoice sent date','invoiceSentOn','Invoice number','invoiceNumber');
  pair('Technician Reimbursed','Reimbursement date','reimbursedOn','Payment number','paymentNumber');
  pair('Invoice Paid in Full','Payment status date','paidStatusOn','Paid in full','paidInFull',[['',notRecorded],['yes','Yes'],['no','No']]);
 },'projects/'+projectId+'/finance-status','PUT',draft=>({
  requestId:draft.requestId,version:draft.version,
  invoiceSentOn:draft.invoiceSentOn,invoiceNumber:draft.invoiceNumber.trim(),
  reimbursedOn:draft.reimbursedOn,paymentNumber:draft.paymentNumber.trim(),
  paidInFull:draft.paidInFull===''?null:draft.paidInFull==='yes',paidStatusOn:draft.paidStatusOn
 }),{saveLabel:'Save finance status',draftReview:{label:'Finance status',section:'Finance status'}});
}

export async function renderInvoiceReferences(parent,projectId,context={}){
 const [operations,project,lifecycle]=await Promise.all([context.ops??request(`projects/${projectId}/operations`),context.project??request(`projects/${projectId}`),context.lifecycle??request(`projects/${projectId}/lifecycle`)]),panel=node('section',null,'panel');panel.append(node('h2','Purchase orders & Finance references'),node('p','Reference details for each existing invoice. Saving a reference does not issue an invoice, change its original document or confirm payment.','field-help'));parent.append(panel);
 const closed=project.status==='closed'||Boolean(lifecycle.state?.closed),readOnly=closed||Boolean(lifecycle.state?.financeFinalisation);
 if(readOnly)panel.append(node('p',closed?(lifecycle.managed?'This project is closed. References are read-only. Reopen it through the guided workflow before changing financial records.':'This historical project is closed. References are read-only. Review its status in Details before changing financial records.'):'Finance is finalised. References are read-only. Review the guided workflow before changing invoice records.','field-help'));
 if(!operations.invoices.length){panel.append(node('p','References can be recorded here once an invoice has been created.'));return;}
 for(const invoice of operations.invoices){const path=`projects/${projectId}/invoices/${invoice.id}/references`,saved=await request(path),title=invoice.number??invoice.snapshot?.number??'Invoice';if(readOnly){const box=node('section',null,'panel');box.append(node('h3',title));const details=node('dl');for(const [label,value]of [['Purchase order reference',saved.purchaseOrder],['External Finance invoice reference',saved.financeInvoiceReference]])details.append(node('dt',label),node('dd',value||'Not recorded'));box.append(details);renderRetainedReferenceDraft(box,'invoice-references/'+invoice.id);panel.append(box);continue;}const entry=editor(panel,'invoice-references/'+invoice.id,saved,title,(form,d)=>{field(form,'Purchase order reference',d,'purchaseOrder').maxLength=120;field(form,'External Finance invoice reference',d,'financeInvoiceReference').maxLength=120;},path,'PUT',d=>Object.fromEntries(['requestId','version','purchaseOrder','financeInvoiceReference'].map(k=>[k,d[k]])));const save=entry.form.querySelector('button[type=submit]');save.dataset.label='Save references';if(!entry.d.pending)save.textContent='Save references';}
}
