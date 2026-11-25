import {node,action,field,notice,request,downloadProjectFile} from './project-care.js';
import {residentialAddressText} from './client-address.js';
import {lifecycleGate,lifecycleCostLabels} from './lifecycle-model.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=c=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format((c??0)/100);
export function storedZip(files){
 const enc=new TextEncoder(),parts=[],directory=[];let offset=0;
 const crc=bytes=>{let c=0xffffffff;for(const b of bytes){c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
 for(const file of files){const name=enc.encode(file.name),data=typeof file.data==='string'?enc.encode(file.data):file.data,checksum=crc(data),h=new Uint8Array(30+name.length),v=new DataView(h.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);h.set(name,30);parts.push(h,data);const d=new Uint8Array(46+name.length),dv=new DataView(d.buffer);dv.setUint32(0,0x02014b50,true);dv.setUint16(4,20,true);dv.setUint16(6,20,true);dv.setUint16(8,0x800,true);dv.setUint32(16,checksum,true);dv.setUint32(20,data.length,true);dv.setUint32(24,data.length,true);dv.setUint16(28,name.length,true);dv.setUint32(42,offset,true);d.set(name,46);directory.push(d);offset+=h.length+data.length;}
 const size=directory.reduce((n,b)=>n+b.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,files.length,true);v.setUint16(10,files.length,true);v.setUint32(12,size,true);v.setUint32(16,offset,true);return new Blob([...parts,...directory,end],{type:'application/zip'});
}
function download(blob,name){const url=URL.createObjectURL(blob),a=node('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
const safeName=s=>String(s).replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,100);
export async function readFinanceSnapshot(projectId,read=request){
 const snapshot=await Promise.all([read('projects/'+projectId),read(`projects/${projectId}/lifecycle`),read(`projects/${projectId}/operations`),read(`projects/${projectId}/attachments`),read(`projects/${projectId}/work-plan`),read('business-settings')]);
 const reviewerId=snapshot[1].state?.peerReview?.reviewerId,people={items:[]};
 if(reviewerId){const selected=await read('selections/people/'+encodeURIComponent(reviewerId));if(selected.item)people.items.push({id:selected.item.id,name:selected.item.name});}
 return [...snapshot,people];
}
export function assertStableFinanceSnapshot(before,after){
 const [project,lifecycle,operations,,plan]=before;
 if([project,operations,plan].filter(Boolean).some(record=>record.version!==lifecycle.version)||JSON.stringify(before)!==JSON.stringify(after))throw Error('Project or supporting records changed while preparing the document. Please download it again.');
}
export function workflowNotice(current){
 const s=current.state;
 if(!s)return '<p>Legacy project: no guided workflow decisions recorded.</p>';
 const position=s.closed?'Project closed — no further work authorised':s.cancellation?'Cancelled — no work authorised':s.work?.status==='complete'?'Work completed — follow the remaining sign-off and Finance steps':current.workGate?.allowed?'Recorded prerequisites complete — follow the current project stage':'Prerequisites incomplete — work must not commence';
 return record('Workflow stage',(current.effectiveStage??s.stage).replaceAll('_',' '))+record('Work position',position)+(s.cancellation?record('CANCELLED — do not commence work',s.cancellation.reason):'')+(s.revisionRequested?record('QUOTE REVISION REQUIRED — previous approvals do not authorise work',s.revisionRequested.reason):'')+(s.closed?record('CLOSED',s.closed.reason):'');
}
let documentLogo;
function printableDocumentBrand(business={},logo=''){
 const image=/^data:image\/png;base64,[a-z0-9+/]+={0,2}$/i.test(logo)
  ?`<img src="${logo}" width="468" height="90" alt="TADSA">`:'';
 const issuer=[business.issuerName,business.address,business.contact].filter(value=>typeof value==='string'&&value.trim());
 return image+'<strong>TADSA · Technology for Ageing &amp; Disability SA</strong>'+
  (issuer.length?`<div class="issuer">${issuer.map(value=>`<div>${escape(value)}</div>`).join('')}</div>`:'');
}
function readDocumentLogo(){
 documentLogo??=fetch(new URL('./assets/tadsa-logo.png',import.meta.url))
  .then(async response=>{
   if(!response.ok)throw Error('Logo unavailable');
   const bytes=new Uint8Array(await response.arrayBuffer());
   let binary='';
   for(const byte of bytes)binary+=String.fromCharCode(byte);
   return 'data:image/png;base64,'+btoa(binary);
  }).catch(()=>{documentLogo=null;return '';});
 return documentLogo;
}
function htmlDocument(title,body,brand){
 const letterhead=printableDocumentBrand(brand?.business,brand?.logo);
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>
 body{font:16px/1.5 Arial,sans-serif;color:#17213a;max-width:850px;margin:32px auto;padding:0 24px;overflow-wrap:anywhere}
 header,.acceptance-letterhead{border-bottom:3px solid #748f47;padding-bottom:12px}header img,.acceptance-letterhead img{display:block;width:min(100%,290px);height:auto;margin-bottom:8px;filter:brightness(0)}
 .issuer{font-size:14px;white-space:pre-line}.muted{color:#536078}h1{color:#2f3e84;font-size:28px;margin:12px 0 0}h2{font-size:20px;margin-top:24px}
 table{border-collapse:collapse;width:100%}td,th{padding:8px;text-align:left;border-bottom:1px solid #aaa;vertical-align:top}
 .request-context{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,240px),1fr));gap:8px 20px;margin:0}
 .request-context>div{border-left:2px solid #a9b0bf;padding:0 8px}.request-context dt{font-weight:700}.request-context dd{margin:0;white-space:pre-line}
 pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.customer-acceptance{border-top:1px solid #aaa;margin-top:28px;padding-top:18px}
 @media print{
  @page{size:A4;margin:16mm}
  body{margin:0;padding:0;max-width:none;font-size:11pt;line-height:1.35}
  header,.acceptance-letterhead{padding-bottom:6px}header img,.acceptance-letterhead img{width:215px;margin-bottom:4px}
  h1,h2,h3,h4{break-after:avoid}h1{font-size:21pt;margin-top:6px}h2{font-size:15pt;margin:9px 0 4px}h3{margin:7px 0 3px}p{margin:4px 0}
  td,th{padding:4px}.request-context{gap:4px 12px}tr,.request-context>div,.quote-approval{break-inside:avoid}
  body:has(.customer-acceptance){font-size:10.5pt;line-height:1.3}
  body:has(.customer-acceptance) p{margin:3px 0}
  body:has(.customer-acceptance) .request-context{grid-template-columns:repeat(3,minmax(0,1fr))}
  .customer-acceptance{break-before:page;margin:0;padding:0;border:0}
 }
 </style></head><body><header>${letterhead}<h1>${escape(title)}</h1></header>${body}</body></html>`;
}
const record=(label,value)=>`<p><strong>${escape(label)}:</strong> ${escape(value||'Not recorded')}</p>`;
export function decisionSummary(state,people=[]){
 const s=state??{},who=x=>x?.actor?.displayName||'Operator not recorded';
 const assessment=s.assessmentDecision?{...s.assessmentDecision,actor:s.assessmentDecision.actor??s.history?.findLast(e=>e.action==='assessmentDecision')?.actor}:null;
 const section=(title,value,fields)=>`<h3>${escape(title)}</h3>${value?fields.map(([label,text])=>record(label,text)).join('')+record('Recorded by',who(value)):'<p>Not recorded.</p>'}`;
 return (s.quotes?.at(-1)?.pricing?section('Product manager quote approval',s.quotes.at(-1),[['Approved by',s.quotes.at(-1).pricing.approvedBy],['Approval evidence',s.quotes.at(-1).pricing.approvalReference],['Approval date',s.quotes.at(-1).pricing.approvedOn],['Service charge included',money(s.quotes.at(-1).pricing.serviceChargeCents)],['Service charge adjustment reason',s.quotes.at(-1).pricing.adjustmentReason],['Invoice before build',s.quotes.at(-1).pricing.invoiceBeforeBuild?'Required — payment must be confirmed before purchasing/building':'Final invoice after completion'],['Funding doubts',s.quotes.at(-1).pricing.fundingUncertain?'Yes':'No'],['Decision reason',s.quotes.at(-1).pricing.invoiceReason]]):'')+section('Assessment',assessment,[['Decision',s.assessmentDecision?.required?'Assessment required':'Assessment not required'],['Reason',s.assessmentDecision?.reason],['Findings',s.assessment?.notes],['Findings recorded by',s.assessment?who(s.history?.findLast(e=>e.action==='assessmentComplete')):'Not recorded']])+
 (s.schema===2&&!s.peerReview?'':section('Technical peer review',s.peerReview,[['Reviewer',people.find(p=>p.id===s.peerReview?.reviewerId)?.name||'Recorded technical member'],['Quote revision',s.peerReview?.quoteVersion],['Decision',s.peerReview?.approved?'Viable':'Revision needed'],['Notes',s.peerReview?.notes]]))+
 (s.schema===2?section('Assessment review',s.assessmentReview,[['Decision',s.assessmentReview?.approved?'Approved for quotation':'Changes required'],['Engineering quality reviewed',s.assessmentReview?.qualityReviewed?'Yes':'Not confirmed'],['Safety reviewed',s.assessmentReview?.safetyReviewed?'Yes':'Not confirmed'],['Costs reviewed',s.assessmentReview?.costsReviewed?'Yes':'Not confirmed'],['Date',s.assessmentReview?.reviewedOn],['Evidence reference',s.assessmentReview?.reference],['Notes',s.assessmentReview?.notes]]):'')+
 section('Client quote acceptance',s.acceptance,[['Accepted by',s.acceptance?.acceptedBy],['Quote revision',s.acceptance?.quoteVersion],['Date',s.acceptance?.date],['Evidence reference',s.acceptance?.reference]])+
 (s.schema===2&&!s.financeClearance?'':section('Finance clearance',s.financeClearance,[['Decision',s.financeClearance?.status==='paid'?'External Finance confirms payment':'External Finance authorises work without prepayment'],['Quote revision',s.financeClearance?.quoteVersion],['Date',s.financeClearance?.confirmedOn],['Evidence reference',s.financeClearance?.reference],['Notes',s.financeClearance?.notes]]))+
 (s.schema===2?section('Work Request authorisation',s.workRequest,[['Quote revision',s.workRequest?.quoteVersion],['Request sent date',s.workRequest?.sentOn],['Evidence reference',s.workRequest?.reference],['Work and access instructions',s.workRequest?.instructions]]):'')+
 (s.schema===2?section('Cost summary sent to Finance',s.financeHandoff,[['Cost return revision',s.financeHandoff?.costReturnVersion],['Sent date',s.financeHandoff?.sentOn],['Evidence reference',s.financeHandoff?.reference],['Notes',s.financeHandoff?.notes]]):'')+
 section('Customer sign-off',s.signoff,[['Accepted by',s.signoff?.acceptedBy],['Date',s.signoff?.signedOn],['Evidence reference',s.signoff?.reference],['Handover notes',s.signoff?.notes]])+
 section('Finance finalisation',s.financeFinalisation,[['Date',s.financeFinalisation?.confirmedOn],['Evidence reference',s.financeFinalisation?.reference],['Notes',s.financeFinalisation?.notes],...(s.schema===2?[['Client payment resolved',s.financeFinalisation?.clientPaymentResolved?'Confirmed by Finance':'Not confirmed'],['Technician reimbursement resolved',s.financeFinalisation?.technicianPaymentResolved?'Confirmed by Finance':'Not confirmed']]:[])]);
}
export function invoiceSummary(invoices=[],payments=[]){
 if(!invoices.length)return '<p>No draft invoices recorded in this application.</p>';
 return invoices.map(i=>{const s=i.snapshot??i,receipts=payments.filter(p=>p.invoiceId===i.id),paid=receipts.reduce((n,p)=>n+p.amountCents,0);return `<h3>${escape(i.number)}</h3>`+record('Recipient',s.payerName)+record('Billing address',s.billingAddress)+record('Invoice date',s.invoiceDate)+quoteTable(s,'Draft invoice total',false)+record('GST',s.business?.gstConfirmed?money(s.gstCents??0):'Tax treatment unconfirmed')+record('Recorded receipts',money(paid))+record('Outstanding',money(s.totalCents-paid))+(receipts.length?'<h4>Receipt evidence</h4>'+receipts.map(p=>record(p.receivedOn,`${money(p.amountCents)} · ${p.reference}`)).join(''):'<p>No receipts recorded.</p>');}).join('');
}
function quoteTable(quote,totalLabel='Estimate total',showTaxNote=true){return quote?`<table><thead><tr><th>Item</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${quote.lines.map(l=>`<tr><td>${escape(l.description)}${l.type?' ('+escape(lifecycleCostLabels[l.type]??l.type)+')':''}</td><td>${escape((l.quantityMilli??1000)/1000)}</td><td>${escape(money(l.unitPriceCents??l.amountCents))}</td><td>${escape(money(l.amountCents??Math.round(l.quantityMilli*l.unitPriceCents/1000)))}</td></tr>`).join('')}</tbody></table>${record(totalLabel,money(quote.totalCents))}${quote.pricing?record('Service charge included in the total',money(quote.pricing.serviceChargeCents))+record('Invoice before build',quote.pricing.invoiceBeforeBuild?'Payment required before purchasing or building':'Final invoice after completion'):''}${showTaxNote?'<p class="muted">AUD. Tax treatment must be confirmed before issuing a final financial document. Synthetic demonstration only.</p>':''}`:'<p>No quote recorded.</p>';}
export function assertCurrentClientQuote(current){
 if(current.state?.cancellation||current.state?.revisionRequested)throw Error('This quote is cancelled or awaiting revision. Save a current quote before preparing it for the client.');
 const quote=current.state?.quotes?.at(-1);if(!quote)throw Error('Save a quote revision first.');if(current.quotePolicyRequired&&!quote.pricing)throw Error('Prepare a reviewed quote revision with recorded product manager approval before sending or downloading it for the client. Historical quotes remain in the project record.');return quote;
}
export function assertStableDocumentSnapshot(before,after){
 const [project,current,,details]=before;
 if(project.version!==current.version||(details&&details.version!==project.version)||JSON.stringify(before)!==JSON.stringify(after))throw Error('Project or supporting records changed while preparing the document. Please prepare it again.');
}
export function clientQuoteDraft(project,current,recipient){
 const quote=assertCurrentClientQuote(current),email=String(recipient??'').trim();
 if(!/^[^\s@<>,;?&#]+@[^\s@<>,;?&#]+\.[^\s@<>,;?&#]+$/.test(email))throw Error('Enter one valid client email address first.');
 const subject=`TADSA ${project.reference} — quote revision ${quote.version}`;
 const body=`Please review quote revision ${quote.version} for project ${project.reference}: ${project.title}.\n\nEstimated total: ${money(quote.totalCents)} AUD.\n\n[Download the current client quote, review it, print/save as PDF if required, and attach that revision manually before sending.]\n\nPlease identify quote revision ${quote.version} in your response. Changes to scope or cost require a revised quote.\n\nThis draft does not record sending or acceptance in the application.`;
 return {subject,body,href:`mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`};
}
export function quoteValidUntil(at){
 const date=typeof at==='string'?at.slice(0,10):'';if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return '';
 const parsed=new Date(date+'T00:00:00.000Z');if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==date)return '';
 parsed.setUTCDate(parsed.getUTCDate()+30);return parsed.toISOString().slice(0,10);
}
export function clientQuoteDocument(project,current,client,business={},plan={},payer=null,logo=''){
 const q=assertCurrentClientQuote(current),person=client?.person??{},details=client?.details??{},self=project.coordination?.fundingStatus==='self',funder=self?person:payer??{},funderAddress=self?residentialAddressText(details):residentialAddressText(funder)||funder.address||'';
 const blank=(label,value)=>value?record(label,value):`<p><strong>${escape(label)}:</strong> __________________________________________________</p>`;
 return htmlDocument('Quote — '+project.reference+' / revision '+q.version,
  '<p><strong>DRAFT · Review before sharing. Prepared using the supplied TADSA quotation form; issuer and tax settings require confirmation.</strong></p>'+record('Issuer',business.issuerName)+record('Australian Business Number (ABN)',business.abn)+record('Issuer address',business.address)+record('Issuer contact',business.contact)+record('Project number',project.reference)+record('Quote date',q.at?.slice(0,10))+record('Valid until',quoteValidUntil(q.at))+'<p>This quotation is valid for up to 30 days from the quote date. Acceptance and available funding must be confirmed before work proceeds.</p>'+record('Client',person.name||project.clientName)+record('Client address',residentialAddressText(details))+(plan.ndisApplicable&&plan.ndisNumber?record('National Disability Insurance Scheme (NDIS) number',plan.ndisNumber):'')+record('Description of work',project.summary)+quoteTable(q)+record('Quote notes',q.notes)+'<h2>Funder details</h2>'+blank('Funder name',funder.name)+blank('Funder address',funderAddress)+blank('Funder contact email',funder.email)+blank('Funder contact phone',funder.phone)+'<h2>Authorisation to proceed</h2><p>I accept this quotation. I acknowledge that any modifications made by TADSA to my equipment may affect the product warranty.</p><section class="quote-approval"><h2>Quote approval</h2><p>Client or authorised representative name: __________________________________________</p><p>Signature: __________________________________ Date: _____________________________</p><p>Approval refers to quote revision '+escape(q.version)+'. Changes to scope or cost require a revised quote and renewed approval.</p></section><h2>Invoice instructions</h2>'+blank('Make the invoice out to',funder.name)+blank('Send the invoice to (email address)',funder.email)+blank('Purchase order or agreement / service booking number','')+'<p>Return the completed acceptance to TADSA using the issuer contact details above. Completing this form does not itself record approval, issue an invoice or confirm payment in the application.</p>',{business,logo});
}
function savedCostReturn(current,revision){
 const returns=current.state?.costReturns??[];
 if(!returns.length)throw Error('Record an actual cost return first.');
 const saved=revision==null?returns.at(-1):returns.find(item=>item.version===revision);
 if(!saved)throw Error('This cost return revision is unavailable. Reopen the project and try again.');
 return saved;
}
function costReturnDetails(project,saved){
 return record('Project',project.title)+record('Client',project.clientName)+record('Cost return revision',saved.version)+
  record('Cost return received on',saved.receivedOn)+record('Original technician return',saved.sourceFileName)+
  record('Recorded at',saved.at)+record('Recorded by',saved.actor?.displayName);
}
export function costReturnDocument(project,current,revision){
 const saved=savedCostReturn(current,revision);
 const quote=current.state.quotes?.at(-1);
 return htmlDocument('Actual cost return — '+project.reference+' / revision '+saved.version,
  '<p><strong>CRM copy of the technician’s return · Fictional development data · Saved cost evidence, not an invoice</strong></p>'+costReturnDetails(project,saved)+quoteTable(saved,'Actual cost total',false)+record('Cost return notes',saved.notes)+'<h2>Current project context</h2>'+workflowNotice(current)+record('Latest saved quote revision',quote?.version)+record('Latest saved quote total',quote?money(quote.totalCents):'Not recorded')+record('Difference from latest saved quote',quote?money(saved.totalCents-quote.totalCents):'Not recorded — no quote saved'));
}
export function costSummaryDocument(project,current,revision){
 const saved=savedCostReturn(current,revision);
 const totals=new Map();
 for(const line of saved.lines)totals.set(line.type,(totals.get(line.type)??0)+line.amountCents);
 const rows=[...totals].map(([type,cents])=>'<tr><td>'+escape(lifecycleCostLabels[type]??type)+'</td><td>'+money(cents)+'</td></tr>').join('');
 return htmlDocument('Cost summary for Finance — '+project.reference+' / revision '+saved.version,
  '<p>Fictional development data · Actual costs in AUD</p>'+costReturnDetails(project,saved)+
  '<h2>Cost summary</h2><table><thead><tr><th>Cost category</th><th>Amount</th></tr></thead><tbody>'+rows+
  '</tbody><tfoot><tr><th>Total actual cost</th><td>'+money(saved.totalCents)+'</td></tr></tfoot></table>'+
  '<h2>Supporting cost return</h2>'+quoteTable(saved,'Actual cost total',false)+record('Cost return notes',saved.notes));
}
function printCostDocument(html){
 const page=new DOMParser().parseFromString(html,'text/html');
 const sheet=node('article',null,'finance-hard-copy');
 sheet.append(...page.body.childNodes);
 document.querySelector('.finance-hard-copy')?.remove();
 document.body.append(sheet);
 try{window.print();}finally{sheet.remove();}
}
export function projectCoverDocument(project,current,client,details={}){
 const intake=client.details??{},person=client.person??{},residential=residentialAddressText(intake),representative=client.contacts?.find(c=>c.personId===intake.representativePersonId),preferred=intake.preferredContact==='representative'?representative:person;
 return htmlDocument('Enquiry / project cover sheet — '+project.reference,
 '<p><strong>DRAFT · Fictional development data · Internal saved-record summary</strong></p><p>This cover sheet is not approval or authorisation to commence work.</p>'+record('Project',project.title)+record('Project number',project.reference)+record('Client',person.name||project.clientName)+record('Client email',person.email)+record('Client phone',person.phone)+record('Residential address',residential)+record('TADSA work address',intake.sameAsResidential?residential:intake.workAddress)+record('Preferred contact',intake.preferredContact==='representative'?(representative?.name||'Representative no longer linked — review required'):'Client')+record('Preferred contact email',preferred?.email)+record('Preferred contact phone',preferred?.phone)+record('Contact needs',intake.contactNeeds)+record('Work requested',project.summary)+record('Project status',project.status)+record('Target date',project.dueDate)+record('Programme',details.programme==='FW'?'Freedom Wheels (FW)':details.programme)+record('Enquiry source',details.enquirySource)+record('Next follow-up',details.followUpOn)+record('Technical team',(project.relationships??[]).filter(r=>r.role==='Technician').map(r=>r.name).join(', '))+workflowNotice(current));
}
function freedomWheelsRequestDetails(details){if(details.programme!=='FW')return '';const specs=details.freedomWheels??{};const labels={cycleType:'Bike / trike',bikeMake:'Make',bikeSize:'Size',colour:'Colour',pedalClips:'Pedal clips',linkedPedals:'Linked pedals',rearSteering:'Rear steering',handlebars:'Handlebars',backSupport:'Back support',seat:'Seat',bikeSerialNumber:'Serial number',bikeSource:'Source',notes:'Fitting / build notes'};const rows=Object.entries(labels).filter(([key])=>specs[key]).map(([key,label])=>record(label,specs[key])).join('');return rows?'<h2>Freedom Wheels fitting details</h2>'+rows+'<p>Confirm the assessment and approved specification before ordering or building. These recorded details do not replace safety review or authorisation.</p>':'';}
function requestContext(project,client,details){
 const person=client.person??{},intake=client.details??{},address=residentialAddressText(intake),representative=client.contacts?.find(c=>c.personId===intake.representativePersonId),preferred=intake.preferredContact==='representative'?representative:person;
 const facts=entries=>'<dl class="request-context">'+entries.map(([label,value])=>`<div><dt>${escape(label)}</dt><dd>${escape(value||'Not recorded')}</dd></div>`).join('')+'</dl>';
 const team=(project.relationships??[]).filter(relation=>relation.role==='Technician').map(relation=>relation.name).join(', ');
 return '<h2>Project and visit</h2>'+facts([
  ['Project number',project.reference],['Project',project.title],['Assigned technical team',team],
  ['TADSA work address',intake.sameAsResidential?address:intake.workAddress],['Next follow-up',details.followUpOn]
 ])+'<h2>Client and contacts</h2>'+facts([
  ['Client',person.name||project.clientName],['Client phone',person.phone],['Client email',person.email],
  ['Preferred contact',intake.preferredContact==='representative'?(representative?.name||'Representative no longer linked — review required'):'Client'],
  ['Preferred contact email',preferred?.email],['Preferred contact phone',preferred?.phone],['Contact needs',intake.contactNeeds]
 ])+'<h2>Requested scope</h2><p>'+escape(project.summary||'Not recorded')+'</p>'+freedomWheelsRequestDetails(details)+
  '<p>Assignment does not confirm that a technical member has accepted this request. Review the recipient, scope and contact arrangements before sharing.</p>';
}
export function assessmentRequestDocument(project,current,client,details={},brand){
 const s=current.state;
 if(current.workGate?.reasons?.some(reason=>/hold|stop/i.test(reason)))throw Error('Resolve the project hold or client stop before preparing an assessment request.');
 if(project.status==='closed'||!s||s.closed||s.cancellation||s.revisionRequested||s.stage!=='assessment'||s.assessmentDecision?.required!==true||s.assessment)throw Error('An assessment request is available only while a required assessment is awaiting findings.');
 return htmlDocument('Assessment Request — '+project.reference,'<p><strong>DRAFT · Fictional development data · Review before sharing</strong></p>'+requestContext(project,client,details)+record('Assessment decision reason',s.assessmentDecision.reason)+record('Instructions to the technical member',details.assessmentInstructions||'Confirm the visit arrangements with the office and client. Return the assessment findings to the office; do not purchase or build from this assessment request.')+'<h2>Report to return</h2><p>Send the office a separate assessment report covering feasibility, safety and engineering needs, with estimated hours and costs for parts, travel, consumables and other items. Keep that report in Project files and record the findings before preparing a quote.</p><p>This request is for assessment only. It does not authorise fabrication, purchasing, building or other technical work. Confirm client consent and arrangements before any visit; recheck the live project for a later hold or client stop. Preparing this document does not send it or record acceptance.</p>',brand);
}
function workRequestApproval(state,prepared){
 const accepted=state.acceptance;
 const review=state.schema===2?state.assessmentReview:state.peerReview;
 const savedRequest=state.workRequest;
 const evidence=(...values)=>values.filter(Boolean).join(' · ');
 const reviewSummary=state.schema===2
  ?evidence('Engineering quality, safety and costs reviewed',review?.reviewedOn,review?.reference,review?.notes)
  :evidence('Technical peer review recorded',review?.notes);
 const status=prepared
  ?'Prepared for sending. Wait for the office to send and authorise this specific request before starting.'
  :savedRequest
   ?evidence('Work Request sent',savedRequest.sentOn,savedRequest.reference)
   :'Saved approvals allow work at the current stage.';
 return '<h2>Authorisation</h2>'+
  record('Client quote acceptance',evidence(accepted.acceptedBy,accepted.date,accepted.reference))+
  record('Safety review',reviewSummary)+
  (state.financeClearance?record('Finance clearance',evidence(state.financeClearance.status==='paid'?'Payment confirmed':'Authorised exception',state.financeClearance.reference)):'')+
  record('Work Request status',status);
}
export function technicalTaskRequestDocument(project,current,client,details={},brand){
 const s=current.state;
 const requestDraft=s?.schema===2&&s.stage==='work_request'&&!!s.quotes?.at(-1)&&!!s.acceptance&&s.assessmentReview?.approved&&s.acceptance.quoteVersion===s.quotes.at(-1).version&&(!s.work||s.work.status==='paused')&&Array.isArray(current.workGate?.reasons)&&!current.workGate.reasons.some(r=>/hold|stop/i.test(r))&&lifecycleGate(s,{programme:details.programme??''}).reasons.every(r=>r==='Record the project request sent to authorise the current work.');
 if(project.status==='closed'||!s||s.closed||s.cancellation||s.revisionRequested||(!requestDraft&&(s.stage!=='work'||(s.work&&!['in_progress'].includes(s.work.status))||current.workGate?.allowed!==true||!lifecycleGate(s,{programme:details.programme??''}).allowed)))throw Error(s?.schema===2?'A work request requires the current quote, assessment review and client acceptance at the Work Request or authorised work stage. Resolve any hold or revision first.':'A work request requires the current quote, technical review, client acceptance and Finance clearance, with work permitted at the current stage. Resolve any hold or revision first.');
 const quote=s.quotes.at(-1);if(Object.hasOwn(details,'draftWorkInstructions')&&(typeof details.draftWorkInstructions!=='string'||details.draftWorkInstructions.trim().length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(details.draftWorkInstructions)))throw Error('Enter valid work instructions within 2,000 characters.');
 return htmlDocument('Work Request — '+project.reference+' / quote revision '+quote.version,'<p><strong>DRAFT · Fictional development data · Review before sharing</strong></p>'+requestContext(project,client,details)+workRequestApproval(s,requestDraft)+record(requestDraft?'Instructions after authorisation':'Work Request instructions',s.workRequest?.instructions??details.draftWorkInstructions??'Add work authorisation and access instructions before sending, then record the sent request in the workflow.')+record('Approved quote revision',quote.version)+quoteTable(quote)+record('Quote scope / notes',quote.notes)+'<p>Recheck the live project before work begins. Changes to scope or cost require renewed approval. Return actual costs, receipts and the attached customer acceptance page. Preparing this document does not send it, record technical-member acceptance or start work.</p><section class="customer-acceptance"><div class="acceptance-letterhead">'+printableDocumentBrand(brand?.business,brand?.logo)+'</div><h2>Customer acceptance — completed work</h2>'+record('Project reference',project.reference)+record('Client',project.clientName)+record('Quote revision',quote.version)+'<p>Work completed / changes agreed: __________________________________________________</p><p>____________________________________________________________________________</p><p>Client or authorised representative name: __________________________________________</p><p>Signature: __________________________________ Date: _____________________________</p><p>Technical member name: ________________________________________________________</p><p>Photographs of completed work: obtain the client’s permission before taking or sharing photographs. Record any restrictions with the project documents.</p><p>Permission for project evidence photographs: Yes / No &nbsp; Reference or restrictions: ______________________</p><p>Optional permission for promotional publication: Yes / No / Not requested. Publication restrictions: ______________________</p><p>Promotional permission is separate from acceptance of the completed work and is not required to complete the project.</p><p>Return this acceptance record with the cost return, purchase receipts and permitted photographs. Record the evidence in the project workflow; this blank form does not constitute sign-off.</p></section>',brand);
}
export function renderWorkflowRequestDownloads(parent,project,{assessment=true,task=true,draftInstructions=null}={}){
 if(!assessment&&!task)return;
 const buttons=node('div',null,'actions report-toolbar'),feedback=node('div');parent.append(buttons,feedback);
 const prepare=async(kind)=>{try{
  const read=async()=>{const p=await request('projects/'+project.id);return Promise.all([Promise.resolve(p),request(`projects/${p.id}/lifecycle`),request('clients/'+p.clientId),request(`projects/${p.id}/admin-details`),request('business-settings')]);};
  const [before,logo]=await Promise.all([read(),readDocumentLogo()]);
  const [p,current,client,details,business]=before;
  const html=(kind==='assessment'?assessmentRequestDocument:technicalTaskRequestDocument)(p,current,client,kind==='task'&&draftInstructions?{...details,draftWorkInstructions:draftInstructions()}:details,{business,logo});
  assertStableDocumentSnapshot(before,await read());
  download(new Blob([html],{type:'text/html'}),safeName(p.reference)+'-'+kind+'-request'+(kind==='task'?'-quote-'+current.state.quotes.at(-1).version:'')+'.html');
  feedback.replaceChildren(notice('Draft request downloaded. Open it to review, print or save as PDF. Nothing was sent, accepted or started.'));
 }catch(e){feedback.replaceChildren(notice(e.message,true));}};
 if(assessment)buttons.append(action('Download Assessment Request',()=>prepare('assessment')));
 if(task)buttons.append(action('Download Work Request',()=>prepare('task')));
}
export function renderSavedDocumentDownloads(parent,project,{cover=true,costReturn=true,returns=[]}={}){
 const feedback=node('div',null,'report-toolbar'),buttons=node('div',null,'actions report-toolbar');parent.append(buttons,feedback);
 const selection={revision:returns.at(-1)?.version};
 const revisionPicker=costReturn&&returns.length>1?field(buttons,'Cost return revision',selection,'revision','text',returns.slice().reverse().map(r=>[r.version,'Revision '+r.version+(r.receivedOn?' · '+r.receivedOn:'')])):null;
 const prepare=async(kind,print=false)=>{try{
  const revision=selection.revision==null?null:Number(selection.revision);
  const read=async()=>{const p=await request('projects/'+project.id);return Promise.all([Promise.resolve(p),request(`projects/${p.id}/lifecycle`),...(kind==='cover'?[request('clients/'+p.clientId),request(`projects/${p.id}/admin-details`)]:[])]);};
  const before=await read(),[p,current,client,details]=before;
  const renderer=kind==='summary'?costSummaryDocument:costReturnDocument;
  const html=kind==='cover'?projectCoverDocument(p,current,client,details):renderer(p,current,revision);
  assertStableDocumentSnapshot(before,await read());
  if(print){printCostDocument(html);return;}
  const suffix=kind==='cover'?'cover-sheet':(kind==='summary'?'cost-summary-':'cost-return-')+savedCostReturn(current,revision).version;
  download(new Blob([html],{type:'text/html'}),safeName(p.reference)+'-'+suffix+'.html');
  feedback.replaceChildren(notice('Saved document downloaded. Open it to review, print or save as PDF.'));
 }catch(e){feedback.replaceChildren(notice(e.message,true));}};
 if(cover)buttons.append(action('Download enquiry / project cover sheet',()=>prepare('cover')));
 if(costReturn)buttons.append(action('Print cost return',()=>prepare('cost',true)),action('Print cost summary',()=>prepare('summary',true)),
  action('Download saved cost return',()=>prepare('cost')),action('Download cost summary for Finance',()=>prepare('summary')));
 if(costReturn&&returns.some(item=>item.sourceFileId)){
  const selectedReturn=()=>returns.find(item=>item.version===Number(selection.revision));
  const original=action('Download technician’s original',async()=>{try{
   const saved=selectedReturn();await downloadProjectFile(project.id,saved.sourceFileId,saved.sourceFileName);
   feedback.replaceChildren(notice('Original downloaded. Open the file to print the copy supplied by the technician.'));
  }catch(error){feedback.replaceChildren(notice(error.message,true));}});
  const showOriginal=()=>{original.hidden=!selectedReturn()?.sourceFileId;};
  revisionPicker?.addEventListener('change',showOriginal);showOriginal();buttons.append(original);
 }
}
// Use the very same guards as document generation. Availability is guidance;
// each download still reads a fresh stable snapshot before preparing a file.
export function projectDocumentAvailability(project,current,details={}){
 const reasons={};const client={person:{},details:{}};
 for(const [kind,prepare] of [['assessment',()=>assessmentRequestDocument(project,current,client,details)],['task',()=>technicalTaskRequestDocument(project,current,client,details)],['quote',()=>assertCurrentClientQuote(current)],['cost',()=>costReturnDocument(project,current)]]){
  try{prepare();reasons[kind]='';}catch(error){reasons[kind]=error.message;}
 }
 return reasons;
}
export function renderFinancePack(parent,project,lifecycle,options={}){
 const availability=options.library?projectDocumentAvailability(project,lifecycle,options.adminDetails):null;
 const includeQuote=!availability?.quote;
 const section=node(options.quoteOnly||options.expanded?'section':'details',null,'care-details');section.append(node(options.quoteOnly||options.expanded?'h3':'summary',options.library?'Project documents and packs':options.quoteOnly?'Reviewed client quote':'Documents and Finance handoff'));parent.append(section);
 if(options.library){section.append(node('p','Download a generated draft to open, review and print it or save it as PDF. Send the Assessment Request to the technical member, then keep their returned assessment report in Project files. The Work Request includes a customer acceptance page. Keep copies of documents actually sent in Project files.','field-help'));const list=node('dl',null,'document-availability');for(const [kind,label] of [['assessment','Assessment Request'],['task','Work Request'],['quote','Client quote'],['cost','Actual cost return']]){const row=node('div');row.append(node('dt',label),node('dd',availability[kind]||'Available from the saved project record'));list.append(row);}section.append(list);}
 if(!options.quoteOnly)section.append(node('p','Prepare a pack for Finance without giving them an app login. Download it, review its contents, then attach it to your email. Nothing is sent automatically.','field-help'));
 const controls=node('div',null,'form-grid'),d={purpose:(project.status==='closed'||lifecycle.state?.work?.status==='complete'||lifecycle.state?.cancellation||lifecycle.state?.closed)?'completion':'before_work',recipient:'',mailbox:'pm@tadsa.org.au'};if(!options.quoteOnly)section.append(controls);
 field(controls,'Finance pack purpose',d,'purpose','text',[['before_work','Before work — approval and payment'],['completion','Completion — costs and reconciliation']]);
 field(controls,'Finance email address',d,'recipient','email');field(controls,'Suggested sending mailbox',d,'mailbox','text',[['pm@tadsa.org.au','Project management — pm@tadsa.org.au'],['fw@tadsa.org.au','Freedom Wheels — fw@tadsa.org.au'],['own','My own mailbox']]);
 const feedback=node('div');section.append(feedback);const buttons=node('div',null,'actions');section.append(buttons);
 const clientControls=node('div',null,'form-grid'),clientDraft={recipient:''};if(includeQuote)section.append(clientControls);
 const clientEmail=field(clientControls,'Client quote email address',clientDraft,'recipient','email');let recipientEdited=false;clientEmail.addEventListener('input',()=>recipientEdited=true);
 clientControls.append(node('p','Review the recipient and attach the downloaded quote yourself. Preparing a draft does not send email or record quote sending or acceptance.','field-help'));
 if(includeQuote)request('clients/'+project.clientId).then(client=>{if(!recipientEdited){clientDraft.recipient=client.person?.email||'';clientEmail.value=clientDraft.recipient;}}).catch(()=>{clientControls.append(node('p','Saved client email could not load. Enter the recipient manually.','field-help'));});
 clientControls.append(action('Prepare client quote email draft',async()=>{try{
  const read=async()=>{const p=await request('projects/'+project.id);return Promise.all([Promise.resolve(p),request(`projects/${p.id}/lifecycle`),request('clients/'+p.clientId)]);};
  const before=await read(),[p,current,client]=before;
  if(!recipientEdited){clientDraft.recipient=client.person?.email||'';clientEmail.value=clientDraft.recipient;}
  const draft=clientQuoteDraft(p,current,clientDraft.recipient);
  assertStableDocumentSnapshot(before,await read());
  const a=node('a');a.href=draft.href;a.click();feedback.replaceChildren(notice('Email draft prepared. Review the recipient and quote revision, choose your sending mailbox, and attach the quote manually. Nothing was sent or recorded as sent.'));
 }catch(e){feedback.replaceChildren(notice(e.message,true));}}));
 if(!options.quoteOnly)renderSavedDocumentDownloads(section,project,{costReturn:Boolean(lifecycle.state?.costReturns?.length),returns:lifecycle.state?.costReturns});
 if(!options.quoteOnly)renderWorkflowRequestDownloads(section,project,{assessment:!availability?.assessment,task:!availability?.task});
 if(!options.quoteOnly)buttons.append(action('Download Finance pack',async()=>{try{
  feedback.replaceChildren(notice('Preparing saved project details…'));
  const readSnapshot=()=>readFinanceSnapshot(project.id);
  const snapshot=await readSnapshot(),[p,current,ops,files,plan,business,people]=snapshot;assertStableFinanceSnapshot(snapshot,snapshot);
  const state=current.state,quote=state?.quotes?.at(-1),rows=[workflowNotice(current),record('Project number',p.reference),record('Client',p.clientName),record('Work',p.summary),record('Purpose',d.purpose==='before_work'?'Approval and payment before work':'Final costs and reconciliation'),record('Prepared',new Date().toLocaleString('en-AU')),record('NDIS reference',plan.ndisNumber),record('Issuer',business.issuerName),record('ABN',business.abn),record('Office',business.address),'<h2>Current estimate</h2>',quoteTable(quote),'<h2>Recorded decisions</h2>',decisionSummary(state,people.items),'<h2>Actual cost return and summary</h2><p>Distinguish technical-member expenses and travel/work time from the reviewed service charge. Check the quantities and rates before sending to Finance; no reimbursement or fee is calculated from an assumed rate.</p>',(state?.costReturns?.length?quoteTable(state.costReturns.at(-1),'Actual cost total'):'<p>No actual cost return recorded yet.</p>'),record('Cost return notes',state?.costReturns?.at(-1)?.notes),record('Difference from quote',state?.costReturns?.length&&quote?money(state.costReturns.at(-1).totalCents-quote.totalCents):'Not recorded'),'<p>Differences require an explicit decision by the customer and Finance; they are not automatically billed.</p>','<h2>Hours and invoices</h2>',record('Recorded hours',String(ops.actualMinutes/60)),invoiceSummary(ops.invoices,plan.payments),'<h2>Files in this pack</h2>',`<ul>${files.items.map(f=>`<li>${escape(f.name)}</li>`).join('')}</ul>`,'<p>External Finance records remain authoritative for invoicing and payment. Recorded confirmations are operator-entered evidence, not a bank verification. Review this pack before sending.</p>'];
  if(files.items.reduce((n,f)=>n+f.size,0)>50*1024*1024)throw Error('Project files exceed the 50 MB email-pack limit. Download required files individually from Project files instead.');
  const entries=[{name:'Finance-summary.html',data:htmlDocument('Finance handoff — '+p.reference,rows.join(''))},{name:'Project-record.json',data:JSON.stringify({purpose:d.purpose,preparedAt:new Date().toISOString(),project:p,lifecycle:current,operations:ops,ndisReference:plan.ndisNumber,attachments:files.items},null,2)}];
  if(d.purpose==='completion'&&state?.costReturns?.length){
   const revision=state.costReturns.at(-1).version;
   entries.push({name:'Cost-return-'+revision+'.html',data:costReturnDocument(p,current,revision)},
    {name:'Cost-summary-'+revision+'.html',data:costSummaryDocument(p,current,revision)});
  }
  for(const file of files.items){const r=await fetch(`/api/projects/${p.id}/attachments/${file.id}/download`);if(!r.ok)throw Error('Unable to include '+file.name+'. Pack was not downloaded.');entries.push({name:'Documents/'+safeName(file.id)+'-'+safeName(file.name),data:new Uint8Array(await r.arrayBuffer())});}
  assertStableFinanceSnapshot(snapshot,await readSnapshot());
  download(storedZip(entries),safeName(p.reference)+'-finance-'+d.purpose+'.zip');feedback.replaceChildren(notice('Pack downloaded with project records and documents. Review it before sharing; attach it manually to your email.'));
 }catch(e){feedback.replaceChildren(notice(e.message,true));}}));
 if(!options.quoteOnly)buttons.append(action('Prepare email draft',()=>{const recipient=d.recipient.trim();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)){feedback.replaceChildren(notice('Enter the Finance email address first.',true));return;}const subject=`TADSA ${project.reference} — ${d.purpose==='before_work'?'approval and payment':'final costs and reconciliation'}`;const body=`Please review the Finance pack for project ${project.reference}: ${project.title}.\n\n[Attach the downloaded Finance pack before sending.]\n\nPlease return confirmation and your reference so the project record can be updated.`;const a=node('a');a.href=`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;a.click();feedback.replaceChildren(notice(`If your email app opened, choose ${d.mailbox==='own'?'your own mailbox':d.mailbox} as the sender and attach the downloaded pack. A browser cannot select the From account or attach files automatically.`));}));
 if(includeQuote)buttons.append(action('Download client quote',async()=>{try{const readQuote=async()=>{const p=await request('projects/'+project.id),coordination=p.coordination??{},payer=coordination.payerId&&['person','organisation'].includes(coordination.fundingStatus)?request((coordination.fundingStatus==='person'?'people/':'organisations/')+coordination.payerId):Promise.resolve(null);return Promise.all([Promise.resolve(p),request(`projects/${p.id}/lifecycle`),request('business-settings'),request('clients/'+p.clientId),request(`projects/${p.id}/work-plan`),payer]);};const [snapshot,logo]=await Promise.all([readQuote(),readDocumentLogo()]);const [p,current,business,client,plan,payer]=snapshot;const q=assertCurrentClientQuote(current);const html=clientQuoteDocument(p,current,client,business,plan,payer,logo);const after=await readQuote();if(p.version!==current.version||JSON.stringify(snapshot)!==JSON.stringify(after))throw Error('Project changed while preparing the quote. Please download it again.');download(new Blob([html],{type:'text/html'}),safeName(project.reference)+'-quote-'+q.version+'.html');feedback.replaceChildren(notice('Quote downloaded. Open it to review or print to PDF before sharing.'));}catch(e){feedback.replaceChildren(notice(e.message,true));}}));
}
