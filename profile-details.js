import {node,action,link,request,field,editor} from './project-care.js';
import {attachAddressLookup} from './address-lookup.js';
import {createRecordPicker,selectionLabel} from './record-picker.js';
import {EQUIPMENT_OPTIONS,ALLIED_HEALTH_PROFESSIONS,DIRECTORY_STATUSES,normaliseProfileDetails} from './profile-details-model.js';
const editing=new Set();
const yesNo=[['unknown','Not recorded'],['yes','Yes'],['no','No']];
function summary(parent,entries){const filled=entries.filter(([,value])=>value&&value!=='Not recorded');if(!filled.length){parent.append(node('p','No additional details recorded.','field-help'));return;}const dl=node('dl',null,'detail-list');for(const [label,value]of filled){dl.append(node('dt',label),node('dd',value));}parent.append(dl);}
function input(form,label,d,key,max,type='text'){const control=field(form,label,d,key,type);control.maxLength=max;return control;}
export async function readAffiliation(id,read=request){
 if(!id)return null;
 try{return (await read('selections/organisations/'+encodeURIComponent(id))).item;}
 catch{return {id,name:id+' (details unavailable)',directoryStatus:'current'};}
}
export function bindAffiliationSave(entry,picker){
 const submit=entry.form.onsubmit;let submitting=false;picker.setDisabled(Boolean(entry.d.pending));
 entry.form.onsubmit=async event=>{if(submitting)return;submitting=true;picker.setDisabled(true);try{return await submit(event);}finally{picker.setDisabled(Boolean(entry.d.pending));submitting=false;}};
}
export async function renderProfileDetails(parent,person){
 parent.querySelectorAll('[data-profile-affiliation-picker]').forEach(n=>n.recordPicker?.destroy());
 const id=person.id,profile=await request(`people/${id}/profile-details`);
 Object.assign(profile,normaliseProfileDetails(profile));
 const savedOrganisation=await readAffiliation(profile.contact.organisationId);
 function section(key,title,renderSummary,renderFields){
  const box=node('section',null,'panel profile-details'),body=node('div'),forms=node('div'),editKey=id+'/'+key;box.append(node('h2',title),body,forms);parent.append(box);renderSummary(body,profile[key]);
  const edit=action('Edit '+title.toLowerCase(),()=>{editing.add(editKey);draw();});body.append(edit);
  function draw(){edit.hidden=editing.has(editKey);forms.hidden=!editing.has(editKey);if(!editing.has(editKey)||forms.children.length)return;
   const entry=editor(forms,'profile-details/'+editKey,{...structuredClone(profile[key]),version:profile.version},null,renderFields,`people/${id}/profile-details`,'PUT',d=>({requestId:d.requestId,version:d.version,section:key,details:{...Object.fromEntries(Object.keys(profile[key]).map(k=>[k,d[k]])),...(key==='contact'?{geocode:d.geocode??null}:{})}}),{onSaved:()=>{editing.delete(editKey);forms.querySelectorAll('[data-profile-affiliation-picker]').forEach(n=>n.recordPicker?.destroy());}});
   const picker=entry.form.affiliationPicker;if(picker){bindAffiliationSave(entry,picker);let connected=entry.form.isConnected;const observer=new MutationObserver(()=>{if(entry.form.isConnected)connected=true;else if(connected){picker.destroy();observer.disconnect();}});observer.observe(document.body,{childList:true,subtree:true});}
   const save=entry.form.querySelector('button[type=submit]');save.dataset.label='Save '+title.toLowerCase();if(!entry.d.pending)save.textContent=save.dataset.label;
  }draw();
 }
 section('contact','Additional contact details',(body,d)=>{
  summary(body,[['Home phone',d.homePhone],['Work phone',d.workPhone],['Mobile phone',d.mobilePhone],['Preferred phone',d.preferredPhone?d.preferredPhone[0].toUpperCase()+d.preferredPhone.slice(1):''],['Language',d.language],['Contact address',[d.addressLine1,d.addressLine2,d.suburb,d.state,d.postcode].filter(Boolean).join(', ')],['Organisation',savedOrganisation?selectionLabel(savedOrganisation):'']]);
  if(savedOrganisation)body.append(link('Open affiliated organisation','organisation/'+savedOrganisation.id));
  if(d.alliedHealthProfession)summary(body,[['Allied health profession',d.alliedHealthProfession==='other'?d.alliedHealthProfessionOther:ALLIED_HEALTH_PROFESSIONS.find(([key])=>key===d.alliedHealthProfession)?.[1]]]);
  summary(body,[['Record status',DIRECTORY_STATUSES.find(([key])=>key===d.directoryStatus)?.[1]]]);
 },(form,d)=>{
  form.append(node('p','Optional additional contact information. Existing primary phone and client intake addresses remain unchanged. This address does not change the technician base or project worksite.','field-help'));
  input(form,'Home phone',d,'homePhone',40,'tel');input(form,'Work phone',d,'workPhone',40,'tel');input(form,'Mobile phone',d,'mobilePhone',40,'tel');
  field(form,'Preferred phone',d,'preferredPhone','text',[['','Not recorded'],['home','Home'],['work','Work'],['mobile','Mobile']]);
  input(form,'Language',d,'language',120);const affiliation=createRecordPicker({label:'Organisation affiliation',kind:'organisations',selectedId:d.organisationId,onChange:id=>{d.organisationId=id;}});affiliation.element.setAttribute('data-profile-affiliation-picker','true');affiliation.element.recordPicker=affiliation;form.affiliationPicker=affiliation;form.append(affiliation.element);
  const profession=field(form,'Allied health profession',d,'alliedHealthProfession','text',ALLIED_HEALTH_PROFESSIONS),other=input(form,'Other allied health profession',d,'alliedHealthProfessionOther',120);
  const updateProfession=()=>{other.parentElement.hidden=d.alliedHealthProfession!=='other';other.required=d.alliedHealthProfession==='other';if(d.alliedHealthProfession!=='other'){d.alliedHealthProfessionOther='';other.value='';}};profession.addEventListener('change',updateProfession);updateProfession();
  form.append(node('p','Record a profession when relevant. This does not grant a role or application access.','field-help'));
  field(form,'Record status',d,'directoryStatus','text',DIRECTORY_STATUSES);
  form.append(node('p','Inactive records remain available in history and search. Choose Current when the person returns. Needs review marks information to check; it does not merge or delete records. This status does not change sign-in accounts or permissions.','field-help'));
  const elements={addressLine1:input(form,'Contact address line 1',d,'addressLine1',250),addressLine2:input(form,'Contact address line 2',d,'addressLine2',250),suburb:input(form,'Contact suburb or town',d,'suburb',120),state:input(form,'Contact state or region',d,'state',80),postcode:input(form,'Contact postcode',d,'postcode',20)};
  attachAddressLookup(elements.addressLine1,{draft:d,geoField:'geocode',fields:{street:'addressLine1',suburb:'suburb',state:'state',postcode:'postcode',keys:['addressLine1','addressLine2','suburb','state','postcode'],elements}});
 });
 if(person.technician||(person.roles??[person.role]).includes('Technician'))section('capabilities','Technician capabilities',(body,d)=>{
  summary(body,[['Visits clients',yesNo.find(x=>x[0]===d.visitClients)?.[1]],['Drives',yesNo.find(x=>x[0]===d.drives)?.[1]],['Vehicle details',d.vehicle],['Work interests and preferences',d.interests],['Equipment available',d.equipment.join(', ')],['Equipment details',d.equipmentNotes]]);
 },(form,d)=>{
  form.append(node('p','These details support discussion when assigning work. They do not establish qualifications, equipment ownership or availability for a particular job.','field-help'));
  field(form,'Visits clients',d,'visitClients','text',yesNo);field(form,'Drives',d,'drives','text',yesNo);input(form,'Vehicle details',d,'vehicle',200);input(form,'Work interests and preferences',d,'interests',1000,'textarea');
  const equipment=node('fieldset');equipment.append(node('legend','Equipment available'));for(const label of EQUIPMENT_OPTIONS){const check=field(equipment,label,{checked:d.equipment.includes(label)},'checked','checkbox');check.addEventListener('change',()=>{d.equipment=check.checked?[...d.equipment,label]:d.equipment.filter(x=>x!==label);});}form.append(equipment);
  input(form,'Other equipment and access details',d,'equipmentNotes',1000,'textarea');
 });
}
