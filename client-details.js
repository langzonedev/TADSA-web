const drafts=new Map();
const el=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export const clientDetailsHasDrafts=()=>[...drafts.values()].some(d=>d.dirty||d.pending);
export function clientDetailsSummary(client) {
  const box=el('section');box.className='panel workflow-panel';box.append(el('h2','Client details'));
  const d=client.details;box.append(el('p',`${d.reference} · ${d.complete?'Contact and addresses recorded':'Intake details incomplete'}`));
  box.append(el('p','NDIS number: '+(client.ndis?.number||'Not recorded')));
  box.append(el('p',`Residential: ${d.residentialAddress||'Not recorded'}`),el('p',`Work: ${d.sameAsResidential?d.residentialAddress||'Not recorded':d.workAddress||'Not recorded'}`));
  box.append(el('p',`Preferred contact: ${d.preferredContact==='representative'?(client.contacts.find(p=>p.personId===d.representativePersonId)?.name||'Representative no longer linked — review required'):'Client'}`));
  if(d.contactNeeds)box.append(el('p',d.contactNeeds));
  const link=el('a','Edit client details');link.href='#client-details/'+client.id;box.append(link);
  const history=el('details');history.append(el('summary',`Client history (${client.audit.length})`));
  for(const event of client.audit)history.append(el('p',`${new Date(event.at).toLocaleString()} · ${event.action} · ${event.actor}`));
  box.append(history);return box;
}
export async function renderClientDetails(view,id,host) {
  const client=await host.request('clients/'+id);const current=client.details;
  if(!drafts.has(id))drafts.set(id,{...current,dirty:false,pending:false});
  const d=drafts.get(id);view.append(el('h1','Client contact and addresses'),el('p','Required intake details. Existing records remain incomplete until these details are supplied.'));
  const form=el('form');form.className='panel workflow-panel form-grid';const status=el('div');status.setAttribute('role','status');
  const controls={};
  function field(key,label,max,type='text'){
    const wrap=el('label');wrap.className='workflow-field';wrap.append(el('span',label));const input=el(type==='textarea'?'textarea':'input');if(type!=='textarea')input.type=type;
    input.value=d[key]||'';input.maxLength=max;input.setAttribute('aria-label',label);input.addEventListener('input',()=>{d[key]=input.value;d.dirty=true;});wrap.append(input);form.append(wrap);controls[key]=input;
  }
  field('name','Client name',120);controls.name.required=true;field('email','Email',254,'email');field('phone','Phone',40,'tel');
  field('residentialAddress','Residential address',500,'textarea');controls.residentialAddress.required=true;
  const same=el('label');const checkbox=el('input');checkbox.type='checkbox';checkbox.checked=d.sameAsResidential;same.append(checkbox,el('span','Work address is the same as residential'));form.append(same);
  field('workAddress','Work address',500,'textarea');
  const toggle=()=>{controls.workAddress.disabled=d.sameAsResidential;controls.workAddress.required=!d.sameAsResidential;};toggle();
  checkbox.addEventListener('change',()=>{d.sameAsResidential=checkbox.checked;d.dirty=true;toggle();});
  function select(key,label,items){const l=el('label');l.append(el('span',label));const s=el('select');s.setAttribute('aria-label',label);for(const [value,text]of items){const o=el('option',text);o.value=value;s.append(o);}s.value=d[key]||'';s.addEventListener('change',()=>{d[key]=s.value||null;d.dirty=true;});l.append(s);form.append(l);return s;}
  const preferred=select('preferredContact','Preferred contact',[['client','Client'],['representative','Linked representative']]);
  const rep=select('representativePersonId','Representative',[['','Choose linked contact'],...client.contacts.map(p=>[p.personId,`${p.name} — ${p.role}`])]);
  const repToggle=()=>{rep.disabled=d.preferredContact!=='representative';rep.required=!rep.disabled;};repToggle();preferred.addEventListener('change',repToggle);
  field('contactNeeds','Contact needs or preferences',1000,'textarea');form.append(status);
  if(d.version!==current.version){status.append(el('p','Saved details changed. Your draft is retained. Compare current values before retrying.'));const latest=el('pre',JSON.stringify(current,null,2));status.append(latest);const accept=el('button','Use latest version with my reviewed draft');accept.type='button';accept.onclick=()=>{d.version=current.version;status.replaceChildren(el('p','Latest version acknowledged. Review and save.'));};status.append(accept);}
  const save=el('button','Save client details');save.type='submit';const cancel=el('button','Discard changes');cancel.type='button';cancel.onclick=()=>{if(d.pending)return;if(d.dirty&&!window.confirm('Discard unsaved client details?'))return;drafts.delete(id);location.hash='client/'+id;};form.append(save,cancel);view.append(form);
  form.addEventListener('submit',async event=>{event.preventDefault();if(d.pending)return;d.pending=true;host.setSaving?.(true);const disabled=[...form.elements].map(n=>[n,n.disabled]);for(const[n]of disabled)n.disabled=true;status.replaceChildren(el('p','Saving…'));
    const body=Object.fromEntries(['version','name','email','phone','residentialAddress','workAddress','sameAsResidential','preferredContact','representativePersonId','contactNeeds'].map(k=>[k,d[k]]));if(d.preferredContact==='client')body.representativePersonId=null;
    try{await host.request(`clients/${id}/details`,'PUT',body);drafts.delete(id);host.announce?.('Client details saved.');location.hash='client/'+id;}
    catch(error){status.replaceChildren(el('p',error.message||'Save was not confirmed. Your draft is retained.'));if(error.status===409){const reload=el('button','Compare latest saved details');reload.type='button';reload.onclick=()=>{view.replaceChildren();renderClientDetails(view,id,host).catch(e=>status.append(el('p',e.message)));};status.append(reload);}}
    finally{d.pending=false;host.setSaving?.(false);for(const[n,state]of disabled)n.disabled=state;}
  });
}
