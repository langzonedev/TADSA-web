import {node,link,field,editor,request,action} from './project-care.js';
import {createRecordPicker} from './record-picker.js';
import {PROJECT_CONTACT_ROLES} from './project-contacts-model.js';
import {needsManualReferrerReview,isSelfReferralLabel,referralName,referralPhoneVariants,referrerIdentity} from './website-referral-matches.js';
const openRemovals=new Set();

// Both intake and older projects use the same People check and the same project role.
export function reviewWebsiteReferrer(parent,answers,{choice,onChoice,allowDefer=false,locked=false}){
 const identity=referrerIdentity(answers);
 if(!identity.name){
  if(needsManualReferrerReview(answers))parent.append(node('p','The submitted referrer name needs review. After saving, use Contacts to choose the person named in the original website answers.','field-help'));
  return null;
 }
 const group=node('fieldset',null,'form-grid'),status=node('p',null,'field-help');
 status.setAttribute('role','status');
 group.append(node('legend','Project referrer'),node('p',[identity.name,identity.phone,identity.email].filter(Boolean).join(' · ')));
 const label=node('label',null,'workflow-field'),select=node('select');
 const additions=node('div',null,'form-grid');
 label.append(node('span','Referrer record','field-label'),select);group.append(label,status,additions);parent.append(group);
 select.required=true;
 let decisions=new Map(),people=new Map(),prior=choice;
 const option=(value,label,disabled=false)=>{const o=node('option',label);o.value=value;o.disabled=disabled;select.append(o);};
 function decision(updatedByOperator=false){
  const selected=decisions.get(select.value);
  let current=selected;
  additions.replaceChildren();
  const person=people.get(selected?.personId);
  if(person?.nameMatch){
   const values={};
   const apply=(changed)=>{
    current=Object.keys(values).length?{...selected,additions:{...values}}:selected;
    prior=current;
    if(changed)onChoice(current,true);
   };
   for(const [key,caption] of [['phone','phone number'],['email','email address']]){
    if(person[key]||!identity[key])continue;
    const line=node('label',null,'checkbox'),check=node('input');
    check.type='checkbox';check.disabled=locked;
    check.checked=Boolean(prior?.personId===person.id&&prior.additions?.[key]===identity[key]);
    if(check.checked)values[key]=identity[key];
    const description='Add missing referrer '+caption;
    check.setAttribute('aria-label',description);
    line.append(check,node('span',description+' · '+identity[key]));additions.append(line);
    check.addEventListener('change',()=>{if(check.checked)values[key]=identity[key];else delete values[key];apply(true);});
   }
   apply(false);
  }
  if(current||updatedByOperator)prior=current;
  if(current?.defer)status.textContent='The submitted details will stay with this enquiry until you link the referrer in Contacts.';
  else if(current?.create)status.textContent='Saving will create '+identity.name+' in People and link them as this project’s referrer.';
  else if(current?.personId)status.textContent='Saving will link the selected People record as this project’s referrer.';
  else if(current?.client)status.textContent='Saving will link the client as this project’s referrer.';
  onChoice(current,updatedByOperator);
 }
 const priorKey=()=>prior?.personId||(prior?.client?'client':prior?.create?'new':prior?.defer?'defer':'');
 const selfLabel=isSelfReferralLabel(identity.name);
 const sameClient=selfLabel||referralName(identity.name)===referralName(answers.client);
 const submittedNumbers=referralPhoneVariants(identity.phone);
 const conflictingContact=item=>Boolean(identity.email&&item.email&&identity.email.toLowerCase()!==item.email.trim().toLowerCase()||
   submittedNumbers.length&&item.phone&&!referralPhoneVariants(item.phone).some(number=>submittedNumbers.includes(number)));
 select.addEventListener('change',()=>decision(true));
 const retry=action('Check referrer matches again',()=>load());group.append(retry);retry.hidden=true;
 function add(value,label,payload){option(value,label);decisions.set(value,payload);}
 async function load(){
  decisions=new Map();people=new Map();additions.replaceChildren();select.replaceChildren();option('','Checking People…');select.disabled=true;retry.hidden=true;
  status.textContent='Checking the People directory.';onChoice(undefined,false,true);
  try{
   const {items,more}=await request('website-referrer-matches','POST',identity);
   if(!parent.isConnected)return;
   select.replaceChildren();option('','Choose the referrer record');
   for(const item of items){
    people.set(item.id,item);
    const reason=item.nameMatch?(conflictingContact(item)?'Name matches, contact details differ':item.contactMatch?'Name and contact match':'Name matches'):'Contact matches, name differs';
    const display=[item.name,item.phone,item.email,item.id,reason,item.directoryStatus==='inactive'?'Inactive':item.directoryStatus==='review'?'Needs review':''].filter(Boolean).join(' · ');
    if(item.directoryStatus==='inactive')option(item.id,display,true);
    else add(item.id,display,{personId:item.id});
   }
   if(sameClient)add('client','Use the client as their own referrer',{client:true});
   if(!more&&!selfLabel)add('new','Create '+identity.name+' in People and link as referrer',{create:true,reviewedIds:items.map(item=>item.id)});
   if(allowDefer)add('defer','Leave the referrer for follow-up',{defer:true});
   const priorValue=priorKey();
   const suggested=!more&&!sameClient&&(items.length===0?'new':items.length===1&&items[0].directoryStatus==='current'&&items[0].nameMatch&&items[0].contactMatch&&!conflictingContact(items[0])?items[0].id:'');
   // Do not silently carry a create decision across a change in the matching records.
   const candidatesUnchanged=!prior?.create||items.length===prior.reviewedIds.length&&items.every(item=>prior.reviewedIds.includes(item.id));
   select.value=priorValue?(decisions.has(priorValue)&&candidatesUnchanged?priorValue:''):(suggested||'');
   select.disabled=locked;
   status.textContent=more?'There are more possible matches. Choose a listed person or use the project Contacts directory after saving.':
    !items.length&&!sameClient?'No matching person was found. Saving will create the person and link them to this project.':
    suggested?'One current person matches the submitted name and contact details. Check the selection before saving.':
    'Compare the name and contact details before choosing. People can share names or phone numbers.';
   decision();
  }catch{
   if(!parent.isConnected)return;
   select.replaceChildren();option('','Check the directory before choosing');select.disabled=true;
   status.textContent='The People directory could not be checked.';retry.hidden=locked;
   if(allowDefer&&!locked){add('defer','Leave the referrer for follow-up',{defer:true});select.disabled=false;if(prior?.defer)select.value='defer';decision();}
  }
 }
 void load();
 return {recheck:load};
}

