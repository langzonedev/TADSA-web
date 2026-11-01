import {node,link,field,editor,request} from './project-care.js';
import {createRecordPicker} from './record-picker.js';
import {PROJECT_CONTACT_ROLES} from './project-contacts-model.js';
const openRemovals=new Set();
export async function renderProjectContacts(view,id){
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
 editor(view,'project-contact-add/'+id,{version:saved.version,operation:'add',type:'person',id:'',role:'Contact',selectedName:''},'Add a project contact or referrer',(form,d)=>{
  const type=field(form,'Record type',d,'type','text',[['person','Person'],['organisation','Organisation']]),pickerHost=node('div',null,'workflow-field');form.append(pickerHost);let picker;
  const mount=()=>{picker?.destroy();picker=createRecordPicker({label:d.type==='person'?'Contact person':'Contact organisation',kind:d.type==='person'?'people':'organisations',selectedId:d.id,required:true,onChange:(identity,item)=>{d.id=identity;d.selectedName=item?.name||'';form.dispatchEvent(new Event('change',{bubbles:true}));}});pickerHost.replaceChildren(picker.element);};mount();
  type.addEventListener('change',()=>{d.id='';d.selectedName='';mount();});
  field(form,'Role on this project',d,'role','text',PROJECT_CONTACT_ROLES.map(role=>[role,role==='OT'?'OT (occupational therapist)':role]));
  form.append(node('p','Choose the role this record has on this project. This does not change their directory roles or give them access to the application.','field-help'));
 },path,'POST',d=>({requestId:d.requestId,version:d.version,operation:'add',type:d.type,id:d.id,role:d.role}),{saveLabel:'Add project contact',reviewConflict:conflict});
}
