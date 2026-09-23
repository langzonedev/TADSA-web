import {installModelExtensions,fail} from './device-model.mjs';
import {createProfileDetails,validateProfileDetails} from './profile-details-model.js';
export function validateProfileDetailsBackup(data){
 if(data.profileDetails===undefined)return;
 const entries=data.profileDetails;if(!entries||typeof entries!=='object'||Array.isArray(entries))fail('Backup rejected: profile details must be an object.');
 for(const [id,value]of Object.entries(entries)){
  if(!data.people.some(p=>p.id===id)||!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==4||Object.keys(value).some(k=>!['personId','version','contact','capabilities'].includes(k))||value.personId!==id||!Number.isSafeInteger(value.version)||value.version<1)fail('Backup rejected: invalid person profile record.');
  for(const section of ['contact','capabilities'])try{validateProfileDetails({requestId:'backup-check',version:value.version,section,details:value[section]});}catch(error){fail('Backup rejected: '+error.message);}
  if(value.contact.organisationId&&!data.organisations.some(o=>o.id===value.contact.organisationId))fail('Backup rejected: profile organisation is missing.');
 }
}
installModelExtensions(ctx=>{
 if(ctx.phase==='guard')return;
 const {d,parts,method,input,find,event}=ctx,[kind,id,sub]=parts;
 if(kind!=='people'||sub!=='profile-details'||parts.length!==3)return;
 const person=find('people',id),before=d.profileDetails?.[id]??{personId:id,version:0,...createProfileDetails()};
 if(method==='GET')return structuredClone(before);
 if(method!=='PUT')fail('Profile action unavailable.',404);
 let value;try{value=validateProfileDetails(input);}catch(error){fail(error.message);}
 if(input.version!==before.version)fail('Profile details changed. Reload and compare before saving.',409,{code:'VERSION_CONFLICT'});
 if(value.section==='capabilities'&&(person.active===false||!(person.roles??[person.role]).includes('Technician')))fail('Choose a person with an active Technician role.');
 if(value.section==='contact'&&value.details.organisationId&&!d.organisations.some(o=>o.id===value.details.organisationId))fail('Choose an existing organisation.');
 const next={...structuredClone(before),version:before.version+1,[value.section]:value.details};d.profileDetails??={};d.profileDetails[id]=next;
 event('people',id,value.section==='contact'?'Additional contact details updated':'Technician capabilities updated',{section:value.section,before:before[value.section],after:value.details});
 return structuredClone(next);
});