export async function renderProjectContacts(view,id,referral){
 const path=`projects/${id}/contacts`,saved=await request(path);
 const heading=node('section',null,'panel');heading.append(node('h2','Project contacts and referrers'),node('p','Link the people or organisations involved in this project. These links apply to this project only. Use Team for technicians and Funding for the payer.'));view.append(heading);
 const conflict=async d=>{const latest=await request(path);return {message:'The project changed while you were editing. Review its current contacts below before keeping your choice.',comparison:[['Current project contacts',latest.items.map(r=>`${r.name} — ${r.role} (${r.type})`).join('; ')||'No contacts linked'],['Your unsaved choice',`${d.operation==='remove'?'Remove':'Link'} ${d.selectedName||d.id} — ${d.role} (${d.type})`]],version:latest.version};};
 if(!saved.items.length)heading.append(node('p','No project contacts or referrers linked yet.'));
 for(const item of saved.items){
  const row=node('section',null,'panel'),record=link(item.name,`${item.type==='person'?'person':'organisation'}/${item.id}`);row.append(record,node('p',`${item.role} · ${item.type==='person'?'Person':'Organisation'}`));heading.append(row);
  const key=`project-contact-remove/${id}/${item.type}/${item.id}/${item.role}`,removal=node('details');removal.open=openRemovals.has(key);removal.addEventListener('toggle',()=>{if(removal.open)openRemovals.add(key);else openRemovals.delete(key);});removal.append(node('summary','Remove this project link'));row.append(removal);
  editor(removal,key,{version:saved.version,operation:'remove',type:item.type,id:item.id,role:item.role,selectedName:item.name},null,(form)=>{
   form.append(node('p',`Remove ${item.name} as ${item.role} from this project? Their directory record and links to other projects will remain.`));
   const label=node('label',null,'checkbox'),checkbox=node('input');checkbox.type='checkbox';checkbox.required=true;label.append(checkbox,node('span','Yes, remove this project link'));form.append(label);
  },path,'POST',d=>({requestId:d.requestId,version:d.version,operation:'remove',type:d.type,id:d.id,role:d.role}),{saveLabel:'Remove project link',reviewConflict:conflict,onSaved:()=>openRemovals.delete(key)});
 }
 if(needsManualReferrerReview(referral?.answers)&&!saved.items.some(item=>item.role==='Referrer')){
  heading.append(node('p','The website supplied the following referrer. Choose their directory record below and select Referrer as their project role.'),
   node('p',referral.answers.referrer),link('Open People directory','people'));
 }
 if(referral&&referrerIdentity(referral.answers).name&&!saved.items.some(item=>item.role==='Referrer')){
  editor(view,'project-website-referrer/'+id,{version:saved.version},'Review website referrer',(form,d)=>{
   reviewWebsiteReferrer(form,referral.answers,{choice:d.websiteReferrer,locked:Boolean(d.pending),onChoice:(choice,changed)=>{
    if(!d.pending)d.websiteReferrer=choice;
    if(changed)form.dispatchEvent(new Event('change',{bubbles:true}));
   }});
  },path,'POST',d=>{
   if(!d.websiteReferrer)throw Error('Choose a referrer record before saving.');
   return {requestId:d.requestId,version:d.version,operation:'resolveWebsiteReferrer',websiteReferrer:d.websiteReferrer};
  },{saveLabel:'Save project referrer',reviewConflict:async()=>{
   const latest=await request(path),linked=latest.items.filter(item=>item.role==='Referrer');
   return {message:linked.length?'A referrer has already been saved for this project.':'Check the latest directory matches and project before saving the referrer.',comparison:linked.map(item=>['Saved referrer',item.name]),version:latest.version,canKeep:!linked.length};
  }});
 }
 editor(view,'project-contact-add/'+id,{version:saved.version,operation:'add',type:'person',id:'',role:'Contact',selectedName:''},'Add a project contact or referrer',(form,d)=>{
  const type=field(form,'Record type',d,'type','text',[['person','Person'],['organisation','Organisation']]),pickerHost=node('div',null,'workflow-field');form.append(pickerHost);let picker;
  const mount=()=>{picker?.destroy();picker=createRecordPicker({label:d.type==='person'?'Contact person':'Contact organisation',kind:d.type==='person'?'people':'organisations',selectedId:d.id,required:true,onChange:(identity,item)=>{d.id=identity;d.selectedName=item?.name||'';form.dispatchEvent(new Event('change',{bubbles:true}));}});pickerHost.replaceChildren(picker.element);};mount();
  type.addEventListener('change',()=>{d.id='';d.selectedName='';mount();});
  field(form,'Role on this project',d,'role','text',PROJECT_CONTACT_ROLES.map(role=>[role,role==='OT'?'OT (occupational therapist)':role]));
  form.append(node('p','Choose the role this record has on this project. This does not change their directory roles or give them access to the application.','field-help'));
 },path,'POST',d=>({requestId:d.requestId,version:d.version,operation:'add',type:d.type,id:d.id,role:d.role}),{saveLabel:'Add project contact',reviewConflict:conflict});
}
