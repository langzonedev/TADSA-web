import {node,action,field,notice,request} from './project-care.js';
import {residentialAddressText} from './client-address.js';
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
export function assertStableFinanceSnapshot(before,after){
 const [project,lifecycle,operations,,plan]=before;
 if([project,operations,plan].filter(Boolean).some(record=>record.version!==lifecycle.version)||JSON.stringify(before)!==JSON.stringify(after))throw Error('Project or supporting records changed while preparing the document. Please download it again.');
}
export function workflowNotice(current){
 const s=current.state;
 if(!s)return '<p>Legacy project: no guided workflow decisions recorded.</p>';
 const position=s.closed?'Project closed — no further work authorised':s.cancellation?'Cancelled — no work authorised':s.work?.status==='complete'?'Work completed — follow the remaining sign-off and Finance steps':current.workGate?.allowed?'Recorded prerequisites complete — follow the current project stage':'Prerequisites incomplete — work must not commence';
 return record('Workflow stage',s.stage.replaceAll('_',' '))+record('Work position',position)+(s.cancellation?record('CANCELLED — do not commence work',s.cancellation.reason):'')+(s.revisionRequested?record('QUOTE REVISION REQUIRED — previous approvals do not authorise work',s.revisionRequested.reason):'')+(s.closed?record('CLOSED',s.closed.reason):'');
}
function htmlDocument(title,body){return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>body{font:16px/1.6 Arial,sans-serif;color:#17213a;max-width:920px;margin:40px auto;padding:0 24px}header{border-bottom:5px solid #97c64b}h1{color:#2f3e84;font-size:28px}h2{font-size:20px;margin-top:28px}table{border-collapse:collapse;width:100%}td,th{padding:10px;text-align:left;border-bottom:1px solid #ddd;vertical-align:top}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.muted{color:#536078}@media print{body{margin:0}h2,tr{break-inside:avoid}}</style><header><strong>TADSA · Technology for Ageing &amp; Disability SA</strong><h1>${escape(title)}</h1></header>${body}</html>`;}
const record=(label,value)=>`<p><strong>${escape(label)}:</strong> ${escape(value||'Not recorded')}</p>`;
export function decisionSummary(state,people=[]){
 const s=state??{},who=x=>x?.actor?.displayName||'Operator not recorded';
 const assessment=s.assessmentDecision?{...s.assessmentDecision,actor:s.assessmentDecision.actor??s.history?.findLast(e=>e.action==='assessmentDecision')?.actor}:null;
 const section=(title,value,fields)=>`<h3>${escape(title)}</h3>${value?fields.map(([label,text])=>record(label,text)).join('')+record('Recorded by',who(value)):'<p>Not recorded.</p>'}`;
 return section('Assessment',assessment,[['Decision',s.assessmentDecision?.required?'Assessment required':'Assessment not required'],['Reason',s.assessmentDecision?.reason],['Findings',s.assessment?.notes],['Findings recorded by',s.assessment?who(s.history?.findLast(e=>e.action==='assessmentComplete')):'Not recorded']])+
 section('Technical peer review',s.peerReview,[['Reviewer',people.find(p=>p.id===s.peerReview?.reviewerId)?.name||'Recorded technical member'],['Quote revision',s.peerReview?.quoteVersion],['Decision',s.peerReview?.approved?'Viable':'Revision needed'],['Notes',s.peerReview?.notes]])+
 section('Client quote acceptance',s.acceptance,[['Accepted by',s.acceptance?.acceptedBy],['Quote revision',s.acceptance?.quoteVersion],['Date',s.acceptance?.date],['Evidence reference',s.acceptance?.reference]])+
 section('Finance clearance',s.financeClearance,[['Decision',s.financeClearance?.status==='paid'?'External Finance confirms payment':'External Finance authorises work without prepayment'],['Quote revision',s.financeClearance?.quoteVersion],['Date',s.financeClearance?.confirmedOn],['Evidence reference',s.financeClearance?.reference],['Notes',s.financeClearance?.notes]])+
 section('Customer sign-off',s.signoff,[['Accepted by',s.signoff?.acceptedBy],['Date',s.signoff?.signedOn],['Evidence reference',s.signoff?.reference],['Handover notes',s.signoff?.notes]])+
 section('Finance finalisation',s.financeFinalisation,[['Date',s.financeFinalisation?.confirmedOn],['Evidence reference',s.financeFinalisation?.reference],['Notes',s.financeFinalisation?.notes]]);
}
export function invoiceSummary(invoices=[],payments=[]){
 if(!invoices.length)return '<p>No draft invoices recorded in this application.</p>';
 return invoices.map(i=>{const s=i.snapshot??i,receipts=payments.filter(p=>p.invoiceId===i.id),paid=receipts.reduce((n,p)=>n+p.amountCents,0);return `<h3>${escape(i.number)}</h3>`+record('Recipient',s.payerName)+record('Billing address',s.billingAddress)+record('Invoice date',s.invoiceDate)+quoteTable(s,'Draft invoice total',false)+record('GST',s.business?.gstConfirmed?money(s.gstCents??0):'Tax treatment unconfirmed')+record('Recorded receipts',money(paid))+record('Outstanding',money(s.totalCents-paid))+(receipts.length?'<h4>Receipt evidence</h4>'+receipts.map(p=>record(p.receivedOn,`${money(p.amountCents)} · ${p.reference}`)).join(''):'<p>No receipts recorded.</p>');}).join('');
}
function quoteTable(quote,totalLabel='Estimate total',showTaxNote=true){return quote?`<table><thead><tr><th>Item</th><th>Quantity</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${quote.lines.map(l=>`<tr><td>${escape(l.description)}${l.type?' ('+escape(l.type)+')':''}</td><td>${escape((l.quantityMilli??1000)/1000)}</td><td>${escape(money(l.unitPriceCents??l.amountCents))}</td><td>${escape(money(l.amountCents??Math.round(l.quantityMilli*l.unitPriceCents/1000)))}</td></tr>`).join('')}</tbody></table>${record(totalLabel,money(quote.totalCents))}${showTaxNote?'<p class="muted">AUD. Tax treatment must be confirmed before issuing a final financial document. Synthetic demonstration only.</p>':''}`:'<p>No quote recorded.</p>';}
export function assertCurrentClientQuote(current){
 if(current.state?.cancellation||current.state?.revisionRequested)throw Error('This quote is cancelled or awaiting revision. Save a current quote before preparing it for the client.');
 const quote=current.state?.quotes?.at(-1);if(!quote)throw Error('Save a quote revision first.');return quote;
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
export function costReturnDocument(project,current){
 const saved=current.state?.costReturns?.at(-1);if(!saved)throw Error('Record an actual cost return first.');
 const quote=current.state.quotes?.at(-1);
 return htmlDocument('Actual cost return — '+project.reference+' / revision '+saved.version,
  '<p><strong>DRAFT · Fictional development data · Saved cost evidence, not an invoice</strong></p>'+record('Project',project.title)+record('Client',project.clientName)+workflowNotice(current)+record('Cost return revision',saved.version)+record('Recorded at',saved.at)+record('Recorded by',saved.actor?.displayName)+quoteTable(saved,'Actual cost total')+record('Cost return notes',saved.notes)+record('Latest saved quote revision',quote?.version)+record('Latest saved quote total',quote?money(quote.totalCents):'Not recorded')+record('Difference from latest saved quote',quote?money(saved.totalCents-quote.totalCents):'Not recorded — no quote saved')+'<p>Differences require an explicit customer and Finance decision; they are not automatically billed. This document does not confirm payment or authorise work.</p>');
}
export function projectCoverDocument(project,current,client,details={}){
 const intake=client.details??{},person=client.person??{},residential=residentialAddressText(intake),representative=client.contacts?.find(c=>c.personId===intake.representativePersonId),preferred=intake.preferredContact==='representative'?representative:person;
 return htmlDocument('Enquiry / project cover sheet — '+project.reference,
 '<p><strong>DRAFT · Fictional development data · Internal saved-record summary</strong></p><p>This cover sheet is not approval or authorisation to commence work.</p>'+record('Project',project.title)+record('Project number',project.reference)+record('Client',person.name||project.clientName)+record('Client email',person.email)+record('Client phone',person.phone)+record('Residential address',residential)+record('Work address',intake.sameAsResidential?residential:intake.workAddress)+record('Preferred contact',intake.preferredContact==='representative'?(representative?.name||'Representative no longer linked — review required'):'Client')+record('Preferred contact email',preferred?.email)+record('Preferred contact phone',preferred?.phone)+record('Contact needs',intake.contactNeeds)+record('Work requested',project.summary)+record('Project status',project.status)+record('Target date',project.dueDate)+record('Programme',details.programme==='FW'?'Freedom Wheels (FW)':details.programme)+record('Enquiry source',details.enquirySource)+record('Next follow-up',details.followUpOn)+record('Technical team',(project.relationships??[]).filter(r=>r.role==='Technician').map(r=>r.name).join(', '))+workflowNotice(current));
}
export function renderSavedDocumentDownloads(parent,project,{cover=true,costReturn=true}={}){
 const feedback=node('div',null,'report-toolbar'),buttons=node('div',null,'actions report-toolbar');parent.append(buttons,feedback);
 const prepare=async(kind)=>{try{
  const read=async()=>{const p=await request('projects/'+project.id);return Promise.all([Promise.resolve(p),request(`projects/${p.id}/lifecycle`),...(kind==='cover'?[request('clients/'+p.clientId),request(`projects/${p.id}/admin-details`)]:[])]);};
  const before=await read(),[p,current,client,details]=before;
  const html=kind==='cover'?projectCoverDocument(p,current,client,details):costReturnDocument(p,current);
  assertStableDocumentSnapshot(before,await read());
  download(new Blob([html],{type:'text/html'}),safeName(p.reference)+(kind==='cover'?'-cover-sheet':'-cost-return-'+current.state.costReturns.at(-1).version)+'.html');
  feedback.replaceChildren(notice('Saved document downloaded. Open it to review and print / save as PDF. Nothing was sent or marked approved.'));
 }catch(e){feedback.replaceChildren(notice(e.message,true));}};
 if(cover)buttons.append(action('Download enquiry / project cover sheet',()=>prepare('cover')));
 if(costReturn)buttons.append(action('Download saved cost return',()=>prepare('cost')));
}
export function renderFinancePack(parent,project,lifecycle,options={}){
 const section=node(options.quoteOnly||options.expanded?'section':'details',null,'care-details');section.append(node(options.quoteOnly||options.expanded?'h3':'summary',options.quoteOnly?'Reviewed client quote':'Documents and Finance handoff'));parent.append(section);
 if(!options.quoteOnly)section.append(node('p','Prepare a pack for Finance without giving them an app login. Download it, review its contents, then attach it to your email. Nothing is sent automatically.','field-help'));
 const controls=node('div',null,'form-grid'),d={purpose:(lifecycle.state?.work?.status==='complete'||lifecycle.state?.cancellation||lifecycle.state?.closed)?'completion':'before_work',recipient:'',mailbox:'pm@tadsa.org.au'};if(!options.quoteOnly)section.append(controls);
 field(controls,'Finance pack purpose',d,'purpose','text',[['before_work','Before work — approval and payment'],['completion','Completion — costs and reconciliation']]);
 field(controls,'Finance email address',d,'recipient','email');field(controls,'Suggested sending mailbox',d,'mailbox','text',[['pm@tadsa.org.au','Project management — pm@tadsa.org.au'],['fw@tadsa.org.au','Freedom Wheels — fw@tadsa.org.au'],['own','My own mailbox']]);
 const feedback=node('div');section.append(feedback);const buttons=node('div',null,'actions');section.append(buttons);
 const clientControls=node('div',null,'form-grid'),clientDraft={recipient:''};section.append(clientControls);
 const clientEmail=field(clientControls,'Client quote email address',clientDraft,'recipient','email');let recipientEdited=false;clientEmail.addEventListener('input',()=>recipientEdited=true);
 clientControls.append(node('p','Review the recipient and attach the downloaded quote yourself. Preparing a draft does not send email or record quote sending or acceptance.','field-help'));
 request('clients/'+project.clientId).then(client=>{if(!recipientEdited){clientDraft.recipient=client.person?.email||'';clientEmail.value=clientDraft.recipient;}}).catch(()=>{clientControls.append(node('p','Saved client email could not load. Enter the recipient manually.','field-help'));});
 clientControls.append(action('Prepare client quote email draft',async()=>{try{
  const read=async()=>{const p=await request('projects/'+project.id);return Promise.all([Promise.resolve(p),request(`projects/${p.id}/lifecycle`),request('clients/'+p.clientId)]);};
  const before=await read(),[p,current,client]=before;
  if(!recipientEdited){clientDraft.recipient=client.person?.email||'';clientEmail.value=clientDraft.recipient;}
  const draft=clientQuoteDraft(p,current,clientDraft.recipient);
  assertStableDocumentSnapshot(before,await read());
  const a=node('a');a.href=draft.href;a.click();feedback.replaceChildren(notice('Email draft prepared. Review the recipient and quote revision, choose your sending mailbox, and attach the quote manually. Nothing was sent or recorded as sent.'));
 }catch(e){feedback.replaceChildren(notice(e.message,true));}}));
 if(!options.quoteOnly)renderSavedDocumentDownloads(section,project);
 if(!options.quoteOnly)buttons.append(action('Download Finance pack',async()=>{try{
  feedback.replaceChildren(notice('Preparing saved project details…'));
  const readSnapshot=()=>Promise.all([request('projects/'+project.id),request(`projects/${project.id}/lifecycle`),request(`projects/${project.id}/operations`),request(`projects/${project.id}/attachments`),request(`projects/${project.id}/work-plan`),request('business-settings'),request('people')]);
  const snapshot=await readSnapshot(),[p,current,ops,files,plan,business,people]=snapshot;assertStableFinanceSnapshot(snapshot,snapshot);
  const state=current.state,quote=state?.quotes?.at(-1),rows=[workflowNotice(current),record('Project number',p.reference),record('Client',p.clientName),record('Work',p.summary),record('Purpose',d.purpose==='before_work'?'Approval and payment before work':'Final costs and reconciliation'),record('Prepared',new Date().toLocaleString('en-AU')),record('NDIS reference',plan.ndisNumber),record('Issuer',business.issuerName),record('ABN',business.abn),record('Office',business.address),'<h2>Current estimate</h2>',quoteTable(quote),'<h2>Recorded decisions</h2>',decisionSummary(state,people.items),'<h2>Actual cost return and summary</h2>',(state?.costReturns?.length?quoteTable(state.costReturns.at(-1),'Actual cost total'):'<p>No actual cost return recorded yet.</p>'),record('Cost return notes',state?.costReturns?.at(-1)?.notes),record('Difference from quote',state?.costReturns?.length&&quote?money(state.costReturns.at(-1).totalCents-quote.totalCents):'Not recorded'),'<p>Differences require an explicit decision by the customer and Finance; they are not automatically billed.</p>','<h2>Hours and invoices</h2>',record('Recorded hours',String(ops.actualMinutes/60)),invoiceSummary(ops.invoices,plan.payments),'<h2>Files in this pack</h2>',`<ul>${files.items.map(f=>`<li>${escape(f.name)}</li>`).join('')}</ul>`,'<p>External Finance records remain authoritative for invoicing and payment. Recorded confirmations are operator-entered evidence, not a bank verification. Review this pack before sending.</p>'];
  if(files.items.reduce((n,f)=>n+f.size,0)>50*1024*1024)throw Error('Project files exceed the 50 MB email-pack limit. Download required files individually from Project files instead.');
  const entries=[{name:'Finance-summary.html',data:htmlDocument('Finance handoff — '+p.reference,rows.join(''))},{name:'Project-record.json',data:JSON.stringify({purpose:d.purpose,preparedAt:new Date().toISOString(),project:p,lifecycle:current,operations:ops,ndisReference:plan.ndisNumber,attachments:files.items},null,2)}];
  for(const file of files.items){const r=await fetch(`/api/projects/${p.id}/attachments/${file.id}/download`);if(!r.ok)throw Error('Unable to include '+file.name+'. Pack was not downloaded.');entries.push({name:'Documents/'+safeName(file.id)+'-'+safeName(file.name),data:new Uint8Array(await r.arrayBuffer())});}
  assertStableFinanceSnapshot(snapshot,await readSnapshot());
  download(storedZip(entries),safeName(p.reference)+'-finance-'+d.purpose+'.zip');feedback.replaceChildren(notice('Pack downloaded with project records and documents. Review it before sharing; attach it manually to your email.'));
 }catch(e){feedback.replaceChildren(notice(e.message,true));}}));
 if(!options.quoteOnly)buttons.append(action('Prepare email draft',()=>{const recipient=d.recipient.trim();if(!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(recipient)){feedback.replaceChildren(notice('Enter the Finance email address first.',true));return;}const subject=`TADSA ${project.reference} — ${d.purpose==='before_work'?'approval and payment':'final costs and reconciliation'}`;const body=`Please review the Finance pack for project ${project.reference}: ${project.title}.\n\n[Attach the downloaded Finance pack before sending.]\n\nPlease return confirmation and your reference so the project record can be updated.`;const a=node('a');a.href=`mailto:${encodeURIComponent(recipient)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;a.click();feedback.replaceChildren(notice(`If your email app opened, choose ${d.mailbox==='own'?'your own mailbox':d.mailbox} as the sender and attach the downloaded pack. A browser cannot select the From account or attach files automatically.`));}));
 buttons.append(action('Download client quote',async()=>{try{const readQuote=()=>Promise.all([request('projects/'+project.id),request(`projects/${project.id}/lifecycle`),request('business-settings')]);const snapshot=await readQuote(),[p,current,business]=snapshot;const q=current.state?.quotes?.at(-1);if(current.state?.cancellation||current.state?.revisionRequested)throw Error('This quote is cancelled or awaiting revision. Save a current quote before downloading it for the client.');if(!q)throw Error('Save a quote revision first.');const html=htmlDocument('Quote — '+p.reference+' / revision '+q.version,record('Issuer',business.issuerName)+record('ABN',business.abn)+record('Address',business.address)+record('Contact',business.contact)+record('Client',p.clientName)+record('Work',p.summary)+quoteTable(q)+record('Quote notes',q.notes)+'<p>Acceptance must identify this quote revision. Changes to scope or cost require a revised quote and renewed approval.</p>');const after=await readQuote();if(p.version!==current.version||JSON.stringify(snapshot)!==JSON.stringify(after))throw Error('Project changed while preparing the quote. Please download it again.');download(new Blob([html],{type:'text/html'}),safeName(project.reference)+'-quote-'+q.version+'.html');feedback.replaceChildren(notice('Quote downloaded. Open it to review or print to PDF before sharing.'));}catch(e){feedback.replaceChildren(notice(e.message,true));}}));
}
