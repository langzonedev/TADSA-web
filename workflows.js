// Call-intake workflows. All records in this development workspace are fictional.
const drafts = new Map();
let host;
export const configureWorkflows = options => { host = options; };
export const workflowHasDrafts = () => [...drafts.values()].some(d => d.dirty || d.pending);
const el = (tag, text, cls) => { const n = document.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
const link = (text, route, cls = 'text-button') => { const n = el('a', text, cls); n.href = '#' + route; return n; };
const button = (text, action, cls = 'secondary') => { const n = el('button', text, cls); n.type = 'button'; n.addEventListener('click', action); return n; };
const note = (text, error = false) => { const n = el('div', text, error ? 'message error' : 'message'); n.setAttribute('role', error ? 'alert' : 'status'); return n; };
const title = (view, text, sub, back) => { if (back) view.append(link('← Back to '+(back.startsWith('project/')?'project':'client'), back, 'breadcrumb')); view.append(el('h1', text), el('p', sub, 'subtitle workflow-intro')); };
const panel = text => { const n = el('section', null, 'panel workflow-panel'); if (text) n.append(el('h2', text)); return n; };
const getDraft = (key, initial) => { if (!drafts.has(key)) drafts.set(key, { ...initial, requestId: crypto.randomUUID(), dirty: false }); return drafts.get(key); };
const touch = d => { d.dirty = true; };
const options = (items, value) => items.map(([id, name]) => { const n = el('option', name); n.value = id; n.selected = id === value; return n; });
function field(form, label, d, key, { type = 'text', required = false, max = 120, help = '' } = {}) {
  const l = el('label', null, 'workflow-field'); l.append(el('span', label, 'field-label'));
  const input = el(type === 'textarea' ? 'textarea' : 'input');
  if (type !== 'textarea') input.type = type;
  input.setAttribute('aria-label', label); input.name = key; input.value = d[key] ?? ''; input.required = required; input.maxLength = max;
  if (type === 'textarea') input.rows = 4;
  input.addEventListener('input', () => { d[key] = input.value; touch(d); input.setCustomValidity(''); });
  l.append(input); if (help) l.append(el('small', help, 'field-help')); form.append(l); return input;
}
function selectField(form, label, d, key, values, change) {
  const l = el('label', null, 'workflow-field'); l.append(el('span', label, 'field-label')); const input = el('select'); input.setAttribute('aria-label', label); input.name = key; input.append(...options(values, d[key]));
  input.addEventListener('change', () => { input.setCustomValidity(''); d[key] = input.value; touch(d); change?.(); }); l.append(input); form.append(l); return input;
}
function check(form, label, checked, change) {
  const l = el('label', null, 'checkbox'); const input = el('input'); input.type = 'checkbox'; input.checked = checked; input.addEventListener('change', () => change(input.checked)); l.append(input, el('span', label)); form.append(l); return input;
}
function lock(form, locked, retry) { form.querySelectorAll('input,textarea,select,button').forEach(n => { n.disabled = n.dataset.keepDisabled === 'true' || (locked && n !== retry); }); }
async function request(path, method = 'GET', body) {
  const response = await fetch('/api/' + path, { method, ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(12000) });
  let data;
  try { data = await response.json(); } catch { throw new Error('The save result could not be confirmed.'); }
  if (!response.ok) { const e = new Error(data.error || 'Could not save.'); e.status = response.status; e.data = data; throw e; }
  return data;
}
async function save(form, d, notice, saveButton, path, method, payload, done, duplicate) {
  if (host.isSaving()) return;
  const body = d.pending ?? payload; d.pending = body; d.dirty = true; host.setSaving(true); lock(form, true); notice.replaceChildren(note('Saving… Please wait.'));
  try { const result = await request(path, method, body); d.pending = null; host.setSaving(false); await done(result); }
  catch (error) {
    if (error.status) { d.pending = null; d.requestId = crypto.randomUUID(); }
    notice.replaceChildren(note(error.status ? error.message : 'The save result is not confirmed. Your details are kept. Retry the same save to check safely without creating a duplicate.', true));
    if (error.data?.candidates?.length && duplicate) duplicate(error.data.candidates);
    if (error.status === 409 && !duplicate) { notice.append(el('p', 'Another change may have been saved. Your draft is retained.', 'field-help')); if (method === 'PUT') notice.append(button('Compare latest allocation', () => host.refresh())); }
  } finally { host.setSaving(false); lock(form, Boolean(d.pending), saveButton); saveButton.disabled = false; saveButton.textContent = d.pending ? 'Retry save safely' : saveButton.dataset.label; }
}
function cancel(form, d, key, route, label = 'Cancel') {
  return button(label, () => {
    if (!d.dirty) { drafts.delete(key); location.hash = route; return; }
    let confirm = form.querySelector('.discard-question'); if (confirm) return;
    confirm = note('Discard the unsaved details?'); confirm.classList.add('discard-question');
    confirm.append(button('Keep editing', () => confirm.remove()), button('Discard draft', () => { drafts.delete(key); location.hash = route; })); form.append(confirm); confirm.querySelector('button').focus();
  });
}
function saveButton(label) { const n = el('button', label, 'primary'); n.type = 'submit'; n.dataset.label = label; return n; }
function valid(form) { for (const n of form.querySelectorAll('[required]')) { n.setCustomValidity(''); if (!n.value.trim()) n.setCustomValidity('Please enter this information.'); } return form.reportValidity(); }

async function newClient(view, arg) {
  const key = 'new-client'; const d = getDraft(key, { name: '', email: '', phone: '', allowDuplicate: false, forProject: arg === 'project' });
  if (arg === 'project') d.forProject = true;
  title(view, 'New client', 'Start with the details you know. A client can be saved before there is a project.');
  const box = panel('Client details'); const form = el('form', null, 'form-grid');
  field(form, 'Full name', d, 'name', { required: true, help: 'Use the name the client wants us to use. Required.' });
  field(form, 'Phone number', d, 'phone', { type: 'tel', max: 40, help: 'Optional. Helpful when checking whether this person already has a record.' });
  field(form, 'Email address', d, 'email', { type: 'email', max: 200, help: 'Optional. Do not invent an address if it is unknown.' });
  const notice = el('div'); const actions = el('div', null, 'actions'); const submit = saveButton('Save client');
  actions.append(submit, cancel(form, d, key, d.forProject ? 'new-project' : 'people')); form.append(notice, actions); box.append(form); view.append(box);
  function duplicates(rows) {
    const match = panel('Please check these existing records');
    match.append(el('p', 'A matching name or contact detail does not always mean the same person. Open the record and check before creating another client.'));
    for (const r of rows) match.append(link(`${r.name} · ${r.phone || r.email || 'No contact details'}`, `${r.type === 'client' ? 'client' : 'person'}/${r.id}`, 'duplicate-result'));
    match.append(button('This is a different person — create separate client', () => { d.allowDuplicate = true; d.requestId = crypto.randomUUID(); form.requestSubmit(); })); notice.append(match);
  }
  form.addEventListener('submit', e => { e.preventDefault(); if (!valid(form)) return; save(form, d, notice, submit, 'clients', 'POST', { requestId: d.requestId, name: d.name.trim(), email: d.email.trim(), phone: d.phone.trim(), allowDuplicate: d.allowDuplicate }, result => {
    drafts.delete(key); host.announce('Client saved.');
    if (d.forProject) { const project = drafts.get('new-project'); if (project) { project.clientId = result.id; project.step = 2;  } location.hash = 'new-project/' + result.id; }
    else location.hash = 'client/' + result.id;
  }, duplicates); });
  if (d.pending) { notice.append(note('A previous save was not confirmed. Retry it safely.')); lock(form, true, submit); submit.textContent = 'Retry save safely'; }
}

function coordinationValues(d) { return { requiredSkills: d.requiredSkills, technicianId: d.technicianId || null, technicianIds: d.technicianIds ?? (d.technicianId?[d.technicianId]:[]), fundingStatus: d.fundingStatus, payerId: ['person', 'organisation'].includes(d.fundingStatus) ? d.payerId || null : null, fundingNotes: d.fundingNotes.trim() }; }
function coordinationFields(form, d, directories) {
  const funding = el('fieldset'); funding.append(el('legend', 'Who is expected to pay?'));
  selectField(funding, 'Payer', d, 'fundingStatus', [['unknown','Not known yet'],['self','The client'],['organisation','An organisation'],['person','Another person']], () => { d.payerId = ''; drawPayer(); });
  const payerSlot = el('div'); funding.append(payerSlot);
  function drawPayer() { payerSlot.replaceChildren(); if (['organisation', 'person'].includes(d.fundingStatus)) {
    const items = d.fundingStatus === 'organisation' ? directories.organisations : directories.people;
    const control = selectField(payerSlot, d.fundingStatus === 'organisation' ? 'Paying organisation' : 'Paying person', d, 'payerId', [['','Choose a payer'], ...items.map(p => [p.id,p.name])]); control.required = true;
  } }
  drawPayer(); field(funding, 'Funding notes', d, 'fundingNotes', { type: 'textarea', max: 1000, help: 'For example, who will confirm funding. Selecting a payer does not approve spending or confirm payment.' }); form.append(funding);
  d.technicianIds??=d.technicianId?[d.technicianId]:[];
  const assignment = el('fieldset'); assignment.append(el('legend', 'Choose the technical team'), el('p', 'Use recorded skills to narrow the list. Confirm availability and suitability with the technician before work begins.', 'field-help'));
  const skills = el('div', null, 'skill-options'); const technicians = el('div');
  for (const skill of directories.skills) check(skills, skill, d.requiredSkills.includes(skill), on => { d.requiredSkills = on ? [...d.requiredSkills,skill] : d.requiredSkills.filter(s => s !== skill); d.assignmentAcknowledged = false; touch(d); drawTechnicians(); });
  assignment.append(el('h3', 'Skills needed (optional)'), skills);
  check(assignment, 'Show technicians who do not match all selected skills', d.showAll ?? false, on => { d.showAll = on; drawTechnicians(); });
  const areaFilter=selectField(assignment,'Technician service area filter',d,'filterArea',[['','Any service area'],...directories.serviceAreas.map(a=>[a.id,a.label])]);const postcodeFilter=field(assignment,'Technician postcode filter',d,'filterPostcode',{max:4,help:'Exact postcode or recorded service area only; no travel distance is inferred.'});postcodeFilter.inputMode='numeric';areaFilter.addEventListener('change',()=>{d.assignmentAcknowledged=false;drawTechnicians();});postcodeFilter.addEventListener('input',()=>{d.assignmentAcknowledged=false;drawTechnicians();});
  assignment.append(link('View all technician calendars and service areas','availability'),technicians); form.append(assignment);
  function drawTechnicians() {
    technicians.replaceChildren();
    if(d.technicianId&&!directories.technicians.some(t=>t.id===d.technicianId)) technicians.append(note('The previously assigned person is no longer listed as a technician. Their saved assignment remains in the project history. Choose active technical members or clear the team selection before saving this allocation.',true));
    const locationMatches=t=>(!d.filterArea||(t.serviceAreas||[]).includes(d.filterArea))&&(!d.filterPostcode||t.postcode===d.filterPostcode);const visible = directories.technicians.filter(t => d.technicianIds.includes(t.id) || ((d.showAll || d.requiredSkills.every(s => t.skills.includes(s)))&&locationMatches(t)));
    const rows=visible;if(d.technicianIds.length)technicians.append(button('Clear team selection',()=>{d.technicianIds=[];d.technicianId='';d.assignmentAcknowledged=false;touch(d);drawTechnicians();}));technicians.append(el('p',d.technicianIds.length?`${d.technicianIds.length} technical members selected`:'No technician assigned yet. You can allocate the team later.','field-help'));
    for (const t of rows) {
      const l = el('label', null, 'choice-card'); const radio = el('input'); radio.type = 'checkbox'; radio.name = 'technician'; radio.value = t.id; radio.checked = d.technicianIds.includes(t.id);
      const text = el('span'); text.append(el('strong', t.name));
      if (t.id) text.append(el('small', `${t.skills.join(' · ')}. ${t.openCount} open projects. ${Math.round((t.remainingMinutes??0)/60*100)/100} hours remaining. General availability: ${t.availability}. Base: ${[t.suburb,t.postcode].filter(Boolean).join(' ')||'Not recorded'}. Service areas: ${(t.serviceAreas||[]).map(a=>({western:'Western suburbs',southern:'Southern suburbs',northern:'Northern suburbs',eastern:'Eastern suburbs','adelaide-hills':'Adelaide Hills',metro:'Metropolitan Adelaide',regional:'Regional South Australia'}[a]||a)).join(', ')||'Not recorded'}.`));
      else text.append(el('small', 'Save the request now and allocate someone later.'));
      radio.addEventListener('change', () => { d.technicianIds=radio.checked?[...d.technicianIds,t.id]:d.technicianIds.filter(id=>id!==t.id);if(!d.technicianIds.includes(d.technicianId))d.technicianId=d.technicianIds[0]||'';d.assignmentAcknowledged = false; touch(d); drawTechnicians(); [...technicians.querySelectorAll('input[name=technician]')].find(input=>input.value===t.id)?.focus({preventScroll:true}); }); l.append(radio,text); technicians.append(l);
    }
    if (!visible.length) technicians.append(note('No technicians match every selected skill. Save unassigned, or show other technicians to review their skills.'));
    const team=directories.technicians.filter(t=>d.technicianIds.includes(t.id));if(team.length){selectField(technicians,'Lead technician',d,'technicianId',team.map(t=>[t.id,t.name]));technicians.append(el('p','The lead is the main contact; every selected technical member is linked to this project.','field-help'));}
    const selected = directories.technicians.find(t => t.id === d.technicianId);
    if(selected)technicians.append(link('View '+selected.name+' — qualifications & clearances','person/'+selected.id));
    d.needsAcknowledgement = team.some(t=>t.availability !== 'available'||!d.requiredSkills.every(s=>t.skills.includes(s))||!locationMatches(t));
    if (d.needsAcknowledgement) { technicians.append(note('Check this allocation: the recorded skills, availability or location need a conversation. This is not an eligibility or safety assessment.')); check(technicians, 'I have reviewed the skill / availability / location warning', d.assignmentAcknowledged ?? false, on => { d.assignmentAcknowledged = on; touch(d); }); }
  }
  drawTechnicians();
}
async function directories() {
  const [technicians, people, organisations,areas] = await Promise.all([request('technicians'),request('people'),request('organisations'),request('availability-options')]);
  const byName=(a,b)=>a.name.localeCompare(b.name,'en-AU');return { serviceAreas:[...areas.serviceAreas].sort((a,b)=>a.label.localeCompare(b.label,'en-AU')),technicians: [...technicians.items].sort(byName), skills: [...technicians.skills].sort(), people: [...people.items].sort(byName), organisations: [...organisations.items].sort(byName) };
}
function allocationValid(form, d, notice) { if (!valid(form)) return false; if (d.needsAcknowledgement && !d.assignmentAcknowledged) { notice.replaceChildren(note('Review the technician warning and tick the acknowledgement, or leave the request unassigned.', true)); notice.scrollIntoView({block:'nearest'}); return false; } return true; }
function reviewList(items) { const dl = el('dl', null, 'review-list'); for (const [label,value] of items) { dl.append(el('dt',label),el('dd',value)); } return dl; }
async function newProject(view, clientId) {
  const key = 'new-project'; const d = getDraft(key, { step: clientId ? 2 : 1, clientId: clientId || '', title: '', summary: '', kind: 'Assessment', fundingStatus:'unknown',payerId:'',fundingNotes:'',requiredSkills:[],technicianId:'' });
  const [clients, dirs] = await Promise.all([request('clients'),directories()]);
  if (clientId && !d.clientId) { d.clientId = clientId; d.step = 2; }
  let selected = clients.items.find(c => c.id === d.clientId);
  title(view, 'New project', 'Record an email enquiry or phone call. A project number is assigned automatically; assessment and technical work stay in this project.');
  const steps = el('ol', null, 'workflow-steps'); for (const [i,label] of ['Client','Project details','Funding & technical team','Review'].entries()) { const n = el('li', `${i+1}. ${label}`); if (i+1 === d.step) n.setAttribute('aria-current','step'); steps.append(n); } view.append(steps);
  const slot = el('div'); view.append(slot);
  function draw() {
    slot.replaceChildren(); steps.querySelectorAll('li').forEach((n,i) => i+1 === d.step ? n.setAttribute('aria-current','step') : n.removeAttribute('aria-current'));
    const box = panel(`Step ${d.step} of 4 — ${['Client','Project details','Funding & technical team','Review'][d.step-1]}`); const form = el('form', null, 'form-grid'); const notice = el('div');
    if (d.step === 1) {
      const q = el('input'); q.type = 'search'; q.setAttribute('aria-label','Find client'); q.placeholder = 'Name, phone or email'; const label = el('label'); label.append(el('span','Find an existing client','field-label'),q); form.append(label);
      const matches = el('div', null, 'client-matches');
      function results() { matches.replaceChildren(); const term = q.value.toLowerCase().trim(); const found = [...clients.items].sort((a,b)=>a.person.name.localeCompare(b.person.name,'en-AU')).filter(c => [c.person.name,c.person.email,c.person.phone].join(' ').toLowerCase().includes(term));
        for (const c of found) { const l = el('label', null,'choice-card'); const radio = el('input'); radio.type='radio';radio.name='client';radio.value=c.id;radio.checked=d.clientId===c.id;radio.addEventListener('change',()=>{d.clientId=c.id;selected=c;touch(d);}); const text=el('span');text.append(el('strong',c.person.name),el('small',`${c.person.phone || 'No phone'} · ${c.person.email || 'No email'}`));l.append(radio,text);matches.append(l); }
        if (!found.length) matches.append(el('p','No matching client. Check the spelling, or create a new client.'));
      }
      q.addEventListener('input',results);results();form.append(matches,link('Create new client','new-client/project','button secondary'),el('p',`Showing up to ${clients.limit} clients. Confirm the person’s contact details before choosing.`, 'field-help'));
    } else if (d.step === 2) {
      form.append(note(`Client: ${selected?.person.name ?? 'Choose a client first'}`));
      field(form,'Project title',d,'title',{required:true,help:'A short description the client and team will recognise.'});
      field(form,'What does the client need?',d,'summary',{type:'textarea',required:true,max:2000,help:'Describe the goal in the client’s words. Avoid unnecessary sensitive information.'});
      form.append(el('p','Assessment, quote acceptance and technical work will be recorded as stages of this project.','field-help'));
      form.append(el('p','Creating a project does not authorise work or spending. Progress through the project’s assessment, acceptance and Finance checks first.','field-help'));
    } else if (d.step === 3) {form.append(note('Client work location: '+(selected?.details?.workAddress||selected?.details?.residentialAddress||'Not recorded. Open the client record to add an address.')));coordinationFields(form,d,dirs);}
    else {
      const payer = d.fundingStatus==='unknown' ? 'Not known yet — follow up' : d.fundingStatus==='self' ? `Client: ${selected?.person.name}` : (d.fundingStatus==='organisation'?dirs.organisations:dirs.people).find(p=>p.id===d.payerId)?.name;
      form.append(reviewList([['Client',selected?.person.name],['Project',d.title],['Need',d.summary],['Expected payer',payer],['Funding notes',d.fundingNotes||'None recorded'],['Skills',d.requiredSkills.join(', ')||'Not specified'],['Technical team',dirs.technicians.filter(t=>(d.technicianIds??[]).includes(t.id)).map(t=>t.name+(t.id===d.technicianId?' (lead)':'')).join(', ')||'Not assigned yet']]));
      form.append(note('Check the client and project details before saving. No emails, work instructions or invoices will be sent.'));
    }
    const actions=el('div',null,'actions');const next=saveButton(d.step===4?'Create project':'Continue');
    if(d.step>1)actions.append(button('Back',()=>{d.step--;draw();slot.querySelector('h2').tabIndex=-1;slot.querySelector('h2').focus({preventScroll:true});window.scrollTo(0,0);}));
    actions.append(next,cancel(form,d,key,d.clientId?'client/'+d.clientId:'projects','Cancel new project'));form.append(notice,actions);box.append(form);slot.append(box);
    form.addEventListener('submit',e=>{e.preventDefault();if(d.step===1&&!d.clientId){notice.replaceChildren(note('Choose the existing client or create a new client to continue.',true));return;}if(!allocationValid(form,d,notice))return;
      if(d.step<4){d.step++;draw();slot.querySelector('h2').tabIndex=-1;slot.querySelector('h2').focus({preventScroll:true});window.scrollTo(0,0);return;}
      save(form,d,notice,next,'projects','POST',{requestId:d.requestId,clientId:d.clientId,title:d.title.trim(),summary:d.summary.trim(),kind:d.kind,...coordinationValues(d)},result=>{drafts.delete(key);host.announce('Project created.');location.hash='project/'+result.id;});
    });
    if(d.pending){notice.append(note('A previous save was not confirmed. Retry the same request safely.'));lock(form,true,next);next.textContent='Retry save safely';}
  }
  draw();
}
async function editCoordination(view,id) {
  const [project,dirs,projectLocation]=await Promise.all([request('projects/'+id),directories(),request('projects/'+id+'/location')]);const key='coordination/'+id;
  const d=getDraft(key,{...project.coordination,technicianId:project.coordination.technicianId||'',payerId:project.coordination.payerId||'',version:project.version,filterArea:projectLocation.serviceArea,filterPostcode:projectLocation.postcode});
  title(view,'Funding & technical team',project.title,'project/'+id);view.append(note('Project location: '+([projectLocation.address,projectLocation.suburb,projectLocation.postcode].filter(Boolean).join(', ')||'Not recorded. Set the location from More, then Edit project details.'))); const box=panel('Review the allocation');const form=el('form',null,'form-grid');coordinationFields(form,d,dirs);const notice=el('div');const actions=el('div',null,'actions');const submit=saveButton('Save allocation');actions.append(submit,cancel(form,d,key,'project/'+id));form.append(notice,actions);box.append(form);view.append(box);
  form.addEventListener('submit',e=>{e.preventDefault();if(!allocationValid(form,d,notice))return;save(form,d,notice,submit,'projects/'+id+'/coordination','PUT',{version:d.version,...coordinationValues(d)},()=>{drafts.delete(key);host.announce('Allocation saved.');location.hash='project/'+id;});});
  if(d.pending){lock(form,true,submit);submit.textContent='Retry save safely';}
  if(d.version!==project.version){notice.append(note('This project changed since you started. Your draft is kept. Compare the latest saved allocation before continuing.',true),reviewList([['Latest version',String(project.version)],['Funding',project.coordination.fundingStatus],['Funding notes',project.coordination.fundingNotes||'None'],['Technician',dirs.technicians.find(t=>t.id===project.coordination.technicianId)?.name||'Unassigned'],['Skills',project.coordination.requiredSkills.join(', ')||'None']]));notice.append(button('Use latest version with my draft',()=>{d.version=project.version;notice.replaceChildren(note('Latest version acknowledged. Review your draft, then save.'));}));}
}

async function linkContact(view,id) {
  const [client,people]=await Promise.all([request('clients/'+id),request('people')]);const key='contact/'+id;const d=getDraft(key,{mode:'existing',personId:'',role:'Occupational therapist',name:'',phone:'',email:'',allowDuplicate:false,personRequestId:crypto.randomUUID()});
  title(view,'Link a contact',`Client: ${client.person.name}. This links a person to the client, not to every project.`, 'client/'+id);
  const box=panel('Contact details');const form=el('form',null,'form-grid');selectField(form,'Relationship to client',d,'role',[['Occupational therapist','Occupational therapist (OT)'],['Carer','Carer'],['Referrer','Referrer']]);
  const mode=el('div',null,'actions');const slot=el('div');
  mode.append(button('Choose existing person',()=>{d.mode='existing';drawPerson();}),button('Create new contact',()=>{d.mode='new';d.personId='';drawPerson();}));form.append(mode,slot);
  function drawPerson(){slot.replaceChildren();if(d.mode==='new'&&!d.personId){field(slot,'Full name',d,'name',{required:true});field(slot,'Phone number',d,'phone',{type:'tel',max:40});field(slot,'Email address',d,'email',{type:'email',max:200});slot.append(el('p','A person record will be created, then linked to this client. It will not create a sign-in account.','field-help'));}else{const picker=selectField(slot,'Existing person',d,'personId',[['','Choose a person'],...[...people.items].sort((a,b)=>a.name.localeCompare(b.name,'en-AU')).map(p=>[p.id,`${p.name} — ${p.role}`])]);picker.required=true;if(d.personId&&!people.items.some(p=>p.id===d.personId)){picker.append(...options([[d.personId,d.name]],d.personId));picker.value=d.personId;}slot.append(el('p','People can have different relationships to different clients. Select the role for this client above.','field-help'));}}
  drawPerson();const notice=el('div');const actions=el('div',null,'actions');const submit=saveButton('Link contact');actions.append(submit,cancel(form,d,key,'client/'+id));form.append(notice,actions);box.append(form);view.append(box);
  form.addEventListener('submit',async e=>{e.preventDefault();if(!valid(form)||host.isSaving())return;
    if(d.mode==='new'&&!d.personId){host.setSaving(true);lock(form,true);notice.replaceChildren(note('Saving the contact…'));
      try{d.dirty=true;d.personPending??={requestId:d.personRequestId,name:d.name.trim(),email:d.email.trim(),phone:d.phone.trim(),role:d.role,allowDuplicate:d.allowDuplicate};const person=await request('people','POST',d.personPending);d.personPending=null;d.personId=person.id;d.mode='existing';people.items.push(person);drawPerson();}
      catch(error){if(error.status){d.personPending=null;d.personRequestId=crypto.randomUUID();}notice.replaceChildren(note(error.status?error.message:'Contact save was not confirmed. Retry safely using the same details.',true));if(error.data?.candidates){for(const p of error.data.candidates)notice.append(button(`Use ${p.name}`,()=>{d.personId=p.type==='client'?p.personId:p.id;d.mode='existing';drawPerson();notice.replaceChildren();}));notice.append(button('This is a different person — create separate contact',()=>{d.allowDuplicate=true;d.personRequestId=crypto.randomUUID();form.requestSubmit();}));}host.setSaving(false);return;}
      finally{host.setSaving(false);lock(form,Boolean(d.personPending),submit);if(d.personPending)submit.textContent='Retry save safely';}
    }
    await save(form,d,notice,submit,`clients/${id}/contacts`,'POST',{requestId:d.requestId,personId:d.personId,role:d.role},()=>{drafts.delete(key);host.announce('Contact linked.');location.hash='client/'+id;});
  });
  if(d.pending||d.personPending){notice.append(note('A previous save was not confirmed. Retry using the same details.'));lock(form,true,submit);submit.textContent='Retry save safely';}
}
export function addClientContactActions(box,client) {
  box.append(link('Link a contact','link-contact/'+client.id,'button secondary'));
  if(!client.contacts?.length)box.append(el('p','No client contacts linked yet. Add an occupational therapist, carer or referrer.','muted'));
  for(const c of client.contacts??[]){const row=el('div',null,'contact-row');const text=el('div');text.append(link(c.name,'person/'+c.personId,'row-title'),el('p',c.role,'muted'));row.append(text);
    row.append(button(`Unlink ${c.name}`,()=>{const prompt=note(`Remove ${c.name} from this client’s contacts? The person record and project links will remain.`);const d={requestId:crypto.randomUUID()};const form=el('form');const submit=saveButton('Unlink contact');form.append(submit,button('Keep contact',()=>prompt.remove()));const feedback=el('div');form.append(feedback);prompt.append(form);row.append(prompt);form.addEventListener('submit',e=>{e.preventDefault();save(form,d,feedback,submit,`clients/${client.id}/contacts/remove`,'POST',{requestId:d.requestId,personId:c.personId,role:c.role},()=>{host.refresh();});});},'text-button'));box.append(row);}
}
export async function renderWorkflow(view,route,arg) {
  if(route==='new-person'||route==='edit-person')await personProfile(view,route==='edit-person'?arg:null);
  else if(route==='new-client')await newClient(view,arg);
  else if(route==='new-project')await newProject(view,arg);
  else if(route==='link-contact')await linkContact(view,arg);
  else if(route==='coordination')await editCoordination(view,arg);
  else if(route==='organisation-category')await organisationCategory(view,arg);
  else return false;
  return true;
}

async function personProfile(view, id) {
  const [catalogue, person] = await Promise.all([request('person-options'), id ? request('people/' + id) : null]);
  const key = id ? 'person/' + id : 'new-person';
  const d = getDraft(key, { name:person?.name ?? '', email:person?.email ?? '', phone:person?.phone ?? '', roles:person?.roles ?? [], skills:person?.technician?.skills ?? [], availability:person?.technician?.availability ?? 'unavailable', version:person?.version, allowDuplicate:false });
  title(view, id ? 'Edit person' : 'New person', 'Choose one profile type. A technician may also be an administrator; other types use separate profiles.');
  view.append(link('← Back to people', 'people', 'breadcrumb'));
  const box = panel('Person details'), form = el('form', null, 'form-grid');
  field(form,'Full name',d,'name',{required:true}); field(form,'Phone number',d,'phone',{type:'tel',max:40}); field(form,'Email address',d,'email',{type:'email',max:200});
  const roles = el('fieldset'); roles.classList.add('person-role-options'); roles.append(el('legend','Profile type'),el('p','Choose one type. Client and occupational therapist records stay separate from technician profiles.','field-help'));
  const tech = el('fieldset'); tech.append(el('legend','Technician details'),el('p','Record skills and current availability to help allocate projects. These details do not establish clearance or permission to start work.','field-help'));
  const skills = el('div',null,'skill-options');
  for (const skill of catalogue.skills) check(skills,skill,d.skills.includes(skill),on=>{d.skills=on?[...d.skills,skill]:d.skills.filter(s=>s!==skill);touch(d);});
  tech.append(el('span','Skills','field-label'),skills);
  selectField(tech,'Availability',d,'availability',catalogue.availability.map(v=>[v,v==='unavailable'?'Not available / not confirmed':v==='limited'?'Limited availability':'Available']));
  const compatible=d.roles.length===1||(d.roles.length===2&&d.roles.includes('Technician')&&d.roles.includes('Administrator'));
  d.profileType??=compatible?(d.roles.includes('Technician')?'Technician':d.roles[0]):'';
  if(!compatible&&d.roles.length)roles.append(note('This existing profile combines '+d.roles.join(', ')+'. Select its correct type before saving. Linked projects and history remain recorded; reassign current technician work before removing that role.',true));
  const typePicker=selectField(roles,'Profile type',d,'profileType',[['','Choose a profile type'],...catalogue.roles.map(r=>[r,r])]);typePicker.required=true;
  if(person&&!person.clientId)roles.append(el('p','Choosing Client creates the linked client record for this person. Reassign technician work before changing their profile type.','field-help'));
  if(person?.clientId){for(const option of typePicker.options)if(option.value&&option.value!=='Client')option.disabled=true;roles.append(el('p','This profile has a linked client record. Retain Client here; create a separate profile for another type.','field-help'));}
  const alsoAdmin=el('div');const adminCheck=check(alsoAdmin,'Also an administrator',d.roles.includes('Administrator')&&d.roles.includes('Technician'),on=>{d.roles=on?['Technician','Administrator']:['Technician'];touch(d);});roles.append(alsoAdmin);
  const chooseType=()=>{d.roles=d.profileType==='Technician'?(adminCheck.checked?['Technician','Administrator']:['Technician']):d.profileType?[d.profileType]:[];tech.hidden=d.profileType!=='Technician';alsoAdmin.hidden=d.profileType!=='Technician';touch(d);};
  typePicker.addEventListener('change',chooseType);alsoAdmin.hidden=d.profileType!=='Technician';
  tech.hidden=!d.roles.includes('Technician');
  form.append(roles,tech,el('p','Administrator is a recorded role only. It does not create a login or grant access to this application.','field-help'));
  const notice=el('div'), actions=el('div',null,'actions'), submit=saveButton(id?'Save profile':'Save person');
  actions.append(submit,cancel(form,d,key,id?'person/'+id:'people'));form.append(notice,actions);box.append(form);view.append(box);
  function duplicate(candidates) {
    notice.append(el('h2','Please check these existing records'));
    for(const candidate of candidates) notice.append(link(`${candidate.name} — open existing profile`, 'person/'+(candidate.personId??candidate.id), 'duplicate-result'));
    notice.append(button('These details are correct — save anyway',()=>{d.allowDuplicate=true;d.requestId=crypto.randomUUID();form.requestSubmit();}));
  }
  if(id&&d.version!==person.version&&!d.pending) {
    notice.append(note('This profile changed since you started. Compare the latest details before saving your draft.',true),reviewList([['Name',person.name],['Phone',person.phone||'None'],['Email',person.email||'None'],['Roles',person.roles.join(', ')],['Skills',person.technician?.skills.join(', ')||'None'],['Availability',person.technician?.availability||'Not a technician']]));
    notice.append(button('Use latest version with my draft',()=>{d.version=person.version;d.requestId=crypto.randomUUID();notice.replaceChildren(note('Latest version acknowledged. Review your draft, then save.'));}));
  }
  form.addEventListener('submit',async e=>{
    e.preventDefault();if(!valid(form))return;
    if(!d.roles.length){notice.replaceChildren(note('Choose at least one role for this person.',true));return;}
    const payload={requestId:d.requestId,name:d.name.trim(),email:d.email.trim(),phone:d.phone.trim(),roles:d.roles,technician:d.roles.includes('Technician')?{skills:d.skills,availability:d.availability}:null,allowDuplicate:d.allowDuplicate,...(id?{version:d.version}:{})};
    await save(form,d,notice,submit,id?`people/${id}/profile`:'people',id?'PUT':'POST',payload,p=>{drafts.delete(key);host.announce('Person profile saved.');location.hash='person/'+p.id;},candidates=>duplicate(candidates));
    if(id&&notice.querySelector('[role=alert]')&&!d.pending) notice.append(button('Compare latest profile',()=>host.refresh()));
  });
  if(d.pending){lock(form,true,submit);submit.textContent='Retry save safely';notice.append(note('A previous save could not be confirmed. Retry it before changing these details.'));}
}

async function organisationCategory(view,id){
 const item=await request('organisations/'+id),key='organisation-category/'+id,d=getDraft(key,{category:item.category||'',version:item.version});
 title(view,'Organisation category',item.name);view.append(link('Back to organisation','organisation/'+id,'breadcrumb'));
 const box=panel('Category'),form=el('form',null,'form-grid');const input=field(form,'Category',d,'category',{max:80,help:'Choose a suggestion or enter a category used by your team.'});const suggestions=el('datalist');suggestions.id='organisation-categories';for(const value of ['School','NDIS','Health service','Government','Community organisation','Supplier','Other']){const option=el('option');option.value=value;suggestions.append(option);}input.setAttribute('list',suggestions.id);form.append(suggestions);
 const notice=el('div'),actions=el('div',null,'actions'),submit=saveButton('Save category');actions.append(submit,cancel(form,d,key,'organisation/'+id));form.append(notice,actions);box.append(form);view.append(box);
 if(d.version!==item.version)notice.append(note('This organisation changed. Latest category: '+(item.category||'Not categorised'),true),button('Use latest version with my draft',()=>{d.version=item.version;d.requestId=crypto.randomUUID();notice.replaceChildren(note('Review your category, then save.'));}));
 form.addEventListener('submit',e=>{e.preventDefault();if(!valid(form))return;save(form,d,notice,submit,'organisations/'+id+'/category','PUT',{requestId:d.requestId,version:d.version,category:d.category.trim()},()=>{drafts.delete(key);host.announce('Organisation category saved.');location.hash='organisation/'+id;});});
}
