import {node,action,link,request,field,editor} from './project-care.js';
import {attachAddressLookup} from './address-lookup.js';
import {createRecordPicker} from './record-picker.js';
import {AUSTRALIAN_STATES,RESIDENTIAL_FIELDS,residentialAddressText} from './client-address.js';
import {clientNdisControl,clientNdisIsEditing,clientHistory,savedContactAddressOption} from './client-details.js';
import {EQUIPMENT_OPTIONS,ALLIED_HEALTH_PROFESSIONS,DIRECTORY_STATUSES,normaliseProfileDetails,profileContactPhone} from './profile-details-model.js';
const editing=new Set();
const yesNo=[['unknown','Not recorded'],['yes','Yes'],['no','No']];
function summary(parent,entries){const filled=entries.filter(([,value])=>value&&value!=='Not recorded');if(!filled.length){parent.append(node('p','No additional details recorded.','field-help'));return;}const dl=node('dl',null,'detail-list');for(const [label,value]of filled){dl.append(node('dt',label),node('dd',value));}parent.append(dl);}
function input(form,label,d,key,max,type='text'){const control=field(form,label,d,key,type);control.maxLength=max;return control;}
const phoneIdentity=value=>{const digits=String(value||'').replace(/\D/g,'');return digits.length>=5?digits:String(value||'').trim().toLowerCase();};
const normal=value=>String(value||'').replace(/[\s,]+/g,' ').trim().toLowerCase();
const displayDate=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?new Intl.DateTimeFormat('en-AU',{day:'2-digit',month:'2-digit',year:'numeric'}).format(new Date(value+'T12:00:00')):value||'Not recorded';
const hasRole=(person,role)=>(person.roles??[person.role]).includes(role);
const alliedHealth=person=>hasRole(person,'Occupational therapist')||hasRole(person,'Allied-health contact');
const phoneChannels=['home','work','mobile'];
const clientFields=['residentialAddress',...RESIDENTIAL_FIELDS,'workAddress','sameAsResidential','preferredContact','representativePersonId','contactNeeds'];
function contactRecordValues(person,profile,client){
 const contact=profile.contact;
 const primaryChannel=phoneChannels.find(key=>person.phone&&phoneIdentity(contact[key+'Phone'])===phoneIdentity(person.phone))??'';
 const values={...structuredClone(contact),geocode:contact.geocode??null,name:person.name,email:person.email,phone:person.phone,primaryChannel};
 if(client)for(const key of [...clientFields,'residentialGeocode','workGeocode'])values[key]=client.details[key];
 return values;
}
function contactRecordEditor(forms,person,profile,client,draw,onSaved){
 const contact=profile.contact,baseline=contactRecordValues(person,profile,client);
 const initial={...structuredClone(baseline),baseline,version:profile.version,personVersion:person.version,allowDuplicate:false};
 return editor(forms,'profile-details/'+person.id+'/contact',initial,null,draw,'people/'+person.id+'/profile-details','PUT',d=>{
  let phone=d.primaryChannel?d[d.primaryChannel+'Phone']:d.phone;
  // Populate the directory phone on first entry. Historical alternate numbers
  // stay separate when someone is only editing a name, address or comments.
  if(!phone&&!d.baseline.phone&&phoneChannels.every(key=>!d.baseline[key+'Phone'])){
   phone=profileContactPhone('',d).number;
  }
  const identity={version:d.personVersion,name:d.name,email:d.email,phone,allowDuplicate:d.allowDuplicate};
  const details={...Object.fromEntries(Object.keys(contact).map(k=>[k,d[k]])),geocode:d.geocode??null};
  const address=client?{...Object.fromEntries(clientFields.map(k=>[k,d[k]])),representativePersonId:d.preferredContact==='client'?null:d.representativePersonId,residentialGeocode:d.residentialGeocode??null,...(!d.sameAsResidential?{workGeocode:d.workGeocode??null}:{})}:null;
  return {requestId:d.requestId,version:d.version,section:'contact',details,identity,client:address};
 },{saveLabel:'Save contact details',onSaved,onDuplicate:(draft)=>{draft.allowDuplicate=true;},
  reviewLabel:'Keep my reviewed contact changes',
  async reviewConflict(d){
   const latestPerson=await request('people/'+person.id);
   const [p,c]=await Promise.all([request('people/'+person.id+'/profile-details'),latestPerson.clientId?request('clients/'+latestPerson.clientId):null]);
   const saved=contactRecordValues(latestPerson,p,c),merged=structuredClone(saved),comparison=[];
   const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
   for(const [key,old] of Object.entries(d.baseline)){
    if(!Object.hasOwn(saved,key)||same(old,d[key]))continue;
    merged[key]=d[key];
    if(!same(old,saved[key])&&!same(d[key],saved[key])&&!key.endsWith('Geocode')&&key!=='geocode'){
     const label=key.replace(/([A-Z])/g,' $1').toLowerCase();comparison.push([label,'Saved: '+(saved[key]||'Not recorded')+' · Your change: '+(d[key]||'Not recorded')]);
    }
   }
   return {version:p.version,personVersion:latestPerson.version,baseline:saved,merged,comparison,message:'This person changed. Review your entries before saving again. Fields you did not edit will use the latest saved values.'};
  },
  onAcceptReview(d,review){Object.assign(d,review.merged,{personVersion:review.personVersion,baseline:review.baseline,allowDuplicate:false});}
 });
}
function phoneFields(form,d){
 const group=node('fieldset',null,'contact-phone-fields');group.append(node('legend','Phone numbers'));form.append(group);
 const general=node('div');input(general,'Primary phone',d,'phone',40,'tel');
 general.hidden=Boolean(d.primaryChannel);group.append(general);
 const row=node('div',null,'contact-phone-row'),inputs={};group.append(row);
 function preference(parent,key,label){
  const wrap=node('label',null,'contact-phone-preference'),option=node('input');
  option.type='radio';option.name='contact-phone-preference';option.value=key;option.checked=d.preferredPhone===key;
  option.setAttribute('aria-label',key?'Prefer '+key+' phone':'No preferred phone');
  option.addEventListener('change',()=>{if(option.checked)d.preferredPhone=key;});wrap.append(option,node('span',label));parent.append(wrap);
 }
 for(const key of phoneChannels){
  const cell=node('div');row.append(cell);const name=key[0].toUpperCase()+key.slice(1)+' phone';
  inputs[key]=input(cell,name,d,key+'Phone',40,'tel');preference(cell,key,'Preferred');
 }
 preference(group,'','No preference');
 if(!d.primaryChannel){
  const pick=node('select');pick.setAttribute('aria-label','Identify primary phone type');
  const choices=()=>{pick.replaceChildren(new Option('Identify primary phone type…',''));for(const key of phoneChannels)if(!d[key+'Phone'])pick.add(new Option(key[0].toUpperCase()+key.slice(1),key));pick.hidden=!d.phone||pick.options.length===1;};
  choices();general.append(pick);group.addEventListener('input',event=>{if(event.target.type==='tel')choices();});
  pick.addEventListener('change',()=>{const key=pick.value;if(!phoneChannels.includes(key)||d[key+'Phone']||!d.phone)return;
   d.primaryChannel=key;d[key+'Phone']=d.phone;inputs[key].value=d.phone;general.hidden=true;inputs[key].focus();
  });
 }
}
function clientContactFields(form,d,client){
 const group=node('fieldset',null,'contact-address-fields');group.append(node('legend','Addresses and contact preferences'));form.append(group);
 const elements={};elements.residentialAddress=input(group,'Residential street address',d,'residentialAddress',500);
 const locality=node('div',null,'contact-locality-row');group.append(locality);
 elements.residentialSuburb=input(locality,'Residential suburb or town',d,'residentialSuburb',100);
 elements.residentialState=field(locality,'Residential state or territory',d,'residentialState','text',[['','Not recorded'],...AUSTRALIAN_STATES.map(s=>[s,s])]);
 elements.residentialPostcode=input(locality,'Residential postcode',d,'residentialPostcode',4);elements.residentialPostcode.pattern='[0-9]{4}';elements.residentialPostcode.inputMode='numeric';
 attachAddressLookup(elements.residentialAddress,{draft:d,geoField:'residentialGeocode',fields:{street:'residentialAddress',suburb:'residentialSuburb',state:'residentialState',postcode:'residentialPostcode',keys:['residentialAddress',...RESIDENTIAL_FIELDS],elements}});
 savedContactAddressOption(group,d,elements,d.baseline);
 const same=field(group,'TADSA work takes place at the residential address',d,'sameAsResidential','checkbox');
 const workGroup=node('div');group.append(workGroup);
 const work=input(workGroup,'TADSA work address',d,'workAddress',500);workGroup.append(node('p','Where TADSA will carry out the work.','field-help'));
 attachAddressLookup(work,{draft:d,geoField:'workGeocode',fields:{street:'workAddress',keys:['workAddress'],elements:{workAddress:work}}});
 const toggle=()=>{workGroup.hidden=d.sameAsResidential;work.required=!d.sameAsResidential;};same.addEventListener('change',toggle);toggle();
 const preferred=field(group,'Preferred contact',d,'preferredContact','text',[['client','Client'],['representative','Linked representative']]);
 const rep=field(group,'Representative',d,'representativePersonId','text',[['','Choose linked contact'],...client.contacts.map(c=>[c.personId,c.name+' · '+(c.relationshipLabel||c.role)])]);
 const show=()=>{rep.closest('label').hidden=d.preferredContact!=='representative';rep.required=d.preferredContact==='representative';};
 preferred.addEventListener('change',show);show();input(group,'Contact needs or preferences',d,'contactNeeds',1000,'textarea');
}
export function contactOverviewValues(person,profile,client=null){
 const d=profile.contact,phones=new Map(),addresses=new Map();
 for(const [label,value]of [['Primary phone',person.phone],['Home phone',d.homePhone],['Work phone',d.workPhone],['Mobile phone',d.mobilePhone]]){if(!value)continue;const key=phoneIdentity(value);if(phones.has(key))phones.get(key)[0]+=' / '+label.toLowerCase();else phones.set(key,[label,value]);}
 const addAddress=(label,value)=>{if(!value)return;const key=normal(value);if(addresses.has(key))addresses.get(key)[0]+=' / '+label.toLowerCase();else addresses.set(key,[label,value]);};
 addAddress('Contact address',[d.addressLine1,d.addressLine2,d.suburb,d.state,d.postcode].filter(Boolean).join(', '));
 if(client){const c=client.details,suffix=[c.residentialSuburb,c.residentialState,c.residentialPostcode].filter(Boolean).join(' '),residential=suffix&&normal(c.residentialAddress).endsWith(' '+normal(suffix))?c.residentialAddress:residentialAddressText(c);addAddress('Residential address',residential);if(!c.sameAsResidential)addAddress('TADSA work address',c.workAddress);}
 const {number:phone,preferredChannel}=profileContactPhone(person.phone,d),primaryAddress=[...addresses.values()][0],phoneKey=phoneIdentity(phone);
 const contact=[['Email',person.email||'Not recorded'],[primaryAddress?.[0]||'Address',primaryAddress?.[1]||'Not recorded'],[preferredChannel?'Phone ('+preferredChannel+')':'Phone',phone||'Not recorded']];
 const personal=[...(client||hasRole(person,'Client')||d.disability?[['Disability',d.disability||'Not recorded']]:[]),['Additional comments',d.additionalComments||'Not recorded'],['Language',d.language||'Not recorded'],...(client?[['NDIS participant number',client.ndis?.number||'Not recorded']]:[]),['Date of birth',displayDate(d.dateOfBirth)]];
 if(client?.details.contactNeeds)personal.push(['Contact needs or preferences',client.details.contactNeeds]);
 if(client?.details.preferredContact==='representative')personal.push(['Preferred contact',client.contacts.find(p=>p.personId===client.details.representativePersonId)?.name||'Representative no longer linked — review required']);
 const other=[...[...phones.values()].filter(([,value])=>phoneIdentity(value)!==phoneKey),...[...addresses.values()].slice(1),...(client?.details.sameAsResidential?[['TADSA work address','Same as residential address']]:[])];
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
 const alternatePhones=values.other.filter(([label])=>/phone/i.test(label));
 for(const entries of [values.contact,values.personal]){
  const dl=node('dl',null,'contact-overview-values');
  for(const [label,value]of entries){
   const dd=node('dd',value);
   if(entries===values.contact&&/^Phone/.test(label)&&alternatePhones.length){
    dd.replaceChildren();dd.className='contact-phone-values';
    for(const [kind,number] of [[label,value],...alternatePhones]){
     const item=node('span');item.append(node('strong',kind==='Phone'?'Primary':kind),node('span',number));dd.append(item);
    }
   }
   dl.append(node('dt',label),dd);
  }
  overview.append(dl);
 }
 if(savedOrganisation){const affiliation=node('div',null,'contact-affiliation');affiliation.append(node('strong','Organisation'),link(savedOrganisation.name,'organisation/'+savedOrganisation.id));box.append(affiliation);}
 if(profile.contact.alliedHealthProfession)summary(box,[['Allied health profession',profile.contact.alliedHealthProfession==='other'?profile.contact.alliedHealthProfessionOther:ALLIED_HEALTH_PROFESSIONS.find(([key])=>key===profile.contact.alliedHealthProfession)?.[1]]]);
 if((person.membershipStatus&&person.membershipStatus!=='Not recorded')||person.cohorts?.length)summary(box,[['Membership status',person.membershipStatus],['Mailing groups',person.cohorts?.join(', ')]]);
 const otherAddresses=values.other.filter(([label])=>!(/phone/i.test(label)));
 if(otherAddresses.length){const other=node('details',null,'contact-other-details');other.append(node('summary','Other addresses'));summary(other,otherAddresses);box.append(other);}
 const editKey=id+'/contact',editArea=node('div',null,'contact-editor-area');editArea.id='contact-editor-'+id;
 const edit=action('Edit contact details',()=>{if(editing.has(editKey)){editing.delete(editKey);editArea.hidden=true;edit.setAttribute('aria-expanded','false');}else{editing.add(editKey);drawContactEditor();}});edit.classList.add('contact-editor-toggle');edit.setAttribute('aria-controls',editArea.id);box.append(edit,editArea);
 function drawContactEditor(){
  const open=editing.has(editKey)||client&&clientNdisIsEditing(client.id);editArea.hidden=!open;edit.setAttribute('aria-expanded',String(Boolean(open)));if(!open||editArea.children.length)return;
  editArea.append(node('h3','Edit contact details'));
  const forms=node('div');editArea.append(forms);
  const entry=contactRecordEditor(forms,person,profile,client,contactFields,()=>{editing.delete(editKey);forms.querySelector('[data-profile-affiliation-picker]')?.recordPicker?.destroy();});
  prepareEditor(entry,forms);
  if(client)editArea.append(clientNdisControl(client));
 }
 function contactFields(form,d){
  const identity=node('div',null,'contact-identity-row');form.append(identity);
  form.addEventListener('input',()=>{d.allowDuplicate=false;});
  input(identity,'Full name',d,'name',120).required=true;input(identity,'Email address',d,'email',254,'email');
  phoneFields(form,d);
  if(client)clientContactFields(form,d,client);
  if(client||hasRole(person,'Client')||profile.contact.disability||d.disability)input(form,'Disability',d,'disability',1000,'textarea').rows=2;
  input(form,'Additional comments',d,'additionalComments',2000,'textarea');input(form,'Language',d,'language',120);input(form,'Date of birth',d,'dateOfBirth',10,'date');
  const affiliation=createRecordPicker({label:'Organisation affiliation',kind:'organisations',selectedId:d.organisationId,onChange:id=>{d.organisationId=id;}});affiliation.element.setAttribute('data-profile-affiliation-picker','true');affiliation.element.recordPicker=affiliation;form.affiliationPicker=affiliation;form.append(affiliation.element);
  if(alliedHealth(person)||profile.contact.alliedHealthProfession||d.alliedHealthProfession){
   const profession=field(form,'Allied health profession',d,'alliedHealthProfession','text',ALLIED_HEALTH_PROFESSIONS),other=input(form,'Other allied health profession',d,'alliedHealthProfessionOther',120);
   const updateProfession=()=>{other.parentElement.hidden=d.alliedHealthProfession!=='other';other.required=d.alliedHealthProfession==='other';if(d.alliedHealthProfession!=='other'){d.alliedHealthProfessionOther='';other.value='';}};profession.addEventListener('change',updateProfession);updateProfession();
  }
  field(form,'Record status',d,'directoryStatus','text',DIRECTORY_STATUSES);
  form.append(node('p','Inactive records remain available in history and search. Choose Current when the person returns. Needs review marks information to check; it does not merge or delete records. This status does not change sign-in accounts or permissions.','field-help'));
  let addressParent=form;
  if(client){
   addressParent=node('details',null,'care-details');addressParent.open=Boolean(d.addressLine1||d.addressLine2||d.suburb||d.state||d.postcode);addressParent.append(node('summary','Separate contact address (optional)'),node('p','Only record an address here if it serves a different contact purpose. The residential address above does not need to be entered twice. Existing separate addresses are retained.','field-help'));form.append(addressParent);
  }
  const elements={addressLine1:input(addressParent,'Contact address line 1',d,'addressLine1',250),addressLine2:input(addressParent,'Contact address line 2',d,'addressLine2',250),suburb:input(addressParent,'Contact suburb or town',d,'suburb',120),state:input(addressParent,'Contact state or region',d,'state',80),postcode:input(addressParent,'Contact postcode',d,'postcode',20)};
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
