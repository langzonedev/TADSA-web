// Human-readable values shared by activity history and draft comparisons.
const labels={actualMinutes:'Actual hours',remainingMinutes:'Estimated hours remaining',approvedBy:'Approver',approvedOn:'Approval date',fundingContributors:'Payer contributions',fundingExceptionReason:'Funding context',resumeClientConsent:'Client agreed to resume work',clientStopped:'Client asked work to stop',onHold:'Work is on hold',reviewRequired:'Needs administrator review',assessmentComplete:'Assessment completed',workApproved:'Work approved',feedbackRequired:'Feedback required',invoiceRequired:'Invoice required',completed:'Feedback completed',amountCents:'Amount',totalCents:'Total',payerId:'Payer',personId:'Person',projectId:'Project',event:'Workflow event',before:'Previous values',after:'Saved values'};
const internal=new Set(['requestId','version','primaryRecordId','primaryReference','primary_record_id']);
export const fieldLabel=key=>labels[key]??String(key).replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
export function formatValue(value,key='',resolve=(id)=>id){
 if(value===null||value===undefined||value==='')return 'Not recorded';
 if(typeof value==='boolean')return key==='completed'?(value?'Completed':'Not completed'):value?'Yes':'No';
 if(typeof value==='number')return /Cents$/.test(key)?new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(value/100):/Minutes$/.test(key)?`${Math.round(value/60*100)/100} hours`:String(value);
 if(Array.isArray(value))return value.length?value.map(v=>formatValue(v,key,resolve)).join('; '):'None';
 if(typeof value==='object'){
  if(value.type&&value.id&&Number.isInteger(value.amountCents))return `${resolve(value.id,value.type)} · ${formatValue(value.amountCents,'amountCents')}`;
  return Object.entries(value).filter(([k])=>!internal.has(k)).map(([k,v])=>`${fieldLabel(k)}: ${formatValue(v,k,resolve)}`).join(' · ')||'None';
 }
 return resolve(String(value));
}
export function auditChanges(changes,resolve){
 const before=changes?.from??changes?.before,after=changes?.to??changes?.after;
 if(before&&after&&typeof before==='object'&&typeof after==='object'&&!Array.isArray(before)&&!Array.isArray(after))return [...new Set([...Object.keys(before),...Object.keys(after)])].filter(key=>!internal.has(key)&&JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>({label:fieldLabel(key),value:`${formatValue(before[key],key,resolve)} → ${formatValue(after[key],key,resolve)}`}));
 return Object.entries(changes??{}).filter(([key])=>!internal.has(key)).map(([key,value])=>{
  const change=value&&typeof value==='object'&&!Array.isArray(value)&&(Object.hasOwn(value,'from')||Object.hasOwn(value,'to'));
  return {label:fieldLabel(key),value:change?`${formatValue(value.from,key,resolve)} → ${formatValue(value.to,key,resolve)}`:formatValue(value,key,resolve)};
 });
}
