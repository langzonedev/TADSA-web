import {node,action,field,editor,link,notice,request,downloadProjectFile} from './project-care.js';
import {assessmentRequestDocument,assertStableDocumentSnapshot} from './finance-pack.js';
import {assessmentWordFile,reportParagraphs,requestParagraphs} from './assessment-word.js';
import {projectMatchLocation} from './technician-location-model.js';
import {residentialAddressText} from './client-address.js';

const defaultInstructions='Where the referrer is arranging the visit, they will contact you to agree a time. Otherwise, confirm arrangements with the project manager. Please record your findings, risks and estimates in the assessment report and return it to the project manager.';
const singleEmail=value=>typeof value==='string'&&value.length<=254&&/^[^\s@<>,;?&#]+@[^\s@<>,;?&#]+\.[^\s@<>,;?&#]+$/.test(value);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Adelaide'}).format(new Date());
const held=current=>current.workGate?.reasons?.some(reason=>/hold|stop/i.test(reason));

async function readContext(id){
 const project=await request('projects/'+id);
 return Promise.all([project,request('projects/'+id+'/lifecycle'),request('clients/'+project.clientId),request('projects/'+id+'/admin-details'),request('projects/'+id+'/location'),request('business-settings')]);
}
function documentContent(context,instructions){
 const [project,current,client,details,location,business]=context;
 const target=projectMatchLocation({location:location.address,suburb:location.suburb,postcode:location.postcode,geocode:location.geocode},client.details);
 const visit=target.source==='client-residential'?residentialAddressText(client.details):[target.address,target.suburb,target.postcode&&!String(target.address).includes(target.postcode)?target.postcode:''].filter(Boolean).join(', ');
 const html=assessmentRequestDocument(project,current,client,{...details,assessmentInstructions:instructions,assessmentVisitAddress:visit},{business});
 const team=project.relationships.filter(r=>r.role==='Technician').map(r=>r.name).join(', ');
 return {requestRows:requestParagraphs(html),reportRows:reportParagraphs(project,client,visit,team)};
}
function previewRows(panel,rows,close){
 const back=action('Back to assessment',close);panel.replaceChildren(back);
 for(const [kind,label,value] of rows){
  if(kind==='fact'){const row=node('p');row.append(node('strong',label+'  '),document.createTextNode(value||'Not recorded'));panel.append(row);}
  else panel.append(node(kind==='title'?'h3':kind==='heading'?'h4':'p',label));
 }
 panel.append(action('Back to assessment',close));panel.hidden=false;back.focus();
}

function renderPreparation(parent,project,current,admin,templates){
 const path='projects/'+project.id,pack=current.state.assessmentPack;
 const latest=templates.items[0];
 const initial={version:current.version,instructions:admin.assessmentInstructions||pack?.instructions||defaultInstructions,
  reportTemplateRevision:String(latest&&pack?.reportTemplateRevision?latest.revision:0)};
 const preview=node('article',null,'panel assessment-preview');preview.hidden=true;
 let previewContext;
 editor(parent,'assessment-pack/'+project.id,initial,'Prepare the assessment documents',(form,d)=>{
  const answers=admin.websiteReferral?.answers;
  if(answers?.safety||answers?.attendance){
   const visit=node('div',null,'field-help');visit.append(node('strong','Website form information for this visit'));
   if(answers.safety)visit.append(node('p','Reported safety issues: '+answers.safety));
   if(answers.attendance)visit.append(node('p','Referrer or carer attendance: '+answers.attendance));
   form.append(visit);
  }
  const instructions=field(form,'Instructions to the technical member',d,'instructions','textarea');instructions.required=true;instructions.maxLength=2000;
  const choices=[['0','CRM report form · filled in with this client and project']];
  if(latest)choices.push([String(latest.revision),latest.name+' · TADSA blank, revision '+latest.revision]);
  field(form,'Report form to send',d,'reportTemplateRevision','text',choices);
  form.append(node('p',latest?'The CRM form fills in the project details. Choosing TADSA’s own blank keeps the uploaded document as supplied.':'The CRM provides an editable Word report with the client and project already filled in.','field-help'));
  if(admin.documentFolderUrl){const a=node('a','Open project SharePoint folder');a.href=admin.documentFolderUrl;a.target='_blank';a.rel='noopener noreferrer';form.append(a);}
  const message=node('div');const view=action('Preview assessment request',async()=>{
   try{if(!instructions.reportValidity())return;const before=await readContext(project.id);const content=documentContent(before,d.instructions);assertStableDocumentSnapshot(before,before);previewContext=before;
    previewRows(preview,content.requestRows,()=>{preview.hidden=true;view.focus();});message.replaceChildren();
   }catch(error){message.replaceChildren(notice(error.message,true));}
  });
  form.append(view,message,preview);
 },path+'/assessment-pack','POST',async d=>{
  const before=await readContext(project.id),{requestRows,reportRows}=documentContent(before,d.instructions);
  if(previewContext&&JSON.stringify(previewContext)!==JSON.stringify(before))throw Error('Project or client details changed since the preview. Preview the assessment request again before saving.');
  const reference=String(project.reference).replace(/[^a-zA-Z\d_-]/g,'_');
  const reportTemplateRevision=Number(d.reportTemplateRevision);
  const [requestFile,reportFile]=await Promise.all([assessmentWordFile(reference+'-assessment-request.docx',requestRows),
   reportTemplateRevision===0?assessmentWordFile(reference+'-assessment-report.docx',reportRows):null]);
  assertStableDocumentSnapshot(before,await readContext(project.id));
  return {requestId:d.requestId,version:d.version,instructions:d.instructions,reportTemplateRevision,requestFile,reportFile};
 },{saveLabel:'Save assessment documents to Project files',async reviewConflict(){
  const latest=await request(path+'/lifecycle');
  return {version:latest.version,canKeep:false,message:'The project or report template changed. Review the latest saved documents and instructions before preparing a new copy.'};
 }});
}

function arrangingContacts(project,client){
 const contacts=new Map();
 for(const item of project.relationships.filter(r=>['Contact','Carer','OT','Occupational therapist','Allied-health contact','Referrer'].includes(r.role))){
  contacts.set(item.type+'/'+item.id,item);
 }
 for(const c of client.contacts||[]){
  const key='person/'+c.personId;
  if(c.personId&&!contacts.has(key))contacts.set(key,{id:c.personId,type:'person',name:c.name,role:c.relationshipLabel||c.role});
 }
 return [...contacts.values()];
}

function recipientFields(parent,label,choices,preferred=''){
 const values={selected:preferred,email:''},key=r=>r.type+'/'+r.id;
 const labelFor=r=>r.name+(r.role?' · '+r.role:'')+(choices.some(other=>key(other)!==key(r)&&other.name===r.name&&other.role===r.role)?' · '+r.id:'');
 const choose=field(parent,label,values,'selected','text',[['','Choose a contact'],...choices.map(r=>[key(r),labelFor(r)])]);
 const email=field(parent,label+' email',values,'email','email');email.maxLength=254;let revision=0,directory;
 const load=async()=>{
  const ticket=++revision,selected=choices.find(r=>key(r)===choose.value);directory=null;email.value=values.email='';email.disabled=Boolean(selected);
  if(!selected)return;
  try{const record=await request((selected.type==='organisation'?'organisations/':'people/')+selected.id);
   if(ticket===revision){directory={name:record.name,email:record.email||''};email.value=values.email=directory.email;choose.selectedOptions[0].textContent=labelFor({...selected,name:record.name});}
  }catch{ /* The next action reports that the directory record needs another lookup. */ }
  finally{if(ticket===revision)email.disabled=false;}
 };
 choose.addEventListener('change',load);void load();
 return {choose,email,read(){const selected=choices.find(r=>key(r)===choose.value);if(!selected)throw Error('Choose the '+label.toLowerCase()+'.');
  if(!directory)throw Error('Select the '+label.toLowerCase()+' again to load their directory details.');
  if(email.disabled||!singleEmail(email.value.trim()))throw Error('Check the email address for '+selected.name+'.');
  return {...selected,name:directory.name,email:email.value.trim(),directoryEmail:directory.email};
 }};
}

function showMail(parent,address,subject,body,validate,isCurrent){
 const message=node('div',null,'assessment-mail-draft');message.append(node('h4','Review email draft'),node('p','To: '+address),node('strong',subject),node('p',body));
 const open=node('a','Open in email app','button secondary');open.href='mailto:'+encodeURIComponent(address)+'?subject='+encodeURIComponent(subject)+'&body='+encodeURIComponent(body);
 let checking=false;
 open.addEventListener('click',async event=>{
  event.preventDefault();if(checking||!isCurrent())return;checking=true;
  try{await validate();if(isCurrent()&&open.isConnected)window.location.assign(open.href);}
  catch(error){if(isCurrent())parent.replaceChildren(notice(error.message,true));}
  finally{checking=false;}
 });
 message.append(open);parent.replaceChildren(message);
}

function renderDispatch(parent,project,current,client,files,options){
 const state=current.state,pack=state.assessmentPack;if(!pack)return;
 const requestFile=files.items.find(f=>f.id===pack.requestFileId),reportFile=files.items.find(f=>f.id===pack.reportFileId);
 const box=node('section',null,'panel workflow-panel');parent.append(box);box.append(node('h3','Saved assessment documents'));
 if(!requestFile||!reportFile){box.append(notice('One of the recorded files is unavailable. Check Project files before sending.',true));return;}
 const feedback=node('div'),bar=node('div',null,'actions');
 const fileButton=(label,file)=>action(label,async()=>{try{await downloadProjectFile(project.id,file.id,file.name);}catch(e){feedback.replaceChildren(notice(e.message,true));}});
 bar.append(fileButton('Download assessment request',requestFile),fileButton('Download assessment report form',reportFile));
 if(options.openFiles)bar.append(action('Open Project files',options.openProjectFiles||options.openFiles));
 if(!held(current))bar.append(action('Review or amend instructions',()=>parent.querySelector('textarea[aria-label="Instructions to the technical member"]')?.focus()));
 box.append(node('p','Download the saved request and report form and attach both to the technician’s email. Save any revised instructions before sending.'),bar,feedback);
 if(state.assessmentDispatch)box.append(node('p','Assessment request recorded as sent to '+state.assessmentDispatch.technicianName+' on '+state.assessmentDispatch.sentOn+'.'));
 if(held(current))return;
 const team=project.relationships.filter(r=>r.role==='Technician'&&r.type==='person');
 if(!team.length){box.append(link('Assign a technician to prepare the emails','coordination/'+project.id));return;}
 const tech=recipientFields(box,'Assigned technician',team,project.coordination.technicianId?'person/'+project.coordination.technicianId:team.length===1?'person/'+team[0].id:'');
 let techDraft=0,contactDraft=0;
 const mail=node('div');box.append(action('Prepare technician email',async()=>{const ticket=++techDraft;try{
  const person=tech.read();await checkCurrent(person);if(ticket!==techDraft)return;
  showMail(mail,person.email,'Assessment request · TADSA '+project.reference,'Hi '+person.name+',\n\nPlease see the attached assessment request and report form for project '+project.reference+'. Please complete the report after the visit and return it to the project manager.\n\nThanks',()=>checkCurrent(person),()=>ticket===techDraft);
 }catch(e){if(ticket===techDraft)mail.replaceChildren(notice(e.message,true));}}),mail);
 const alreadySent=state.assessmentDispatch?.requestFileId===pack.requestFileId;
 let confirmation;
 if(!alreadySent)editor(box,'assessment-send/'+project.id+'/'+pack.requestFileId,{version:current.version,sentOn:today(),confirmed:false},null,(form,d)=>{
  field(form,'Assessment request sent date',d,'sentOn','date').required=true;
  if(!d.pending)d.confirmed=false;
  confirmation=field(form,'I sent the request and report form to the selected technician',d,'confirmed','checkbox');confirmation.required=true;
  if(d.pending){tech.choose.disabled=true;tech.email.disabled=true;form.append(node('p','Retry the recorded send to '+d.pending.data.technicianName+' at '+d.pending.data.technicianEmail+'.'));}
 },'projects/'+project.id+'/lifecycle','PUT',async d=>{if(!d.confirmed)throw Error('Confirm the documents have been sent.');const ticket=techDraft,p=tech.read();await checkCurrent(p);if(ticket!==techDraft||!d.confirmed)throw Error('Review the selected technician and confirm sending again.');
  return {requestId:d.requestId,version:d.version,action:'assessmentRequestSent',data:{sentOn:d.sentOn,technicianId:p.id,technicianName:p.name,technicianEmail:p.email,requestFileId:pack.requestFileId,reportFileId:pack.reportFileId}};
 },{saveLabel:'Record assessment request sent'});
 const visitDraft=node('div');
 const clearPreviews=()=>{mail.replaceChildren();visitDraft.replaceChildren();if(confirmation?.checked){confirmation.checked=false;confirmation.dispatchEvent(new Event('change',{bubbles:true}));}};
 const resetRecipient=()=>{techDraft++;contactDraft++;clearPreviews();};
 tech.choose.addEventListener('change',resetRecipient);tech.email.addEventListener('input',resetRecipient);
 const arrange=node('section',null,'panel workflow-panel');parent.append(arrange);arrange.append(node('h3','Ask a contact to arrange the visit'));
 const contacts=arrangingContacts(project,client);
 if(!contacts.length){arrange.append(node('p','Link the referrer or arranging contact to the project or client to prepare their email.'));if(options.openContacts)arrange.append(action('Open project contacts',options.openContacts));return;}
 const ref=recipientFields(arrange,'Arranging contact',contacts);
 const resetContact=()=>{contactDraft++;visitDraft.replaceChildren();};
 ref.choose.addEventListener('change',resetContact);ref.email.addEventListener('input',resetContact);
 arrange.append(action('Prepare visit arrangement email',async()=>{const ticket=++contactDraft;try{
  const person=tech.read(),recipient=ref.read();await checkCurrent(person,recipient);if(ticket!==contactDraft)return;
  showMail(visitDraft,recipient.email,'Arrange an assessment visit · TADSA '+project.reference,'Hi '+recipient.name+',\n\nCould you please contact '+person.name+' ('+person.email+') to arrange a mutually suitable time with the client for the assessment visit for TADSA project '+project.reference+'?\n\nThanks',()=>checkCurrent(person,recipient),()=>ticket===contactDraft);
 }catch(e){if(ticket===contactDraft)visitDraft.replaceChildren(notice(e.message,true));}}),visitDraft);
 async function checkCurrent(person,recipient){
  const originalTech=techDraft,originalContact=contactDraft;
  const verifyAddress=async target=>{
   const entry=await request((target.type==='organisation'?'organisations/':'people/')+target.id);
   if(entry.name!==target.name||(entry.email||'')!==target.directoryEmail)throw Error('Directory contact details changed. Select the recipient again and review their name and email address.');
  };
  try{
   const [fresh,workflow,freshClient]=await Promise.all([request('projects/'+project.id),request('projects/'+project.id+'/lifecycle'),request('clients/'+project.clientId),verifyAddress(person),...(recipient?[verifyAddress(recipient)]:[])]);
   if(fresh.version!==current.version||workflow.state?.assessmentPack?.requestFileId!==pack.requestFileId||workflow.state?.stage!=='assessment'||held(workflow)||
    !fresh.relationships.some(r=>r.role==='Technician'&&r.id===person.id)||recipient&&!arrangingContacts(fresh,freshClient).some(c=>c.id===recipient.id&&c.type===recipient.type))throw Error('The project or its contacts have changed. Reopen the assessment before preparing an email.');
  }catch(error){
   if(originalTech===techDraft&&(!recipient||originalContact===contactDraft))clearPreviews();
   throw error;
  }
 }
}

export async function renderAssessmentWorkspace(parent,project,current,options={}){
 const slot=node('div',null,'assessment-workspace');parent.append(slot);
 try{
  const [client,admin,templates,files]=await Promise.all([request('clients/'+project.clientId),options.adminDetails??request('projects/'+project.id+'/admin-details'),request('assessment-templates'),request('projects/'+project.id+'/attachments')]);
  if(held(current))slot.append(notice('Resume the assessment before preparing documents or recording dispatch.'));
  renderDispatch(slot,project,current,client,files,options);
  if(!held(current))renderPreparation(slot,project,current,admin,templates);
 }catch(e){slot.append(notice('The assessment documents could not be loaded. '+e.message,true));}
}
