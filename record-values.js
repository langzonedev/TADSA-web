// Human-readable values shared by activity history and draft comparisons.
const labels={actualMinutes:'Actual hours',remainingMinutes:'Estimated hours remaining',approvedBy:'Approver',approvedOn:'Approval date',fundingContributors:'Payer contributions',fundingExceptionReason:'Funding context',resumeClientConsent:'Client agreed to resume work',clientStopped:'Client asked work to stop',onHold:'Work is on hold',reviewRequired:'Needs administrator review',assessmentComplete:'Assessment completed',workApproved:'Work approved',feedbackRequired:'Feedback required',invoiceRequired:'Invoice required',completed:'Feedback completed',amountCents:'Amount',totalCents:'Total',fundingStatus:'Funding status',clientId:'Client',payerId:'Payer',personId:'Person',projectId:'Project',event:'Workflow event',before:'Previous values',after:'Saved values',id:'Record',invoiceId:'Invoice',quantityMilli:'Quantity',unitPriceCents:'Unit price',reviewerId:'Technical reviewer',technicianId:'Technician',technicianIds:'Technical team',quoteVersion:'Quote revision',costReturnVersion:'Cost return revision'};
const events={begin:'Workflow started',assessmentDecision:'Assessment decision recorded',assessmentComplete:'Assessment completed',quote:'Quote prepared',peerReview:'Technical peer review recorded',issueQuote:'Quote sent',acceptQuote:'Client acceptance recorded',financeClearance:'Finance clearance recorded',work:'Work progress recorded',signoff:'Client sign-off recorded',costReturn:'Actual costs returned',financeFinalise:'Finance finalised',close:'Project closed',reopen:'Project reopened',cancel:'Project cancelled',revise:'Revision requested',returnTo:'Returned for correction',enquiry:'Enquiry',peer_review:'Technical peer review',finance_clearance:'Finance clearance',finance_finalisation:'Final Finance review',cost_return:'Actual cost return',in_progress:'In progress'};
const stages={legacy:'Existing project workflow',enquiry:'Enquiry',assessment:'Assessment',quote:'Quote preparation',peer_review:'Technical peer review',client_acceptance:'Client acceptance',finance_clearance:'Finance clearance',work:'Work',customer_signoff:'Client sign-off',finance_finalisation:'Final Finance review',ready_to_close:'Ready to close',closed:'Closed'};
const fundingStatuses={unknown:'Not confirmed',self:'Client funded',person:'Named person funds the work',organisation:'Organisation funded'};
export const auditAction=value=>String(value).startsWith('Project lifecycle: ')?events[String(value).slice(19)]??fieldLabel(String(value).slice(19)):value;
const internal=new Set(['requestId','version','primaryRecordId','primaryReference','primary_record_id']);
export const fieldLabel=key=>labels[key]??String(key).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
export function formatValue(value,key='',resolve=(id)=>id){
 if(value===null||value===undefined||value==='')return 'Not recorded';
 if(typeof value==='boolean')return key==='completed'?(value?'Completed':'Not completed'):value?'Yes':'No';
 if(typeof value==='number')return /Cents$/.test(key)?new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(value/100):key==='quantityMilli'?String(value/1000):/Minutes$/.test(key)?`${Math.round(value/60*100)/100} hours`:String(value);
 if(Array.isArray(value))return value.length?value.map(v=>formatValue(v,key,resolve)).join('; '):'None';
 if(typeof value==='object'){
  if(value.type&&value.id&&Number.isInteger(value.amountCents))return `${resolve(value.id,value.type)} · ${formatValue(value.amountCents,'amountCents')}`;
  return Object.entries(value).filter(([k])=>!internal.has(k)).map(([k,v])=>`${fieldLabel(k)}: ${formatValue(v,k,resolve)}`).join(' · ')||'None';
 }
 if(['stage','target'].includes(key))return stages[value]??fieldLabel(value);
 if(key==='fundingStatus')return fundingStatuses[value]??fieldLabel(value);
 if(['action','type','status'].includes(key)&&events[value])return events[value];
 return /Id(s)?$/.test(key)||['id','approvedBy','ndisApprovedBy'].includes(key)?resolve(String(value),key):String(value);
}
export function auditChanges(changes,resolve){
 // Event actor/time are repeated at the activity header and inside event data.
 const clean=value=>Array.isArray(value)?value.map(clean):value&&typeof value==='object'?Object.fromEntries(Object.entries(value).filter(([key])=>!['actor','at'].includes(key)).map(([key,v])=>[key,clean(v)])):value;
 changes=clean(changes);
 const before=changes?.from??changes?.before,after=changes?.to??changes?.after;
 if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>!internal.has(key)&&JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>({label:fieldLabel(key),value:`${formatValue(before[key],key,resolve)} → ${formatValue(after[key],key,resolve)}`}));
 return Object.entries(changes??{}).filter(([key])=>!internal.has(key)).map(([key,value])=>{
  const change=value&&typeof value==='object'&&!Array.isArray(value)&&(Object.hasOwn(value,'from')||Object.hasOwn(value,'to'));
  return {label:fieldLabel(key),value:change?`${formatValue(value.from,key,resolve)} → ${formatValue(value.to,key,resolve)}`:formatValue(value,key,resolve)};
 });
}

export function auditReferenceIds(value){
 const ids=new Set();
 const visit=(v,key='')=>{if(Array.isArray(v)){for(const item of v)visit(item,key);}else if(v&&typeof v==='object'){for(const[k,item]of Object.entries(v))visit(item,['from','to'].includes(k)?key:k);}else if(typeof v==='string'&&(/Id(s)?$/.test(key)||['id','approvedBy','ndisApprovedBy'].includes(key))&&/^(person|client|organisation|org)-[a-zA-Z0-9-]+$/.test(v))ids.add(v);};
 visit(value);return [...ids];
}
