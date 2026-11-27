import {rankTechnicians,clientMatchLocation,workRegion,technicianMatchesFilters} from './technician-location-model.js';
import {MEMBERSHIP_STATUSES,MAILING_COHORTS,matchingPersonRoles} from './profile-details-model.js';
import {registerDraftSource,trackDraftForm,refreshDraftReview,baselineDraft,draftChanged} from './draft-review.js';
import {organisationRoleSuggestions} from './organisation-model.js';
import {reconcileContactDraft} from './contact-draft.js';
import {attachAddressLookup,renderTravelComparison} from './address-lookup.js';
import {AUSTRALIAN_STATES} from './client-address.js';
import {reviewDay} from './project-details-model.js';
import {createRecordPicker,selectionLabel} from './record-picker.js';
import {intakeChannelLabels,readReferralHtml,readReferralText,referralBirthDate,referralRows,referralNdisNumber,referralFundingNotes,reviewableClientDetails,websiteResidence,resolveReferralMapping,validateWebsiteReferral} from './website-referral.js';
import {compareReferralIdentity,referralPhoneVariants} from './website-referral-matches.js';
import {reviewWebsiteReferrer} from './project-contacts.js';
import {readFileBase64} from './project-care.js';
// Call-intake workflows. All records in this development workspace are fictional.
const drafts = new Map();
registerDraftSource('workflow',()=>[...drafts].filter(([,d])=>d.dirty||d.pending).map(([key,d])=>({key,pending:Boolean(d.pending)})));
let host;
export const configureWorkflows = options => { host = options; };
export const workflowHasDrafts = () => [...drafts.values()].some(d => d.dirty || d.pending);
export function renderProjectDraftReturn(view,route){
  const d=drafts.get('new-project');
  if(route==='new-project'||!d||(!d.dirty&&!d.pending&&d.step===1))return;
  const banner=el('aside',null,'project-draft-return');banner.setAttribute('aria-label','Project in progress');
  const context=el('div');context.append(el('strong',d.title.trim()||'New enquiry in progress'),el('span',d.intakeChannel==='website'?'Website enquiry · Unsaved draft kept in this tab.':`Step ${d.step} of 4 · Unsaved draft kept in this tab.`));
  banner.append(context,link('← Return to project draft','new-project','button secondary'));view.prepend(banner);
}
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const link = (text, route, cls = 'text-button') => { const n = el('a', text, cls); n.href = '#' + route; return n; };
const button = (text, action, cls = 'secondary') => { const n = el('button', text, cls); n.type = 'button'; n.addEventListener('click', action); return n; };
const note = (text, error = false) => { const n = el('div', text, error ? 'message error' : 'message'); n.setAttribute('role', error ? 'alert' : 'status'); return n; };
const title = (view, text, sub, back) => { if (back) view.append(link('← Back to '+(back.startsWith('project/')?'project':'client'), back, 'breadcrumb')); view.append(el('h1', text), el('p', sub, 'subtitle workflow-intro')); };
const panel = text => { const n = el('section', null, 'panel workflow-panel'); if (text) n.append(el('h2', text)); return n; };
const getDraft = (key, initial) => { const previous=drafts.get(key);if(previous&&!previous.dirty&&!previous.pending&&initial.version!==undefined&&initial.version!==previous.version)drafts.delete(key); if (!drafts.has(key)) drafts.set(key, { ...initial, ...("technicianId" in initial?{technicianIds:initial.technicianIds??(initial.technicianId?[initial.technicianId]:[])}:{}), requestId: crypto.randomUUID(), dirty: false }); return baselineDraft(drafts.get(key)); };
const touch = d => { d.dirty = draftChanged(d); refreshDraftReview(); };
const options = (items, value) => items.map(([id, name]) => { const n = el('option', name); n.value = id; n.selected = id === value; return n; });
function field(form, label, d, key, { type = 'text', required = false, max = 120, help = '', draft = d } = {}) {
  const l = el('label', null, 'workflow-field'); l.append(el('span', label, 'field-label'));
  const input = el(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  input.setAttribute('aria-label', label); input.name = key; input.value = d[key] ?? ''; input.required = required; input.maxLength = max;
  if (type === 'textarea') input.rows = 4;
  input.addEventListener('input', () => { d[key] = input.value; touch(draft); input.setCustomValidity(''); });
  l.append(input); if (help) l.append(el('small', help, 'field-help')); form.append(l); return input;
}
function selectField(form, label, d, key, values, change) {
  const l = el('label', null, 'workflow-field'); l.append(el('span', label, 'field-label')); const input = el('select'); input.setAttribute('aria-label', label); input.name = key; input.append(...options(values, d[key]));
  input.addEventListener('change', () => { input.setCustomValidity(''); d[key] = input.value; touch(d); change?.(); }); l.append(input); form.append(l); return input;
}
function check(form, label, checked, change) {
  const l = el('label', null, 'checkbox'); const input = el('input'); input.type = 'checkbox'; input.checked = checked; input.addEventListener('change', () => change(input.checked)); l.append(input, el('span', label)); form.append(l); return input;
}
function lock(form, locked, retry) { form.querySelectorAll('.record-picker').forEach(n=>n.recordPicker?.setDisabled(locked));form.querySelectorAll('input,textarea,select,button').forEach(n => { n.disabled = n.dataset.keepDisabled === 'true' || (locked && n !== retry); }); }
async function request(path, method = 'GET', body) {
  const fileUpload=method==='POST'&&path==='projects'&&body?.websiteReferralPdf;
  const response = await fetch('/api/' + path, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), ...(fileUpload?{}:{signal:AbortSignal.timeout(12000)}) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The save result could not be confirmed.'); }
  if (!response.ok) { const e = new Error(data.error || 'Could not save.'); e.status = response.status; e.data = data; throw e; }
  return data;
}
async function save(form, d, notice, saveButton, path, method, payload, done, duplicate, recheckReferrer) {
  if (host.isSaving()) return;
  let body = d.pending;
  d.dirty = true; host.setSaving(true); lock(form, true); notice.replaceChildren(note('Saving… Please wait.'));
  try {
    if(!body){body=typeof payload==='function'?await payload():payload;d.pending=body;}
    const result=await request(path,method,body);d.pending=null;host.setSaving(false);await done(result);
  }
  catch (error) {
    const uncertain=Boolean(body)&&(!error.status||(method==='POST'&&path==='projects'&&body.websiteReferral&&(error.status===408||error.status>=500)));
    if (!uncertain) { d.pending = null; d.requestId = crypto.randomUUID(); }
    notice.replaceChildren(note(uncertain ? 'The save result is not confirmed. Your details are kept. Retry the same save to check safely without creating a duplicate.' : error.message, true));
    if(error.data?.code==='REFERRER_REVIEW_CHANGED'&&recheckReferrer)notice.append(button('Review referrer matches',recheckReferrer));
    else if (error.data?.candidates?.length && duplicate) duplicate(error.data.candidates);
    if (error.status === 401) notice.append(button('Sign in and keep draft', () => host.refresh()));
    if (error.status === 409 && !duplicate) { notice.append(el('p', 'Another change may have been saved. Your draft is retained.', 'field-help')); if (method === 'PUT') notice.append(button('Compare latest allocation', () => host.refresh())); }
  } finally { refreshDraftReview();host.setSaving(false); lock(form, Boolean(d.pending), saveButton); saveButton.disabled = false; saveButton.textContent = d.pending ? 'Retry save safely' : saveButton.dataset.label; }
}
function cancel(form, d, key, route, label = 'Cancel') {
  return button(label, () => {
    if (!d.dirty) { drafts.delete(key); typeof route==='function'?route():location.hash = route; return; }
    let confirm = form.querySelector('.discard-question'); if (confirm) return;
    confirm = note('Discard the unsaved details?'); confirm.classList.add('discard-question');
    confirm.append(button('Keep editing', () => confirm.remove()), button('Discard draft', () => { drafts.delete(key); typeof route==='function'?route():location.hash = route; })); form.append(confirm); confirm.querySelector('button').focus();
  });
}
function saveButton(label) { const n = el('button', label, 'primary'); n.type = 'submit'; n.dataset.label = label; return n; }
function valid(form) { for (const n of form.querySelectorAll('[required]')) { n.setCustomValidity(''); if (!n.value.trim()) n.setCustomValidity('Please enter this information.'); } return form.reportValidity(); }

const emptyIntakeAddress={street:'',suburb:'',state:'',postcode:'',geocode:null};
function intakeAddressFields(form,d,isClient){
  const group=el('fieldset');group.className='form-grid';
  group.append(el('legend',isClient?'Residential address':'Address'),
    el('p',isClient?'TADSA normally does the work at this address. A suburb or postcode can help find nearby technicians even if the street is unknown.':'For a client this becomes the residential address. For other people it is their contact address.','field-help'));
  const street=field(group,'Street address',d,'street',{max:250});
  const suburb=field(group,'Suburb or town',d,'suburb',{max:100});
  const state=selectField(group,'State or territory',d,'state',[['','Not recorded'],...AUSTRALIAN_STATES.map(s=>[s,s])]);
  const postcode=field(group,'Postcode',d,'postcode',{max:4});postcode.inputMode='numeric';postcode.pattern='[0-9]{4}';
  form.append(group);
  attachAddressLookup(street,{draft:d,geoField:'geocode',fields:{street:'street',suburb:'suburb',state:'state',postcode:'postcode',keys:['street','suburb','state','postcode'],elements:{street,suburb,state,postcode}}});
}
function intakeAddressPayload(d){
  if(![d.street,d.suburb,d.state,d.postcode].some(value=>value?.trim()))return {};
  return {initialAddress:{street:d.street??'',suburb:d.suburb??'',state:d.state??'',postcode:d.postcode??'',geocode:d.geocode??null}};
}

async function newClient(view, arg) {
  const referral=arg==='project'?drafts.get('new-project')?.websiteReferral?.answers:null;
  const key = 'new-client'; const d = getDraft(key, { name: referral?.client??'', email: '', phone: referral?.mobile||referral?.phone||'', language: 'English', ...emptyIntakeAddress,allowDuplicate: false, forProject: arg === 'project' });
  if (arg === 'project') d.forProject = true;
  title(view, 'New client', 'Start with the details you know. A client can be saved before there is a project.');
  const box = panel('Client details'); const form = el('form', null, 'form-grid');trackDraftForm(form,'workflow',key,{label:key==='new-project'?'New enquiry':key==='new-client'?'New client':'Person details'});
  field(form, 'Full name', d, 'name', { required: true, help: 'Use the name the client wants us to use. Required.' });
  field(form, 'Phone number', d, 'phone', { type: 'tel', max: 40, help: 'Optional. Helpful when checking whether this person already has a record.' });
  field(form, 'Email address', d, 'email', { type: 'email', max: 200, help: 'Optional. Do not invent an address if it is unknown.' });
  field(form,'Language',d,'language',{max:120});
  intakeAddressFields(form,d,true);
  const notice = el('div'); const actions = el('div', null, 'actions'); const submit = saveButton('Save client');
  actions.append(submit, cancel(form, d, key, d.forProject ? 'new-project' : 'people')); form.append(notice, actions); box.append(form); view.append(box);
  function duplicates(rows) {
    const match = panel('Please check these existing records');
    match.append(el('p', 'A matching name or contact detail does not always mean the same person. Open the record and check before creating another client.'));
    for (const r of rows) match.append(link(`${r.name} · ${r.phone || r.email || 'No contact details'}`, `${r.type === 'client' ? 'client' : 'person'}/${r.id}`, 'duplicate-result'));
    match.append(button('This is a different person — create separate client', () => { d.allowDuplicate = true; d.requestId = crypto.randomUUID(); form.requestSubmit(); })); notice.append(match);
  }
  form.addEventListener('submit', e => { e.preventDefault(); if (!valid(form)) return; save(form, d, notice, submit, 'clients', 'POST', { requestId: d.requestId, name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim(), language:d.language.trim(), allowDuplicate: d.allowDuplicate,...intakeAddressPayload(d) }, result => {
    drafts.delete(key); host.announce('Client saved.');
    if (d.forProject) {
      const project = drafts.get('new-project');
      if(project){
        project.clientId=result.id;
        if(project.websiteReferral){project.clientId='';project.chooseReferralClient=true;delete project.referralClientMode;delete project.referralCandidate;delete project.clientAdditions;}
        else project.step=2;
      }
      location.hash='new-project/'+result.id;
    }
    else location.hash = 'client/' + result.id;
  }, duplicates); });
  if (d.pending) { notice.append(note('A previous save was not confirmed. Retry it safely.')); lock(form, true, submit); submit.textContent = 'Retry save safely'; }
}

function coordinationValues(d) { return { requiredSkills: d.requiredSkills, technicianId: d.technicianId || null, technicianIds: d.technicianIds ?? (d.technicianId?[d.technicianId]:[]), fundingStatus: d.fundingStatus, payerId: ['person', 'organisation'].includes(d.fundingStatus) ? d.payerId || null : null, fundingNotes: d.fundingNotes.trim() }; }
function coordinationFields(form, d, directories, focus, target={}) {
  if (focus !== 'team') {
  const funding = el('fieldset'); funding.append(el('legend', 'Who is expected to pay?'),el('p','This is the expected funding contact. Agreed dollar contributions and the invoice recipient are recorded under Costs. Once contributions are saved, they are shown as the payers on the overview.','field-help'));
  selectField(funding, 'Payer', d, 'fundingStatus', [['unknown','Not known yet'],['self','The client'],['organisation','An organisation'],['person','Another person']], () => { d.payerId = '';d.payerLabel=''; drawPayer(); });
  const payerSlot = el('div'); funding.append(payerSlot);
  function drawPayer() { payerSlot.querySelectorAll('.record-picker').forEach(n=>n.recordPicker?.destroy());payerSlot.replaceChildren(); if (['organisation', 'person'].includes(d.fundingStatus)) {
    const capturedKind=d.fundingStatus,capturedId=d.payerId;const picker=createRecordPicker({label:capturedKind==='organisation'?'Paying organisation':'Paying person',kind:capturedKind==='organisation'?'organisations':'people',selectedId:capturedId,required:true,onChange:(id,item)=>{d.payerId=id;d.payerLabel=item?selectionLabel(item):'';touch(d);}});picker.element.recordPicker=picker;payerSlot.append(picker.element);picker.ready.then(()=>{if(d.fundingStatus===capturedKind&&d.payerId===capturedId&&picker.element.isConnected&&capturedId)d.payerLabel=picker.select.selectedOptions[0]?.textContent;});
  } }
  drawPayer(); field(funding, 'Funding notes', d, 'fundingNotes', { type: 'textarea', max: 1000, help: 'For example, who will confirm funding. Selecting a payer does not approve spending or confirm payment.' }); form.append(funding);
  }
  if (focus === 'funding') return;
  d.technicianIds??=d.technicianId?[d.technicianId]:[];
  const assignment = el('fieldset'); assignment.append(el('legend', 'Choose the technical team'), el('p', 'Use recorded skills to narrow the list. Confirm availability and suitability with the technician before work begins.', 'field-help'));
  const sourceLabel=({'client-work':'TADSA work address','client-residential':'Client residential address','project':'Project work location'})[target.source]??'Work location';
  assignment.append(el('p',sourceLabel+': '+([target.address,target.suburb,target.postcode].filter(Boolean).join(', ')||'Not recorded')+'. Matching skills come first. Within a skill group, unavailable technicians appear last. Distances are straight-line estimates.','field-help'));
  const credit=el('a','Postcode locations: GeoNames');credit.href='https://www.geonames.org/';credit.target='_blank';credit.rel='noopener noreferrer';
  const regionsCredit=el('a','Region boundaries: Data SA');regionsCredit.href='https://data.sa.gov.au/data/dataset/south-australian-government-regions';regionsCredit.target='_blank';regionsCredit.rel='noopener noreferrer';
  const credits=el('p',null,'field-help');credits.append(credit,el('span',' · '),regionsCredit);assignment.append(credits);
  const skills = el('div', null, 'skill-options'); const technicians = el('div');let technicianPage=d.technicianPage??0,technicianQuery=d.technicianQuery??'',calendarGeneration=0;
  for (const skill of directories.skills) check(skills, skill, d.requiredSkills.includes(skill), on => { d.requiredSkills = on ? [...d.requiredSkills,skill] : d.requiredSkills.filter(s => s !== skill); d.assignmentAcknowledged = false; touch(d); drawTechnicians(); });
  assignment.append(el('h3', 'Skills needed (optional)'), skills);
  const showAllSkills=check(assignment, 'Show technicians who do not match all selected skills', d.showAll ?? false, on => { d.showAll = on; drawTechnicians(); });
  const regionLabel=id=>directories.serviceAreas.find(area=>area.id===id)?.label||id;
  const destinationRegion=workRegion(target);
  if (!destinationRegion && d.filterArea==='work-region') d.filterArea='';
  const areaOptions=[['','Any service area']];
  if(destinationRegion) areaOptions.push(['work-region','Work location region — '+regionLabel(destinationRegion)]);
  areaOptions.push(...directories.serviceAreas.map(a=>[a.id,a.label]));
  const areaFilter=selectField(assignment,'Technician service area filter',d,'filterArea',areaOptions);
  const modeFilter=selectField(assignment,'Region match',d,'regionMode',[
    ['either','Serves or is located in the region'],['coverage','Recorded service coverage only'],['base','Base or contact location only']
  ]);
  const radiusFilter=selectField(assignment,'Distance from work location',d,'filterRadius',[
    ['','Any distance'],...['10','25','50','100'].map(km=>[km,'Within '+km+' km (estimated)'])
  ]);
  const postcodeFilter=field(assignment,'Technician postcode filter',d,'filterPostcode',{max:4,help:'Use a postcode prefix for the technician’s location, or leave blank to include nearby postcodes.'});
  postcodeFilter.inputMode='numeric';
  const distanceHelp=el('small','A distance limit includes only technicians with a measured or estimated distance. A shared postcode alone does not establish a distance.','field-help');
  assignment.append(distanceHelp);
  function changeFilters(){
    technicianPage=0;
    d.assignmentAcknowledged=false;
    drawTechnicians();
  }
  for(const control of [areaFilter,modeFilter,radiusFilter]) control.addEventListener('change',changeFilters);
  postcodeFilter.addEventListener('input',changeFilters);
  assignment.append(link('View all technician calendars and service areas','availability'),technicians); form.append(assignment);
  const searchLabel=el('label',null,'workflow-field'),search=el('input');search.type='search';search.value=technicianQuery;search.maxLength=120;search.setAttribute('aria-label','Search technician names');searchLabel.append(el('span','Search technician names','field-label'),search);assignment.insertBefore(searchLabel,technicians);search.addEventListener('input',()=>{if(d.pending||host.isSaving()){search.value=technicianQuery;return;}technicianQuery=search.value;d.technicianQuery=technicianQuery;technicianPage=0;drawTechnicians();});
  function drawTechnicians(focusPage=false) {
    const generation=++calendarGeneration;
    technicians.replaceChildren();
    if(d.technicianId&&!directories.technicians.some(t=>t.id===d.technicianId)) technicians.append(note('The previously assigned person is no longer listed as a technician. Their saved assignment remains in the project history. Choose active technical members or clear the team selection before saving this allocation.',true));
    const region=d.filterArea==='work-region'?destinationRegion:d.filterArea;
    modeFilter.disabled=!region||Boolean(d.pending)||host.isSaving();
    modeFilter.dataset.keepDisabled=String(!region);
    distanceHelp.hidden=!d.filterRadius;
    const locationMatches=t=>technicianMatchesFilters(t,{region,mode:d.regionMode,postcode:d.filterPostcode,radius:d.filterRadius});
    const ranked=rankTechnicians(directories.technicians,target,d.requiredSkills);
    const visible=ranked.filter(t=>d.technicianIds.includes(t.id)||((d.showAll||t.skillMatch)&&locationMatches(t)));
    const query=technicianQuery.trim().toLocaleLowerCase('en-AU');
    const nameMatches=t=>query.split(/\s+/).every(word=>t.name.toLocaleLowerCase('en-AU').includes(word));
    const selectedRows=visible.filter(t=>d.technicianIds.includes(t.id)),matches=visible.filter(t=>!d.technicianIds.includes(t.id)&&nameMatches(t));technicianPage=Math.min(technicianPage,Math.max(0,Math.ceil(matches.length/50)-1));d.technicianPage=technicianPage;const start=technicianPage*50,rows=[...selectedRows,...matches.slice(start,start+50)];if(d.technicianIds.length)technicians.append(button('Clear team selection',()=>{d.technicianIds=[];d.technicianId='';d.assignmentAcknowledged=false;touch(d);drawTechnicians();}));technicians.append(el('p',d.technicianIds.length?`${d.technicianIds.length} technical members selected`:'No technician assigned yet. You can allocate the team later.','field-help'));
    const paging=el('div',null,'actions'),previous=button('Previous technicians',()=>{if(d.pending||host.isSaving())return;technicianPage--;drawTechnicians(true);}),next=button('Next technicians',()=>{if(d.pending||host.isSaving())return;technicianPage++;drawTechnicians(true);}),pageStatus=el('span',`${matches.length?start+1:0}–${Math.min(start+50,matches.length)} of ${matches.length} matching unselected technicians. ${selectedRows.length} selected members remain visible.`);pageStatus.tabIndex=-1;pageStatus.setAttribute('role','status');previous.disabled=start===0||Boolean(d.pending)||host.isSaving();next.disabled=start+50>=matches.length||Boolean(d.pending)||host.isSaving();paging.append(previous,pageStatus,next);technicians.append(paging);if(focusPage)pageStatus.focus({preventScroll:true});
    for (const t of rows) {
      const l = el('label', null, 'choice-card'); const radio = el('input'); radio.type = 'checkbox'; radio.name = 'technician'; radio.value = t.id; radio.checked = d.technicianIds.includes(t.id);
      const text = el('span'); text.append(el('strong', t.name),el('small',t.locationReason));
      if (radio.checked && (!locationMatches(t)||!d.showAll&&!t.skillMatch)) text.append(el('small','Selected · outside current filters'));
      if (t.id) text.append(el('small', `${t.skills.join(' · ')}. ${t.openCount} open projects. Remaining work: ${t.remainingMinutes==null?'Not recorded':Math.round(t.remainingMinutes/60*100)/100+' hours'+(t.remainingWorkUnrecordedCount?' recorded; '+t.remainingWorkUnrecordedCount+' project'+(t.remainingWorkUnrecordedCount===1?'':'s')+' not estimated':' remaining')}. General allocation status: ${t.availability==='unknown'?'Not recorded':t.availability}. ${t.locationSource==='person-contact'?'Contact address':'Base'}: ${[t.suburb,t.postcode].filter(Boolean).join(' ')||'Not recorded'}${t.baseRegion?' ('+regionLabel(t.baseRegion)+')':''}. Service areas: ${(t.serviceAreas||[]).map(regionLabel).join(', ')||'Not recorded'}.`));
      else text.append(el('small', 'Save the request now and allocate someone later.'));
      const calendarText=el('small',`Calendar today (${directories.calendarDay}): ${!t.calendarToday||t.calendarToday==='Could not load'?'Loading…':t.calendarToday}. Check future dates in the calendar.`);calendarText.dataset.calendarPerson=t.id;text.append(calendarText);
      radio.addEventListener('change', () => { d.technicianIds=radio.checked?[...d.technicianIds,t.id]:d.technicianIds.filter(id=>id!==t.id);if(!d.technicianIds.includes(d.technicianId))d.technicianId=d.technicianIds[0]||'';d.assignmentAcknowledged = false; touch(d);const status=drawTechnicians(),replacement=[...technicians.querySelectorAll('input[name=technician]')].find(input=>input.value===t.id);(replacement??status)?.focus({preventScroll:true}); }); l.append(radio,text); technicians.append(l);
    }
    if (!visible.length) technicians.append(note('No technicians match the selected skills and location filters. Clear a filter, review other technicians, or save unassigned.'));else if(!matches.length)technicians.append(note('No unselected technicians match the name search and current skill / location filters. Selected members remain visible.'));
    if(query&&!matches.length&&!selectedRows.some(nameMatches)){
      const outside=ranked.filter(t=>!visible.includes(t)&&nameMatches(t));
      if(outside.length){
        technicians.append(el('p',outside.length+' matching '+(outside.length===1?'technician is':'technicians are')+' outside your skill or location filters.','field-help'));
        technicians.append(button('Show name matches across all areas and skills',()=>{
          d.filterArea='';d.filterRadius='';d.filterPostcode='';d.showAll=true;
          areaFilter.value='';radiusFilter.value='';postcodeFilter.value='';showAllSkills.checked=true;
          changeFilters();search.focus();
        }));
      }else{
        technicians.append(el('p','Check the person’s directory roles in People. Project teams use the Technician role. A login or a technical mailing group alone does not add a person to this list.','field-help'));
        const refresh=button('Refresh technician list',async()=>{
          if(d.pending||host.isSaving())return;
          refresh.disabled=true;refresh.textContent='Refreshing…';
          try{
            const latest=await directories.readTechnicians();
            if(!refresh.isConnected||d.pending||host.isSaving())return;
            directories.technicians=latest;
            drawTechnicians(true);
          }catch{
            if(refresh.isConnected)technicians.append(note('Could not refresh the technician list. Try again.',true));
          }finally{
            refresh.disabled=false;refresh.textContent='Refresh technician list';
          }
        });
        technicians.append(refresh,link('Open People directory','people'));
      }
    }
    const team=selectedRows;if(team.length){selectField(technicians,'Lead technician',d,'technicianId',team.map(t=>[t.id,t.name]));technicians.append(el('p','The lead is the main contact; every selected technical member is linked to this project.','field-help'));}
    const selected = directories.technicians.find(t => t.id === d.technicianId);
    if(selected)technicians.append(link('View '+selected.name+' — qualifications & clearances','person/'+selected.id));
    d.needsAcknowledgement = team.some(t=>t.availability !== 'available'||!d.requiredSkills.every(s=>t.skills.includes(s))||!locationMatches(t));
    if (d.needsAcknowledgement) { technicians.append(note('Check this allocation: the recorded skills, general allocation status or location need a conversation. This is not an eligibility or safety assessment.')); check(technicians, 'I have reviewed the skill / availability / location warning', d.assignmentAcknowledged ?? false, on => { d.assignmentAcknowledged = on; touch(d); }); }
    const current=()=>form.isConnected&&technicians.isConnected&&generation===calendarGeneration;
    Promise.resolve().then(async()=>{if(!current())return;await directories.loadCalendars(rows,current);if(!current())return;for(const label of technicians.querySelectorAll('[data-calendar-person]')){const t=rows.find(t=>t.id===label.dataset.calendarPerson);label.textContent=`Calendar today (${directories.calendarDay}): ${t?.calendarToday??'Not recorded'}. Check future dates in the calendar.`;}if(rows.some(t=>t.calendarToday==='Could not load')){const retry=button('Retry displayed calendars',()=>{if(!d.pending&&!host.isSaving())drawTechnicians(true);});retry.disabled=Boolean(d.pending)||host.isSaving();technicians.append(retry);}});
    return pageStatus;
  }
  // Embedded sections can finish building before their parent mounts them.
  // The mounting caller starts calendar reads after insertion; detached panes
  // continue to fail the current() guard instead of making background requests.
  form.startTechnicianCalendars=()=>drawTechnicians();
  drawTechnicians();
}
async function directories(loadCalendars=true,source='technicians') {
  const [technicians,areas] = await Promise.all([request(source),request('availability-options')]);
  const calendarDay=new Intl.DateTimeFormat('en-CA',{timeZone:'Australia/Adelaide'}).format(new Date()),calendars=new Map(),waiters=[];let active=0;
  async function loadDisplayedCalendars(rows,isCurrent){if(!loadCalendars)return;await Promise.all(rows.map(async t=>{if(!isCurrent())return;if(calendars.has(t.id)){t.calendarToday=await calendars.get(t.id);return;}while(active>=4)await new Promise(resolve=>waiters.push(resolve));if(!isCurrent()){waiters.shift()?.();return;}if(calendars.has(t.id)){waiters.shift()?.();t.calendarToday=await calendars.get(t.id);return;}active++;const loading=(async()=>{try{const calendar=await request('availability/'+t.id);return calendar.entries.find(e=>e.startDate<=calendarDay&&e.endDate>=calendarDay)?.status??'Not recorded';}catch{calendars.delete(t.id);return 'Could not load';}finally{active--;waiters.shift()?.();}})();calendars.set(t.id,loading);t.calendarToday=await loading;}));}
  const byName=(a,b)=>a.name.localeCompare(b.name,'en-AU')||a.id.localeCompare(b.id);
  const readTechnicians=async()=>(await request(source)).items.sort(byName);
  return {readTechnicians,target:technicians.target,calendarDay,loadCalendars:loadDisplayedCalendars,serviceAreas:[...areas.serviceAreas].sort((a,b)=>a.label.localeCompare(b.label,'en-AU')),technicians: [...technicians.items].sort(byName), skills: [...technicians.skills].sort() };
}
function allocationValid(form, d, notice) { if (!valid(form)) return false; if (d.needsAcknowledgement && !d.assignmentAcknowledged) { notice.replaceChildren(note('Review the technician warning and tick the acknowledgement, or leave the request unassigned.', true)); notice.scrollIntoView({block:'nearest'}); return false; } return true; }
function reviewList(items) { const dl = el('dl', null, 'review-list'); for (const [label,value] of items) { dl.append(el('dt',label),el('dd',value)); } return dl; }
function focusEnquiryHeading(){
  const heading=document.querySelector('#enquiry-step-heading');
  if(heading){heading.tabIndex=-1;heading.focus();}
}
function websiteDraftDefaults(answers){
  return {step:1,clientId:'',title:answers.need.split('\n')[0].slice(0,120),summary:answers.need.slice(0,2000),followUpOn:reviewDay(),
    fundingStatus:'unknown',fundingNotes:referralFundingNotes(answers),payerId:'',payerLabel:'',technicianId:'',technicianIds:[],requiredSkills:[],
    assignmentAcknowledged:false,needsAcknowledgement:false};
}
function websiteIntake(form,d,draw){
  const box=el('div',null,'form-grid');
  const pdfLabel=el('label','Import enquiry PDF','workflow-field website-pdf-drop');
  const pdf=el('input');pdf.type='file';pdf.accept='.pdf,application/pdf';pdf.setAttribute('aria-label','Import enquiry PDF');
  pdfLabel.append(pdf,el('small','Choose or drop the referral PDF from the office email (up to 10 MB).','field-help'));
  const fileLabel=el('label','Saved website email','workflow-field'),file=el('input');file.type='file';file.accept='.html,.htm,text/html';fileLabel.append(file);
  const copyLabel=el('label','Paste website form','workflow-field'),paste=el('textarea');paste.rows=4;paste.maxLength=1000000;paste.value=d.websitePaste??'';copyLabel.append(paste);
  const preview=el('div'),message=el('div');let revision=0;
  function reset(){++revision;delete d.websiteMapping;delete d.websiteMappingPdf;preview.replaceChildren();message.replaceChildren();}
  function show(parsed,originalPdf){
    const imported=validateWebsiteReferral({receivedOn:reviewDay(),answers:parsed});
    const replacement=websiteDraftDefaults(imported.answers);
    d.beforeWebsite=Object.fromEntries(Object.keys(replacement).map(key=>[key,d[key]]));
    Object.assign(d,replacement);
    d.websiteReferral=imported;
    if(originalPdf)d.websitePdfFile=originalPdf;
    else delete d.websitePdfFile;
    d.referralClient=websiteClientDraft(imported.answers);
    delete d.websiteMapping;delete d.websiteMappingPdf;delete d.websitePaste;
    touch(d);draw();focusEnquiryHeading();
  }
  function showProblem(error,originalPdf){
    const mapping=error.referralMapping;
    if(!mapping){message.replaceChildren(note(error.message,true));return;}
    message.replaceChildren();
    d.websiteMapping=mapping;
    if(originalPdf)d.websiteMappingPdf=originalPdf;
    const group=el('fieldset');group.append(el('legend','Match the website questions'),el('p','Choose the answer for each field below. The other answers will also stay with the enquiry.','field-help'));
    const choices={};
    for(const key of mapping.missing){
      const label=el('label',key==='client'?'Question containing the client name':'Question describing the request','workflow-field');
      const select=el('select');select.append(...options([['','Choose a website question'],...mapping.candidates.map(row=>[row.id,row.label+' — '+row.value.slice(0,100)])],''));
      select.onchange=()=>{choices[key]=select.value;message.replaceChildren();};
      label.append(select);group.append(label);
    }
    group.append(button('Preview matched answers',()=>{try{show(resolveReferralMapping(mapping,choices),originalPdf);message.replaceChildren();}catch(problem){message.replaceChildren(note(problem.message,true));}}));
    preview.replaceChildren(group);
  }
  async function importPdf(files){
    if(!files?.length)return;
    reset();file.value='';pdf.value='';paste.value='';delete d.websitePaste;
    if(files.length!==1){message.replaceChildren(note('Choose one referral PDF at a time.',true));return;}
    const selected=files[0],version=revision;
    message.replaceChildren(note('Reading the PDF…'));
    try{
      const {readReferralPdf}=await import('./website-referral-pdf.js');
      const answers=await readReferralPdf(selected);
      if(version===revision&&box.isConnected)show(answers,selected);
    }catch(error){if(version===revision&&box.isConnected)showProblem(error,selected);}
  }
  pdf.addEventListener('change',()=>importPdf(Array.from(pdf.files)));
  pdfLabel.addEventListener('dragover',event=>{event.preventDefault();event.dataTransfer.dropEffect='copy';});
  pdfLabel.addEventListener('drop',event=>{event.preventDefault();importPdf(Array.from(event.dataTransfer.files));});
  paste.addEventListener('input',()=>{file.value='';pdf.value='';reset();d.websitePaste=paste.value;touch(d);});
  paste.addEventListener('paste',event=>{
    const html=event.clipboardData?.getData('text/html'),plain=event.clipboardData?.getData('text/plain');
    if(!html&&!plain)return;
    event.preventDefault();file.value='';paste.value=plain||'';reset();d.websitePaste=paste.value;touch(d);
    if(html){try{show(readReferralHtml(html));return;}catch(error){if(error.noPlainFallback||error.referralMapping||!plain){showProblem(error);return;}}}
    try{show(readReferralText(plain));}catch(error){showProblem(error);}
  });
  file.addEventListener('change',async()=>{
    reset();paste.value='';delete d.websitePaste;const version=revision,chosen=file.files[0];if(!chosen)return;
    try{if(chosen.size>1000000)throw Error('Choose one HTML notification under 1 MB.');const html=await chosen.text();if(version===revision&&box.isConnected)show(readReferralHtml(html));}
    catch(error){if(version===revision&&box.isConnected)showProblem(error);}
  });
  const read=button('Preview pasted form',()=>{
    reset();try{show(readReferralText(paste.value));}catch(error){showProblem(error);}
  });
  const alternate=el('details');alternate.append(el('summary','Use a saved HTML email'),fileLabel);
  const actions=el('div',null,'actions');actions.append(read);
  box.append(pdfLabel,copyLabel,actions,preview,message,alternate);form.append(box);
  if(d.websiteMapping)showProblem({referralMapping:d.websiteMapping},d.websiteMappingPdf);
}
function projectPayload(d){
  return {requestId:d.requestId,title:d.title.trim(),summary:d.summary.trim(),kind:d.kind,intakeChannel:d.intakeChannel,
    followUpOn:d.followUpOn??reviewDay(),...coordinationValues(d),
    ...(d.websiteReferral?{websiteReferral:d.websiteReferral}:{})};
}

function websiteClientDraft(answers){
  const supplied=(value,max)=>value&&value.length<=max?value:'';
  const dateOfBirth=referralBirthDate(answers.birth);
  return {name:supplied(answers.client,120),phone:supplied(answers.phone||answers.mobile,40),mobilePhone:supplied(answers.mobile,40),
    email:'',dateOfBirth,ndisNumber:referralNdisNumber(answers),disability:supplied(answers.disability,1000),...websiteResidence(answers.address),allowDuplicate:false};
}
function websiteClientPayload(client){
  return {name:client.name.trim(),email:client.email.trim(),phone:client.phone.trim(),allowDuplicate:client.allowDuplicate,
    mobilePhone:client.mobilePhone.trim(),dateOfBirth:client.dateOfBirth,disability:client.disability.trim(),...(client.ndisNumber?{ndisNumber:client.ndisNumber}:{}),...intakeAddressPayload(client)};
}
function websiteClientReview(group,d){
  const client=d.referralClient,answers=d.websiteReferral.answers;
  const overview=el('div');
  function updateOverview(){
    overview.replaceChildren(reviewList([['New client',client.name],['Phone',client.phone],['Mobile',client.mobilePhone===client.phone?'':client.mobilePhone],
      ['Residential address',[client.street,client.suburb,client.state,client.postcode].filter(Boolean).join(' ')],['Date of birth',client.dateOfBirth],
      ['Disability information',client.disability],['NDIS participant number',client.ndisNumber],['Client email',client.email]].filter(([,value])=>value)));
  }
  updateOverview();group.append(overview);
  const edit=el('details');edit.append(el('summary','Review or edit new client details'));
  const fields=el('div',null,'form-grid');edit.append(fields);group.append(edit);
  const entry=(label,key,settings)=>field(fields,label,client,key,{...settings,draft:d});
  entry('Full name','name',{required:true});
  entry('Phone number','phone',{type:'tel',max:40});
  entry('Mobile phone','mobilePhone',{type:'tel',max:40});
  entry('Date of birth','dateOfBirth',{type:'date'}).max=reviewDay();
  if(referralNdisNumber(answers)){
    const number=entry('NDIS participant number','ndisNumber',{max:30});
    number.pattern='[0-9 ]{3,30}';number.inputMode='numeric';
  }
  entry('Disability information','disability',{type:'textarea',max:1000});
  entry('Street address','street',{max:250});entry('Suburb or town','suburb',{max:100});
  const stateLabel=el('label','State or territory','workflow-field'),state=el('select');
  state.append(...options([['','Not recorded'],...AUSTRALIAN_STATES.map(value=>[value,value])],client.state));
  state.addEventListener('change',()=>{client.state=state.value;touch(d);updateOverview();});
  stateLabel.append(state);fields.append(stateLabel);
  const postcode=entry('Postcode','postcode',{max:4});postcode.pattern='[0-9]{4}';postcode.inputMode='numeric';
  const email=entry('Client email address','email',{type:'email',max:254,help:'Use an address confirmed as belonging to this client.'});
  if(answers.contactEmail&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(answers.contactEmail)&&answers.contactEmail.length<=254){
    const confirm=check(group,'I confirm '+answers.contactEmail+' is the client’s own email address',client.email===answers.contactEmail,checked=>{
      if(checked)client.email=answers.contactEmail;
      else if(client.email===answers.contactEmail)client.email='';
      email.value=client.email;client.allowDuplicate=false;touch(d);updateOverview();
    });
    email.addEventListener('input',()=>{confirm.checked=client.email===answers.contactEmail;});
  }
  if(!client.name||answers.address&&!client.street&&!client.suburb&&!client.postcode||answers.birth&&!client.dateOfBirth){
    edit.open=true;
    fields.prepend(el('p','Check the supplied details below. Anything you leave blank is still available in the original website answers.','field-help'));
    if(answers.address&&!client.street&&!client.suburb&&!client.postcode)fields.prepend(el('p','Address as supplied: '+answers.address));
    if(answers.birth&&!client.dateOfBirth)fields.prepend(el('p','Date of birth as supplied: '+answers.birth));
  }
  fields.addEventListener('input',()=>{client.allowDuplicate=false;updateOverview();});
  fields.addEventListener('invalid',()=>{edit.open=true;},true);
}
function referralMatchInput(answers,crmName){
  const draft=websiteClientDraft(answers);
  return {name:crmName||draft.name,phone:answers.phone?.length<=40?answers.phone:'',mobile:draft.mobilePhone,dateOfBirth:draft.dateOfBirth,postcode:draft.postcode};
}
function referralComparison(answers,item,crmName){
  const section=el('section',null,'referral-comparison'),heading=item.name+' · '+(item.reference||item.id);
  section.setAttribute('aria-label',heading);section.append(el('h3',heading));
  const table=el('table'),head=table.createTHead().insertRow(),body=table.createTBody();
  table.setAttribute('aria-label','Submitted details and client record for '+heading);
  for(const text of ['Detail','Website form','Client record','Comparison'])head.append(el('th',text));
  const date=value=>value?.replace(/^(\d{4})-(\d{2})-(\d{2})$/,'$3/$2/$1')||'';
  function telephoneRow(label,key){
    const submitted=answers[key],recorded=item[key],state=item.comparison[key];
    const wanted=referralPhoneVariants(submitted);
    if(state==='match'&&!referralPhoneVariants(recorded).some(value=>wanted.includes(value))){
      const channels=[['phone','primary phone'],['mobile','mobile'],['homePhone','home phone'],['workPhone','work phone']];
      const match=channels.find(([field])=>referralPhoneVariants(item[field]).some(value=>wanted.includes(value)));
      if(match)return [label,submitted,[recorded,item[match[0]]+' ('+match[1]+')'].filter(Boolean).join('\n'),state,'Matches '+match[1]];
    }
    return [label,submitted,recorded,recorded?state:'unknown'];
  }
  const location=[item.address,item.suburb,item.state,item.postcode].filter(Boolean).join(', ');
  const values=[
    ['Name',answers.client,item.name,item.comparison.name,crmName?({match:'Matches CRM name',partial:'Partial CRM name match',different:'Differs from CRM name',unknown:'Cannot compare CRM name'})[item.comparison.name]:undefined],
    ['Date of birth',answers.birth,date(item.dateOfBirth),item.comparison.dateOfBirth],
    telephoneRow('Phone','phone'),telephoneRow('Mobile','mobile'),
    ['Address',answers.address,location,item.comparison.postcode]
  ];
  for(const [label,submitted,recorded,state,crossChannel] of values){
    if(!submitted&&!recorded)continue;
    const row=body.insertRow(),name=el('th',label);name.scope='row';row.append(name);
    row.append(el('td',submitted||'Not supplied'),el('td',recorded||'Not recorded'));
    const description=crossChannel||{match:'Matches',partial:'Partial match',different:'Differs',unknown:'Cannot compare'}[state]||'Cannot compare';
    const comparison=el('td',label==='Address'&&['match','different'].includes(state)?(state==='match'?'Postcode matches':'Postcode differs'):description);
    comparison.className='referral-'+state;row.append(comparison);
  }
  section.append(table);
  if(item.directoryStatus==='inactive')section.append(el('p','Inactive client. Review the directory record before using it.', 'field-help'),link('View client record','client/'+item.id));
  return section;
}
function selectReferralClient(d,item,draw){
  if(item.directoryStatus==='inactive')return;
  d.clientId=item.id;d.referralCandidate=item;d.referralClientMode='existing';d.clientAdditions={};
  d.referralClient.allowDuplicate=false;touch(d);draw();focusEnquiryHeading();
}
async function reviewDirectoryClient(id,d,draw,notice){
  notice.dataset.clientId=id;
  notice.replaceChildren(el('p','Checking the selected client…','field-help'));
  try{
    const client=await request('clients/'+id),profile=await request('people/'+client.personId+'/profile-details');
    if(!notice.isConnected||notice.dataset.clientId!==id)return;
    const contact=profile.contact;
    const item={id:client.id,reference:client.details.reference,name:client.person.name,phone:client.person.phone,
      email:client.person.email,disability:contact.disability,ndisNumber:client.ndis?.number,mobile:contact.mobilePhone,homePhone:contact.homePhone,workPhone:contact.workPhone,dateOfBirth:contact.dateOfBirth,
      address:client.details.residentialAddress,suburb:client.details.residentialSuburb,state:client.details.residentialState,
      postcode:client.details.residentialPostcode,directoryStatus:contact.directoryStatus||client.person.directoryStatus};
    if(item.directoryStatus==='inactive'){notice.replaceChildren(note('This client is inactive. Check the directory record before continuing.',true));return;}
    item.comparison=compareReferralIdentity(referralMatchInput(d.websiteReferral.answers,d.referralLookupName),item);
    selectReferralClient(d,item,draw);
  }catch{if(notice.isConnected&&notice.dataset.clientId===id)notice.replaceChildren(note('Could not check this client’s details.',true),button('Check this client again',()=>reviewDirectoryClient(id,d,draw,notice)));}
}
function websiteClientChoices(group,d,draw){
  const answers=d.websiteReferral.answers;
  const results=el('div');results.setAttribute('aria-live','polite');
  const submitted=referralMatchInput(answers);
  const needsName=!submitted.name&&!referralPhoneVariants(submitted.phone,submitted.mobile).length;
  let searchRevision=0;
  if(needsName){
    const label=el('label','CRM client name','workflow-field'),name=el('input');name.maxLength=120;
    name.value=d.referralLookupName||'';
    label.append(name,el('small','Enter a name of up to 120 characters to check the directory and prepare the client record. The enquiry keeps the full name supplied on the form.','field-help'));
    const apply=button('Check client name',()=>{
      if(!name.value.trim()){name.setCustomValidity('Enter the name to check.');name.reportValidity();return;}
      d.referralLookupName=name.value.trim();d.referralClient.name=d.referralLookupName;
      d.referralClient.allowDuplicate=false;touch(d);checkMatches();
    });
    name.addEventListener('input',()=>{name.setCustomValidity('');searchRevision++;results.replaceChildren();});
    name.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();apply.click();}});
    group.append(label,apply);
  }
  group.append(results);
  const useNew=auto=>{
    d.clientId='';d.referralClientMode='new';d.noReferralMatches=auto;d.referralClient.allowDuplicate=false;
    touch(d);draw();focusEnquiryHeading();
  };
  async function checkMatches(){
    const revision=++searchRevision;
    results.replaceChildren(el('p','Checking the client directory…','field-help'));
    try{
      const {items,more}=await request('website-referral-matches','POST',referralMatchInput(answers,d.referralLookupName));
      if(!group.isConnected||revision!==searchRevision)return;
      if(!items.length&&!more&&!d.chooseReferralClient){useNew(true);return;}
      results.replaceChildren(el('p',items.length?'Choose the client after comparing the details below.':'No matching clients were found.','field-help'));
      for(const item of items){
        const card=referralComparison(answers,item,d.referralLookupName);
        if(item.directoryStatus!=='inactive')card.append(button('Use '+item.name,()=>reviewDirectoryClient(item.id,d,draw,results)));
        results.append(card);
      }
      if(more)results.append(el('p','More possible matches are in the directory. Search for a different client if the right record is missing.','field-help'));
      const search=el('details');search.append(el('summary','Search for a different client'));
      search.addEventListener('toggle',()=>{
        if(!search.open||search.querySelector('.record-picker'))return;
        const status=el('div');
        const picker=createRecordPicker({label:'Existing client',kind:'clients',onChange:(id,item)=>{if(id&&item)reviewDirectoryClient(id,d,draw,status);}});
        picker.element.recordPicker=picker;search.append(picker.element,status);
      });
      results.append(search,button('Create a new client',()=>useNew(false)));
    }catch{
      if(group.isConnected&&revision===searchRevision)results.replaceChildren(note('The directory check could not finish. Check again before choosing a client.',true),button('Check for matching clients again',checkMatches));
    }
  }
  if(!needsName||d.referralLookupName)void checkMatches();
}
function missingClientAdditions(group,d,item){
  const answers=d.websiteReferral.answers;
  const section=el('fieldset');
  section.append(el('legend','Add missing details to this client'));
  const source=reviewableClientDetails(answers);
  const currentAddress=[item.address,item.suburb,item.state,item.postcode].some(Boolean);
  for(const [key,label,existing] of [
    ['phone','Add missing phone number',item.phone],
    ['mobilePhone','Add missing mobile number',item.mobile],
    ['dateOfBirth','Add missing date of birth',item.dateOfBirth],
    ['residence','Add missing residential address',currentAddress],
    ['disability','Add missing disability information',item.disability],
    ['email','Confirm this is the client’s own email and add it',item.email],
    ['ndisNumber','Add missing NDIS participant number',item.ndisNumber]
  ]){
    const supplied=source[key];
    if(existing||!supplied)continue;
    const box=check(section,label+' · '+supplied,Boolean(d.clientAdditions?.[key]),checked=>{
      d.clientAdditions??={};
      if(checked)d.clientAdditions[key]=supplied;
      else delete d.clientAdditions[key];
      touch(d);
    });
    box.setAttribute('aria-label',label);
  }
  if(section.childElementCount>1)group.append(section);
}

