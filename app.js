import {adelaideToday} from './credential-expiry.js';
import {registerDraftSource,trackDraftForm,refreshDraftReview,installDraftReview,revealDraftForm,pendingDrafts} from './draft-review.js';
import {renderProjectContacts} from './project-contacts.js';
import {applyActionStyles,installActionStyles} from './action-styles.js';
import {financeStatusRows,renderFinanceStatusForm,renderInvoiceReferences} from './invoice-references.js';
import {awaitingInvoicePayment,outstandingInvoiceMessage} from './finance-status-model.js';
import {residentialAddressText} from './client-address.js';
import {auditReferenceIds,auditAction,auditChanges,formatValue as displayValue} from './record-values.js';
import {renderProfileDetails} from './profile-details.js';
import {recordDirectoryStatus,DIRECTORY_STATUSES} from './profile-details-model.js';
import {renderProjectDetails,renderProjectCoordinator,renderProjectFeedback} from './project-details.js';
import {renderAccounts} from './accounts.js';
import {renderReports} from './reports.js';
import {renderSettings,configureSettings} from './settings.js';
import {requireLocalSession,sessionEnded,showAuthFailure} from './local-login.js';
import {configureOperations,renderOperations,operationsHaveDrafts,renderNotes} from './operations.js';
import {configureCare,careHasDrafts,renderLockedFinanceStatusDraft,renderProjectCare} from './project-care.js';
import {financeRecordingAccess,renderLifecycle} from './project-lifecycle.js';
import {projectLifecycleStatus} from './lifecycle-model.js';
import {renderFinancePack,renderSavedDocumentDownloads} from './finance-pack.js';
import {renderAssessmentTemplateDownloads} from './assessment-templates.js';
import {renderProjectHistory} from './project-history.js';
import {renderCredentials} from './technician-credentials.js';
import {renderAvailability} from './availability.js';
import {renderTechnicianLocation} from './technician-location.js';
import {renderClientDetails,clientDetailsHasDrafts} from './client-details.js';
import { configureWorkflows, renderWorkflow, workflowHasDrafts, renderProjectDraftReturn, addClientContactActions } from './workflows.js';
const main = document.querySelector('#content');
installActionStyles(main);
const globalInput = document.querySelector('#global-query');
const announcement = document.querySelector('#announcement');
const drafts = new Map(),protectedProjectDrafts=new Set();
registerDraftSource('project',()=>[...drafts].map(([key])=>({key})));
let requestedDraftReview=null;
const registers = new Map();
const projectTabs = new Map();
let renderVersion = 0;
let saving = false;
const hasUnsavedWork=()=>Boolean(drafts.size||workflowHasDrafts()||operationsHaveDrafts()||careHasDrafts()||clientDetailsHasDrafts());
let returnRoute = 'projects';
let workspaceRestored=false;
configureSettings({isSaving:()=>saving,setSaving:value=>{saving=value;},refresh:()=>render()});
window.addEventListener('tadsa-workspace-restored',()=>{workspaceRestored=true;renderVersion++;main.replaceChildren(el('p','Opening the restored workspace…','loading'));});
configureWorkflows({ isSaving: () => saving, setSaving: value => { saving = value; }, announce: text => announce(text), refresh: () => render() });
configureOperations({isSaving:()=>saving,setSaving:value=>{saving=value;},refresh:()=>render()});
configureCare({isSaving:()=>saving,setSaving:value=>{saving=value;},refresh:()=>render()});
const el = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
const link = (text, hash, className) => { const a = el('a', text, className); a.href = `#${hash}`; return a; };
const button = (text, action, className = 'secondary') => { const b = el('button', text, className); b.type = 'button'; b.addEventListener('click', action); return b; };
if(document.documentElement.dataset.hostedStaging==='true'){
  const loadedVersion=document.documentElement.dataset.uiVersion;
  const environment=document.querySelector('.environment');
  const summary=environment.querySelector('summary');
  const label=summary.querySelector('span:last-child');
  const info=environment.querySelector('.environment-info');
  const updateStatus=el('p');
  updateStatus.setAttribute('role','status');
  const checkFailed='Could not check the latest version. Try again when connected.';
  let checking;
  const updateButton=button('Update ready — reload app',async()=>{
    if(await checkVersion()!==true)return;
    if(saving||hasUnsavedWork()||pendingDrafts().length){
      updateStatus.textContent='Finish saving or discard your drafts before updating.';
      return;
    }
    location.reload();
  });
  summary.setAttribute('aria-label','Staging information');
  function checkVersion(){
    if(document.hidden||document.documentElement.dataset.authState!=='ready')return;
    if(checking)return checking;
    checking=fetch('./',{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(8000)})
      .then(response=>{
        const version=response.headers.get('X-TADSA-UI-Version');
        if(!response.ok||!version||!/^[a-f0-9]{64}$/.test(version))throw Error('Version unavailable');
        if(updateStatus.textContent===checkFailed)updateStatus.textContent='';
        const available=version!==loadedVersion;
        label.textContent=available?'Update ready':'Staging';
        summary.setAttribute('aria-label',available?'Staging information — update ready':'Staging information');
        if(available&&!updateButton.isConnected)info.append(updateButton,updateStatus);
        if(!available){
          updateButton.remove();updateStatus.remove();updateStatus.textContent='';
        }
        return available;
      }).catch(()=>{
        if(updateButton.isConnected)updateStatus.textContent=checkFailed;
      }).finally(()=>{checking=undefined;});
    return checking;
  }
  window.addEventListener('focus',checkVersion);
  document.addEventListener('visibilitychange',checkVersion);
  environment.addEventListener('toggle',()=>{if(environment.open)checkVersion();});
  window.setInterval(checkVersion,120000);
}
const cap = text => text ? text[0].toUpperCase() + text.slice(1) : 'Not recorded';
const initials = name => name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('');
const avatar = name => { const n = el('span', initials(name), 'avatar'); n.setAttribute('aria-hidden', 'true'); return n; };
const date = value => value ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : 'Not recorded';
const status = value => el('span', value === 'open' ? 'Opened' : cap(value), `badge ${value}`);
function projectStatus(p){const group=el('span',undefined,'project-status');group.append(status(p.status==='closed'?'closed':p.cancelled?'cancelled':p.financeHandoff?'with finance':p.status));if(p.cancelled&&p.status==='closed')group.append(status('cancelled'));if(p.invoiceRequired&&p.status!=='closed')group.append(el('span','Invoice required','badge invoice'));return group;}
const nameOf = item => item.person?.name ?? item.name ?? item.title;
const typeOf = kind => ({ projects: 'project', clients: 'client', people: 'person', organisations: 'organisation' })[kind];
const pathOf = type => ({ project: 'projects', client: 'clients', person: 'people', organisation: 'organisations' })[type];
let announcementRoute='';let toastTimer;function announce(text) { announcement.textContent = text;announcementRoute=location.hash||'#projects';queueMicrotask(()=>{if(announcement.textContent===text)announcementRoute=location.hash||'#projects';});if(/\b(saved|created|linked|removed)\b/i.test(text)){document.querySelector('.save-toast')?.remove();const toast=el('div',text,'save-toast');toast.setAttribute('aria-hidden','true');document.body.append(toast);clearTimeout(toastTimer);toastTimer=setTimeout(()=>{toast.remove();if(announcement.textContent===text)announcement.textContent='';},2800);} }
window.addEventListener('tadsa-saved',()=>announce('Changes saved.'));
async function api(path, body) {
  const response = await fetch(`/api/${path}`, { ...(body ? { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(10000) });
  const data = await response.json();
  if (!response.ok) { const error = new Error(data.error || 'The request could not be completed.'); error.status = response.status; throw error; }
  return data;
}
function message(text, error = false) { const n = el('div', text, `message${error ? ' error' : ''}`); n.setAttribute('role', error ? 'alert' : 'status'); return n; }
function heading(title, subtitle, eyebrow) { const h = el('div', undefined, 'page-heading'); const text = el('div'); if (eyebrow) text.append(el('div', eyebrow, 'eyebrow')); text.append(el('h1', title)); if (subtitle) text.append(el('p', subtitle, 'subtitle')); h.append(text); return h; }
function panel(title) { const n = el('section', undefined, 'panel'); if (title) n.append(el('h2', title)); return n; }
function empty(title, text) { const n = el('div', undefined, 'empty'); n.append(el('strong', title), el('span', text)); return n; }
function details(items) { const dl = el('dl', undefined, 'detail-pairs'); for (const [key, value] of items) { const group = el('div'); group.append(el('dt', key)); const dd = el('dd'); dd.append(value instanceof Node ? value : String(value ?? 'Not recorded')); group.append(dd); dl.append(group); } return dl; }
function relationships(rows) {
  const box = panel('People & organisations');
  if (!rows.length) box.append(el('p', 'No relationships recorded.', 'muted'));
  for (const r of rows) { const a = link('', `${r.type}/${r.id}`, 'relationship-line'); const text = el('span'); text.append(el('strong', r.name), el('small', r.role)); a.append(avatar(r.name), text); box.append(a); }
  return box;
}
function projectLinks(projects) {
  const box = panel('Linked projects'); if (!projects.length) box.append(el('p', 'No linked projects recorded.', 'muted'));
  const list = el('div', undefined, 'project-links');
  for (const p of [...projects].sort((a,b)=>Number(a.status==='closed')-Number(b.status==='closed')||String(b.reference).localeCompare(String(a.reference),'en-AU',{numeric:true}))) { const a = link('', `project/${p.id}`, 'project-link'); const text = el('span'); const heading=el('span',undefined,'linked-project-heading');heading.append(el('small',String(p.reference)),el('strong',p.title));text.append(heading);const description=String(p.summary||'').replace(/\s+/g,' ').trim();if(description)text.append(el('span',description.length>200?description.slice(0,197)+'…':description,'project-link-description'));a.append(text, projectStatus(p)); list.append(a); }
  box.append(list); return box;
}
const registerStatus = item => item.cancelled ? 'Cancelled' : item.status==='closed' ? 'Closed' : item.onHold ? 'On hold' : cap(item.status);
const reviewDateText = value => value ? new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric',timeZone:'Australia/Adelaide'}).format(new Date(value+'T12:00:00Z')) : '';
async function projectPreviewContext(project, row) {
  const safeRead = path => api(path).catch(() => null);
  const members = project.relationships ?? [];
  const identities = new Map();
  for (const member of members) {
    const key = member.type+':'+member.id;
    const directory = member.type === 'organisation' ? 'organisations' : 'people';
    if (!identities.has(key)) identities.set(key,safeRead('selections/'+directory+'/'+encodeURIComponent(member.id)));
  }
  const [client,lifecycle] = await Promise.all([
    safeRead('selections/clients/'+encodeURIComponent(project.clientId)),
    row ? null : safeRead('projects/'+encodeURIComponent(project.id)+'/lifecycle')
  ]);
  const profile = client?.item?.personId ? safeRead('people/'+encodeURIComponent(client.item.personId)+'/profile-details') : null;
  const people = await Promise.all([...identities].map(async ([key,value]) => [key,(await value)?.item]));
  return {row,client:client?.item,people:new Map(people),status:row?.projectStatus??projectLifecycleStatus(lifecycle?.state,{projectStatus:project.status,programme:lifecycle?.programme}),
    reviewDate:row?.reviewDate??(project.status!=='closed'&&!project.cancelled?project.followUpOn:null),comments:(await profile)?.contact?.additionalComments};
}
function inspect(item, kind, slot, options = {}) {
  const type = typeOf(kind), top = el('div', 'Quick view', 'inspector-top');
  if (options.closeControl) top.append(options.closeControl);
  slot.replaceChildren(top);
  const body = el('div', undefined, 'inspector-body');
  if (!item) { body.append(empty('Select a record', 'Choose a row to see its details here.')); slot.append(body); return; }
  if (kind === 'projects') {
    const {client,people,status,reviewDate,comments} = options.context ?? {};
    function phone(record) {
      if (!record) return 'Could not load';
      const value = String(record.displayPhone ?? record.phone ?? '').trim();
      if (!value) return 'Not recorded';
      const dial = value.replace(/[\s().-]/g,'');
      if (!/^\+?[0-9]{5,20}$/.test(dial)) return value;
      const telephone = el('a',value); telephone.href = 'tel:'+dial; return telephone;
    }
    const summary = el('div',undefined,'project-preview-summary');
    summary.append(el('strong',item.reference,'inspector-reference'),details([['Status',registerStatus(options.context?.row??item)],['Workflow status',status]]));
    body.append(summary,el('h2',item.title));
    if (item.summary) body.append(el('p',item.summary));
    const context = el('div',undefined,'inspector-section');
    context.append(el('h3','Project details'),details([
      ['Client',link(item.clientName,'client/'+item.clientId)], ['Client phone',phone(client)],
      ...(reviewDate ? [['Review date',reviewDateText(reviewDate)]] : [])
    ]));
    if (comments?.trim()) context.append(el('h3','Additional comments'),el('p',comments,'project-preview-comments'));
    body.append(context);
    const contacts = el('div',undefined,'inspector-section');
    contacts.append(el('h3','Working together'));
    for (const member of [...item.relationships].sort((a,b) => Number(a.role==='Technician') - Number(b.role==='Technician'))) {
      contacts.append(details([[member.role,link(member.name,member.type+'/'+member.id)],
        ['Phone',phone(people?.get(member.type+':'+member.id))]]));
    }
    if (!item.relationships.length) contacts.append(el('p','No assignments recorded.'));
    body.append(contacts);
  } else {
    const name = nameOf(item); body.append(avatar(name), el('h2', name), el('p', kind === 'clients' ? 'Client record' : item.role));
    const context = el('div', undefined, 'inspector-section');
    if (kind === 'clients') context.append(details([['Email', item.person.email], ['Phone', item.person.phone], ['Linked projects', item.projects.length]]));
    else if (kind === 'people') context.append(details([['Email', item.email||'Not recorded'], ['Phone', options.phone??(item.phone||'Not recorded')], ['Linked projects', item.projects.length]]));
    else {
      if(item.description)context.append(el('p',item.description));
      context.append(details([['Email',item.email||'Not recorded'],['Phone',item.phone||'Not recorded'],['Linked projects',item.projects.length]]));
    }
    body.append(context);
    if (item.projects.length) { const linked = el('div', undefined, 'inspector-section'); linked.append(el('h3', 'Current context')); for (const p of item.projects.slice(0, 2)) { const a = link(p.title, `project/${p.id}`, 'person-line'); linked.append(a); } body.append(linked); }
  }
  body.append(link(kind === 'projects' ? 'Open project →' : 'Open record →', `${type}/${item.id}`, 'button primary')); slot.append(body);
}
async function register(view, kind) {
  if(['people','organisations','projects'].includes(kind)){
    const isProject=kind==='projects',state=registers.get(kind)??{query:'',filter:isProject?'active':'current',sort:isProject?'reference':'name',selected:null};state.after??='';state.previous??=[];state.offset??=0;registers.set(kind,state);returnRoute=kind;
    const routeTicket=renderVersion,head=heading(cap(kind),isProject?'Open a project for its full workflow and history.':'Search all records. Open a record to review its details.','Administration'),count=el('span','Loading…','meta-note');head.append(count,link(isProject?'New enquiry':kind==='people'?'New person':'New organisation',isProject?'new-project':kind==='people'?'new-person':'new-organisation','button primary'));if(kind==='people')head.append(link('New client','new-client','button secondary'));if(isProject)head.append(link('Review projects','reviews','button secondary'));view.append(head);
    const tabs=el('div',undefined,'filter-tabs');tabs.setAttribute('aria-label','Filter '+kind);
    const layout=el('div',undefined,isProject?'register-layout paged-register-layout project-register-layout':'register-layout paged-register-layout'),box=el('section',undefined,'register-panel'),inspector=el('aside',undefined,'inspector');box.setAttribute('aria-label',cap(kind)+' register');inspector.setAttribute('aria-label','Selected record');
    const tools=el('div',undefined,'register-tools'),label=el('label'),q=el('input');q.type='search';q.maxLength=100;q.value=state.query;q.placeholder=isProject?'Project number, title, client or summary':'Name, reference, address, phone or email';q.setAttribute('aria-label',isProject?'Search projects by project number, title or client':'Filter '+kind+' by name or reference');if(isProject)label.append(el('span','Search projects','field-label'));label.append(q);const sortLabel=el('label'),sort=el('select');sortLabel.append(el('span','Sort by'),sort);sort.setAttribute('aria-label','Sort '+kind);for(const[value,text]of isProject?[['reference','Project number (newest first)'],['name','Project title'],['review-date','Review date'],['client','Client name']]:[['name','Name A–Z'],['reverse','Name Z–A']]){const option=el('option',text);option.value=value;sort.append(option);}sort.value=state.sort;tools.append(label,sortLabel);
    const tableSlot=el('div',undefined,'table-wrap'),foot=el('div',undefined,'table-footer');box.append(tools,tableSlot,foot);layout.append(box,inspector);view.append(tabs);
    if (!isProject) view.append(el('p','Counts cover all records matching the search. Current includes Needs review; role filters include all directory statuses.','field-help'));
    view.append(layout);
    inspector.hidden=true;inspector.id=kind+'-quick-view';
    let generation=0,detailGeneration=0,controller,timer,currentItems=[],focusFilter=false,focusPage='';
    const active=current=>current===generation&&routeTicket===renderVersion;
    const reset=()=>{state.after='';state.previous=[];state.offset=0;};
    function closePreview(id) {
      detailGeneration++; state.selected=null; inspector.hidden=true; inspector.replaceChildren();
      for (const control of tableSlot.querySelectorAll('.row-preview')) control.setAttribute('aria-expanded','false');
      (tableSlot.querySelector('tr[data-id="'+CSS.escape(id)+'"] .row-preview') || q).focus();
    }
    inspector.addEventListener('keydown',event=>{
      if(event.key==='Escape'&&state.selected){event.preventDefault();closePreview(state.selected);}
    });
    async function preview(id, trigger) {
      const current=++detailGeneration;state.selected=id;
      const live=()=>current===detailGeneration&&routeTicket===renderVersion;
      const closeControl=button('Close quick view',()=>closePreview(id),'text-button');
      inspector.hidden=false;
      for (const control of tableSlot.querySelectorAll('.row-preview')) control.setAttribute('aria-expanded',String(control.closest('tr').dataset.id===id));
      const top=el('div','Quick view','inspector-top');top.append(closeControl);
      inspector.replaceChildren(top,el('p','Loading selected record…','inspector-body'));
      if(trigger&&document.activeElement===trigger)closeControl.focus();
      try {
        const path=kind+'/'+encodeURIComponent(id);
        const [item,selection]=await Promise.all([api(path),kind==='people'?api('selections/'+path).catch(()=>null):null]);if(!live())return;
        const row=currentItems.find(row=>row.id===id);
        const context=isProject && item.clientId ? await projectPreviewContext(item,row) : null;if(!live())return;
        const keepCloseFocus=document.activeElement===closeControl;
        const preferredPhone=selection?.item?.displayPhone;
        inspect(item,kind,inspector,{context,closeControl,phone:preferredPhone||undefined});
        if(keepCloseFocus)closeControl.focus();
      }catch(error){
        if(!live())return;
        const failure=message('Selected record could not be loaded. '+error.message,true);
        inspector.lastElementChild?.replaceWith(failure);
      }
    }
    async function load(){if(routeTicket!==renderVersion)return;controller?.abort();controller=new AbortController();const current=++generation;detailGeneration++;currentItems=[];inspector.hidden=true;inspector.replaceChildren();count.textContent='Loading…';tabs.replaceChildren();tableSlot.replaceChildren(el('p','Loading matching records…'));foot.replaceChildren();
      const directory=isProject||['all','current','inactive','needs-review'].includes(state.filter),status=isProject?state.filter:directory?({all:'all',current:'active',inactive:'inactive','needs-review':'review'}[state.filter]):'all',role=directory?'':state.filter;
      const params=new URLSearchParams({kind,q:state.query,status,role,direction:state.sort==='reverse'||isProject&&state.sort==='reference'?'desc':'asc',limit:'50',...(isProject?{sort:state.sort}:{}),...(state.after?{after:state.after}:{})});
      try{const response=await fetch('/api/registers?'+params,{signal:AbortSignal.any([controller.signal,AbortSignal.timeout(12000)])}),data=await response.json();if(!response.ok)throw Object.assign(Error(data.error||'Register unavailable'),{status:response.status});if(!active(current))return;currentItems=data.items;count.textContent=data.total+' matching '+kind;
        const filters=isProject?[['active','Active projects',data.statuses.active],['all','All projects',data.statuses.all],['open','Open',data.statuses.open],['review','Review',data.statuses.review],['closed','Closed',data.statuses.closed],['cancelled','Cancelled',data.statuses.cancelled],['feedback','Feedback',data.statuses.feedback],['invoice','Invoice',data.statuses.invoice]]:[['all','All '+kind,data.statuses.all],['current','Current',data.statuses.active],['inactive','Inactive',data.statuses.inactive],['needs-review','Needs review',data.statuses.review],...(kind==='people'?data.roles.map(r=>[r.role,r.role,r.total]):[])];
        for(const[key,text,total]of filters){const tab=button('',()=>{state.filter=key;reset();focusFilter=true;void load();},'filter-tab');tab.setAttribute('aria-pressed',String(state.filter===key));tab.append(el('span',text),el('span',String(total),'filter-count'));tabs.append(tab);}if(focusFilter){tabs.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});focusFilter=false;}tabs.setAttribute('aria-description',isProject?'Counts cover all projects matching the search text.':'Counts cover all records matching the search text; role counts include all directory statuses.');
        const table=el('table',undefined,kind+'-table'),thead=el('thead'),header=el('tr');for(const text of isProject?['Project','Client','Status','Workflow status','Review date']:kind==='people'?['Person','Role','Projects']:['Organisation','Type','Category','Projects']){const th=el('th',text);th.scope='col';header.append(th);}thead.append(header);table.append(thead);const tbody=el('tbody');
        const today=isProject?adelaideToday():null;
        for(const item of data.items){const row=el('tr');row.dataset.id=item.id;const first=el('td'),open=link('',typeOf(kind)+'/'+item.id,'row-open');open.setAttribute('aria-label','Open '+(isProject?item.title:item.name));const name=el('span');name.append(el('span',isProject?item.title:item.name,'row-title'),el('span',(isProject?[item.reference]:[item.reference,item.email,item.suburb,item.postcode]).filter(Boolean).join(' · '),'row-sub'));if(!isProject&&item.directoryStatus!=='current')name.append(el('small',item.directoryStatus==='inactive'?'Inactive':'Needs review'));open.append(name);first.append(open);const rowActions=isProject?first:el('div',undefined,'directory-row-actions');if(!isProject&&item.clientId){const clientRecord=link('Client record','client/'+item.clientId,'text-button');clientRecord.setAttribute('aria-label','Client record for '+item.name);rowActions.append(clientRecord);}const quick=button('Quick view',()=>void preview(item.id,quick),'text-button row-preview');quick.setAttribute('aria-label','Preview '+(isProject?item.title:item.name));quick.setAttribute('aria-controls',inspector.id);quick.setAttribute('aria-expanded','false');rowActions.append(quick);if(!isProject)first.append(rowActions);row.append(first);if(isProject){row.append(el('td',item.clientName),el('td',registerStatus(item)));const projectState=el('td',item.projectStatus,'project-stage-cell');if(item.invoiceRequired&&item.status!=='closed')projectState.append(el('span','Invoice required','badge invoice'));const date=el('td',undefined,'project-review-date');if(item.reviewDate){const overdue=item.reviewDate<today;date.append(el('span',reviewDateText(item.reviewDate),overdue?'overdue-date':''));if(overdue)date.append(el('small','Overdue','overdue-label'));}row.append(projectState,date);}else{row.append(el('td',item.roles.join(', ')||'No current role'));if(kind==='organisations')row.append(el('td',item.category||'Not specified'));row.append(el('td',String(item.projectCount)));}row.addEventListener('click',event=>{if(!event.target.closest('button,a'))location.hash=typeOf(kind)+'/'+item.id;});tbody.append(row);}
        table.append(tbody);tableSlot.replaceChildren(data.items.length?table:empty('No matching records','Try another filter or clear your search.'));const pages=el('div',undefined,'actions');if(state.previous.length)pages.append(button('Previous',()=>{state.after=state.previous.pop();state.offset=Math.max(0,state.offset-data.limit);focusPage='Previous';void load();}));if(data.nextAfter)pages.append(button('Next',()=>{state.previous.push(state.after);state.after=data.nextAfter;state.offset+=data.items.length;focusPage='Next';void load();}));foot.replaceChildren(el('span',data.items.length?'Showing '+(state.offset+1)+'–'+(state.offset+data.items.length)+' of '+data.total+' matching records':'0 of '+data.total+' matching records'),pages);if(focusPage){([...pages.querySelectorAll('button')].find(b=>b.textContent===focusPage)||pages.querySelector('button')||q).focus({preventScroll:true});focusPage='';}if(data.items.some(item=>item.id===state.selected))void preview(state.selected);else state.selected=null;
      }catch(error){if(error.name==='AbortError'||!active(current))return;count.textContent='Register unavailable';tableSlot.replaceChildren(message(error.message+' No current results are shown.',true));foot.replaceChildren(button('Try again',()=>void load()));if(error.status===401)void render();}
    }
    q.addEventListener('input',()=>{state.query=q.value;reset();controller?.abort();generation++;detailGeneration++;currentItems=[];inspector.hidden=true;inspector.replaceChildren();clearTimeout(timer);count.textContent='Searching…';tabs.replaceChildren();tableSlot.replaceChildren(el('p','Searching all records…'));foot.replaceChildren();timer=setTimeout(()=>void load(),250);});q.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(timer);void load();}});sort.addEventListener('change',()=>{state.sort=sort.value;reset();void load();});await load();return;
  }
  const { items, limit } = await api(kind);
  const state = registers.get(kind) ?? { query: '', filter: ['people','clients','organisations'].includes(kind) ? 'current' : 'all', sort: kind === 'projects' ? 'reference' : 'name', selected: null };
  registers.set(kind, state); returnRoute = kind;
  const descriptions = { projects: 'Projects in progress, the people involved, and the work to be done.', clients: 'A connected view of each person and the work supporting them.', people: 'Clients, technical members and the people supporting each request.', organisations: 'The organisations connected to our work.' };
  const head = heading(cap(kind), descriptions[kind], 'Administration'); head.append(el('span', `${items.length} ${kind === 'people' ? 'people' : kind}`, 'meta-note')); if (kind === 'projects') head.append(link('New enquiry', 'new-project', 'button primary')); if(kind==='organisations')head.append(link('New organisation','new-organisation','button primary')); if (kind === 'people') head.append(link('New person', 'new-person', 'button primary')); if (kind === 'clients') head.append(link('New client', 'new-client', 'button primary')); view.append(head);
  if(kind==='projects'){const {counts}=await api('dashboard');view.append(link(`${counts.overdueReviews??0} overdue · ${counts.reviewsToday??0} due today — Review projects`, 'reviews','button secondary'));}
  const tabs = el('div', undefined, 'filter-tabs'); tabs.setAttribute('aria-label', `Filter ${kind}`);
  const filters = kind === 'projects' ? [['all', 'All projects', () => true], ['open', 'Open', p => p.status === 'open'], ['review', 'Review', p => p.status === 'review'], ['closed', 'Closed', p => p.status === 'closed'], ['feedback', 'Feedback', p => p.feedbackRequired], ['invoice', 'Invoice', p => p.invoiceRequired]] : [['all', `All ${kind}`, () => true], ...(['people','clients','organisations'].includes(kind)?[['current','Current',p=>recordDirectoryStatus(p)!=='inactive'],['inactive','Inactive',p=>recordDirectoryStatus(p)==='inactive'],['needs-review','Needs review',p=>recordDirectoryStatus(p)==='review']]:[]), ...(kind === 'people' ? [...new Set(items.flatMap(p => p.roles ?? [p.role]))].sort().map(role => [role, role, p => (p.roles ?? [p.role]).includes(role)]) : [])];
  const layout = el('div', undefined, 'register-layout'); const box = el('section', undefined, 'register-panel'); box.setAttribute('aria-label', `${cap(kind)} register`); const inspector = el('aside', undefined, 'inspector'); inspector.setAttribute('aria-label', 'Selected record');
  const tools = el('div', undefined, 'register-tools'); const searchLabel = el('label'); const q = el('input'); q.type = 'search'; q.value = state.query; q.placeholder = `Filter ${kind}…`; q.setAttribute('aria-label', `Filter ${kind} by name or reference`); searchLabel.append(q);
  if(kind==='people'){q.placeholder='Name, suburb or postcode…';q.setAttribute('aria-description','Includes the residential suburb and postcode of linked clients.');}
  const sortLabel = el('label'); sortLabel.append(el('span', 'Sort by')); const sort = el('select'); sort.setAttribute('aria-label', `Sort ${kind}`);
  for (const [value, label] of kind === 'projects' ? [['reference', 'Project number (newest first)'], ['name', 'Project title'], ['date', 'Target date'], ['client', 'Client name']] : [['name', 'Name A–Z'], ['reverse', 'Name Z–A']]) { const o = el('option', label); o.value = value; sort.append(o); }
  sort.value = state.sort; sortLabel.append(sort); tools.append(searchLabel, sortLabel);
  const tableSlot = el('div', undefined, 'table-wrap'); const foot = el('div', undefined, 'table-footer'); box.append(tools, tableSlot, foot); layout.append(box, inspector); view.append(tabs, layout);
  function draw() {
    tabs.replaceChildren();
    for (const [key, label, predicate] of filters) { const b = button('', () => { state.filter = key; draw(); tabs.querySelector('[aria-pressed=true]')?.focus(); }, 'filter-tab'); b.setAttribute('aria-pressed', String(state.filter === key)); b.append(el('span', label), el('span', String(items.filter(predicate).length), 'filter-count')); tabs.append(b); }
    const predicate = filters.find(f => f[0] === state.filter)?.[2] ?? (() => true);
    const query = state.query.toLowerCase().trim();
    const visible = items.filter(item => predicate(item) && [nameOf(item), item.reference, item.clientName, item.role, item.category, item.summary, item.residentialSuburb, item.residentialState, item.residentialPostcode, item.clientSuburb, item.clientState, item.clientPostcode].filter(Boolean).join(' ').toLowerCase().includes(query));
    const key = item => state.sort === 'date' ? item.dueDate ?? '9999' : state.sort === 'client' ? item.clientName : state.sort === 'reference' ? item.reference : nameOf(item);
    visible.sort((a, b) => String(key(a)).localeCompare(String(key(b)), 'en-AU', { numeric: true }) * (state.sort === 'reverse' || kind === 'projects' && state.sort === 'reference' ? -1 : 1));
    if (!visible.some(i => i.id === state.selected)) state.selected = visible[0]?.id ?? null;
    const table = el('table', undefined, kind + '-table'); const thead = el('thead'); const tr = el('tr');
    const columns = kind === 'projects' ? ['Project', 'Client', 'Status', 'Target'] : kind === 'clients' ? ['Client', 'Projects'] : kind === 'people' ? ['Person', 'Role', 'Projects'] : ['Organisation', 'Type', 'Category', 'Projects'];
    columns.forEach((label, i) => { const th = el('th', label); th.scope = 'col'; if ((kind === 'projects' && i === 3)) th.className = 'optional-col'; tr.append(th); }); thead.append(tr); table.append(thead);
    const tbody = el('tbody');
    for (const item of visible) {
      const row = el('tr'); row.dataset.id = item.id; row.classList.toggle('selected', !matchMedia('(max-width:800px)').matches && item.id === state.selected);
      const first = el('td'); const control = link('',`${typeOf(kind)}/${item.id}`,'row-open'); control.setAttribute('aria-label', `Open ${nameOf(item)}`);
      const text = el('span'); text.append(el('span', nameOf(item), 'row-title'), ...(['people','clients','organisations'].includes(kind)&&recordDirectoryStatus(item)!=='current'?[el('small',recordDirectoryStatus(item)==='inactive'?'Inactive':'Needs review')]:[]), el('span', kind === 'projects' ? `${item.reference}` : kind === 'clients' ? item.person.email : kind === 'people' ? item.email : item.description, 'row-sub'));
      if (kind === 'clients' || kind === 'people') { const identity = el('span', undefined, 'name-cell'); identity.append(avatar(nameOf(item)), text); control.append(identity); } else control.append(text); first.append(control); {const previewButton=button('Quick view',()=>choose(item),'text-button row-preview');previewButton.setAttribute('aria-label','Preview '+nameOf(item));first.append(previewButton);} row.append(first);
      if (kind === 'projects') { row.append(el('td', item.clientName)); const s = el('td'); s.append(projectStatus(item)); row.append(s, el('td', item.status==='closed'?'—':date(item.dueDate), 'optional-col')); }
      else if (kind === 'clients') row.append(el('td', String(item.projects.length)));
      else if(kind==='organisations')row.append(el('td',item.roles?.join(', ')||item.role||'Not recorded'),el('td',item.category||'Not specified'),el('td',String(item.projects.length))); else row.append(el('td',item.role),el('td',String(item.projects.length)));
      row.addEventListener('click', event => { if (!event.target.closest('button,a')) {location.hash=typeOf(kind)+'/'+item.id;} }); tbody.append(row);
    }
    table.append(tbody); tableSlot.replaceChildren(visible.length ? table : empty('No matching records', 'Try another filter or clear your search.'));
    foot.replaceChildren(el('span', `${visible.length} of ${items.length} records`), el('span', items.length >= limit ? `Showing the first ${limit} records` : 'Click a record to open · Quick view for a preview'));
    inspect(visible.find(i => i.id === state.selected), kind, inspector);
    function choose(item) { state.selected = item.id; if (window.matchMedia('(max-width: 800px)').matches) { location.hash = typeOf(kind) + '/' + item.id; return; } tbody.querySelectorAll('tr').forEach(r => { const selected = r.dataset.id === item.id; r.classList.toggle('selected', selected); r.querySelector('button')?.setAttribute('aria-pressed', String(selected)); }); inspect(item, kind, inspector); announce(`${nameOf(item)} selected. Quick view updated.`); }
  }
  q.addEventListener('input', () => { state.query = q.value; draw(); }); sort.addEventListener('change', () => { state.sort = sort.value; draw(); }); draw();
}
async function reviews(view){
  view.append(heading('Projects due for review','Shared with all project coordinators. Add a case note after following up, then choose the next review date.','Project reviews'),link('← All projects','projects','breadcrumb'));
  const options=await api('project-admin-options'),controls=el('div',undefined,'register-tools'),label=el('label'),picker=el('select');picker.setAttribute('aria-label','Coordinator');label.append(el('span','Coordinator'),picker);for(const [value,text]of [['','All coordinators'],...options.coordinators.map(a=>[a.id,a.displayName])]){const option=el('option',text);option.value=value;picker.append(option);}controls.append(label);view.append(controls);const slot=el('section');view.append(slot);let offset=0,generation=0;
  async function draw(){const current=++generation;slot.replaceChildren(el('p','Loading review dates…'));try{const data=await api('project-reviews?'+new URLSearchParams({offset:String(offset),coordinator:picker.value}));if(current!==generation)return;const rows=el('div',undefined,'project-links');for(const p of data.items){const row=link('',`project/${p.id}`,'project-link'),text=el('span');text.append(el('strong',p.reference+' · '+p.title),el('small',`${p.followUpOn<data.today?'Overdue':'Due today'} · ${new Date(p.followUpOn+'T12:00:00Z').toLocaleDateString('en-AU',{timeZone:'Australia/Adelaide',day:'numeric',month:'short',year:'numeric'})} · ${options.coordinators.find(a=>a.id===p.coordinatorAccountId)?.displayName||(p.coordinatorAccountId?'Previously assigned account':'Not assigned')}`));row.append(text,projectStatus(p));rows.append(row);}const pages=el('div',undefined,'actions');if(offset)pages.append(button('Previous',()=>{offset=Math.max(0,offset-data.limit);draw();},'secondary'));if(offset+data.items.length<data.total)pages.append(button('Next',()=>{offset+=data.limit;draw();},'secondary'));slot.replaceChildren(el('p',`${data.total} project${data.total===1?'':'s'} due for review${data.total?` · Showing ${offset+1}–${offset+data.items.length}`:''}`),data.items.length?rows:empty('No projects due for review','Future review dates remain on each project.'),pages);}catch(error){if(current===generation)slot.replaceChildren(message(error.message,true));}}
  picker.addEventListener('change',()=>{offset=0;draw();});await draw();
}
async function search(view, term) {
  returnRoute = `search/${encodeURIComponent(term)}`; globalInput.value = term;
  view.append(heading(term ? `Results for “${term}”` : 'Find a record', 'Search across clients, projects, people and organisations.', 'Workspace search'));
  if (!term) { view.append(empty('Start with a name or reference', 'Use the search field above. Press Ctrl K to jump there.')); return; }
  const { results } = await api(`search?q=${encodeURIComponent(term)}`); const box = el('div', undefined, 'results');
  if (!results.length) { box.append(empty('No matching records', 'Try a shorter name, a project title or a project number.'), link('New client', 'new-client', 'button secondary')); }
  for (const r of results) { const a = link('', `${r.type}/${r.id}`, 'result'); const text = el('span'); text.append(el('strong', r.label), el('small', r.description)); a.append(text, el('span', cap(r.type), 'result-type')); box.append(a); }
  view.append(el('p', results.length === 50 ? 'Showing the first 50 results. Refine your search with a name or reference to find a specific record.' : `${results.length} matching record${results.length === 1 ? '' : 's'}`, 'muted'), box); if(results.length===50){const directories=el('div',undefined,'actions');directories.append(link('Browse people','people','button secondary'),link('Browse organisations','organisations','button secondary'),link('Browse projects','projects','button secondary'));view.append(directories);}
}
function recordHeader(view, eyebrow, title, meta, action) { view.dataset.recordContext??=title+' · '+(location.hash.split('/')[1]||eyebrow); const header = el('div', undefined, 'record-header'); const text = el('div'); text.append(el('div', eyebrow, 'eyebrow'), el('h1', title)); if (meta) text.append(meta); header.append(text); if (action) header.append(action); view.append(header); return header; }
function contactRoles(person){
  const meta=el('div',undefined,'record-meta contact-roles');meta.setAttribute('aria-label','Contact roles');
  for(const role of person.roles?.length?person.roles:[person.role||'Role not recorded'])meta.append(el('span',role,'contact-role'));
  return meta;
}
async function client(view,id){
  const c=await api('clients/'+id),person=await api('people/'+c.person.id);await contactRecord(view,person,c);
}
async function contactRecord(view,person,c=null){
  view.classList.add('contact-workspace');view.dataset.recordContext=person.name+' · '+person.id;view.append(link('← Back to people','people','breadcrumb'));
  const grid=el('div',undefined,'detail-layout contact-detail-layout'),left=el('div'),right=el('div');
  const {profile}=await renderProfileDetails(left,person,{client:c});
  const header=el('div',undefined,'record-header contact-header'),identity=el('div'),roles=el('div',undefined,'contact-header-roles'),state=el('div',undefined,'contact-header-status');
  identity.append(el('div','Person record','eyebrow'),el('h1',person.name));roles.append(el('strong',(person.roles?.length??1)>1?'Roles':'Role'),contactRoles(person),link('Edit roles & membership','edit-person/'+person.id+'/roles','text-button'));
  state.append(el('strong','Status'),el('span',DIRECTORY_STATUSES.find(([key])=>key===profile.contact.directoryStatus)?.[1]||'Not recorded','contact-status-value'));
  header.append(identity,roles,state);if(c)header.append(link('New enquiry','new-project/'+c.id,'button primary'));view.append(header);
  if(c){const contacts=panel('Referrers, carers & other contacts');contacts.append(el('p','People linked to this client across their work. Project-specific contacts are recorded separately on each project.','field-help'));addClientContactActions(contacts,c);left.append(contacts);}
  if(person.technician){
    await renderTechnicianLocation(left,person.id);try{await renderCredentials(left,person.id);}catch(error){if(error.status!==403)throw error;left.append(message('Qualifications and clearances are restricted to authorised staff.'));}
    const tech=panel('Technician details');tech.append(details([['Skills',person.technician.skills.join(', ')||'Not recorded'],['General allocation status',person.technician.availability==='unknown'?'Not recorded':cap(person.technician.availability)]]),el('p','General allocation status is separate from dated calendar entries. Check the dates before assigning work.','field-help'),link('View calendar availability','availability/'+person.id,'button secondary'));left.append(tech);
  }
  right.append(projectLinks(c?.projects??person.projects));
  if(c){const related=relationships(c.relationships);related.querySelector('h2').textContent='Contacts linked through projects';right.append(related);}
  grid.append(left,right);view.append(grid);
}
function auditPanel(p,operationsPromise,managed=false) {
  const names=new Map([[p.id,p.reference+' · '+p.title],[p.clientId,p.clientName],...p.relationships.map(r=>[r.id,r.name])]);
  const ids=auditReferenceIds(p.audit).filter(id=>!names.has(id));
  const resolve=(id,key)=>names.get(id)??(/^(person|client|organisation|org|project)-/.test(id)?({person:'Person',client:'Client',organisation:'Organisation',org:'Organisation',project:'Project'}[id.split('-')[0]]+' no longer available'):/^[a-f0-9-]{36}$/i.test(id)?(key==='invoiceId'?'Recorded invoice': 'Recorded item')+' (reference unavailable)':id);
  const box = panel('Audit trail');
  const render=()=>{
    box.replaceChildren(el('h2','Audit trail'),el('p','Saved changes, newest first. History retains the values and recorded operator at the time of each change. Signed-in local accounts record their account identity; unconfigured development activity is not verified staff identity. Current decisions are shown in Workflow.','muted'));
    if (!p.audit.length) box.append(empty('No changes recorded yet','Updates to this project will appear here after saving.'));
    for (const a of p.audit) { const row=el('div',undefined,'audit'); row.append(el('strong',auditAction(a.action)),el('small',`${a.actorDisplayName||a.actor} · ${new Date(a.at).toLocaleString('en-AU',{timeZone:'Australia/Adelaide'})}`));for(const change of auditChanges(a.changes,resolve,{managed}))row.append(el('p',`${change.label}: ${change.value}`));box.append(row); }
  };
  render();
  void operationsPromise.then(operations=>{for(const invoice of operations.invoices??[])names.set(invoice.id,invoice.number||invoice.invoiceNumber||'Recorded invoice');render();}).catch(()=>{});
  // Resolve only referenced names, without delaying the project or moving focus.
  void (async()=>{for(let i=0;i<ids.length;i+=4){await Promise.all(ids.slice(i,i+4).map(async id=>{try{const record=await api(pathOf(id.startsWith('org-')?'organisation':id.split('-')[0])+'/'+id);names.set(id,nameOf(record));}catch{}}));render();}})();
  return box;
}

