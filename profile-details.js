import {node,action,link,request,field,editor} from './project-care.js';
import {attachAddressLookup} from './address-lookup.js';
import {createRecordPicker} from './record-picker.js';
import {residentialAddressText} from './client-address.js';
import {clientNdisControl,clientNdisIsEditing,clientHistory} from './client-details.js';
import {EQUIPMENT_OPTIONS,ALLIED_HEALTH_PROFESSIONS,DIRECTORY_STATUSES,normaliseProfileDetails} from './profile-details-model.js';
const editing=new Set();
const yesNo=[['unknown','Not recorded'],['yes','Yes'],['no','No']];
function summary(parent,entries){const filled=entries.filter(([,value])=>value&&value!=='Not recorded');if(!filled.length){parent.append(node('p','No additional details recorded.','field-help'));return;}const dl=node('dl',null,'detail-list');for(const [label,value]of filled){dl.append(node('dt',label),node('dd',value));}parent.append(dl);}
function input(form,label,d,key,max,type='text'){const control=field(form,label,d,key,type);control.maxLength=max;return control;}
const phoneIdentity=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.length>=5?digits:String(value||'').trim().toLowerCase();};
const normal=value=>String(value||'').replace(/[\s,]+/g,' ').trim().toLowerCase();
const displayDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?new Intl.DateTimeFormat('en-AU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value+'T12:00:00')):value||'Not recorded';
export function contactOverviewValues(person,profile,client=null){
 const d=profile.contact,phones=new Map(),addresses=new Map();
 for(const [label,value]of [['Primary phone',person.phone],['Home phone',d.homePhone],['Work phone',d.workPhone],['Mobile phone',d.mobilePhone]]){if(!value)continue;const key=phoneIdentity(value);if(phones.has(key))phones.get(key)[0]+=' / '+label.toLowerCase();else phones.set(key,[label,value]);}
 const addAddress=(label,value)=>{if(!value)return;const key=normal(value);if(addresses.has(key))addresses.get(key)[0]+=' / '+label.toLowerCase();else addresses.set(key,[label,value]);};
 addAddress('Contact address',[d.addressLine1,d.addressLine2,d.suburb,d.state,d.postcode].filter(Boolean).join(', '));
 if(client){const c=client.details,suffix=[c.residentialSuburb,c.residentialState,c.residentialPostcode].filter(Boolean).join(' '),residential=suffix&&normal(c.residentialAddress).endsWith(' '+normal(suffix))?c.residentialAddress:residentialAddressText(c);addAddress('Residential address',residential);if(!c.sameAsResidential)addAddress('Work address',c.workAddress);}
 const preferred=d.preferredPhone&&d[d.preferredPhone+'Phone'],phone=preferred||person.phone||d.mobilePhone||d.homePhone||d.workPhone||'',primaryAddress=[...addresses.values()][0],phoneKey=phoneIdentity(phone);
 const contact=[['Email',person.email||'Not recorded'],[primaryAddress?.[0]||'Address',primaryAddress?.[1]||'Not recorded'],[preferred?'Phone ('+d.preferredPhone+')':'Phone',phone||'Not recorded']];
 const personal=[['Disability',d.disability||'Not recorded'],['Additional comments',d.additionalComments||'Not recorded'],['Language',d.language||'Not recorded'],...(client?[['NDIS participant number',client.ndis?.number||'Not recorded']]:[]),['Date of birth',displayDate(d.dateOfBirth)]];
 if(client?.details.contactNeeds)personal.push(['Contact needs or preferences',client.details.contactNeeds]);
 if(client?.details.preferredContact==='representative')personal.push(['Preferred contact',client.contacts.find(p=>p.personId===client.details.representativePersonId)?.name||'Representative no longer linked — review required']);
 const other=[...[...phones.values()].filter(([,value])=>phoneIdentity(value)!==phoneKey),...[...addresses.values()].slice(1),...(client?.details.sameAsResidential?[['Work address','Same as residential address']]:[])];
 return {contact,personal,other};
}
export async function readAffiliation(id,read=request){
 if(!id)return null;
 try{return (await read('selections/organisations/'+encodeURIComponent(id))).item;}
 catch{return {id,name:id+' (details unavailable)',directoryStatus:'current'};}
}
export function bindAffiliationSave(entry,picker){
 const submit=entry.form.onsubmit;let submitting=false;picker.setDisabled(Boolean(entry.d.pending));
 entry.form.onsubmit=async event=>{if(submitting)return;submitting=true;picker.setDisabled(true);try{return await submit(event);}finally{picker.setDisabled(Boolean(entry.d.pending));submitting=false;}};
}
export async function renderProfileDetails(parent,person,{client=null}={}){
 parent.querySelectorAll('[data-profile-affiliation-picker]').forEach(n=>n.recordPicker?.destroy());
 const id=person.id,profile=await request(`people/${id}/profile-details`);
 Object.assign(profile,normaliseProfileDetails(profile));
 const savedOrganisation=await readAffiliation(profile.contact.organisationId);
 function section(key,title,renderSummary,renderFields,editLabel='Edit '+title.toLowerCase()){
  const box=node('section',null,'panel profile-details'),body=node('div'),forms=node('div'),editKey=id+'/'+key;box.append(node('h2',title),body,forms);parent.append(box);renderSummary(body,profile[key]);
  const edit=action(editLabel,()=>{editing.add(editKey);draw();});body.append(edit);
  function draw(){edit.hidden=editing.has(editKey);forms.hidden=!editing.has(editKey);if(!editing.has(editKey)||forms.children.length)return;
   const entry=profileEditor(forms,key,renderFields,title);prepareEditor(entry,forms);
  }draw();
 }
 function profileEditor(forms,key,renderFields,title){
  const editKey=id+'/'+key;
  const entry=editor(forms,'profile-details/'+editKey,{...structuredClone(profile[key]),version:profile.version},null,renderFields,`people/${id}/profile-details`,'PUT',d=>({requestId:d.requestId,version:d.version,section:key,details:{...Object.fromEntries(Object.keys(profile[key]).map(k=>[k,d[k]])),...(key==='contact'?{geocode:d.geocode??null}:{})}}),{onSaved:()=>{editing.delete(editKey);forms.querySelectorAll('[data-profile-affiliation-picker]').forEach(n=>n.recordPicker?.destroy());}});
  const save=entry.form.querySelector('button[type=submit]');save.dataset.label='Save '+title.toLowerCase();if(!entry.d.pending)save.textContent=save.dataset.label;return entry;
 }
 function prepareEditor(entry,forms){
  const picker=entry.form.affiliationPicker;if(picker){bindAffiliationSave(entry,picker);let connected=entry.form.isConnected;const observer=new MutationObserver(()=>{if(entry.form.isConnected)connected=true;else if(connected){picker.destroy();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});}
 }
 const box=node('section',null,'panel profile-details contact-overview'),overview=node('div');overview.className='contact-overview-grid';box.append(node('h2','Contact details'),overview);parent.append(box);
 const values=contactOverviewValues(person,profile,client);
 for(const entries of [values.contact,values.personal]){const dl=node('dl',null,'contact-overview-values');for(const [label,value]of entries)dl.append(node('dt',label),node('dd',value));overview.append(dl);}
 if(savedOrganisation){const affiliation=node('div',null,'contact-affiliation');affiliation.append(node('strong','Organisation'),link(savedOrganisation.name,'organisation/'+savedOrganisation.id));box.append(affiliation);}
 if(profile.contact.alliedHealthProfession)summary(box,[['Allied health profession',profile.contact.alliedHealthProfession==='other'?profile.contact.alliedHealthProfessionOther:ALLIED_HEALTH_PROFESSIONS.find(([key])=>key===profile.contact.alliedHealthProfession)?.[1]]]);
 if(values.other.length){const other=node('details',null,'contact-other-details');other.append(node('summary','Other phone numbers and addresses'));summary(other,values.other);box.append(other);}
 const editKey=id+'/contact',editArea=node('div',null,'contact-editor-area');editArea.id='contact-editor-'+id;
 const edit=action('Edit contact details',()=>{if(editing.has(editKey)){editing.delete(editKey);editArea.hidden=true;edit.setAttribute('aria-expanded','false');}else{editing.add(editKey);drawContactEditor();}});edit.classList.add('contact-editor-toggle');edit.setAttribute('aria-controls',editArea.id);box.append(edit,editArea);
 function drawContactEditor(){
  const open=editing.has(editKey)||client&&clientNdisIsEditing(client.id);editArea.hidden=!open;edit.setAttribute('aria-expanded',String(Boolean(open)));if(!open||editArea.children.length)return;
  editArea.append(node('h3','Edit contact details'),node('p','Use the section for the details you want to change. Each section saves to the same person record.','field-help'));
  const actions=node('div',null,'contact-edit-actions');actions.append(link('Edit profile & roles','edit-person/'+person.id));if(client)actions.append(link('Edit contact, addresses & preferences','client-details/'+client.id));editArea.append(actions);
  editArea.append(node('h3','Other contact information'),node('p','Phones, language, personal details, contact address and record status.','field-help'));
  const forms=node('div');editArea.append(forms);prepareEditor(profileEditor(forms,'contact',contactFields,'Contact information'),forms);
  if(client)editArea.append(clientNdisControl(client));
 }
 function contactFields(form,d){
  form.append(node('p','The primary name, email and phone are edited using Edit profile & roles above. Client residential and work addresses are edited using Edit contact, addresses & preferences. The contact address below is a separate recorded contact location.','field-help'));
  input(form,'Home phone',d,'homePhone',40,'tel');input(form,'Work phone',d,'workPhone',40,'tel');input(form,'Mobile phone',d,'mobilePhone',40,'tel');
  field(form,'Preferred phone',d,'preferredPhone','text',[['','Not recorded'],['home','Home'],['work','Work'],['mobile','Mobile']]);
  input(form,'Disability',d,'disability',1000,'textarea');input(form,'Additional comments',d,'additionalComments',2000,'textarea');input(form,'Language',d,'language',120);input(form,'Date of birth',d,'dateOfBirth',10,'date');
  const affiliation=createRecordPicker({label:'Organisation affiliation',kind:'organisations',selectedId:d.organisationId,onChange:id=>{d.organisationId=id;}});affiliation.element.setAttribute('data-profile-affiliation-picker','true');affiliation.element.recordPicker=affiliation;form.affiliationPicker=affiliation;form.append(affiliation.element);
  const profession=field(form,'Allied health profession',d,'alliedHealthProfession','text',ALLIED_HEALTH_PROFESSIONS),other=input(form,'Other allied health profession',d,'alliedHealthProfessionOther',120);
  const updateProfession=()=>{other.parentElement.hidden=d.alliedHealthProfession!=='other';other.required=d.alliedHealthProfession==='other';if(d.alliedHealthProfession!=='other'){d.alliedHealthProfessionOther='';other.value='';}};profession.addEventListener('change',updateProfession);updateProfession();
  form.append(node('p','Record a profession when relevant. This does not grant a role or application access.','field-help'));
  field(form,'Record status',d,'directoryStatus','text',DIRECTORY_STATUSES);
  form.append(node('p','Inactive records remain available in history and search. Choose Current when the person returns. Needs review marks information to check; it does not merge or delete records. This status does not change sign-in accounts or permissions.','field-help'));
  const elements={addressLine1:input(form,'Contact address line 1',d,'addressLine1',250),addressLine2:input(form,'Contact address line 2',d,'addressLine2',250),suburb:input(form,'Contact suburb or town',d,'suburb',120),state:input(form,'Contact state or region',d,'state',80),postcode:input(form,'Contact postcode',d,'postcode',20)};
  attachAddressLookup(elements.addressLine1,{draft:d,geoField:'geocode',fields:{street:'addressLine1',suburb:'suburb',state:'state',postcode:'postcode',keys:['addressLine1','addressLine2','suburb','state','postcode'],elements}});
 }
 drawContactEditor();if(client)box.append(clientHistory(client));
 if(person.technician||(person.roles??[person.role]).includes('Technician'))section('capabilities','Technician capabilities',(body,d)=>{
  summary(body,[['Visits clients',yesNo.find(x=>x[0]===d.visitClients)?.[1]],['Drives',yesNo.find(x=>x[0]===d.drives)?.[1]],['Vehicle details',d.vehicle],['Work interests and preferences',d.interests],['Equipment available',d.equipment.join(', ')],['Equipment details',d.equipmentNotes]]);
 },(form,d)=>{
  form.append(node('p','These details support discussion when assigning work. They do not establish qualifications, equipment ownership or availability for a particular job.','field-help'));
  field(form,'Visits clients',d,'visitClients','text',yesNo);field(form,'Drives',d,'drives','text',yesNo);input(form,'Vehicle details',d,'vehicle',200);input(form,'Work interests and preferences',d,'interests',1000,'textarea');
  const equipment=node('fieldset');equipment.append(node('legend','Equipment available'));for(const label of EQUIPMENT_OPTIONS){const check=field(equipment,label,{checked:d.equipment.includes(label)},'checked','checkbox');check.addEventListener('change',()=>{d.equipment=check.checked?[...d.equipment,label]:d.equipment.filter(x=>x!==label);});}form.append(equipment);
  input(form,'Other equipment and access details',d,'equipmentNotes',1000,'textarea');
 });
 return {profile};
}