function reviewedWebsiteEnquiry(slot,d,key,draw){
  const original=d.websiteReferral;
  const box=panel('Review website enquiry');box.querySelector('h2').id='enquiry-step-heading';
  const form=el('form',null,'form-grid');trackDraftForm(form,'workflow',key,{label:'Website enquiry'});
  if(d.websitePdfFile){
    const fileInfo=el('div',null,'website-pdf-review');
    fileInfo.append(el('strong',d.websitePdfFile.name),el('p','The original PDF will be saved in Project files with this enquiry.','field-help'),
      button('Choose a different PDF or paste an email',()=>{leaveWebsiteReview(d,false);touch(d);draw();focusEnquiryHeading();}));
    form.append(fileInfo);
  }
  const source=el('details');
  source.append(el('summary','All website answers'),reviewList(referralRows(original.answers)));
  source.append(button('Remove website details from draft',()=>{
    leaveWebsiteReview(d,false);
    touch(d);draw();focusEnquiryHeading();
  }));
  const group=el('fieldset',null,'form-grid');group.append(el('legend','Client'),el('p','Website form names '+original.answers.client+'.','field-help'));
  if(d.referralClientMode&&d.referralLookupName)group.append(el('p','Directory checked using '+d.referralLookupName+'.','field-help'));
  if(d.referralClientMode){
    const change=button('Change client choice',()=>{
      d.clientId='';delete d.referralClientMode;delete d.referralCandidate;delete d.clientAdditions;
      d.chooseReferralClient=true;
      d.referralClient.allowDuplicate=false;touch(d);draw();focusEnquiryHeading();
    });
    if(d.referralClientMode==='new'){
      if(d.noReferralMatches)group.append(el('p','No matching client was found. These details will create a new client when you save the enquiry.','field-help'));
      websiteClientReview(group,d);
    }else{
      const item=d.referralCandidate;
      group.append(referralComparison(original.answers,item,d.referralLookupName),el('p','This enquiry will be linked to the selected client. Any differences shown stay on the enquiry for follow-up.','field-help'));
      missingClientAdditions(group,d,item);
      const related=el('details');related.append(el('summary','Check this client’s existing enquiries and projects'));group.append(related);
      related.addEventListener('toggle',async()=>{
        if(!related.open||related.childElementCount>1)return;
        const review=el('div','Loading projects…','field-help');related.append(review);
        try{
          const client=await request('clients/'+d.clientId);review.replaceChildren();
          if(!client.projects.length)review.textContent='No projects recorded for this client.';
          for(const project of client.projects)review.append(el('p',project.reference+' · '+project.title));
        }catch{review.textContent='Could not load this client’s projects.';}
      });
    }
    group.append(change);
  }else websiteClientChoices(group,d,draw);
  const details=el('fieldset',null,'form-grid');details.append(el('legend','Enquiry details'));
  const receipt=field(details,'Date office received enquiry',original,'receivedOn',{type:'date',required:true,draft:d});receipt.max=reviewDay();
  field(details,'Project title',d,'title',{required:true});
  field(details,'What does the client need?',d,'summary',{type:'textarea',required:true,max:2000});
  field(details,'Review date',d,'followUpOn',{type:'date'});
  if(original.answers.heard)details.append(reviewList([['How the client heard of TADSA',original.answers.heard.slice(0,500)]]));
  if(d.fundingNotes||original.answers.quote||original.answers.ndis||original.answers.authorityName)field(details,'Funding notes',d,'fundingNotes',{type:'textarea',max:1000});
  details.append(el('small','You can assign the team and confirm funding after saving.','field-help'));
  const notice=el('div'),actions=el('div',null,'actions');
  const submit=saveButton(d.referralClientMode==='new'?'Create client and enquiry':'Save enquiry');
  const referrerHost=el('div');
  let referrer,referrerReviewed=false;
  function readyToSave(){
    const ready=Boolean(d.pending)||Boolean(d.referralClientMode&&(!referrer||referrerReviewed));
    submit.disabled=!ready;submit.dataset.keepDisabled=String(!ready);
  }
  referrer=reviewWebsiteReferrer(referrerHost,original.answers,{choice:d.referrerChoice,allowDefer:true,locked:Boolean(d.pending),onChoice:(choice,changed,checking)=>{
    referrerReviewed=Boolean(choice);
    if(!checking&&!d.pending)d.referrerChoice=choice;
    if(changed)touch(d);
    readyToSave();
  }});
  readyToSave();
  actions.append(submit,cancel(form,d,key,'projects','Cancel new enquiry'));
  form.append(group,details,referrerHost,source,notice,actions);box.append(form);slot.append(box);
  function duplicates(rows){
    const matches=el('fieldset');matches.append(el('legend','Check possible duplicate clients'));
    const identity=()=>JSON.stringify([d.referralClient.name,d.referralClient.phone,d.referralClient.mobilePhone,d.referralClient.email]);
    const checkedIdentity=identity();
    for(const item of rows){
      const row=el('p');row.append(el('span',[item.name,item.phone,item.email].filter(Boolean).join(' · ')+' '));
      if(item.type==='client'&&item.directoryStatus!=='inactive'){
        const status=el('span');row.append(button('Use '+item.name,()=>reviewDirectoryClient(item.id,d,draw,status)),status);
      }else if(item.type==='client'){
        row.append(link('Review inactive client','client/'+item.id));
      }else{
        row.append(link('Review person and client role','person/'+item.id));
      }
      matches.append(row);
    }
    matches.append(button('Confirm this is a different person',()=>{
      d.referralClient.allowDuplicate=identity()===checkedIdentity;touch(d);form.requestSubmit(submit);
    }));
    notice.append(matches);notice.scrollIntoView({block:'nearest'});
  }
  form.addEventListener('submit',event=>{
    event.preventDefault();if(!d.pending&&(!d.referralClientMode||(referrer&&!referrerReviewed)||!valid(form)))return;
    const assignment=d.referralClientMode==='existing'?{clientId:d.clientId}:{newClient:websiteClientPayload(d.referralClient)};
    if(d.referralClientMode==='existing'&&Object.keys(d.clientAdditions??{}).length)assignment.clientAdditions={...d.clientAdditions};
    if(d.referrerChoice&&!d.referrerChoice.defer)assignment.websiteReferrer=d.referrerChoice;
    save(form,d,notice,submit,'projects','POST',async()=>{
      const payload={...projectPayload(d),...assignment};
      if(d.websitePdfFile){
        const file=d.websitePdfFile;
        payload.websiteReferralPdf={name:file.name,mime:'application/pdf',dataBase64:await readFileBase64(file)};
      }
      return payload;
    },result=>{
      drafts.delete(key);host.announce(d.websitePdfFile?'Website enquiry saved with its original PDF in Project files.':'Website enquiry saved. Add the original PDF and any supplied photos under Project files.');location.hash='project/'+result.id;
    },d.referralClientMode==='new'?duplicates:undefined,()=>referrer?.recheck());
  });
  if(d.pending){notice.append(note('A previous save was not confirmed. Retry the same request safely.'));lock(form,true,submit);submit.textContent='Retry save safely';}
}
// Switching channel keeps each unfinished intake in this tab until the operator saves or cancels it.
const websiteDraftFields=['websiteReferral','websitePdfFile','referralClient','referralCandidate','referralClientMode','referralLookupName','chooseReferralClient','noReferralMatches','clientAdditions','referrerChoice'];
function leaveWebsiteReview(d,keep){
  if(!d.websiteReferral)return;
  const manual=d.beforeWebsite;
  if(keep)d.suspendedWebsite=Object.fromEntries([...Object.keys(manual),...websiteDraftFields].filter(k=>Object.hasOwn(d,k)).map(k=>[k,d[k]]));
  for(const key of websiteDraftFields)delete d[key];
  Object.assign(d,manual);delete d.beforeWebsite;
}
function resumeWebsiteReview(d){
  if(!d.suspendedWebsite)return;
  const keys=Object.keys(websiteDraftDefaults(d.suspendedWebsite.websiteReferral.answers));
  d.beforeWebsite=Object.fromEntries(keys.map(k=>[k,d[k]]));
  Object.assign(d,d.suspendedWebsite);delete d.suspendedWebsite;
}
async function newProject(view, clientId) {
  const key = 'new-project'; const d = getDraft(key, { step: clientId ? 2 : 1, clientId: clientId || '', intakeChannel:'',title: '', summary: '', kind: 'Assessment', followUpOn:reviewDay(),fundingStatus:'unknown',payerId:'',fundingNotes:'',requiredSkills:[],technicianId:'' });
  let dirs,choosingSource=!d.intakeChannel;
  if (clientId && !d.clientId && !d.websiteReferral) { d.clientId = clientId; d.step = 2; }
  const manualClient=d.beforeWebsite?.clientId??d.clientId;
  let selected = manualClient ? await request('clients/'+manualClient) : null;
  title(view, 'New enquiry', 'Record the request for review. If TADSA accepts it, the assessment and project keep this reference.');
  const channelBar=el('div',null,'intake-source-bar');view.append(channelBar);
  const steps = el('ol', null, 'workflow-steps'); for (const [i,label] of ['Client','Project details','Funding & technical team','Review'].entries()) { const n = el('li', `${i+1}. ${label}`); if (i+1 === d.step) n.setAttribute('aria-current','step'); steps.append(n); } view.append(steps);
  const slot = el('div'); view.append(slot);
  function useChannel(channel){
    if(channel!==d.intakeChannel){
      if(d.intakeChannel==='website')leaveWebsiteReview(d,true);
      if(channel==='website')resumeWebsiteReview(d);
      d.intakeChannel=channel;
    }
    choosingSource=false;draw();focusEnquiryHeading();
  }
  function draw() {
    slot.querySelectorAll('.record-picker').forEach(n=>n.recordPicker?.destroy());slot.replaceChildren(); steps.querySelectorAll('li').forEach((n,i) => i+1 === d.step ? n.setAttribute('aria-current','step') : n.removeAttribute('aria-current'));
    steps.hidden=choosingSource||d.intakeChannel==='website';channelBar.replaceChildren();channelBar.hidden=choosingSource;
    if(choosingSource){
      const box=panel('How did this enquiry arrive?');box.querySelector('h2').id='enquiry-step-heading';
      if(selected?.person.name)box.append(el('p','Selected client for manual entry: '+selected.person.name,'field-help'));
      const choices=el('div',null,'intake-source-choices');
      for(const [channel,help] of [['phone','Record the request while speaking with the caller.'],['website','Import the attached PDF or paste the form from the office email.'],['other','Enter an enquiry received another way.']]){
        const label=intakeChannelLabels[channel],choice=button(label,()=>useChannel(channel),'secondary');
        choice.setAttribute('aria-label',label);choice.replaceChildren(el('strong',label),el('span',help));choices.append(choice);
      }
      const form=el('form');form.append(choices,cancel(form,d,key,'projects','Cancel new enquiry'));box.append(form);slot.append(box);return;
    }
    const change=button('Change enquiry source',()=>{if(d.pending||host.isSaving())return;choosingSource=true;draw();focusEnquiryHeading();});
    change.disabled=Boolean(d.pending);
    channelBar.append(el('strong',intakeChannelLabels[d.intakeChannel]),change);
    if(d.intakeChannel==='website'){
      if(d.websiteReferral){reviewedWebsiteEnquiry(slot,d,key,draw);return;}
      const box=panel('Import the website enquiry');box.querySelector('h2').id='enquiry-step-heading';
      const form=el('form',null,'form-grid');trackDraftForm(form,'workflow',key,{label:'Website enquiry'});
      websiteIntake(form,d,draw);form.append(cancel(form,d,key,'projects','Cancel new enquiry'));box.append(form);slot.append(box);return;
    }
    if(d.step>=3&&!dirs){
      const wait=panel('Loading funding and team details…');wait.querySelector('h2').id='enquiry-step-heading';slot.append(wait);
      directories().then(value=>{dirs=value;if(wait.parentNode===slot)draw();}).catch(()=>{if(wait.parentNode===slot)wait.append(note('Could not load funding and team details.',true),button('Try again',draw));});
      return;
    }
    const box = panel(`Step ${d.step} of 4 — ${['Client','Project details','Funding & technical team','Review'][d.step-1]}`); const form = el('form', null, 'form-grid');trackDraftForm(form,'workflow',key,{label:key==='new-project'?'New enquiry':key==='new-client'?'New client':'Person details'}); const notice = el('div');
    box.querySelector('h2').id='enquiry-step-heading';
    if (d.step === 1) {
      const picker=createRecordPicker({label:'Existing client',kind:'clients',selectedId:d.clientId,required:true,onChange:async(id,item)=>{d.clientId=id;selected=item?{person:{name:item.name},details:{residentialAddress:item.address}}:null;touch(d);if(id){try{const client=await request('clients/'+id);if(d.clientId===id){selected=client;if(d.step===3&&slot.isConnected)draw();}}catch{}}}});picker.element.recordPicker=picker;form.append(picker.element,link('Create new client','new-client/project','button secondary'),el('p','Search by name, reference, phone, email or address. Confirm the person’s details before choosing.','field-help'));
    } else if (d.step === 2) {
      form.append(note(`Client: ${selected?.person.name ?? 'Choose a client first'}`));
      field(form,'Project title',d,'title',{required:true,help:'A short description the client and team will recognise.'});
      field(form,'What does the client need?',d,'summary',{type:'textarea',required:true,max:2000,help:'Describe the goal in the client’s words. Avoid unnecessary sensitive information.'});
      field(form,'Review date',d,'followUpOn',{type:'date',help:'Starts at today. Change it to when the team should review this enquiry.'});
      form.append(el('p','Assessment, quote acceptance and technical work will be recorded as stages of this project.','field-help'));
      form.append(el('p','Use one project for related work on the same item. Create separate projects for different items or independently managed jobs. Staff can decide after assessment when the scope is clearer.','field-help'));
      form.append(el('p','For a correction to earlier work, check the existing project first and record the follow-up there. A request for different equipment usually needs a new project.','field-help'));
      form.append(el('p','Creating a project does not authorise work or spending. Complete assessment review and quote approval, then record the sent Work Request before technical work begins.','field-help'));
    } else if (d.step === 3) {coordinationFields(form,d,dirs,null,clientMatchLocation(selected?.details));}
    else {
      const payer = d.fundingStatus==='unknown' ? 'Not known yet — follow up' : d.fundingStatus==='self' ? `Client: ${selected?.person.name}` : d.payerLabel||d.payerId||'Choose a payer';
      form.append(reviewList([['Client',selected?.person.name],['Project',d.title],['Need',d.summary],['Expected payer',payer],['Funding notes',d.fundingNotes||'None recorded'],['Skills',d.requiredSkills.join(', ')||'Not specified'],['Technical team',dirs.technicians.filter(t=>(d.technicianIds??[]).includes(t.id)).map(t=>t.name+(t.id===d.technicianId?' (lead)':'')).join(', ')||'Not assigned yet']]));
      form.append(note('Check the client and project details before saving. No emails, work instructions or invoices will be sent.'));
    }
    const actions=el('div',null,'actions');const next=saveButton(d.step===4?'Save enquiry':'Continue');
    if(d.step>1)actions.append(button('Back',()=>{d.step--;draw();slot.querySelector('h2').tabIndex=-1;slot.querySelector('h2').focus({preventScroll:true});window.scrollTo(0,0);}));
    actions.append(next,cancel(form,d,key,d.clientId?'client/'+d.clientId:'projects','Cancel new enquiry'));form.append(notice,actions);box.append(form);slot.append(box);
    form.addEventListener('submit',e=>{e.preventDefault();if(d.step===1&&!d.clientId){notice.replaceChildren(note('Choose the existing client or create a new client to continue.',true));return;}if(!allocationValid(form,d,notice))return;
      if(d.step<4){d.step++;draw();slot.querySelector('h2').tabIndex=-1;slot.querySelector('h2').focus({preventScroll:true});window.scrollTo(0,0);return;}
      save(form,d,notice,next,'projects','POST',{...projectPayload(d),clientId:d.clientId},result=>{drafts.delete(key);host.announce('Enquiry saved.');location.hash='project/'+result.id;});
    });
    if(d.pending){notice.append(note('A previous save was not confirmed. Retry the same request safely.'));lock(form,true,next);next.textContent='Retry save safely';}
  }
  draw();
}
async function editCoordination(view,id,options={}) {
  const focus=['team','funding'].includes(options.focus)?options.focus:null;
  const [project,dirs]=await Promise.all([request('projects/'+id),directories(focus!=='funding',focus==='funding'?'technicians':'projects/'+id+'/technician-matches')]);
  const projectLocation=dirs.target??{};
  const key='coordination/'+id+(focus?'/'+focus:'');
  const previous=drafts.get(key);
  if(previous&&!previous.dirty&&!previous.pending)drafts.delete(key);
  const d=getDraft(key,{...project.coordination,technicianId:project.coordination.technicianId||'',payerId:project.coordination.payerId||'',version:project.version,filterArea:'',filterPostcode:''});
  const label=focus==='team'?'Team':focus==='funding'?'Funding':'Allocation';
  if(!options.embedded)title(view,focus?label:'Funding & technical team',project.title,'project/'+id);

  const box=panel(focus?null:'Review the allocation');
  if(focus!=='funding')renderTravelComparison(box,projectLocation,dirs.technicians);
  const form=el('form',null,'form-grid');trackDraftForm(form,'workflow',key,{label:focus==='funding'?'Funding':'Team',context:project.reference+' · '+project.title});coordinationFields(form,d,dirs,focus,projectLocation);
  const notice=el('div');const actions=el('div',null,'actions');const submit=saveButton('Save '+label.toLowerCase());
  actions.append(submit,cancel(form,d,key,options.onCancel??('project/'+id)));form.append(notice,actions);box.append(form);view.append(box);
  function compare(latest) {
    const rows=[['Latest version',String(latest.version)]];
    if(focus!=='team')rows.push(['Funding',latest.coordination.fundingStatus],['Funding notes',latest.coordination.fundingNotes||'None']);
    if(focus!=='funding')rows.push(['Technicians',(latest.coordination.technicianIds??[latest.coordination.technicianId]).map(id=>dirs.technicians.find(t=>t.id===id)?.name).filter(Boolean).join(', ')||'Unassigned'],['Skills',latest.coordination.requiredSkills.join(', ')||'None']);
    notice.replaceChildren(note('This project changed since you started. Your draft is kept. Compare the latest saved details before continuing.',true),reviewList(rows));
    notice.append(button('Use latest version with my draft',()=>{d.version=latest.version;d.reviewedConflict=true;notice.replaceChildren(note('Latest version acknowledged. Review your draft, then save.'));}));
  }
  let checking=false;
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(checking||host.isSaving()||!(focus==='funding'?valid(form):allocationValid(form,d,notice)))return;
    checking=true;submit.disabled=true;
    try {
      let payload=d.pending;
      if(!payload){
        const latest=await request('projects/'+id);
        if(latest.version!==d.version){compare(latest);return;}
        // The endpoint accepts both sections. Merge only the edited section into
        // the fresh record so acknowledging a conflict cannot restore stale data.
        const edited=coordinationValues(d),values={...latest.coordination};
        for(const field of focus==='team'?['requiredSkills','technicianId','technicianIds']:focus==='funding'?['fundingStatus','payerId','fundingNotes']:Object.keys(edited))values[field]=edited[field];
        payload={version:latest.version,...coordinationValues(values)};
      }
      await save(form,d,notice,submit,'projects/'+id+'/coordination','PUT',payload,()=>{drafts.delete(key);host.announce(label+' saved.');if(options.embedded)host.refresh();else location.hash='project/'+id;});
    } catch(error){notice.replaceChildren(note(error.status?error.message:'Could not check the latest project. Your draft is kept. Try saving again.',true));}
    finally{checking=false;submit.disabled=false;}
  });
  if(d.pending){lock(form,true,submit);submit.textContent='Retry save safely';}
  else if(d.version!==project.version)compare(project);
}