async function project(view, id) {
  let tab = location.hash.split('/')[2]==='costs'?'Costs & invoices':projectTabs.get(id)??'Overview'; let editMode = drafts.has(id); let success = '';
  const operationsPromise=api(`projects/${id}/operations`);
  const [projectRecord,projectOperations,projectLocation,adminDetails,adminOptions,workPlan,currentLifecycle,financeStatus]=await Promise.all([
    api(`projects/${id}`),operationsPromise,api(`projects/${id}/location`),api(`projects/${id}/admin-details`),
    api('project-admin-options'),api(`projects/${id}/work-plan`),api(`projects/${id}/lifecycle`),api(`projects/${id}/finance-status`)
  ]);
  let p=projectRecord;
  const destinations=['Overview','Project status','Files','Costs & invoices','Finance status','Workflow history'];
  if(!destinations.includes(tab)&&!['Task','Edit details','Audit trail','Case-note history','Hold or resume work','Record hours','Prepare invoices','Print documents','Contacts','Team','Funding','Feedback'].includes(tab)&&!tab.startsWith('Action:'))tab='Overview';
  view.classList.add('project-workspace');view.dataset.recordContext=p.reference+' · '+p.title;
  view.append(link('← All projects','projects','breadcrumb'));
  const meta=el('div',undefined,'record-meta'),header=recordHeader(view,p.reference,p.title,meta),headerActions=el('div',undefined,'project-more-wrap');header.firstElementChild.classList.add('project-identity');header.append(headerActions);
  const tabs=el('div',undefined,'record-tabs project-nav');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Project detail');view.append(tabs);
  const subnav=el('div',undefined,'project-subnav');subnav.setAttribute('role','tablist');subnav.setAttribute('aria-label','Project section');view.append(subnav);view.insertBefore(tabs,header);view.insertBefore(subnav,header);
  const overview=el('section',undefined,'project-overview'),task=el('section',undefined,'project-task'),filesPane=el('section'),costsPane=el('section'),financePane=el('section',undefined,'project-finance-editor'),recordPane=el('section'),editPane=el('section');
  const content=el('div'),auditPane=el('section'),caseNotesPane=el('section');editPane.append(content);auditPane.append(button('← Project overview',()=>navigate('Overview'),'secondary'),el('p','Loading history…'));caseNotesPane.append(button('← Project overview',()=>navigate('Overview'),'secondary'));
  const taskForm=el('div',undefined,'project-task-form'),taskContext=el('aside',undefined,'project-task-context'),taskGrid=el('div',undefined,'project-task-grid');taskGrid.append(taskContext,taskForm);
  const taskNavigation=el('nav',undefined,'project-task-navigation actions');taskNavigation.setAttribute('aria-label','Workflow navigation');
  taskNavigation.append(button('← Project overview',()=>navigate('Overview'),'secondary'));
  task.append(taskNavigation,taskGrid);
  view.append(overview,task,filesPane,costsPane,financePane,recordPane,editPane,auditPane,caseNotesPane);
  const actionSource=el('div'),fundingReference=el('div');
  const careContext={project:p,ops:projectOperations,plan:workPlan,location:projectLocation,lifecycle:currentLifecycle};
  const paymentPending=awaitingInvoicePayment(financeStatus);
  const [lifecycle]=await Promise.all([
    renderLifecycle(taskForm,p,{current:currentLifecycle,paymentPending,openFinance:()=>navigate('Finance status'),openContacts:()=>navigate('Contacts'),openProjectFiles:async()=>{await navigate('Files');const section=filesPane.querySelector('.project-files');if(section){section.open=true;section.querySelector('summary')?.focus();}},operations:projectOperations,adminDetails,workPlan,recordTarget:recordPane,actionsTarget:actionSource,contextTarget:taskContext,onSaved:action=>projectTabs.set(id,['cancel','reopen','close'].includes(action)?'Project status':'Task'),openHold:()=>navigate('Hold or resume work'),openAction:name=>{const entry=[...actionPanes].find(([,value])=>value.title.toLowerCase().includes(name.toLowerCase()));if(entry)navigate(entry[0]);},openFollowUp:async()=>{await navigate('Edit details');if(tab==='Edit details'&&view.isConnected)editPane.querySelector('input[type=date]')?.focus();},openFiles:async()=>{await navigate('Files');if(tab==='Files'&&view.isConnected){const section=filesPane.querySelector('.project-files');if(section)section.open=true;filesPane.querySelector('input[type=file]')?.focus();}}}),
    renderProjectDetails(editPane,id,{details:adminDetails})
  ]);
  const earlierStep=taskForm.querySelector('.workflow-return-action');if(earlierStep)taskNavigation.append(earlierStep);
  auditPane.lastElementChild.replaceWith(auditPanel(p,operationsPromise,lifecycle.managed));
  function flatten(section){for(const d of [...section.querySelectorAll('details')].reverse()){if(d.closest('.file-row'))continue;const summary=d.querySelector(':scope > summary'),replacement=el('section',undefined,'project-record-section');if(summary){replacement.append(el('h2',summary.textContent));summary.remove();}replacement.append(...d.childNodes);d.replaceWith(replacement);}}
  flatten(recordPane);flatten(editPane);
  const documentLibrary=el('section',undefined,'project-document-library');filesPane.prepend(documentLibrary);let documentLibraryLoading;
  async function loadFiles(){if(!documentLibraryLoading)documentLibraryLoading=(async()=>{const library=el('div');renderFinancePack(library,p,lifecycle,{expanded:true,library:true,adminDetails,openAssessment:()=>navigate('Task')});await renderAssessmentTemplateDownloads(library,{onlyWhenAvailable:true});documentLibrary.replaceChildren(...library.childNodes);})().catch(error=>{documentLibraryLoading=null;throw error;});return documentLibraryLoading;}
  if(!recordPane.children.length){const empty=panel('Workflow history');empty.append(el('p','No workflow decisions have been recorded for this project yet. Operator notes are in Case notes; technical changes are in Audit trail.'));recordPane.append(empty);}
  filesPane.prepend(returnNavigation('Files'));costsPane.prepend(returnNavigation('Costs'));editPane.prepend(returnNavigation('Details'));
  costsPane.prepend(el('h2','Costs & invoices'));
  const costReturns=lifecycle.state?.costReturns??[];
  const costStage=lifecycle.effectiveStage??lifecycle.state?.stage;
  if(costReturns.length||['customer_signoff','finance_handoff','finance_finalisation'].includes(costStage)){
    const returnsPanel=panel('Technician cost return and summary');
    if(['customer_signoff','finance_handoff','finance_finalisation'].includes(costStage)){
      returnsPanel.append(button('Open cost return entry',async()=>{
        const correction=[...actionPanes].find(([,entry])=>entry.title.startsWith('Correct actual cost return'));
        const destination=correction?.[0]??'Task';
        await navigate(destination);
        const input=panes.get(destination)?.querySelector('[aria-label="Cost return received on"]');
        for(let parent=input?.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
        input?.focus();
      },'secondary'));
    }
    if(costReturns.length)renderSavedDocumentDownloads(returnsPanel,p,{cover:false,returns:costReturns});
    costsPane.append(returnsPanel);
  }
  const financeRelevant=!lifecycle.managed||['finance_clearance','work','customer_signoff','finance_finalisation','ready_to_close','closed'].includes(lifecycle.effectiveStage??lifecycle.state?.stage);
  if(financeRelevant)costsPane.append(link('Prepare or review invoices','operations/'+id+'/invoices','button secondary'));else costsPane.append(el('p','Assessment is free. Invoice preparation becomes available after the client accepts the quote.','field-help'));
  let careLoading,invoiceReferencesLoading;
  function loadCare(){
    if(!careLoading)careLoading=(async()=>{
      const care=el('div'),costDetails=el('div');
      await renderProjectCare(care,id,care,careContext);
      for(const child of [...care.children]){
        const name=child.querySelector(':scope > summary')?.textContent;
        if(child.classList.contains('project-files'))filesPane.append(child);
        else if(name==='NDIS reference')fundingReference.append(child);
        else if(name==='Work location')editPane.append(child);
        else costDetails.append(child);
      }
      for(const action of costDetails.querySelectorAll('a[href^="#operations/"]'))action.remove();
      costsPane.lastElementChild.before(costDetails);
      for(const pane of [filesPane,costDetails,editPane,fundingReference])flatten(pane);
      const ndisSave=fundingReference.querySelector('button[type="submit"]');
      if(ndisSave){ndisSave.dataset.label='Save NDIS reference';if(ndisSave.textContent==='Save')ndisSave.textContent='Save NDIS reference';}
    })().catch(error=>{careLoading=null;throw error;});
    return careLoading;
  }
  function loadInvoiceReferences(){
    if(!invoiceReferencesLoading)invoiceReferencesLoading=(async()=>{
      const references=el('div');
      await renderInvoiceReferences(references,id,careContext);
      costsPane.lastElementChild.before(references);
    })().catch(error=>{invoiceReferencesLoading=null;throw error;});
    return invoiceReferencesLoading;
  }

  const allNotes=panel('Case-note history');for(const n of projectOperations.notes){allNotes.append(el('p',n.text,'case-note'),el('small',`${n.actor||'Operator'} · ${new Date(n.at||n.createdAt).toLocaleString('en-AU')}`));}if(!projectOperations.notes.length)allNotes.append(el('p','No case notes recorded yet.','muted'));caseNotesPane.append(allNotes);
  const state=lifecycle.state,stage=lifecycle.effectiveStage??state?.stage;
  const layout=el('div',undefined,'project-overview-grid');
  const notes=el('section',undefined,'project-home-notes');
  overview.append(layout);
  const historicalPane=renderProjectHistory(overview,p,{openWorkflow:()=>navigate('Task')});
  if(historicalPane&&!lifecycle.managed)overview.prepend(historicalPane);

  const warnings=(lifecycle.workGate?.reasons??[]).filter(reason=>stage==='work'||/hold|stop/i.test(reason));
  if(state?.cancellation)warnings.unshift('Cancelled: '+state.cancellation.reason);
  if(warnings.length){
    const warning=el('div',undefined,'message warning');
    warning.append(...[...new Set(warnings)].map(reason=>el('p',reason)));
    layout.append(warning);
  }
  const revisionFeedback=state&&!state.closed&&!state.cancellation?(state.revisionRequested?.reason||(state.peerReview?.approved===false?state.peerReview.notes:'')):'';
  if(revisionFeedback){
    const feedback=panel('Changes requested');
    feedback.classList.add('revision-feedback');
    feedback.append(el('p',revisionFeedback,'workflow-comment'),button('View workflow history',()=>navigate('Workflow history'),'secondary'));
    layout.append(feedback);
  }
  const quote=state?.quotes?.at(-1),quoteIssued=quote?state.history?.findLast(e=>e.action==='issueQuote'&&e.data.quoteVersion===quote.version):null;
  const brief=panel('The work');brief.append(el('p',p.summary||p.title,'record-summary'));
  const payerNames=new Map([[`client:${p.clientId}`,p.clientName]]);if(projectOperations.fundingContributors.length){const kinds={person:'people',organisation:'organisations',client:'clients'},contributors=projectOperations.fundingContributors.filter(c=>!payerNames.has(c.type+':'+c.id));const selected=await Promise.allSettled(contributors.map(c=>api('selections/'+kinds[c.type]+'/'+encodeURIComponent(c.id))));selected.forEach((result,i)=>{if(result.status==='fulfilled'&&result.value.item?.name)payerNames.set(contributors[i].type+':'+contributors[i].id,result.value.item.name);});}
  const facts=el('div',undefined,'project-facts');const client=el('div');client.append(link('CLIENT',`client/${p.clientId}`,'summary-heading-link'),link(p.clientName,`client/${p.clientId}`));facts.append(client);
  for(const [label,roles] of [['CONTACTS',['Contact','Carer','OT','Occupational therapist','Allied-health contact']],['REFERRER',['Referrer']],['FUNDER / PAYER',['Funder']],['TECHNICAL TEAM',['Technician']]]){
    const group=el('div');group.append(button(label,()=>navigate(label==='TECHNICAL TEAM'?'Team':label==='FUNDER / PAYER'?'Funding':'Contacts'),'summary-heading-link'));const members=p.relationships.filter(r=>roles.includes(r.role));
    if(label==='FUNDER / PAYER'&&projectOperations.fundingContributors.length){for(const c of projectOperations.fundingContributors)group.append(link((payerNames.get(c.type+':'+c.id)||'Recorded payer · '+c.id)+' · '+new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(c.amountCents/100),c.type+'/'+c.id));group.append(el('small','Agreed contributions · not receipts','field-help'));facts.append(group);continue;}
    if(label==='FUNDER / PAYER'&&p.coordination?.fundingStatus==='self'){group.append(link(p.clientName+' · Client pays',`client/${p.clientId}`));facts.append(group);continue;}
    if(!members.length)group.append(el('span',label==='TECHNICAL TEAM'?'Not assigned':'Not recorded','muted'));
    for(const member of members)group.append(link(member.name+(label==='CONTACTS'?' · '+member.role:member.id===p.coordination?.technicianId?' · Lead':''),(member.type==='organisation'?'organisation/':'person/')+member.id));facts.append(group);
  }
  brief.append(facts);const context=el('details',undefined,'project-context-details');context.append(el('summary','More project information'),details([['Programme',adminDetails.programme||'Not recorded'],['Coordinator',adminOptions.coordinators.find(a=>a.id===adminDetails.coordinatorAccountId)?.displayName||(adminDetails.coordinatorAccountId?'Previously assigned account':'Not assigned')],['Skills needed',p.coordination?.requiredSkills?.join(', ')||'Not specified'],...(p.status==='closed'?[]:[['Target date',date(p.dueDate)]]),['Work location',[projectLocation.address,projectLocation.suburb,projectLocation.postcode].filter(Boolean).join(', ')||'Not recorded']]));brief.append(context);if(adminDetails.documentFolderUrl){const folder=el('a','Open project document folder','text-button');folder.href=adminDetails.documentFolderUrl;folder.target='_blank';folder.rel='noopener noreferrer';brief.append(folder);}
  const quickActions=el('div',undefined,'project-overview-links');quickActions.append(button('Edit contacts & referrer',()=>navigate('Contacts'),'primary'),link('Edit team','coordination/'+id+'/team','text-button'),link('Edit funding','coordination/'+id+'/funding','text-button'),button('Edit project details',()=>{editMode=false;navigate('Edit details');},'text-button'));brief.append(quickActions);brief.classList.add('project-home-brief');
  const finance=panel('Finance status');finance.classList.add('project-finance-summary');
  const money=value=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(value/100),fullDate=value=>value?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Adelaide',day:'numeric',month:'short',year:'numeric'}).format(new Date(value.includes('T')?value:value+'T12:00:00Z')):'Not recorded';
  const clearance=state?.financeClearance,lastPayment=[...(workPlan.payments??[])].sort((a,b)=>b.receivedOn.localeCompare(a.receivedOn))[0];
  const statusFacts=financeStatusRows(lifecycle,financeStatus);
  finance.append(details(statusFacts),button('Review finance status',()=>navigate('Finance status'),'primary'));
  const otherFinance=el('details',undefined,'project-context-details');otherFinance.append(el('summary','Other finance records'));
  const financeStateFacts=state?.schema===2?[['Client payment resolution',state.financeFinalisation?.clientPaymentResolved?'Resolved by finance':'Not confirmed'],['Technician payment resolution',state.financeFinalisation?.technicianPaymentResolved?'Resolved by finance':'Not confirmed']]:[['Finance clearance',clearance?.status==='paid'?'Payment confirmed':clearance?.status==='exempt'?'Authorised exemption':'Not recorded'],['Finance confirmation date',fullDate(clearance?.confirmedOn)]];
  const invoiceRequiredValue=el('span',p.invoiceRequired?'Yes':'No');
  otherFinance.append(details([['Quote saved',fullDate(quote?.at)],...financeStateFacts,['Latest recorded receipt',fullDate(lastPayment?.receivedOn)],['Invoice required',invoiceRequiredValue]]));
  finance.append(otherFinance,button('View costs & invoices',()=>navigate('Costs & invoices'),'text-button'));
  const financeReadback=panel('Finance status');
  financeReadback.append(details(statusFacts),el('p','Choose Invoice Before Build when preparing the quote in Workflow. Record client approval, the cost return and the Finance handoff there as well.','field-help'),button('Open project workflow',()=>navigate('Task'),'secondary'));
  financePane.append(returnNavigation('Finance status'),financeReadback);
  let financeEditorLoading;
  function loadFinanceEditor(){
    if(!financeEditorLoading)financeEditorLoading=(async()=>{
      const paymentOnly=Boolean(state?.financeFinalisation&&paymentPending);
      const locked=p.status==='closed'||state?.closed||(state?.financeFinalisation&&!paymentOnly);
      const access=locked?{allowed:false,message:'Finance records are read-only after finalisation or project closure.'}:await financeRecordingAccess('finance_status');
      if(access.allowed)renderFinanceStatusForm(financePane,id,financeStatus,paymentOnly);
      else {financePane.append(el('p',access.message,'field-help'));renderLockedFinanceStatusDraft(financePane,id);}
    })();
    return financeEditorLoading;
  }
  layout.append(notes,brief,finance);
  let noteSaved=false;
  function showLatestNote(operations){
    notes.replaceChildren();
    renderNotes(notes,id,operations,true,saved=>{
      noteSaved=true;
      showLatestNote(saved);
    });
    const notesLink=notes.querySelector('a[href="#operations/'+id+'"]');
    if(notesLink)notesLink.replaceWith(button('View all case notes',()=>navigate('Case-note history'),'text-button'));
  }
  showLatestNote(projectOperations);
  const actionPanes=new Map();for(const [i,child] of [...actionSource.children].entries()){const title=child.querySelector(':scope > summary')?.textContent||child.querySelector('button[type=submit]')?.textContent||'Project action';const pane=el('section',undefined,'project-action-task');pane.append(button('← Project overview',()=>navigate('Overview'),'secondary'),el('h2',title),child);flatten(pane);actionPanes.set('Action:'+i,{title,pane});view.append(pane);if(pane.querySelector(':scope > .project-record-section > h2'))pane.querySelector(':scope > h2')?.remove();}
  const embedded=new Map([['Contacts',{route:'contacts'}],['Hold or resume work',{route:'operations',focus:'holds'}],['Record hours',{route:'operations',focus:'hours'}],['Prepare invoices',{route:'operations',focus:'invoices'}],['Print documents',{route:'documents'}],['Feedback',{route:'feedback'}],['Team',{route:'coordination',focus:'team'}],['Funding',{route:'coordination',focus:'funding'}]].map(([name,config])=>{const pane=el('section',undefined,'project-embedded-pane');pane.hidden=true;pane.tabIndex=-1;view.append(pane);return [name,{...config,pane,loaded:false,loading:null}];}));
  function returnNavigation(name){const navigation=el('nav',undefined,'project-task-navigation actions');navigation.setAttribute('aria-label',name+' navigation');navigation.append(button('← Return to current workflow',()=>navigate('Task'),'secondary'),button('Project overview',()=>navigate('Overview'),'text-button'));return navigation;}
  async function loadEmbedded(name){const entry=embedded.get(name);if(!entry||entry.loaded)return;if(entry.loading)return entry.loading;if(!entry.pane.dataset.sectionLoading)entry.pane.replaceChildren(el('p','Opening '+name.toLowerCase()+'…','loading'));entry.loading=(async()=>{const body=el('div');try{if(entry.route==='coordination')await renderWorkflow(body,'coordination',id,{embedded:true,focus:entry.focus,onCancel:()=>{entry.loaded=false;navigate('Overview');}});else if(entry.route==='contacts')await renderProjectContacts(body,id);else if(entry.route==='feedback')await renderProjectFeedback(body,id);else await renderOperations(body,entry.route,id,{embedded:true,focus:entry.focus,openWorkflow:()=>navigate('Task')});if(name==='Team')await renderProjectCoordinator(body,id);entry.pane.replaceChildren(returnNavigation(name),el('h2',name),body);body.querySelectorAll('form').forEach(form=>form.startTechnicianCalendars?.());if(name==='Funding')entry.pane.append(fundingReference);entry.loaded=true;}catch(error){entry.pane.replaceChildren(message(error.status?error.message:'This section could not load. Your project is still open.',true),button('Try again',()=>loadEmbedded(name),'secondary'));}finally{entry.loading=null;}})();return entry.loading;}
  const statusPane=panel('Project status');
  view.append(statusPane);
  const statusActions=[...actionPanes].filter(([,entry])=>['Cancel this enquiry','Cancel this project','Reopen for review'].includes(entry.title));
  const availableHold=p.status!=='closed'&&!state?.cancellation&&!state?.closed;
  const statusText=registerStatus({status:p.status,onHold:projectOperations.onHold||projectOperations.clientStopped,cancelled:Boolean(state?.cancellation||p.cancelled)});
  statusPane.append(details([['Current status',statusText]]));
  const controls=el('div',undefined,'actions');
  if(availableHold)controls.append(button('Hold or resume work',()=>navigate('Hold or resume work'),'secondary'));
  for(const [key,entry] of statusActions)controls.append(button(entry.title,()=>navigate(key),'secondary'));
  if(!lifecycle.managed){
    controls.append(button('Edit historical status',async()=>{editMode=true;await navigate('Edit details');content.querySelector('[name=status]')?.focus();},'secondary'));
    if(availableHold)controls.append(button('Start workflow to record a cancellation',()=>navigate('Task'),'secondary'));
  }else if(stage==='ready_to_close'&&!paymentPending){
    controls.append(button('Close project',async()=>{const pane=await navigate('Task');const note=pane?.querySelector('[aria-label="Closure note"]');if(note){for(let n=note.parentElement;n;n=n.parentElement)if(n.tagName==='DETAILS')n.open=true;note.focus();}},'secondary'));
  }else if(!state.closed&&p.status!=='closed'){
    const guidance=state.cancellation?'Complete the outstanding Finance steps to close this cancelled project.':'Project closure becomes available after work, sign-off and Finance are complete.';
    statusPane.append(el('p',paymentPending?outstandingInvoiceMessage:guidance,'field-help'));
    if(paymentPending)controls.append(button('Review finance status',()=>navigate('Finance status'),'secondary'));
  }
  if(state?.cancellation)statusPane.append(details([['Cancellation reason',state.cancellation.reason]]));
  statusPane.append(controls);
  const sections=[
    {label:'Overview',items:[['Overview','Overview']]},
    {label:'Status',items:[['Project status','Current status'],...(availableHold?[['Hold or resume work','Hold or resume work']]:[]),...statusActions.map(([key,value])=>[key,value.title])]},
    {label:'Case notes',items:[['Case-note history','Case notes']]},
    {label:'Contacts',items:[['Contacts','Contacts & referrer']]},
    {label:'Team',items:[['Team','Team']]},
    {label:'Funding',items:[['Funding','Funding']]},
    {label:'Files',items:[['Files','Project files'],['Print documents','Print documents']]},
    {label:'Costs',items:[['Costs & invoices','Cost summary'],['Finance status','Finance status'],...(financeRelevant?[['Prepare invoices','Invoices']]:[])]},
    {label:'Hours',items:[['Record hours','Hours']]},
    {label:'Workflow',items:[['Task','Current step'],['Workflow history','Workflow history'],...[...actionPanes].filter(([key])=>!statusActions.some(([statusKey])=>statusKey===key)).map(([key,value])=>[key,value.title])]},
    {label:'Feedback',items:[['Feedback','Customer feedback']]},
    {label:'Details',items:[['Edit details','Project details']]},
    {label:'Audit trail',items:[['Audit trail','Audit trail']]}
  ];
  const more=button('Project sections',()=>{menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('[aria-current=page],button')?.focus();},'secondary project-sections-toggle'),menu=el('div',undefined,'project-more-menu');menu.hidden=true;more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls','project-more-menu');menu.id='project-more-menu';
  for(const section of sections)menu.append(button(section.label,()=>navigate(section.items[0][0]),''));
  headerActions.append(more,menu);headerActions.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;more.setAttribute('aria-expanded','false');more.focus();}});
  const panes=new Map([['Overview',overview],['Project status',statusPane],['Task',task],['Files',filesPane],['Costs & invoices',costsPane],['Finance status',financePane],['Workflow history',recordPane],['Edit details',editPane],['Audit trail',auditPane],['Case-note history',caseNotesPane],...[...embedded].map(([key,value])=>[key,value.pane]),...[...actionPanes].map(([key,value])=>[key,value.pane])]);
  function tabButton(label,key,index,active,container,prefix){
    const b=button(label,()=>navigate(key),'');b.id=prefix+index;b.dataset.destination=key;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;b.setAttribute('aria-controls','project-focused-pane');
    b.addEventListener('keydown',async event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...container.querySelectorAll('[role=tab]')];const target=event.key==='Home'?buttons[0]:event.key==='End'?buttons.at(-1):buttons[(index+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length];const targetId=target.id;await navigate(target.dataset.destination);if(tab===target.dataset.destination&&view.isConnected)document.getElementById(targetId)?.focus();});return b;
  }
  view.addEventListener('click',event=>{const anchor=event.target.closest('a[href]');if(anchor&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0){const [route,target,focus]=anchor.hash.slice(1).split('/');if(target===id){const section=route==='coordination'?(focus==='funding'?'Funding':'Team'):route==='documents'?'Print documents':route==='operations'?({hours:'Record hours',holds:'Hold or resume work',invoices:'Prepare invoices'})[focus]??'Prepare invoices':null;if(section){event.preventDefault();navigate(section);}}}if(!headerActions.contains(event.target)){menu.hidden=true;more.setAttribute('aria-expanded','false');}});
  const sectionLoads=new Map();
  const carePanes=new Map([['Files',filesPane],['Costs & invoices',costsPane],['Edit details',editPane],['Funding',embedded.get('Funding').pane]]);
  function loadProjectSection(name){
    if(name==='Finance status')return loadFinanceEditor();
    const carePane=carePanes.get(name);
    if(!carePane)return loadEmbedded(name);
    if(sectionLoads.has(name))return sectionLoads.get(name);
    carePane.querySelector(':scope > .project-section-loading')?.remove();
    const progress=el('p','Opening '+name.toLowerCase()+'…','loading project-section-loading');
    progress.setAttribute('role','status');
    carePane.prepend(progress);
    carePane.dataset.sectionLoading='true';
    carePane.setAttribute('aria-busy','true');
    const pending=Promise.all([loadCare(),name==='Files'&&loadFiles(),name==='Costs & invoices'&&loadInvoiceReferences()])
      .then(()=>loadEmbedded(name))
      .then(()=>{progress.remove();delete carePane.dataset.sectionLoading;})
      .catch(()=>{
        progress.replaceChildren(el('span','This section could not load. '),button('Try again',()=>{progress.remove();loadProjectSection(name);}));
        sectionLoads.delete(name);
      })
      .finally(()=>carePane.removeAttribute('aria-busy'));
    sectionLoads.set(name,pending);
    return pending;
  }
  async function navigate(name){
    // Saving a note advances the project version. Reload the chosen section
    // before presenting its editors or audit history with that new version.
    if(noteSaved&&name!=='Overview'){
      projectTabs.set(id,name);
      if(location.hash.endsWith('/costs'))history.replaceState(null,'','#project/'+id);
      await render();
      const pane=main.querySelector('#project-focused-pane');
      if(location.hash.split('/')[1]===id&&pane?.dataset.projectSection===name){
        pane.focus({preventScroll:true});
        return pane;
      }
      return;
    }
    tab=name;menu.hidden=true;more.setAttribute('aria-expanded','false');draw();await loadProjectSection(name);if(tab!==name)return;const destination=panes.get(name);destination?.focus({preventScroll:true});(tabs.getClientRects().length?tabs:header).scrollIntoView({block:'nearest'});return destination;}
  function draw(){
    projectTabs.set(id,tab);header.querySelector('h1').textContent=p.title;header.querySelector('.eyebrow').replaceChildren(el('small','Project no.'),el('strong',p.reference,'project-number'));invoiceRequiredValue.textContent=p.invoiceRequired?'Yes':'No';meta.replaceChildren();
    const recordStatus=registerStatus({status:p.status,onHold:projectOperations.onHold||projectOperations.clientStopped,cancelled:Boolean(state?.cancellation||p.cancelled)});
    const headerFacts=[
      ['Status',recordStatus,'Project status'],
      ['Workflow status',projectLifecycleStatus(state,{projectStatus:p.status,programme:lifecycle.programme}),'Task'],
      ...(p.status==='closed'||p.cancelled||state?.cancellation?[]:[['Review date',fullDate(adminDetails.followUpOn),'Edit details']]),
      ['Latest quote',quote?money(quote.totalCents)+' · '+(quoteIssued?'Sent '+fullDate(quoteIssued.data.sentOn):'Not recorded as sent'):'Not recorded','Print documents']
    ];
    for(const [label,value,destination] of headerFacts){
      const fact=el('div',undefined,'project-header-fact');
      const jump=button(label,async()=>{
        const pane=await navigate(destination);
        const target=label==='Review date'?pane?.querySelector('[aria-label="Review date"]'):label==='Latest quote'?pane?.querySelector('[data-quote-panel]'):null;
        if(target){target.scrollIntoView({block:'center'});target.focus({preventScroll:true});}
      },'summary-heading-link');
      jump.setAttribute('aria-label',label+' — open '+(destination==='Task'?'workflow':destination.toLowerCase()));
      fact.append(jump,el('span',value,label==='Workflow status'?'workflow-stage':undefined));
      meta.append(fact);
    }
    header.append(meta,headerActions);
    const section=sections.find(group=>group.items.some(([key])=>key===tab))??sections[0];
    tabs.replaceChildren();sections.forEach((group,i)=>tabs.append(tabButton(group.label,group===section?tab:group.items[0][0],i,group===section,tabs,'project-tab-')));
    more.textContent='Sections · '+section.label+' ▾';more.setAttribute('aria-label','Project sections: '+section.label);
    [...menu.children].forEach((item,i)=>{if(sections[i]===section)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');});
    subnav.replaceChildren();subnav.hidden=section.items.length<2;
    section.items.forEach(([key,label],i)=>subnav.append(tabButton(label,key,i,key===tab,subnav,'project-subtab-')));
    for(const [key,pane]of panes){pane.dataset.projectSection=key;pane.hidden=key!==tab;pane.removeAttribute('id');pane.removeAttribute('aria-labelledby');pane.removeAttribute('role');pane.removeAttribute('aria-label');pane.tabIndex=-1;if(key===tab){pane.id='project-focused-pane';pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',section.items.length>1?'project-subtab-'+section.items.findIndex(([k])=>k===tab):'project-tab-'+sections.indexOf(section));}}
    if(tab!=='Edit details')return;content.replaceChildren();if(success)content.append(message(success));const box=panel(editMode?'Edit project':'Project details');if(editMode)editForm(box);else{box.append(el('p',p.summary||p.title),details([['Opened',date(p.openedAt)],...(p.status==='closed'?[]:[['Target date',date(p.dueDate)]]),['Feedback',p.feedbackRequired?'Required':'Not required'],['Invoice',p.invoiceRequired?'Required':'Not required']]),button('Edit project',()=>{editMode=true;draw();content.querySelector('input')?.focus();},'secondary'));}content.append(box,relationships(p.relationships));
  }
  function editForm(box) {
    const draft = drafts.get(id) ?? { version: p.version, title: p.title, status: p.status, feedbackRequired: p.feedbackRequired, invoiceRequired: p.invoiceRequired };
    const form = el('form', undefined, 'form-grid');trackDraftForm(form,'project',id,{label:'Project details',section:'Edit details'});
    const titleLabel = el('label'); titleLabel.append(el('span', 'Project title', 'field-label')); const input = el('input'); input.name = 'title'; input.required = true; input.maxLength = 120; input.value = draft.title; titleLabel.append(input);
    const stateLabel = el('label'); stateLabel.append(el('span', 'Status', 'field-label')); const select = el('select'); select.name = 'status'; for (const s of ['open', 'review', 'closed']) { const o = el('option', cap(s)); o.value = s; o.disabled=s==='closed'&&p.status!=='closed'&&paymentPending; select.append(o); } select.value = draft.status; select.disabled=Boolean(lifecycle.managed); stateLabel.append(select); form.append(titleLabel, stateLabel);
    if(!lifecycle.managed&&p.status!=='closed'&&paymentPending)form.append(el('p',outstandingInvoiceMessage,'field-help'),button('Review finance status',()=>navigate('Finance status'),'secondary'));
    const checks = {}; for (const [key, label] of [['feedbackRequired', 'Feedback required'], ['invoiceRequired', 'Invoice required']]) { const l = el('label', undefined, 'checkbox'); const check = el('input'); check.type = 'checkbox'; check.name = key; check.checked = draft[key]; checks[key] = check; l.append(check, el('span', label)); form.append(l); }
    const read = () => ({ version: draft.version, title: input.value, status: select.value, feedbackRequired: checks.feedbackRequired.checked, invoiceRequired: checks.invoiceRequired.checked });
    const saved=()=>({version:draft.version,title:p.title,status:p.status,feedbackRequired:p.feedbackRequired,invoiceRequired:p.invoiceRequired});form.addEventListener('input', () => {const value=read();if(!protectedProjectDrafts.has(id)&&JSON.stringify(value)===JSON.stringify(saved()))drafts.delete(id);else drafts.set(id,value);success='';refreshDraftReview();});
    form.append(el('p', lifecycle.managed?'Open Status for hold, cancellation, closure and reopening actions. Its number and history are retained.':p.status==='closed'?'Reopen this historical project only after reviewing whether continuing the same job is appropriate. Guided workflow then records fresh stage approvals.':'Use the guided workflow to record stage approvals before changing status.', 'muted'));
    const notice = el('div'); const actions = el('div', undefined, 'actions'); const save = el('button', 'Save changes', 'primary'); save.type = 'submit'; const cancel = button('Cancel edit', () => { drafts.delete(id);protectedProjectDrafts.delete(id); editMode = false; success = ''; draw(); header.querySelector('button')?.focus(); }, 'secondary'); actions.append(save, cancel); form.append(notice, actions); box.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (saving) return;
      if (!input.value.trim()) { input.setCustomValidity('Enter a project title.'); input.reportValidity(); input.addEventListener('input', () => input.setCustomValidity(''), { once: true }); return; }
      saving = true; save.disabled = true; cancel.disabled = true; input.disabled = true; select.disabled = true; Object.values(checks).forEach(c => c.disabled = true); tabs.querySelectorAll('button').forEach(b => b.disabled = true); save.textContent = 'Saving…'; drafts.set(id, read()); notice.replaceChildren(message('Saving your changes…'));
      try {
        const previousStatus=p.status;
        p = await api(`projects/${id}`, read()); drafts.delete(id);protectedProjectDrafts.delete(id); editMode = false; success = 'Changes saved.'; announce('Project changes saved.');
        if(p.status!==previousStatus){saving=false;await render();return;}
        draw(); header.querySelector('button')?.focus();
      } catch (error) {
        if(!error.status)protectedProjectDrafts.add(id);notice.replaceChildren(message(error.status ? error.message : 'Connection interrupted. Your draft is still here. Check the local service and try again.', true));
        if (error.status === 409||!error.status) notice.append(button('Compare latest version', async () => {
          const compareButton = notice.querySelector('button'); compareButton.disabled = true;
          try { const latest = await api(`projects/${id}`); const comparison = panel('Latest saved version'); comparison.append(details([['Project title', latest.title], ['Status', cap(latest.status)], ['Feedback', displayValue(latest.feedbackRequired)], ['Invoice', displayValue(latest.invoiceRequired)]]), el('p', 'Your draft above has not changed. Compare each value before continuing.', 'muted')); comparison.append(button('Keep my draft against this version', () => { draft.version = latest.version;protectedProjectDrafts.add(id); drafts.set(id, read()); comparison.replaceWith(message('Latest version acknowledged. Review your draft, then save to apply it.')); compareButton.remove(); }, 'secondary')); notice.append(comparison); }
          catch { notice.append(message('Could not load the latest version. Your draft is retained.', true)); compareButton.disabled = false; }
        }, 'secondary'));
      } finally { refreshDraftReview();saving = false; save.disabled = false; cancel.disabled = false; input.disabled = false; select.disabled = Boolean(lifecycle.managed); Object.values(checks).forEach(c => c.disabled = false); tabs.querySelectorAll('button').forEach(b => b.disabled = false); save.textContent = 'Save changes'; }
    });
  }
  view.addEventListener('click',event=>{const a=event.target.closest('a');if(a?.getAttribute('href')==='#project/'+id+'/costs'){event.preventDefault();navigate('Costs & invoices');}});
  draw();await loadProjectSection(tab);
}
async function entity(view,type,id){
  const item=await api(`${pathOf(type)}/${id}`);
  if(type==='person'){const c=item.clientId?await api('clients/'+item.clientId):null;await contactRecord(view,item,c);return;}
  view.append(link('← Back to organisations','organisations','breadcrumb'));
  const meta=el('div',undefined,'record-meta');meta.append(el('span',item.roles?.join(' · ')??item.role));recordHeader(view,'Organisation record',item.name,meta);
  let website='Not recorded';try{const url=new URL(item.website);if(['https:','http:'].includes(url.protocol)&&!url.username&&!url.password){website=el('a',item.website);website.href=url.href;website.target='_blank';website.rel='noopener noreferrer';}}catch{}
  const grid=el('div',undefined,'detail-layout'),left=el('div'),info=panel('About this organisation');info.append(el('p',item.description,'record-summary'),details([['Roles',item.roles?.join(', ')||item.role||'Not recorded'],['Category (optional grouping)',item.category||'Not specified'],['Website',website],['Phone',item.phone||'Not recorded'],['Email',item.email||'Not recorded'],['NDIS provider number',item.ndisProviderNumber||'Not recorded'],['Contact name',item.contactName||'Not recorded'],['Record status',DIRECTORY_STATUSES.find(([key])=>key===recordDirectoryStatus(item))?.[1]]]),link('Edit organisation','edit-organisation/'+id,'button secondary'));left.append(info);grid.append(left,projectLinks(item.projects));view.append(grid);
}
const contactJourneyRoutes=new Set(['client','person','organisation','edit-organisation','organisation-category','edit-person','client-details','link-contact','link-referrer','availability']);
let contactProjectReturn='';
function trackContactOrigin(oldHash,newHash){
  const oldRoute=oldHash.replace(/^#/,''),nextRoute=newHash.replace(/^#/,'').split('/')[0];
  if(oldRoute.startsWith('project/')&&contactJourneyRoutes.has(nextRoute))contactProjectReturn=oldRoute;
  else if(!contactJourneyRoutes.has(nextRoute))contactProjectReturn='';
}
function showContactReturn(view,route){
  if(!contactProjectReturn||!contactJourneyRoutes.has(route))return;
  const back=link('← Back to project',contactProjectReturn,'breadcrumb');
  const existing=view.querySelector('a.breadcrumb[href="#people"]');if(existing)existing.replaceWith(back);else view.prepend(back);
}
function outlineEditActions(view){applyActionStyles(view);}
async function render() {
  if (saving) { announce('Please wait for the save to finish.'); return; }
  const ticket=++renderVersion;
  try{if(!await requireLocalSession(main,render,()=>ticket===renderVersion,()=>hasUnsavedWork()||saving))return;if(ticket!==renderVersion)return;}catch{if(ticket!==renderVersion)return;showAuthFailure(render);return;}
  const [route = 'projects', raw = ''] = (location.hash.slice(1) || 'projects').split('/'); const view = el('div');
  // Keep the incoming route connected for its renderers, but reveal it in one step.
  const loading=el('p','Loading workspace…','loading');loading.setAttribute('role','status');view.hidden=true;view.inert=true;main.replaceChildren(loading,view);main.setAttribute('aria-busy','true');
  const active = ({ project: 'projects', client: 'people', person: 'people', organisation: 'organisations', 'organisation-category':'organisations','new-organisation':'organisations','edit-organisation':'organisations', clients:'people', dashboard: 'projects', 'new-person': 'people', 'edit-person': 'people', 'new-client': 'people', 'new-project': 'projects', 'link-referrer':'people', 'link-contact':'people', coordination: 'projects', operations:'projects',documents:'projects','client-details':'people' })[route] ?? route;
  document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  try {
    const arg = decodeURIComponent(raw);
    if(route==='accounts') await renderAccounts(view);
    else if(route==='reports') await renderReports(view);
    else if(route==='reviews') await reviews(view);
    else if(route==='settings') await renderSettings(view);
    else if (route==='client-details') await renderClientDetails(view,arg,{announce,setSaving:value=>{saving=value;},request:async(path,method='GET',body)=>{const response=await fetch('/api/'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok){const e=Error(data.error);e.status=response.status;throw e;}return data;}});
    else if(route==='availability') await renderAvailability(view,arg,()=>ticket===renderVersion);
    else if(await renderOperations(view,route,arg)) { /* Case workspace supplied. */ }
    else if (await renderWorkflow(view, route, arg)) { /* Workflow view supplied. */ }
    else if (['projects', 'clients', 'people', 'organisations'].includes(route)) await register(view, route==='clients'?'people':route);
    else if (route === 'dashboard') await register(view, 'projects');
    else if (route === 'search') await search(view, arg);
    else if (route === 'project') await project(view, arg);
    else if (route === 'client') await client(view, arg);
    else if (route === 'person' || route === 'organisation') await entity(view, route, arg);
    else view.append(heading('Page not found', 'Return to your workspace to continue.'), link('Open projects', 'projects', 'button primary'));
  } catch (error) { view.replaceChildren(heading('Unable to load this view', 'Your unsaved project drafts are retained in this browser tab.'), message(error.status ? error.message : 'Check that the local application and database are running, then try again.', true), button('Try again', render, 'primary'), link('Back to projects', 'projects', 'text-button')); }
  if (ticket === renderVersion) { showContactReturn(view,route);renderProjectDraftReturn(view,route);outlineEditActions(view);loading.remove();view.hidden=false;view.inert=false;main.removeAttribute('aria-busy'); main.focus({ preventScroll: true }); window.scrollTo(0, 0); document.title = `TADSA · ${view.querySelector('h1')?.textContent ?? 'Workspace'}`;refreshDraftReview();if(requestedDraftReview){revealDraftForm(requestedDraftReview);requestedDraftReview=null;} }
}
// Debounced live suggestions keep focus in the field and reject stale responses.
const searchForm=document.querySelector('#global-search');
const preview=el('div',undefined,'search-preview');preview.id='global-results';preview.hidden=true;preview.setAttribute('role','listbox');preview.setAttribute('aria-label','Search suggestions');searchForm.append(preview);
globalInput.setAttribute('role','combobox');globalInput.setAttribute('aria-autocomplete','list');globalInput.setAttribute('aria-controls',preview.id);globalInput.setAttribute('aria-expanded','false');
let searchTimer,searchTicket=0,searchController,selectedSuggestion=-1;
function closeSearchPreview(){clearTimeout(searchTimer);searchTicket++;searchController?.abort();preview.hidden=true;globalInput.setAttribute('aria-expanded','false');globalInput.removeAttribute('aria-activedescendant');selectedSuggestion=-1;}
function selectSuggestion(index){const items=[...preview.querySelectorAll('[role=option]')];if(!items.length)return;selectedSuggestion=(index+items.length)%items.length;items.forEach((item,i)=>item.setAttribute('aria-selected',String(i===selectedSuggestion)));globalInput.setAttribute('aria-activedescendant',items[selectedSuggestion].id);items[selectedSuggestion].scrollIntoView({block:'nearest'});}
globalInput.addEventListener('input',()=>{closeSearchPreview();const q=globalInput.value.trim();if(!q)return;const ticket=searchTicket;searchTimer=setTimeout(async()=>{searchController=new AbortController();preview.replaceChildren(el('p','Searching…','search-preview-state'));preview.hidden=false;globalInput.setAttribute('aria-expanded','true');try{const response=await fetch('/api/search?q='+encodeURIComponent(q),{signal:AbortSignal.any([searchController.signal,AbortSignal.timeout(12000)])});if(!response.ok)throw Error('Search unavailable');const data=await response.json();if(ticket!==searchTicket||globalInput.value.trim()!==q)return;preview.replaceChildren();for(const [i,result]of data.results.slice(0,7).entries()){const a=link('',result.type+'/'+result.id,'search-suggestion');a.id='search-suggestion-'+i;a.setAttribute('role','option');a.setAttribute('aria-selected','false');a.tabIndex=-1;const text=el('span');text.append(el('strong',result.label),el('small',result.description));a.append(text,el('span',cap(result.type),'result-type'));a.addEventListener('click',e=>{if(saving){e.preventDefault();announce('Please wait for the save to finish.');}closeSearchPreview();});preview.append(a);}if(!data.results.length)preview.append(el('p','No matching records. Try a name or reference.','search-preview-state'));const all=el('p',Math.min(data.results.length,7)+' suggestions · '+(data.results.length===50?'Search is limited to 50 results; refine your search · Enter to review':data.results.length+' matches · Enter to review'),'search-preview-footer');preview.append(all);}catch(e){if(e.name==='AbortError'||ticket!==searchTicket)return;preview.replaceChildren(el('p','Search unavailable. Press Enter to try the full search.','search-preview-state'));}},180);});
globalInput.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSearchPreview();return;}if(!preview.hidden&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();selectSuggestion(selectedSuggestion<0?(e.key==='ArrowDown'?0:preview.querySelectorAll('[role=option]').length-1):selectedSuggestion+(e.key==='ArrowDown'?1:-1));}if(e.key==='Enter'&&!preview.hidden&&selectedSuggestion>=0){e.preventDefault();preview.querySelectorAll('[role=option]')[selectedSuggestion]?.click();}});
searchForm.addEventListener('focusout',()=>setTimeout(()=>{if(!searchForm.contains(document.activeElement))closeSearchPreview();},0));document.addEventListener('pointerdown',e=>{if(!searchForm.contains(e.target))closeSearchPreview();});window.addEventListener('hashchange',closeSearchPreview);

