import {RESIDENTIAL_FIELDS,AUSTRALIAN_STATES,residentialAddressText} from './client-address.js';
import {attachAddressLookup} from './address-lookup.js';
import {reconcileContactDraft} from './contact-draft.js';
import {fieldLabel,formatValue} from './record-values.js';
import {requestInlineConfirmation} from './inline-confirmation.js';
import {editor,field as careField,action,request as careRequest} from './project-care.js';
const drafts=new Map();
const ndisEditing=new Set();
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export const clientDetailsHasDrafts=()=>[...drafts.values()].some(d=>d.dirty||d.pending);
export const clientNdisIsEditing=id=>ndisEditing.has(id);
export function clientNdisControl(client) {
  const ndis=el('div');ndis.className='client-ndis';ndis.append(el('strong','NDIS participant number'),el('p',client.ndis?.number||'Not recorded'));
  const editNdis=action('Edit NDIS number',()=>{ndisEditing.add(client.id);editNdis.hidden=true;ndisEditor.hidden=false;ndisEditor.querySelector('input')?.focus();});const ndisEditor=el('div');ndisEditor.hidden=!ndisEditing.has(client.id);editNdis.hidden=ndisEditing.has(client.id);ndis.append(editNdis,ndisEditor);
  editor(ndisEditor,'client-ndis/'+client.id,{number:client.ndis?.number||'',version:client.ndis?.version??0},null,(form,d)=>{const input=careField(form,'NDIS participant number',d,'number');input.maxLength=30;input.inputMode='numeric';form.append(el('p','This number is shared across the client’s projects. It does not confirm funding or approval.'));},'clients/'+client.id+'/ndis','PUT',d=>({requestId:d.requestId,version:d.version,number:d.number}),{saveLabel:'Save NDIS number',onSaved:()=>ndisEditing.delete(client.id),reviewLabel:'Keep my reviewed NDIS number',reviewConflict:async d=>{const latest=await careRequest('clients/'+client.id+'/ndis');return {version:latest.version,message:'The saved NDIS number changed. Compare it with your draft before saving.',comparison:[['Latest saved number',latest.number||'Not recorded'],['Your draft',d.number||'Not recorded']]};}});
  return ndis;
}
export function clientHistory(client) {
  const history=el('details');history.className='client-history';history.append(el('summary',`Client history (${client.audit.length})`));
  for(const event of client.audit)history.append(el('p',`${new Date(event.at).toLocaleString()} · ${event.action} · ${event.actor}`));
  return history;
}
export function clientDetailsSummary(client) {
  const box=el('section');box.className='panel workflow-panel client-information';box.append(el('h2','Client information'));
  const d=client.details;box.append(el('p',`${d.reference} · ${d.complete?'Contact and addresses recorded':'Intake details incomplete'}`),clientNdisControl(client));
  box.append(el('p',`Preferred contact: ${d.preferredContact==='representative'?(client.contacts.find(p=>p.personId===d.representativePersonId)?.name||'Representative no longer linked — review required'):'Client'}`));
  if(d.contactNeeds)box.append(el('p',d.contactNeeds));
  const link=el('a','Edit contact preferences');link.className='button secondary';link.href='#client-details/'+client.id;box.append(link,clientHistory(client));return box;
}
export async function renderClientDetails(view,id,host) {
  const client=await host.request('clients/'+id);const current=client.details;
  const previous=drafts.get(id);if(previous&&!previous.dirty&&!previous.pending&&previous.version!==current.version)drafts.delete(id);
  if(!drafts.has(id))drafts.set(id,{...current,name:client.person.name,email:client.person.email,phone:client.person.phone,dirty:false,pending:false});
  const d=reconcileContactDraft(drafts.get(id),client.person);view.append(el('h1','Client contact and addresses'),el('p','Phone, email and name are shared with the person profile. Saving here updates that same contact record. Complete the address and preferred-contact details for intake.'));
  const form=el('form');form.className='panel workflow-panel form-grid';const status=el('div');status.setAttribute('role','status');
  const controls={};
  function field(key,label,max,type='text'){
    const wrap=el('label');wrap.className='workflow-field';wrap.append(el('span',label));const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;
    input.value=d[key]||'';input.maxLength=max;input.setAttribute('aria-label',label);input.addEventListener('input',()=>{d[key]=input.value;d.dirty=true;});wrap.append(input);form.append(wrap);controls[key]=input;
  }
  field('name','Client name',120);controls.name.required=true;field('email','Email',254,'email');field('phone','Phone',40,'tel');
  field('residentialAddress','Residential address',500,'textarea');controls.residentialAddress.required=true;
  const help=el('p','Keep existing address text as recorded. Enter suburb, state and postcode separately when known; these optional fields support search and reports.');help.className='field-help';form.append(help);
  field('residentialSuburb','Residential suburb',100);
  controls.residentialState=select('residentialState','Residential state',[['','Not recorded'],...AUSTRALIAN_STATES.map(state=>[state,state])]);
  field('residentialPostcode','Residential postcode',4);controls.residentialPostcode.inputMode='numeric';controls.residentialPostcode.pattern='[0-9]{4}';
  const same=el('label');const checkbox=el('input');checkbox.type='checkbox';checkbox.checked=d.sameAsResidential;same.append(checkbox,el('span','Work address is the same as residential'));form.append(same);
  field('workAddress','Work address',500,'textarea');
  attachAddressLookup(controls.residentialAddress,{draft:d,geoField:'residentialGeocode',fields:{street:'residentialAddress',suburb:'residentialSuburb',state:'residentialState',postcode:'residentialPostcode',keys:['residentialAddress','residentialSuburb','residentialState','residentialPostcode'],elements:controls}});
  attachAddressLookup(controls.workAddress,{draft:d,geoField:'workGeocode',fields:{street:'workAddress',keys:['workAddress'],elements:controls}});
  const toggle=()=>{controls.workAddress.disabled=d.sameAsResidential;controls.workAddress.required=!d.sameAsResidential;};toggle();
  checkbox.addEventListener('change',()=>{d.sameAsResidential=checkbox.checked;d.workGeocode=null;d.dirty=true;toggle();});
  function select(key,label,items){const l=el('label');l.append(el('span',label));const s=el('select');s.setAttribute('aria-label',label);for(const [value,text]of items){const o=el('option',text);o.value=value;s.append(o);}s.value=d[key]||'';s.addEventListener('change',()=>{d[key]=key==='representativePersonId'?(s.value||null):s.value;d.dirty=true;});l.append(s);form.append(l);return s;}
  const preferred=select('preferredContact','Preferred contact',[['client','Client'],['representative','Linked representative']]);
  const rep=select('representativePersonId','Representative',[['','Choose linked contact'],...client.contacts.map(p=>[p.personId,`${p.name} — ${p.relationshipLabel||p.role}`])]);
  const repToggle=()=>{rep.disabled=d.preferredContact!=='representative';rep.required=!rep.disabled;};repToggle();preferred.addEventListener('change',repToggle);
  field('contactNeeds','Contact needs or preferences',1000,'textarea');form.append(status);
  if(d.version!==current.version){status.append(el('p','Saved details changed. Your draft is retained. Compare current values before retrying.'));const latest=el('dl');latest.className='review-list';const resolve=value=>client.contacts.find(c=>c.personId===value)?.name??value;for(const key of ['name','email','phone','residentialAddress','workAddress','sameAsResidential','preferredContact','representativePersonId','contactNeeds',...RESIDENTIAL_FIELDS]){const saved=['name','email','phone'].includes(key)?client.person[key]:current[key];if(JSON.stringify(saved)===JSON.stringify(d[key]))continue;latest.append(el('dt',fieldLabel(key)),el('dd',`Latest saved: ${formatValue(saved,key,resolve)}. Your draft: ${formatValue(d[key],key,resolve)}.`));}status.append(latest);const accept=el('button','Use latest version with my reviewed draft');accept.type='button';accept.onclick=()=>{d.version=current.version;status.replaceChildren(el('p','Latest version acknowledged. Review and save.'));};status.append(accept);}
  let discarding=false;
  const save=el('button','Save client details');save.type='submit';const cancel=el('button','Discard changes');cancel.type='button';cancel.onclick=async()=>{
    if(discarding||d.pending||host.isSaving?.()||!form.isConnected||drafts.get(id)!==d)return;
    if(d.dirty){discarding=true;const before=JSON.stringify(d),disabled=[...form.elements].map(n=>[n,n.disabled]),current=()=>form.isConnected&&drafts.get(id)===d&&!d.pending&&!host.isSaving?.()&&JSON.stringify(d)===before;for(const[n]of disabled)n.disabled=true;let confirmed=false;
      try{confirmed=await requestInlineConfirmation(cancel,{title:'Discard client details?',message:'Discard unsaved client details? Saved contact and address details will stay unchanged.',confirmLabel:'Discard changes',isCurrent:current});}
      finally{discarding=false;if(form.isConnected&&drafts.get(id)===d&&!d.pending&&!host.isSaving?.()){for(const[n,state]of disabled)n.disabled=state;cancel.focus({preventScroll:true});}}
      if(!confirmed||!current())return;
    }
    drafts.delete(id);location.hash='client/'+id;
  };form.append(save,cancel);view.append(form);
  form.addEventListener('submit',async event=>{event.preventDefault();if(d.pending||discarding)return;d.pending=true;host.setSaving?.(true);const disabled=[...form.elements].map(n=>[n,n.disabled]);for(const[n]of disabled)n.disabled=true;status.replaceChildren(el('p','Saving…'));
    const body=Object.fromEntries(['version','name','email','phone','residentialAddress','workAddress','sameAsResidential','preferredContact','representativePersonId','contactNeeds',...RESIDENTIAL_FIELDS].map(k=>[k,d[k]]));if(d.preferredContact==='client')body.representativePersonId=null;
    body.residentialGeocode=d.residentialGeocode??null;if(!d.sameAsResidential)body.workGeocode=d.workGeocode??null;
    try{await host.request(`clients/${id}/details`,'PUT',body);drafts.delete(id);host.announce?.('Client details saved.');location.hash='client/'+id;}
    catch(error){status.replaceChildren(el('p',error.message||'Save was not confirmed. Your draft is retained.'));if(error.status===409){const reload=el('button','Compare latest saved details');reload.type='button';reload.onclick=()=>{view.replaceChildren();renderClientDetails(view,id,host).catch(e=>status.append(el('p',e.message)));};status.append(reload);}}
    finally{d.pending=false;host.setSaving?.(false);for(const[n,state]of disabled)n.disabled=state;}
  });
}
