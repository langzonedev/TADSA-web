import {installModelExtensions,fail} from './device-model.mjs';
import {PROJECT_CONTACT_ROLES,validateProjectContact,sameProjectContact} from './project-contacts-model.js';
installModelExtensions(ctx=>{
 if(ctx.phase==='guard')return;
 const {d,parts,method,input,find,version,bump}=ctx,[kind,id,sub]=parts;
 if(kind!=='projects'||parts.length!==3||sub!=='contacts')return;
 const project=find('projects',id),read=()=>({projectId:id,version:project.version,items:d.relationships.filter(r=>r.projectId===id&&PROJECT_CONTACT_ROLES.includes(r.role)).map(r=>({type:r.type,id:r.id,role:r.role,name:find(r.type==='person'?'people':'organisations',r.id).name})).sort((a,b)=>a.role.localeCompare(b.role)||a.name.localeCompare(b.name)||a.id.localeCompare(b.id))});
 if(method==='GET')return read();if(method!=='POST')fail('Project contacts action unavailable.',404);
 let command;try{command=validateProjectContact(input);}catch(error){fail(error.message);}version(project,command.version);
 const exists=d.relationships.some(r=>r.projectId===id&&sameProjectContact(r,command));if(exists===(command.operation==='add'))return read();
 if(command.operation==='add'){
  const party=(command.type==='person'?d.people:d.organisations).find(p=>p.id===command.id),status=command.type==='person'?d.profileDetails?.[command.id]?.contact?.directoryStatus:party?.directoryStatus;
  if(!party||party.active===false||status==='inactive')fail('Choose a current record, or update its directory status before linking.');
  d.relationships.push({projectId:id,type:command.type,id:command.id,role:command.role});
 }else d.relationships=d.relationships.filter(r=>r.projectId!==id||!sameProjectContact(r,command));
 bump(project,command.operation==='add'?'Project contact linked':'Project contact unlinked',{type:command.type,id:command.id,role:command.role,before:exists,after:command.operation==='add'});return read();
});