document.querySelector('#global-search').addEventListener('submit', event => { event.preventDefault(); closeSearchPreview(); if (saving) { announce('Please wait for the save to finish.'); return; } const target = `#search/${encodeURIComponent(globalInput.value.trim())}`; if (location.hash === target) render(); else location.hash = target; });
document.querySelector('.skip').addEventListener('click', event => { event.preventDefault(); main.focus(); });
window.addEventListener('keydown', event => { if (document.documentElement.dataset.authState==='ready' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if(drawerOpen)setDrawer(false,false);globalInput.focus(); globalInput.select(); } });
window.addEventListener('hashchange', event => { if (saving) { history.replaceState(null, '', new URL(event.oldURL).hash || '#projects'); announce('Your changes are saving. Please wait before leaving this record.'); const pending = main.querySelector('.message'); if (pending) pending.textContent = 'Your changes are saving. Please wait before leaving this record.'; return; } trackContactOrigin(new URL(event.oldURL).hash,location.hash);if(announcementRoute!==(location.hash||'#projects')){announcement.textContent='';document.querySelector('.save-toast')?.remove();clearTimeout(toastTimer);} render(); });
window.addEventListener('beforeunload', event => { if(sessionEnded||workspaceRestored)return; if (drafts.size || workflowHasDrafts() || operationsHaveDrafts() || careHasDrafts() || clientDetailsHasDrafts() || saving) { event.preventDefault(); event.returnValue = ''; } });
installDraftReview(main,async item=>{if(saving){announce('Please wait for saving to finish.');return;}item.restore?.();requestedDraftReview=item.token;const parts=(item.route||'projects').split('/');if(parts[0]==='project'&&item.section)projectTabs.set(parts[1],item.section);const target='#'+(item.route||'projects');if(location.hash===target)await render();else location.hash=target;});
render();
// The desktop rail becomes a focus-contained navigation drawer on small screens.
const drawer=document.querySelector('#workspace-navigation'),drawerToggle=document.querySelector('#navigation-toggle'),drawerClose=document.querySelector('#navigation-close'),backdrop=document.querySelector('#navigation-backdrop'),mobileMedia=matchMedia('(max-width:800px)');
let drawerOpen=false;
function setDrawer(open,restoreFocus=true){drawerOpen=open&&mobileMedia.matches;document.body.classList.toggle('drawer-open',drawerOpen);drawerToggle.setAttribute('aria-expanded',String(drawerOpen));drawer.inert=mobileMedia.matches&&!drawerOpen;backdrop.hidden=!drawerOpen;document.querySelector('.workspace').inert=drawerOpen;document.querySelector('.mobile-navigation').inert=drawerOpen;if(drawerOpen){drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-label','Workspace navigation');drawerClose.focus();}else{drawer.removeAttribute('role');drawer.removeAttribute('aria-modal');drawer.removeAttribute('aria-label');if(restoreFocus&&mobileMedia.matches)drawerToggle.focus();}}
drawerToggle.addEventListener('click',()=>setDrawer(!drawerOpen));drawerClose.addEventListener('click',()=>setDrawer(false));backdrop.addEventListener('click',()=>setDrawer(false));drawer.addEventListener('click',e=>{const anchor=e.target.closest('a');if(anchor){const sameRoute=anchor.hash===(location.hash||'#projects');setDrawer(false,false);if(sameRoute)main.focus({preventScroll:true});}});mobileMedia.addEventListener('change',()=>setDrawer(false,false));
document.addEventListener('keydown',e=>{if(!drawerOpen)return;if(e.key==='Escape'){e.preventDefault();setDrawer(false);return;}if(e.key==='Tab'){const stops=[...drawer.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=stops[0],last=stops.at(-1);if(e.shiftKey&&(document.activeElement===first||!drawer.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
setDrawer(false,false);
window.addEventListener('tadsa-auth-locked',()=>setDrawer(false,false));

// Desktop width is a local presentation preference; changing it never rerenders a form.
const sidebarCollapse=document.querySelector('#sidebar-collapse'),sidebarTooltip=document.createElement('div');
sidebarTooltip.id='sidebar-tooltip';sidebarTooltip.className='sidebar-tooltip';sidebarTooltip.hidden=true;sidebarTooltip.setAttribute('aria-hidden','true');document.body.append(sidebarTooltip);
let sidebarHovered=null;
const compactSidebar=()=>!mobileMedia.matches&&document.documentElement.dataset.sidebar==='collapsed';
function hideSidebarTooltip(){sidebarTooltip.hidden=true;sidebarHovered=null;}
function syncSidebarControl(){const collapsed=compactSidebar(),label=collapsed?'Expand menu':'Collapse menu';sidebarCollapse.setAttribute('aria-expanded',String(!collapsed));sidebarCollapse.setAttribute('aria-label',label);sidebarCollapse.querySelector('.sidebar-toggle-label').textContent=label;hideSidebarTooltip();}
sidebarCollapse.addEventListener('click',()=>{const collapsed=!compactSidebar();document.documentElement.dataset.sidebar=collapsed?'collapsed':'expanded';try{localStorage.setItem('tadsa-sidebar-collapsed',String(collapsed));}catch{}syncSidebarControl();});
const tooltipTarget=target=>target instanceof Element?target.closest('#workspace-navigation nav a,#sidebar-collapse,#local-signout'):null;
function showSidebarTooltip(target){if(!compactSidebar()||!target||target.matches(':disabled')||document.documentElement.dataset.authState!=='ready'){hideSidebarTooltip();return;}sidebarTooltip.textContent=target.getAttribute('aria-label')||target.textContent.trim();sidebarTooltip.hidden=false;const bounds=target.getBoundingClientRect();sidebarTooltip.style.left=drawer.getBoundingClientRect().right+'px';sidebarTooltip.style.top=Math.max(8,Math.min(innerHeight-sidebarTooltip.offsetHeight-8,bounds.top+(bounds.height-sidebarTooltip.offsetHeight)/2))+'px';}
drawer.addEventListener('mouseover',e=>{sidebarHovered=tooltipTarget(e.target);showSidebarTooltip(sidebarHovered);});
drawer.addEventListener('mouseleave',e=>{if(e.relatedTarget instanceof Node&&sidebarTooltip.contains(e.relatedTarget))return;sidebarHovered=null;showSidebarTooltip(tooltipTarget(document.activeElement));});
sidebarTooltip.addEventListener('mouseleave',()=>showSidebarTooltip(tooltipTarget(document.activeElement)));
drawer.addEventListener('focusin',e=>showSidebarTooltip(tooltipTarget(e.target)));
drawer.addEventListener('focusout',()=>{hideSidebarTooltip();});
drawer.addEventListener('click',hideSidebarTooltip);
drawer.addEventListener('scroll',hideSidebarTooltip);
window.addEventListener('resize',hideSidebarTooltip);
window.addEventListener('hashchange',hideSidebarTooltip);
window.addEventListener('tadsa-auth-locked',hideSidebarTooltip);
window.addEventListener('storage',e=>{if(e.key==='tadsa-sidebar-collapsed'||e.key===null)syncSidebarControl();});
document.addEventListener('keydown',e=>{if(e.key==='Escape')hideSidebarTooltip();});
mobileMedia.addEventListener('change',syncSidebarControl);syncSidebarControl();
