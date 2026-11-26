import {node,field,action,editor,notice,request} from './project-care.js';
import {adelaideToday} from './credential-expiry.js';
import {currentCostReturns,hasMemberCosts,lifecycleCostLabels,lifecycleCostTypes} from './lifecycle-model.js';
import {requestInlineConfirmation} from './inline-confirmation.js';
import {renderSavedDocumentDownloads} from './finance-pack.js';
const money=c=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(c/100);
export function usesMemberReturns(lifecycle){
 return Boolean(lifecycle?.assignedTechnicians?.length||hasMemberCosts(lifecycle?.state));
}
export async function renderMemberReturns(parent,project,current,{canPay,openFiles}){
 const state=current.state,team=current.assignedTechnicians??[],claims=currentCostReturns(state),all=state?.costReturns??[];
 const box=node('section',null,'panel');box.append(node('h2','Technician cost returns'));parent.append(box);
 if(!state){box.append(node('p','Start the project workflow to record cost returns.'));return;}
 const open=!state.closed&&!state.financeFinalisation;
 const eligible=Boolean(state.work||state.cancellation||current.workGate?.allowed);
 const frozen=Boolean(state.activeCostSummaryVersion||state.financeHandoff);
 const unpaid=claims.filter(c=>c.technicianId&&!state.returnPayments?.[c.version]&&!state.returnNoPayments?.[c.version]);
 const memberClaims=id=>claims.filter(c=>c.technicianId===id);
 const pending=team.filter(m=>!memberClaims(m.id).length&&!state.memberNoCosts?.[m.id]);
 box.append(node('p',team.length+' assigned · '+pending.length+' awaiting a return or no-cost confirmation'));
 const list=node('ul');
 for(const member of team){
  const returns=memberClaims(member.id),nil=state.memberNoCosts?.[member.id];
  const status=returns.length?returns.length+' '+(returns.length===1?'return':'returns')+' received':nil?'No costs confirmed '+nil.confirmedOn:'Awaiting return';
  list.append(node('li',member.name+' · '+status));
 }
 box.append(list);
 for(const claim of claims){
  const paid=state.returnPayments?.[claim.version],except=state.returnNoPayments?.[claim.version];
  const status=paid?'Reimbursed '+paid.paidOn+' · '+paid.paymentNumber:except?'No payment authorised · '+except.reference+' · '+except.reason:claim.technicianId?'Awaiting reimbursement':'Earlier project-level return';
  box.append(node('p','Return '+claim.version+' · '+(claim.technicianName||'Earlier project costs')+' · '+money(claim.totalCents)+' · '+status));
 }
 if(openFiles)box.append(action('Open Project files',openFiles));
 const summaries=state.costSummaries??[];
 if(summaries.length||all.length)renderSavedDocumentDownloads(box,project,{cover:false,returns:all,summaries,memberCosts:true});
 if(!open)return;
 if(!eligible){box.append(node('p','Record costs once work is authorised, or when a cancelled project needs reconciliation.'));return;}
 const path='projects/'+project.id+'/lifecycle',today=adelaideToday();
 const date=(f,d,label,key)=>{const input=field(f,label,d,key,'date');input.max=today;input.required=true;};
 const form=(key,label,initial,draw,data,actionName=key)=>{
  const section=node('details',null,'care-details');section.append(node('summary',label));box.append(section);
  editor(section,'member-cost/'+project.id+'/'+key,{...initial,version:current.version},null,draw,path,'PUT',
   d=>({requestId:d.requestId,version:d.version,action:actionName,data:data(d)}),
   {saveLabel:label,draftReview:{label,section:'Cost returns'}});
 };
 const people=team.map(m=>[m.id,m.name]),returnChoices=items=>items.map(c=>[String(c.version),'Return '+c.version+' · '+c.technicianName+' · '+money(c.totalCents)]);
 if(!frozen&&people.length){
  const files=request('projects/'+project.id+'/attachments');
  form('costReturn','Save technician cost return',{technicianId:people.length===1?people[0][0]:'',receivedOn:'',sourceFileId:'',notes:'',lines:[],supersedesVersion:''},(f,d)=>{
   const member=field(f,'Technician submitting this return',d,'technicianId','text',[['','Choose technician'],...people]);member.required=true;
   const correction=field(f,'Return to correct (optional)',d,'supersedesVersion','text',[['','New cost return']]);
   const drawCorrections=()=>{const previous=d.supersedesVersion;correction.replaceChildren(new Option('New cost return',''));for(const [id,label] of returnChoices(unpaid.filter(c=>c.technicianId===d.technicianId)))correction.add(new Option(label,id));correction.value=previous;if(correction.selectedIndex<0)correction.selectedIndex=0;d.supersedesVersion=correction.value;};
   member.addEventListener('change',drawCorrections);drawCorrections();
   drawCostEntry(f,d,{files,member:true});
  },d=>({...costReturnInput(d),technicianId:d.technicianId,...(d.supersedesVersion?{supersedesVersion:Number(d.supersedesVersion)}:{})}));
  if(pending.length)form('memberNoCosts','Confirm no costs',{technicianId:pending.length===1?pending[0].id:'',confirmedOn:today},(f,d)=>{
   field(f,'Technician with no costs',d,'technicianId','text',[['','Choose technician'],...pending.map(m=>[m.id,m.name])]).required=true;
   date(f,d,'No costs confirmed on','confirmedOn');
  },d=>({technicianId:d.technicianId,confirmedOn:d.confirmedOn}));
 }
 if(canPay&&unpaid.length){
  const choose=(f,d)=>{field(f,'Technician return',d,'returnVersion','text',[['','Choose return'],...returnChoices(unpaid)]).required=true;};
  const initial={returnVersion:unpaid.length===1?String(unpaid[0].version):''};
  form('returnPayment','Record reimbursement',{...initial,paidOn:today,paymentNumber:''},(f,d)=>{
   choose(f,d);date(f,d,'Reimbursement date','paidOn');field(f,'Payment reference',d,'paymentNumber').required=true;
  },d=>({returnVersion:Number(d.returnVersion),paidOn:d.paidOn,paymentNumber:d.paymentNumber}));
  form('returnNoPayment','Record authorised no-payment decision',{...initial,confirmedOn:today,reference:'',reason:''},(f,d)=>{
   choose(f,d);date(f,d,'Decision date','confirmedOn');field(f,'Authorisation reference',d,'reference').required=true;
   field(f,'Reason for no payment',d,'reason','textarea').required=true;
  },d=>({returnVersion:Number(d.returnVersion),confirmedOn:d.confirmedOn,reference:d.reference,reason:d.reason}));
 }
 if(frozen){
  box.append(node('p',state.activeCostSummaryVersion?'Confirmed cost summary · revision '+state.activeCostSummaryVersion:'Earlier Finance handoff recorded'));
  form('reviseCostSummary','Reopen cost summary',{reason:''},(f,d)=>field(f,'Reason for reopening the summary',d,'reason','textarea').required=true,d=>({reason:d.reason}));
 }else if(!pending.length&&(people.length||claims.length)){
  form('finaliseCostSummary','All returns received',{confirmedOn:today,confirmed:false},(f,d)=>{
   date(f,d,'All returns confirmed on','confirmedOn');
   field(f,'I have checked that no further technician returns are expected',d,'confirmed','checkbox').required=true;
   f.append(node('p','This saves the printable project summary. Record the handoff separately when it goes to Finance.','field-help'));
  },d=>({confirmedOn:d.confirmedOn}));
 }else if(pending.length)box.append(node('p','Before confirming all returns, follow up with '+pending.map(m=>m.name).join(', ')+'.'));
}
export function costDraftTotal(lines){
 let total=0;
 for(const line of lines){
  if(!/^\d+(\.\d{1,3})?$/.test(line.quantity)||!/^\d+(\.\d{1,2})?$/.test(line.rate))return null;
  const quantity=Math.round(Number(line.quantity)*1000),rate=Math.round(Number(line.rate)*100);
  if(!Number.isSafeInteger(quantity)||quantity<1||quantity>1000000||!Number.isSafeInteger(rate)||rate<0||rate>100000000)return null;
  total+=Math.round(quantity*rate/1000);
 }
 return total<=1000000000?total:null;
}
export function quoteCostDraft(quote){return (quote?.lines??[]).map(line=>({type:line.type,description:line.description,quantity:String(line.quantityMilli/1000),rate:String(line.unitPriceCents/100)}));}
export function drawCostEntry(f,d,{latest,quote,files,member=false}){
   const date=field(f,'Cost return received on',d,'receivedOn','date');date.max=adelaideToday();date.required=member;
   const source=field(f,'Original technician return in Project files',d,'sourceFileId','text',[['','Choose an uploaded file (optional)']]);
   const selected=d.sourceFileId;
   if(selected){source.add(new Option(selected===latest?.sourceFileId?latest.sourceFileName:'Previously selected project file',selected));source.value=selected;}
   source.disabled=true;
   files.then(files=>{
    for(const file of files.items){
     if(file.id===selected)source.selectedOptions[0].text=file.name;
     else source.add(new Option(file.name,file.id));
    }
    source.disabled=Boolean(d.pending);
   }).catch(()=>{source.after(notice('Project files could not be loaded. Reopen this project to select an original return.',true));});
   f.append(node('p','Record actual labour, materials, travel, consumables and other costs claimed by the technician. A difference from the quote does not authorise an extra charge.','field-help'));const rows=node('div',null,'lifecycle-quote-lines'),total=node('p',null,'quote-total');total.setAttribute('aria-live','polite');const updateTotal=()=>{const value=costDraftTotal(d.lines);total.textContent=value===null?'Enter valid quantities and rates to see the total.':'Actual cost total: '+money(value);};f.append(rows);f.addEventListener('input',updateTotal);const draw=()=>{rows.replaceChildren();d.lines.forEach((l,i)=>{const row=node('fieldset',null,'quote-line');row.append(node('legend','Actual cost '+(i+1)));field(row,'Cost '+(i+1)+' type',l,'type','text',lifecycleCostTypes.map(type=>[type,lifecycleCostLabels[type]]));field(row,'Cost '+(i+1)+' description',l,'description').required=true;field(row,'Cost '+(i+1)+' quantity',l,'quantity').inputMode='decimal';field(row,'Cost '+(i+1)+' rate ($ AUD)',l,'rate').inputMode='decimal';row.append(action('Remove cost '+(i+1),()=>{d.lines.splice(i,1);draw();f.dispatchEvent(new Event('input',{bubbles:true}));}));rows.append(row);});updateTotal();};draw();
   const review=field(f,'I checked the copied estimate against the actual work and costs',d,'actualCostsReviewed','checkbox');review.closest('label').hidden=!d.copiedQuote;review.required=d.copiedQuote;
   if(!member&&!latest&&quote){const copy=action('Use quote as starting point',async()=>{if(d.lines.length&&!await requestInlineConfirmation(copy,{title:'Replace this unsaved cost draft?',message:'The current unsaved cost lines will be replaced with the quote estimate. Saved cost returns and the quote remain unchanged.',confirmLabel:'Replace draft with quote'}))return;d.lines=quoteCostDraft(quote);d.copiedQuote=true;d.actualCostsReviewed=false;review.checked=false;review.required=true;review.closest('label').hidden=false;draw();f.dispatchEvent(new Event('input',{bubbles:true}));});f.append(copy,node('p','Copying creates an editable draft only. Check quantities, time and rates against actual work before saving; estimates are never recorded as actual costs automatically.','field-help'));}
   f.append(action('Add actual cost',()=>{if(d.lines.length>=20)return;d.lines.push({type:'materials',description:'',quantity:'1',rate:''});draw();f.dispatchEvent(new Event('input',{bubbles:true}));}),total);field(f,member?'Cost return notes':'Cost return notes / no-cost explanation',d,'notes','textarea');
}
export function costReturnInput(d){if(d.copiedQuote&&!d.actualCostsReviewed)throw Error('Check the copied estimate against actual costs before saving.');return {lines:d.lines.map(l=>{if(!/^\d+(\.\d{1,3})?$/.test(l.quantity)||!/^\d+(\.\d{1,2})?$/.test(l.rate))throw Error('Enter valid actual-cost quantities and rates.');return {type:l.type,description:l.description,quantityMilli:Math.round(Number(l.quantity)*1000),unitPriceCents:Math.round(Number(l.rate)*100)};}),notes:d.notes,...(d.receivedOn?{receivedOn:d.receivedOn}:{}),...(d.sourceFileId?{sourceFileId:d.sourceFileId}:{})};}
