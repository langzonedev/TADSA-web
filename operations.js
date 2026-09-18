let host;
const drafts=new Map();
export const configureOperations=h=>{host=h;};
export const operationsHaveDrafts=()=>drafts.size>0;
const node=(tag,text,cls)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(cls)n.className=cls;return n;};
const link=(text,hash)=>{const a=node('a',text,'button secondary');a.href='#'+hash;return a;};
const button=(text,fn)=>{const b=node('button',text,'secondary');b.type='button';b.onclick=fn;return b;};
async function api(path,method='GET',body){const r=await fetch('/api/'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(12000)});const data=await r.json();if(!r.ok){const e=Error(data.error);e.status=r.status;throw e;}return data;}
const notice=(text,error=false)=>{const n=node('p',text,error?'message error':'message');n.setAttribute('role',error?'alert':'status');return n;};
function input(parent,label,d,key,type='text'){const l=node('label',null,'workflow-field');l.append(node('span',label,'field-label'));const n=node(type==='textarea'?'textarea':'input');if(type!=='textarea')n.type=type;n.setAttribute('aria-label',label);n.value=d[key]??'';if(type==='number'){n.min='0';n.step='1';}if(type==='textarea'){n.rows=3;n.maxLength=2000;}else if(type==='text')n.maxLength=200;n.oninput=()=>{d[key]=n.value;};l.append(n);parent.append(l);return n;}
function select(parent,label,d,key,values){const l=node('label',null,'workflow-field');l.append(node('span',label,'field-label'));const n=node('select');n.setAttribute('aria-label',label);for(const[v,t]of values){const o=node('option',t);o.value=v;n.append(o);}n.value=d[key]??'';n.onchange=()=>d[key]=n.value;l.append(n);parent.append(l);return n;}
function check(parent,label,d,key){const l=node('label',null,'checkbox'),n=node('input');n.type='checkbox';n.checked=d[key];n.onchange=()=>d[key]=n.checked;l.append(n,node('span',label));parent.append(l);}
const money=c=>(c/100).toFixed(2);
function cents(value){if(!/^\d+(\.\d{1,2})?$/.test(String(value)))throw Error('Enter a positive dollar amount with at most two decimal places.');return Math.round(Number(value)*100);}
const scalarKeys=['actualMinutes','remainingMinutes','assessmentComplete','workApproved','approvedBy','approvedOn','fundingExceptionReason','onHold','clientStopped','resumeClientConsent','reviewRequired'];
async function send(form,d,key,path,method,payload,feedback,submit){
  if(host.isSaving())return;host.setSaving(true);d.pending??=payload;
  const lock=()=>form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=true);lock();feedback.replaceChildren(notice('Saving…'));
  try{await api(path,method,d.pending);window.dispatchEvent(new Event('tadsa-saved'));drafts.delete(key);host.setSaving(false);host.refresh();}
  catch(e){if(e.status){d.pending=null;d.requestId=crypto.randomUUID();}feedback.replaceChildren(notice(e.status?e.message:'Save result not confirmed. Retry the same save safely.',true));if(e.status===409&&method==='PUT')feedback.append(button('Compare latest case',()=>host.refresh()));}
  finally{host.setSaving(false);form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=Boolean(d.pending)&&n!==submit);submit.disabled=false;submit.textContent=d.pending?'Retry save safely':submit.dataset.label;}
}
export async function renderOperations(view,route,id){
  if(route==='review-queue'){view.append(node('h1','Needs attention'),node('p','Shared queue: any administrator or coordinator can pick up an item.','subtitle'));const q=await api('review-queue');if(!q.items.length)view.append(notice('No flagged cases.'));for(const p of q.items){const box=node('section',null,'panel');box.append(link(p.title||p.reference||p.projectId,'operations/'+(p.projectId||p.id)),node('p',p.reason||'Review the case, funding or hold details.'));view.append(box);}return true;}
  if(!['operations','documents'].includes(route))return false;
  const [p,ops,people,orgs,approvers,business,clients]=await Promise.all([api('projects/'+id),api(`projects/${id}/operations`),api('people'),api('organisations'),api('approvers'),api('business-settings'),api('clients')]);
  ops.invoices=ops.invoices.map(i=>({...i,...i.snapshot}));
  view.append(link('← Back to project','project/'+id),node('h1',route==='documents'?'Project documents':'Case workspace'),node('p',p.title,'subtitle'));
  if(route==='documents'){renderDocuments(view,p,ops);return true;}
  const key='case/'+id,d=drafts.get(key)??{...ops,requestId:crypto.randomUUID(),fundingContributors:ops.fundingContributors.map(c=>({...c,amount:money(c.amountCents)}))};
  const box=node('section',null,'panel workflow-panel'),form=node('form',null,'form-grid');form.classList.add('operations-form');box.append(node('h2','Progress, funding and decisions'),form);view.append(box);
  form.addEventListener('input',()=>drafts.set(key,d));form.addEventListener('change',()=>drafts.set(key,d));
  input(form,'Actual hours worked (running total)',d,'actualHours','number').value=d.actualHours??Number(d.actualMinutes)/60;
  input(form,'Estimated hours remaining',d,'remainingHours','number').value=d.remainingHours??Number(d.remainingMinutes)/60;
  for(const n of form.querySelectorAll('input[type=number]'))n.step='0.25';
  const funding=node('fieldset');funding.className='funding-fields';funding.append(node('legend','Payer contributions'),node('p','Record a dollar contribution for each payer. This does not record payment received.','field-help'));const rows=node('div');funding.append(rows);
  const payerOptions=[['client:'+p.clientId,p.clientName+' (client)'],...[...people.items].sort((a,b)=>a.name.localeCompare(b.name,'en-AU')).map(v=>['person:'+v.id,v.name]),...[...orgs.items].sort((a,b)=>a.name.localeCompare(b.name,'en-AU')).map(v=>['organisation:'+v.id,v.name])];
  function draw(){rows.replaceChildren();d.fundingContributors.forEach((c,i)=>{const row=node('div',null,'panel');const state={target:c.type+':'+c.id};const picker=select(row,'Payer '+(i+1),state,'target',payerOptions);picker.onchange=()=>{[c.type,c.id]=picker.value.split(':');drafts.set(key,d);};input(row,'Contribution '+(i+1)+' ($)',c,'amount');row.append(button('Remove payer '+(i+1),()=>{d.fundingContributors.splice(i,1);drafts.set(key,d);draw();}));rows.append(row);});}
  funding.append(button('Add payer',()=>{d.fundingContributors.push({type:'client',id:p.clientId,amount:''});drafts.set(key,d);draw();}));draw();form.append(funding);
  const approvals=node('fieldset');approvals.append(node('legend','Assessment and work approval'));check(approvals,'Assessment completed',d,'assessmentComplete');check(approvals,'Work approved by administrator/coordinator',d,'workApproved');const approverOptions=[['','Choose an administrator'],...approvers.items.map(a=>[a.id,a.name])];if(d.approvedBy&&!approvers.items.some(a=>a.id===d.approvedBy))approverOptions.push([d.approvedBy,'Previous entry — choose an administrator']);select(approvals,'Approver',d,'approvedBy',approverOptions);input(approvals,'Approval date',d,'approvedOn','date');input(approvals,'Funding context (does not bypass payment)',d,'fundingExceptionReason','textarea');approvals.append(node('p','Technical work requires payment in full and applicable NDIS approval. Assessment is free.','field-help'));form.append(approvals);
  const state=node('fieldset');state.append(node('legend','Hold and review'));check(state,'Client asked work to stop',d,'clientStopped');check(state,'Work is on hold',d,'onHold');check(state,'Client agreed to resume work',d,'resumeClientConsent');check(state,'Needs administrator review',d,'reviewRequired');form.append(state);
  const feedback=node('div'),actions=node('div',null,'actions'),submit=node('button','Save case details','primary');submit.type='submit';submit.dataset.label='Save case details';actions.append(submit,button('Discard unsaved case changes',()=>{drafts.delete(key);host.refresh();}));form.append(feedback,actions);
  if(d.version!==ops.version&&!d.pending){feedback.append(notice('The project changed since this draft began. Compare the latest saved case below before keeping your draft.',true),node('pre',JSON.stringify(Object.fromEntries([...scalarKeys,'fundingContributors'].map(k=>[k,ops[k]])),null,2),'case-comparison'),button('Use latest version with my draft',()=>{d.version=ops.version;d.requestId=crypto.randomUUID();feedback.replaceChildren(notice('Latest version acknowledged. Review and save your draft.'));}));}
  form.onsubmit=e=>{e.preventDefault();try{drafts.set(key,d);const payload={requestId:d.requestId,version:d.version,...Object.fromEntries(scalarKeys.map(k=>[k,d[k]])),actualMinutes:Math.round(Number(d.actualHours??ops.actualMinutes/60)*60),remainingMinutes:Math.round(Number(d.remainingHours??ops.remainingMinutes/60)*60),fundingContributors:d.fundingContributors.map(c=>({type:c.type,id:c.id,amountCents:cents(c.amount)}))};if(d.clientStopped){payload.onHold=true;payload.reviewRequired=true;}send(form,d,key,`projects/${id}/operations`,'PUT',payload,feedback,submit);}catch(e){feedback.replaceChildren(notice(e.message,true));}};
  if(d.pending){form.querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=n!==submit);submit.textContent='Retry save safely';}
  renderNotes(view,id,ops);renderInvoices(view,id,p,ops,payerOptions,business,clients.items,people.items);view.append(link('Review and print documents','documents/'+id));
  return true;
}
export function renderNotes(view,id,ops,compact=false){const box=node('section',null,'panel workflow-panel');box.append(node('h2','Case notes'),node('p','Latest updates for a quick handover. Add a note while on the phone; recording every conversation is optional.','field-help'));for(const n of (compact?ops.notes.slice(0,3):ops.notes)){box.append(node('p',n.text,'case-note'),node('small',`${n.actor||'Development operator'} · ${new Date(n.at||n.createdAt).toLocaleString('en-AU')}`));}const key='note/'+id,d=drafts.get(key)??{requestId:crypto.randomUUID(),text:''};const form=node('form',null,'form-grid');input(form,'New case note',d,'text','textarea').required=true;form.oninput=()=>drafts.set(key,d);const feedback=node('div'),submit=node('button','Add case note','primary');submit.type='submit';submit.dataset.label='Add case note';form.append(feedback,submit);form.onsubmit=e=>{e.preventDefault();drafts.set(key,d);send(form,d,key,`projects/${id}/notes`,'POST',{requestId:d.requestId,text:d.text.trim()},feedback,submit);};if(d.pending){form.querySelector('textarea').disabled=true;submit.textContent='Retry save safely';}box.append(form);if(compact&&ops.notes.length>3)box.append(link('View all case notes','operations/'+id));view.append(box);}
function renderInvoices(view,id,p,ops,payers,business,clients,people){
 if(p.kind==='Assessment'){view.append(notice('Assessments are free. No assessment invoice or payment is required.'));return;}
 const box=node('section',null,'panel workflow-panel');box.append(node('h2','Draft invoices'),notice('Save an itemised draft for review. Recording an invoice does not confirm payment. Financial details and tax treatment come from Settings.'));
 for(const i of ops.invoices)box.append(link((i.number||i.invoiceNumber)+' · '+money(i.totalCents)+' AUD','documents/'+id));
 const key='invoice/'+id,d=drafts.get(key)??{requestId:crypto.randomUUID(),milestone:'deposit',billingMode:'separate',payer:payers[0][0],invoiceDate:new Intl.DateTimeFormat('sv-SE',{timeZone:'Australia/Adelaide',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),billingAddress:'',lines:[{description:p.title,quantity:'1',unitPrice:''}],milestoneReached:false};
 const form=node('form',null,'form-grid invoice-editor');
 const addressFor=target=>{const[type,recordId]=target.split(':');const clientId=type==='client'?recordId:type==='person'?people.find(x=>x.id===recordId)?.clientId:null;const details=clients.find(c=>c.id===clientId)?.details;return details?.workAddress||details?.residentialAddress||'';};
 if(!drafts.has(key))d.billingAddress=addressFor(d.payer);
 input(form,'Invoice date',d,'invoiceDate','date').required=true;select(form,'Billing milestone',d,'milestone',[['deposit','Deposit'],['progress','Progress'],['final','Final']]);check(form,'Administrator confirms this billing milestone has been reached',d,'milestoneReached');select(form,'Invoice arrangement',d,'billingMode',[['separate','Separate invoice for this payer’s contribution'],['nominated','One nominated payer manages the split']]);
 const recipient=select(form,'Invoice recipient',d,'payer',payers);const address=input(form,'Billing address',d,'billingAddress','textarea');address.maxLength=500;recipient.addEventListener('change',()=>{d.billingAddress=addressFor(d.payer);address.value=d.billingAddress;drafts.set(key,d);});
 const items=node('fieldset');items.append(node('legend','Invoice items'));const rows=node('div',null,'invoice-lines'),totals=node('div',null,'invoice-totals');
 const quantity=value=>{if(!/^\d+(\.\d{1,3})?$/.test(String(value)))throw Error('Quantity needs up to three decimal places.');const q=Math.round(Number(value)*1000);if(!Number.isSafeInteger(q)||q<1)throw Error('Quantity must be greater than zero.');return q;};
 const calculate=()=>{try{const amount=d.lines.reduce((sum,line)=>sum+Math.round(quantity(line.quantity)*cents(line.unitPrice)/1000),0);let gst=0,total=amount;if(business.gstConfirmed&&business.gstMode==='exclusive'){gst=Math.round(amount*business.gstRateBps/10000);total+=gst;}else if(business.gstConfirmed&&business.gstMode==='inclusive')gst=Math.round(amount*business.gstRateBps/(10000+business.gstRateBps));totals.replaceChildren(node('strong','Preview total: $'+money(total)+' AUD'),node('p',business.gstConfirmed?(business.gstMode==='not-registered'?'No GST charged.':'GST component: $'+money(gst)):'Tax treatment is unconfirmed. This preview does not calculate GST.','field-help'));}catch{totals.replaceChildren(node('p','Complete each quantity and unit price to preview the total.','field-help'));}};
 const drawLines=()=>{rows.replaceChildren();d.lines.forEach((line,index)=>{const row=node('div',null,'invoice-line');input(row,'Item '+(index+1)+' description',line,'description').required=true;const q=input(row,'Item '+(index+1)+' quantity',line,'quantity');q.inputMode='decimal';q.required=true;const price=input(row,'Item '+(index+1)+' unit price ($ AUD)',line,'unitPrice');price.inputMode='decimal';price.required=true;if(d.lines.length>1)row.append(button('Remove item '+(index+1),()=>{d.lines.splice(index,1);drafts.set(key,d);drawLines();calculate();}));rows.append(row);});};
 items.append(rows,button('Add invoice item',()=>{if(d.lines.length>=10)return;d.lines.push({description:'',quantity:'1',unitPrice:''});drafts.set(key,d);drawLines();calculate();rows.lastElementChild?.querySelector('input')?.focus();}),totals);drawLines();calculate();form.append(items,node('p','Issuer: '+(business.issuerName||'Not configured')+' · ABN: '+(business.abn||'Not configured'),'field-help'),link('Review issuer and tax settings','settings'));
 const feedback=node('div'),submit=node('button','Create draft invoice','primary');submit.type='submit';submit.dataset.label='Create draft invoice';const actions=node('div',null,'actions');actions.append(submit,button('Discard invoice draft',()=>{drafts.delete(key);host.refresh();}));form.oninput=()=>{drafts.set(key,d);calculate();};form.onchange=()=>drafts.set(key,d);form.append(feedback,actions);
 form.onsubmit=e=>{e.preventDefault();try{const[payerType,payerId]=d.payer.split(':');drafts.set(key,d);send(form,d,key,`projects/${id}/invoices`,'POST',{requestId:d.requestId,version:ops.version,milestone:d.milestone,billingMode:d.billingMode,payerType,payerId,invoiceDate:d.invoiceDate,billingAddress:d.billingAddress.trim(),lines:d.lines.map(line=>({description:line.description.trim(),quantityMilli:quantity(line.quantity),unitPriceCents:cents(line.unitPrice)})),milestoneReached:d.milestoneReached},feedback,submit);}catch(e){feedback.replaceChildren(notice(e.message,true));}};
 if(d.pending){form.querySelectorAll('input,select,textarea,button').forEach(n=>n.disabled=n!==submit);submit.textContent='Retry save safely';}box.append(form);view.append(box);
}
function renderDocuments(view,p,ops){view.append(notice('Review before printing. These are provisional internal drafts, not the approved customer forms. No email is sent.'));
  const article=node('article',null,'print-document panel');article.append(node('h2','TADSA — '+(p.kind==='Assessment'?'Assessment Request':'Project Request')),node('strong','DRAFT · Fictional development data'),node('p',p.reference+' · '+p.title),node('p','Client: '+p.clientName),node('p',p.summary),node('p','Technician: '+(p.relationships.find(r=>r.role==='Technician')?.name||'Not assigned')),node('p','Assessment: '+(ops.assessmentComplete?'Recorded complete':'Pending')),node('p','Work approval: '+(ops.workApproved?(ops.approvedByName||'Previous approver entry')+' · '+ops.approvedOn:'Not recorded')),node('p','Actual hours: '+ops.actualMinutes/60+' · Estimated hours remaining: '+ops.remainingMinutes/60));view.append(article);

  for (const i of ops.invoices) {
    const business=i.business||{}, inv=node('article',null,'print-document panel invoice-document');
    const brand=node('header',null,'invoice-brand'), logo=node('img');
    logo.src='./assets/tadsa-logo.png';logo.alt='TADSA';logo.width=234;logo.height=45;
    brand.append(logo,node('span',i.documentLabel||'Draft invoice'));inv.append(brand);
    const heading=node('div',null,'invoice-heading');
    heading.append(node('h2',i.number||i.invoiceNumber),node('p','Invoice date: '+(i.invoiceDate||'Not recorded')),node('strong','DRAFT · Fictional development data'));inv.append(heading);
    const parties=node('div',null,'invoice-parties'),issuer=node('section'),recipient=node('section');
    issuer.append(node('h3','From'),node('strong',business.issuerName||'Issuer not configured'),node('p','ABN: '+(business.abn||'Not configured')),node('p',business.address||'Address not configured'),node('p',business.contact||'Contact not configured'));
    recipient.append(node('h3','Bill to'),node('strong',i.payerName||i.payerId||'Recipient not recorded'),node('p',i.billingAddress||'Billing address not recorded'),node('p',i.projectReference+' · '+i.projectTitle),node('p','Milestone: '+i.milestone));parties.append(issuer,recipient);inv.append(parties);
    const table=node('table',null,'invoice-table'),thead=node('thead'),head=node('tr');
    const labels=['Description','Quantity','Unit price','Amount'];
    for(const text of labels){const th=node('th',text);th.scope='col';head.append(th);}thead.append(head);table.append(thead);
    const body=node('tbody');
    for(const line of i.lines||[]){
      const row=node('tr');
      const values=[line.description,line.quantityMilli===undefined?'1':String(line.quantityMilli/1000),'$'+money(line.unitPriceCents??line.amountCents),'$'+money(line.amountCents)];
      for(const [index,value] of values.entries()){
        const td=node('td');td.dataset.label=labels[index];
        const label=node('span',labels[index],'invoice-mobile-label');label.setAttribute('aria-hidden','true');
        td.append(label,node('span',value));row.append(td);
      }
      body.append(row);
    }
    table.append(body);inv.append(table);
    const total=node('div',null,'invoice-totals');
    if(i.subtotalCents!==undefined)total.append(node('p','Subtotal: $'+money(i.subtotalCents)));
    total.append(node('p',business.gstConfirmed?'GST: $'+money(i.gstCents||0):'Tax treatment unconfirmed'),node('strong','Total: $'+money(i.totalCents)+' AUD'));inv.append(total);
    for(const warning of i.readinessWarnings||[])inv.append(node('p',warning,'document-warning'));
    inv.append(node('p','Payment terms: '+(business.paymentTerms||'Not configured')),node('p','Payment details: '+(business.bankDetails||'Not configured')),node('p','Saved invoice snapshot. This document does not confirm receipt of payment.','field-help'));view.append(inv);
  }
  view.append(button('Print / save as PDF',()=>window.print()));
}