async function linkContact(view,id,initialRole='Occupational therapist') {
  const client=await request('clients/'+id);const key='contact/'+id;const d=getDraft(key,{mode:'existing',personId:'',role:initialRole,relationshipLabel:'',name:'',phone:'',email:'',language:'English',allowDuplicate:false,personRequestId:crypto.randomUUID()});
  title(view,'Link a contact',`Client: ${client.person.name}. This links a person to the client, not to every project.`, 'client/'+id);
  const box=panel('Contact details');const form=el('form',null,'form-grid');trackDraftForm(form,'workflow',key,{label:'Client contact',context:client.person.name+' · '+client.id});selectField(form,'Relationship to client',d,'role',[['Occupational therapist','Occupational therapist (OT)'],['Carer','Carer'],['Referrer','Referrer']],()=>{d.personId='';drawPerson();});
  field(form,'Relationship description (optional)',d,'relationshipLabel',{max:120});form.append(el('p','For example: parent, guardian or support coordinator. Multiple contacts can be linked; the preferred contact is selected separately in Client details.','field-help'));
  const mode=el('div',null,'actions');const slot=el('div');
  mode.append(button('Choose existing person',()=>{d.mode='existing';drawPerson();}),button('Create new contact',()=>{d.mode='new';d.personId='';drawPerson();}));form.append(mode,slot);
  const matchesRelationship=p=>p.active!==false&&p.directoryStatus!=='inactive'&&p.id!==client.person.id&&matchingPersonRoles(p.roles??[p.role],p.alliedHealthProfession).includes(d.role);
  function drawPerson(){
    slot.querySelectorAll('.record-picker').forEach(n=>n.recordPicker?.destroy());slot.replaceChildren();
    if(d.mode==='new'&&!d.personId){field(slot,'Full name',d,'name',{required:true});field(slot,'Phone number',d,'phone',{type:'tel',max:40});field(slot,'Email address',d,'email',{type:'email',max:200});field(slot,'Language',d,'language',{max:120});slot.append(el('p',`A ${d.role.toLowerCase()} profile will be created and linked to this client. This does not create a sign-in account.`,'field-help'));}
    else{const picker=createRecordPicker({label:'Existing person',kind:'people',role:d.role,selectedId:d.personId,required:true,onChange:(id,item)=>{if(id===client.person.id){d.personId='';void picker.setValue('');return;}d.personId=id;touch(d);}});picker.element.recordPicker=picker;slot.append(picker.element,el('p',`Search people with the ${d.role} role. A person can have multiple roles. Saved selections are retained for review; linking still checks the current role.`,'field-help'));}

  }
  drawPerson();const notice=el('div');const actions=el('div',null,'actions');const submit=saveButton('Link contact');actions.append(submit,cancel(form,d,key,'client/'+id));form.append(notice,actions);box.append(form);view.append(box);
  form.addEventListener('submit',async e=>{e.preventDefault();if(!valid(form)||host.isSaving())return;
    if(d.mode==='new'&&!d.personId){host.setSaving(true);lock(form,true);notice.replaceChildren(note('Saving the contact…'));
      try{d.dirty=true;d.personPending??={requestId:d.personRequestId,name:d.name.trim(),email:d.email.trim(),phone:d.phone.trim(),language:d.language.trim(),role:d.role,allowDuplicate:d.allowDuplicate};const person=await request('people','POST',d.personPending);d.personPending=null;d.personId=person.id;d.mode='existing';drawPerson();}
      catch(error){if(error.status){d.personPending=null;d.personRequestId=crypto.randomUUID();}notice.replaceChildren(note(error.status?error.message:'Contact save was not confirmed. Retry safely using the same details.',true));if(error.data?.candidates){for(const p of error.data.candidates){const candidateId=p.type==='client'?p.personId:p.id;let candidate;try{candidate=(await request('selections/people/'+candidateId)).item;}catch{}if(candidate&&matchesRelationship(candidate))notice.append(button(`Use ${p.name}`,()=>{d.personId=candidateId;d.mode='existing';drawPerson();notice.replaceChildren();}));else notice.append(el('p',`${p.name} already exists but is not available as a ${d.role.toLowerCase()}. Review their profile in People before linking.`,'field-help'));}notice.append(button('This is a different person — create separate contact',()=>{d.allowDuplicate=true;d.personRequestId=crypto.randomUUID();form.requestSubmit();}));}host.setSaving(false);return;}
      finally{refreshDraftReview();host.setSaving(false);lock(form,Boolean(d.personPending),submit);if(d.personPending)submit.textContent='Retry save safely';}
    }
    await save(form,d,notice,submit,`clients/${id}/contacts`,'POST',{requestId:d.requestId,personId:d.personId,role:d.role,relationshipLabel:d.relationshipLabel??''},()=>{drafts.delete(key);host.announce('Contact linked.');location.hash='client/'+id;});
  });
  if(d.pending||d.personPending){notice.append(note('A previous save was not confirmed. Retry using the same details.'));lock(form,true,submit);submit.textContent='Retry save safely';}
}
export function addClientContactActions(box,client) {
  const actions=el('div',null,'actions');actions.append(link('Link a contact','link-contact/'+client.id,'button secondary'),link('Link a referrer','link-referrer/'+client.id,'button secondary'));box.append(actions);
  if(!client.contacts?.length)box.append(el('p','No client contacts linked yet. Add an occupational therapist, carer or referrer.','muted'));
  for(const c of client.contacts??[]){const row=el('div',null,'contact-row');const text=el('div');text.append(link(c.name,'person/'+c.personId,'row-title'),el('p',[c.role,c.relationshipLabel].filter(Boolean).join(' · '),'muted'));row.append(text);
    row.append(button(`Unlink ${c.name}`,()=>{const preferred=client.details?.preferredContact==='representative'&&client.details.representativePersonId===c.personId,otherLink=client.contacts.some(other=>other.personId===c.personId&&other.role!==c.role);const impact=preferred?(otherLink?' Another contact link to this preferred representative will remain.':' This is the client’s preferred representative. Unlinking will make intake details incomplete. Review Client details afterward and choose the client or another linked representative.'):'';const prompt=note(`Remove ${c.name} from this client’s contacts? The person record and project links will remain.${impact}`);const d={requestId:crypto.randomUUID()};const form=el('form');const submit=saveButton('Unlink contact');form.append(submit,button('Keep contact',()=>prompt.remove()));const feedback=el('div');form.append(feedback);prompt.append(form);row.append(prompt);form.addEventListener('submit',e=>{e.preventDefault();save(form,d,feedback,submit,`clients/${client.id}/contacts/remove`,'POST',{requestId:d.requestId,personId:c.personId,role:c.role},()=>{host.refresh();});});},'text-button'));box.append(row);}
}
export async function renderWorkflow(view,route,arg,options={}) {
  if(route==='new-person'||route==='edit-person')await personProfile(view,route==='edit-person'?arg:null);
  else if(route==='new-client')await newClient(view,arg);
  else if(route==='new-project')await newProject(view,arg);
  else if(route==='link-contact')await linkContact(view,arg);
  else if(route==='link-referrer')await linkContact(view,arg,'Referrer');
  else if(route==='coordination')await editCoordination(view,arg,options);
  else if(['organisation-category','edit-organisation','new-organisation'].includes(route))await organisationCategory(view,route==='new-organisation'?null:arg);
  else return false;
  return true;
}

