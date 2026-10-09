import {node,field,editor,request} from './project-care.js';
import {createProjectDetails,createFreedomWheelsDetails} from './project-details-model.js';
const payload=d=>Object.fromEntries(['requestId','version',...Object.keys(createProjectDetails())].map(k=>[k,d[k]]));
const labelSave=(entry,label)=>{const button=entry.form.querySelector('button[type=submit]');button.dataset.label=label;if(!entry.d.pending)button.textContent=label;};
export async function renderProjectDetails(view,id){
 const details=await request(`projects/${id}/admin-details`);
 const entry=editor(view,'project-admin/'+id,details,'Programme & follow-up',(form,d)=>{
  const programme=field(form,'Programme',d,'programme','text',[['','Not recorded'],['TAD','TAD'],['FW','Freedom Wheels (FW)']]);
  d.freedomWheels={...createFreedomWheelsDetails(),...d.freedomWheels};
  const bike=node('fieldset');bike.append(node('legend','Freedom Wheels bike details'));
  for(const [key,label] of [['bikeMake','Bike make'],['bikeSize','Bike size (include units)'],['bikeSerialNumber','Bike serial number'],['bikeSource','Bike supplied by'],['cycleType','Bike or trike'],['colour','Colour'],['pedalClips','Pedal clips'],['linkedPedals','Linked pedals'],['rearSteering','Rear steering'],['handlebars','Handlebars'],['backSupport','Back support'],['seat','Seat'],['notes','Bike specification notes']]){const input=field(bike,label,d.freedomWheels,key,key==='notes'?'textarea':'text');input.maxLength=key==='notes'?2000:200;}
  bike.append(node('p','Record the supplied bike specification. These details do not replace an assessment or approval.','field-help'));
  const retained=node('p','Bike details are retained when the programme changes. Clear individual fields only if they are incorrect.','field-help');bike.append(retained);form.append(bike);
  const showBike=()=>{bike.hidden=d.programme!=='FW'&&!Object.values(d.freedomWheels).some(Boolean);retained.hidden=d.programme==='FW';};programme.addEventListener('change',showBike);showBike();
  const instructions=field(form,'Assessment instructions for the technical team',d,'assessmentInstructions','textarea');instructions.maxLength=2000;
  form.append(node('p','These instructions appear on the assessment request. Include access arrangements and known safety concerns; an assessment does not authorise building or modifying equipment.','field-help'));
  const folder=field(form,'Project document folder link',d,'documentFolderUrl','url');folder.maxLength=2000;
  form.append(node('p','Paste the SharePoint folder link for this project. Documents stay in SharePoint; this link does not copy files or change access permissions. Check the project number before saving.','field-help'));
  if(details.documentFolderUrl){const a=node('a','Open project document folder','button secondary');a.href=details.documentFolderUrl;a.target='_blank';a.rel='noopener noreferrer';form.append(a);}
  field(form,'Review date',d,'followUpOn','date');
  field(form,'How the client heard of TADSA',d,'enquirySource','textarea');
  form.append(node('p','The review date is shared with the project team. After following up, add a case note and choose the next review date. Around two weeks is a useful starting point for assessment, quote responses and technical work; adjust it to the circumstances. This date does not change the project stage or target date.','field-help'));
 },`projects/${id}/admin-details`,'PUT',payload);labelSave(entry,'Save project details');
}
export async function renderProjectCoordinator(view,id){
 const [details,options]=await Promise.all([request(`projects/${id}/admin-details`),request('project-admin-options')]);
 const choices=[['','Not assigned'],...options.coordinators.map(a=>[a.id,a.displayName])];
 if(details.coordinatorAccountId&&!options.coordinators.some(a=>a.id===details.coordinatorAccountId))choices.push([details.coordinatorAccountId,'Previously assigned account (inactive or unavailable)']);
 const entry=editor(view,'project-coordinator/'+id,details,'Project coordinator',(form,d)=>{field(form,'Responsible operator',d,'coordinatorAccountId','text',choices);form.append(node('p','Select an application account responsible for following up this project. This is separate from the technical team.','field-help'));},`projects/${id}/admin-details`,'PUT',payload);labelSave(entry,'Save coordinator');
}
export async function renderProjectFeedback(view,id){
 const data=await request(`projects/${id}/feedback`);const local=new Date();const today=[local.getFullYear(),String(local.getMonth()+1).padStart(2,'0'),String(local.getDate()).padStart(2,'0')].join('-');
 view.append(node('p','Record customer feedback separately from work sign-off and internal case notes. Feedback does not close a project or authorise rework.','field-help'));
 const entry=editor(view,'project-feedback/'+id,{version:data.version,recordedOn:today,comments:'',followUpRequired:'unknown',completed:false},'Add customer feedback',(form,d)=>{field(form,'Feedback date',d,'recordedOn','date').required=true;const comments=field(form,'Customer feedback',d,'comments','textarea');comments.maxLength=4000;comments.required=true;field(form,'Completed feedback response',d,'completed','checkbox');form.append(node('p','Tick only for a completed customer response, not a contact attempt or internal note. The feedback date is used in reporting.','field-help'));field(form,'Does this feedback need follow-up?',d,'followUpRequired','text',[['unknown','Not yet decided'],['yes','Yes'],['no','No']]);form.append(node('p','Saved feedback remains in the record. Add a further entry to clarify or correct an earlier one.','field-help'));},`projects/${id}/feedback`,'POST',d=>Object.fromEntries(['requestId','version','recordedOn','comments','followUpRequired','completed'].map(k=>[k,d[k]])));labelSave(entry,'Record feedback');
 const history=node('section',null,'panel');history.append(node('h2','Customer feedback history'));view.append(history);if(!data.items.length)history.append(node('p','No customer feedback recorded.'));
 for(const item of data.items){const row=node('article',null,'case-note');row.append(node('h3',new Date(item.recordedOn+'T12:00:00').toLocaleDateString('en-AU')),node('p',item.comments),node('p',item.completed===true?'Completed feedback response':item.completed===false?'Not a completed response':'Response completion not recorded'),node('p','Follow-up: '+({unknown:'not yet decided',yes:'required',no:'not required'}[item.followUpRequired])),node('p',`${item.actor.displayName} · Recorded ${new Date(item.at).toLocaleString('en-AU')}`,'field-help'));history.append(row);}
}
