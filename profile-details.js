import {node,action,link,request,field,editor} from './project-care.js';
import {EQUIPMENT_OPTIONS} from './profile-details-model.js';
const editing=new Set();
const yesNo=[['unknown','Not recorded'],['yes','Yes'],['no','No']];
function summary(parent,entries){const filled=entries.filter(([,value])=>value&&value!=='Not recorded');if(!filled.length){parent.append(node('p','No additional details recorded.','field-help'));return;}const dl=node('dl',null,'detail-list');for(const [label,value]of filled){dl.append(node('dt',label),node('dd',value));}parent.append(dl);}
function input(form,label,d,key,max,type='text'){const control=field(form,label,d,key,type);control.maxLength=max;return control;}
export async function renderProfileDetails(parent,person){
 const id=person.id,[profile,organisations]=await Promise.all([request(`people/${id}/profile-details`),request('organisations')]);
 const orgs=[...organisations.items].sort((a,b)=>a.name.localeCompare(b.name,'en-AU'));
 function section(key,title,renderSummary,renderFields){
  const box=node('section',null,'panel profile-details'),body=node('div'),forms=node('div'),editKey=id+'/'+key;box.append(node('h2',title),body,forms);parent.append(box);renderSummary(body,profile[key]);
  const edit=action('Edit '+title.toLowerCase(),()=>{editing.add(editKey);draw();});body.append(edit);
  function draw(){edit.hidden=editing.has(editKey);forms.hidden=!editing.has(editKey);if(!editing.has(editKey)||forms.children.length)return;
   const entry=editor(forms,'profile-details/'+editKey,{...structuredClone(profile[key]),version:profile.version},null,renderFields,`people/${id}/profile-details`,'PUT',d=>({requestId:d.requestId,version:d.version,section:key,details:Object.fromEntries(Object.keys(profile[key]).map(k=>[k,d[k]]))}),{onSaved:()=>editing.delete(editKey)});
   const save=entry.form.querySelector('button[type=submit]');save.dataset.label='Save '+title.toLowerCase();if(!entry.d.pending)save.textContent=save.dataset.label;
  }draw();
 }
 section('contact','Additional contact details',(body,d)=>{
  summary(body,[['Home phone',d.homePhone],['Work phone',d.workPhone],['Mobile phone',d.mobilePhone],['Preferred phone',d.preferredPhone?d.preferredPhone[0].toUpperCase()+d.preferredPhone.slice(1):''],['Language',d.language],['Contact address',[d.addressLine1,d.addressLine2,d.suburb,d.state,d.postcode].filter(Boolean).join(', ')]]);
  const org=orgs.find(o=>o.id===d.organisationId);if(org)body.append(link('Organisation: '+org.name,'organisation/'+org.id));
 },(form,d)=>{
  form.append(node('p','Optional additional contact information. Existing primary phone and client intake addresses remain unchanged. This address does not change the technician base or project worksite.','field-help'));
  input(form,'Home phone',d,'homePhone',40,'tel');input(form,'Work phone',d,'workPhone',40,'tel');input(form,'Mobile phone',d,'mobilePhone',40,'tel');
  field(form,'Preferred phone',d,'preferredPhone','text',[['','Not recorded'],['home','Home'],['work','Work'],['mobile','Mobile']]);
  input(form,'Language',d,'language',120);field(form,'Organisation affiliation',d,'organisationId','text',[['','No organisation recorded'],...orgs.map(o=>[o.id,o.name])]);
  input(form,'Contact address line 1',d,'addressLine1',250);input(form,'Contact address line 2',d,'addressLine2',250);input(form,'Contact suburb or town',d,'suburb',120);input(form,'Contact state or region',d,'state',80);input(form,'Contact postcode',d,'postcode',20);
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