async function personProfile(view, id) {
  const [catalogue, person] = await Promise.all([request('person-options'), id ? request('people/' + id) : null]);
  const rolesOnly=Boolean(id)&&location.hash.split('/')[2]==='roles';
  const key = id ? (rolesOnly?'person-roles/':'person/') + id : 'new-person';
  const d = getDraft(key, { name:person?.name ?? '', email:person?.email ?? '', phone:person?.phone ?? '', language:'English', ...(!id?emptyIntakeAddress:{}),roles:person?.roles ?? [], membershipStatus:person?.membershipStatus??'Not recorded', cohorts:person?.cohorts??[], skills:person?.technician?.skills ?? [], availability:person?.technician?.availability ?? 'unknown', version:person?.version, allowDuplicate:false });
  if(person)reconcileContactDraft(d,person);
  title(view, rolesOnly?'Edit roles & membership':id?'Edit person':'New person', rolesOnly?person.name:'Record each person once and select all of their directory roles.');
  view.append(link('← Back to people', 'people', 'breadcrumb'));
  const box = panel('Person details'), form = el('form', null, 'form-grid');trackDraftForm(form,'workflow',key,{label:'Person details',context:person?person.name+' · '+person.id:'New person'});
  if(!rolesOnly){field(form,'Full name',d,'name',{required:true});field(form,'Phone number',d,'phone',{type:'tel',max:40});field(form,'Email address',d,'email',{type:'email',max:200});}
  if(!id){field(form,'Language',d,'language',{max:120});intakeAddressFields(form,d,false);}
  const roles = el('fieldset'); roles.classList.add('person-role-options'); roles.append(el('legend','Directory roles'),el('p','Select Technician to make this person available for project teams. Directory roles are separate from mailing groups and sign-in accounts.','field-help'));
  const mailing=el('fieldset');mailing.append(el('legend','Membership and mailing groups'));
  selectField(mailing,'Membership status',d,'membershipStatus',MEMBERSHIP_STATUSES.map(value=>[value,value]));
  const groupList=el('details');groupList.open=Boolean(d.cohorts.length);
  groupList.append(el('summary','Mailing groups'),el('p','Select all groups that apply. Record membership status separately for the All members mailing list.','field-help'));
  const groupChecks=el('div',null,'skill-options');
  for(const cohort of MAILING_COHORTS)check(groupChecks,cohort,d.cohorts.includes(cohort),on=>{d.cohorts=on?[...d.cohorts,cohort]:d.cohorts.filter(name=>name!==cohort);touch(d);});
  groupList.append(groupChecks);mailing.append(groupList);
  const tech = el('fieldset'); tech.append(el('legend','Technician details'),el('p','Record skills and general allocation status. Dated calendar availability is recorded separately and does not change this status. These details do not establish clearance or permission to start work.','field-help'));
  const skills = el('div',null,'skill-options');
  for (const skill of catalogue.skills) check(skills,skill,d.skills.includes(skill),on=>{d.skills=on?[...d.skills,skill]:d.skills.filter(s=>s!==skill);touch(d);});
  tech.append(el('span','Skills','field-label'),skills);
  selectField(tech,'General allocation status',d,'availability',catalogue.availability.map(v=>[v,v==='unknown'?'Not recorded':v==='unavailable'?'Unavailable':v==='limited'?'Limited availability':'Available']));
  for(const role of catalogue.roles){
    if(role==='Occupational therapist'&&!person?.roles?.includes(role))continue;
    const label=role==='Allied-health contact'?'Allied health':role==='Occupational therapist'?'Occupational therapist (existing role)':role;
    const input=check(roles,label,d.roles.includes(role),on=>{d.roles=on?[...d.roles,role]:d.roles.filter(r=>r!==role);tech.hidden=!d.roles.includes('Technician');touch(d);});
    if(role==='Client'&&person?.clientId){input.disabled=true;input.dataset.keepDisabled='true';}
  }
  if(person?.clientId)roles.append(el('p','The linked client role is retained. Other roles can be recorded on this same person.','field-help'));
  const followUp=el('p',null,'field-help');
  function showRoleDetails(){
    const details=[];
    if(d.roles.includes('Technician'))details.push('Record the technician’s base location and service areas on their profile after saving.');
    if(d.roles.some(role=>role==='Occupational therapist'||role==='Allied-health contact'))details.push('Record their allied health profession under Edit contact details after saving.');
    followUp.textContent=details.join(' ');
    followUp.hidden=!details.length;
  }
  roles.addEventListener('change',showRoleDetails);
  showRoleDetails();
  tech.hidden=!d.roles.includes('Technician');
  form.append(roles,tech,followUp,mailing,el('p','Administrator is a recorded role only. It does not create a login or grant access to this application.','field-help'));
  const notice=el('div'), actions=el('div',null,'actions'), submit=saveButton(id?'Save profile':'Save person');
  actions.append(submit,cancel(form,d,key,id?'person/'+id:'people'));form.append(notice,actions);box.append(form);view.append(box);
  function duplicate(candidates) {
    notice.append(el('h2','Please check these existing records'));
    for(const candidate of candidates) notice.append(link(`${candidate.name} — open existing profile`, 'person/'+(candidate.personId??candidate.id), 'duplicate-result'));
    notice.append(button('These details are correct — save anyway',()=>{d.allowDuplicate=true;d.requestId=crypto.randomUUID();form.requestSubmit();}));
  }
  if(id&&d.version!==person.version&&!d.pending) {
    notice.append(note('This profile changed since you started. Compare the latest details before saving your draft.',true),reviewList([['Name',person.name],['Phone',person.phone||'None'],['Email',person.email||'None'],['Roles',person.roles.join(', ')],['Membership status',person.membershipStatus??'Not recorded'],['Mailing groups',person.cohorts?.join(', ')||'None recorded'],['Skills',person.technician?.skills.join(', ')||'None'],['General allocation status',person.technician?.availability||'Not a technician']]));
    notice.append(button('Use latest version with my draft',()=>{d.version=person.version;d.reviewedConflict=true;d.requestId=crypto.randomUUID();notice.replaceChildren(note('Latest version acknowledged. Review your draft, then save.'));}));
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!valid(form))return;
    if(!d.roles.length){notice.replaceChildren(note('Choose at least one role for this person.',true));return;}
    const payload={requestId:d.requestId,name:d.name.trim(),email:d.email.trim(),phone:d.phone.trim(),roles:d.roles,...(id?{}:{language:d.language.trim(),...intakeAddressPayload(d)}),membershipStatus:d.membershipStatus,cohorts:d.cohorts,technician:d.roles.includes('Technician')?{skills:d.skills,availability:d.availability}:null,allowDuplicate:d.allowDuplicate,...(id?{version:d.version}:{})};
    await save(form,d,notice,submit,id?`people/${id}/profile`:'people',id?'PUT':'POST',payload,p=>{drafts.delete(key);host.announce('Person profile saved.');location.hash='person/'+p.id;},candidates=>duplicate(candidates));
    if(id&&notice.querySelector('[role=alert]')&&!d.pending) notice.append(button('Compare latest profile',()=>host.refresh()));
  });
  if(d.pending){lock(form,true,submit);submit.textContent='Retry save safely';notice.append(note('A previous save could not be confirmed. Retry it before changing these details.'));}
}

async function organisationCategory(view,id){
 const item=id?await request('organisations/'+id):null,directory=await request('organisations'),key=id?'edit-organisation/'+id:'new-organisation',d=getDraft(key,{name:item?.name||'',role:item?.role||'',description:item?.description||'',category:item?.category||'',email:item?.email||'',website:item?.website||'',phone:item?.phone||'',ndisProviderNumber:item?.ndisProviderNumber||'',contactName:item?.contactName||'',directoryStatus:item?.directoryStatus??'current',...(id?{version:item.version}:{})});
 for(const key of ['website','phone','ndisProviderNumber','contactName'])d[key]??=item?.[key]||'';
 d.directoryStatus??=item?.directoryStatus??'current';d.roles??=item?.roles?.length?[...item.roles]:d.role?[d.role]:[];d.allowDuplicate??=false;if(!d.dirty&&!d.pending)baselineDraft(d,true);
 title(view,id?'Edit organisation':'New organisation',id?item.name:'Record an organisation once, then link it to projects as needed.');view.append(link(id?'Back to organisation':'Back to organisations',id?'organisation/'+id:'organisations','breadcrumb'));
 const box=panel('Organisation details'),form=el('form',null,'form-grid');trackDraftForm(form,'workflow',key,{label:'Organisation details',context:item?item.name+' · '+item.id:'New organisation'});
 field(form,'Organisation name',d,'name',{required:true,max:200});
 const suggest=(label,key,values,help)=>{const input=field(form,label,d,key,{required:key==='role',max:key==='role'?120:80,help});const list=el('datalist');list.id='organisation-'+key+'-options';for(const value of [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'en-AU'))){const option=el('option');option.value=value;list.append(option);}input.setAttribute('list',list.id);form.append(list);};
 selectField(form,'Directory status',d,'directoryStatus',[['current','Current'],['inactive','Inactive'],['review','Needs review']]);
 form.append(el('p','Inactive organisations remain available in history and can be made current again. Needs review flags a record for checking; it does not merge or delete it.','field-help'));
 const roleBox=el('fieldset',null,'organisation-role-options');roleBox.append(el('legend','Organisation roles'));
 for(const role of [...new Set([...organisationRoleSuggestions,...directory.items.flatMap(o=>o.roles??[o.role]),...d.roles].filter(Boolean))])check(roleBox,role,d.roles.includes(role),on=>{d.roles=on?[...d.roles,role]:d.roles.filter(r=>r!==role);d.role=d.roles[0]??'';touch(d);});form.append(roleBox);
 const custom=el('input');custom.maxLength=120;custom.setAttribute('aria-label','Additional organisation role');const customLabel=el('label','Additional organisation role');customLabel.append(custom);form.append(customLabel,button('Add role',()=>{const role=custom.value.trim();if(role&&!d.roles.some(r=>r.toLowerCase()===role.toLowerCase())){d.roles.push(role);d.role=d.roles[0];check(roleBox,role,true,on=>{d.roles=on?[...d.roles,role]:d.roles.filter(r=>r!==role);d.role=d.roles[0]??'';touch(d);});touch(d);}custom.value='';}));
 field(form,'Notes',d,'description',{type:'textarea',max:2000});
 suggest('Category','category',['School','NDIS','Health service','Government','Community organisation','Supplier','Other',...directory.items.map(o=>o.category)],'Optional grouping, such as School or NDIS. Organisation type describes its role; category helps your team organise records.');
 field(form,'Organisation email',d,'email',{type:'email',max:254,help:'The organisation contact address, used in reports.'});
 field(form,'Website',d,'website',{max:2000,help:'Enter the website address, for example https://example.org. A domain without https:// is also accepted.'});
 field(form,'Phone number',d,'phone',{type:'tel',max:40});
 field(form,'NDIS provider number',d,'ndisProviderNumber',{max:80,help:'The organisation’s provider number, if known. This is separate from a client’s NDIS participant number.'});
 field(form,'Contact name',d,'contactName',{max:200});
 const notice=el('div'),actions=el('div',null,'actions'),submit=saveButton(id?'Save organisation details':'Create organisation');actions.append(submit,cancel(form,d,key,id?'organisation/'+id:'organisations'));form.append(notice,actions);box.append(form);view.append(box);
 if(id&&d.version!==item.version){notice.append(note('This organisation changed. Compare the latest saved details before retaining your draft.',true));const latest=el('dl',null,'record-details');for(const [label,k] of [['Name','name'],['Type','role'],['Notes','description'],['Category','category'],['Email','email'],['Website','website'],['Phone','phone'],['NDIS provider number','ndisProviderNumber'],['Contact name','contactName'],['Directory status','directoryStatus']])latest.append(el('dt',label),el('dd',item[k]||'Not recorded'));notice.append(latest,button('Use latest version with my draft',()=>{d.version=item.version;d.reviewedConflict=true;d.requestId=crypto.randomUUID();notice.replaceChildren(note('Latest version acknowledged. Review all organisation details, then save.'));}));}
 form.addEventListener('submit',e=>{e.preventDefault();if(!valid(form))return;if(!d.roles.length){notice.replaceChildren(note('Choose at least one organisation role.',true));return;}const payload={requestId:d.requestId,...(id?{version:d.version}:{}),...Object.fromEntries(['name','description','category','email','website','phone','ndisProviderNumber','contactName','directoryStatus'].map(k=>[k,d[k].trim()])),role:d.roles[0],roles:d.roles,allowDuplicate:d.allowDuplicate};save(form,d,notice,submit,id?'organisations/'+id+'/profile':'organisations',id?'PUT':'POST',payload,result=>{drafts.delete(key);host.announce(id?'Organisation details saved.':'Organisation created.');location.hash='organisation/'+result.id;},candidates=>{notice.append(el('h2','Please check these existing organisations'));for(const c of candidates)notice.append(link(c.name+' — open existing record','organisation/'+c.id,'duplicate-result'));notice.append(button('This is a different organisation — save anyway',()=>{d.allowDuplicate=true;d.requestId=crypto.randomUUID();form.requestSubmit();}));});});
 form.addEventListener('input',e=>{if(e.target.name==='name'||e.target.name==='email')d.allowDuplicate=false;});
 if(d.pending){lock(form,true,submit);submit.textContent='Retry save safely';notice.append(note('A previous save could not be confirmed. Retry it before changing these details.'));}
}
