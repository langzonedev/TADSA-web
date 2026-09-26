import {renderInvoiceReferences} from './invoice-references.js';
import {auditReferenceIds,auditAction,auditChanges,formatValue as displayValue} from './record-values.js';
import {renderProfileDetails} from './profile-details.js';
import {renderProjectDetails,renderProjectCoordinator,renderProjectFeedback} from './project-details.js';
import {renderAccounts} from './accounts.js';
import {renderReports} from './reports.js';
import {renderSettings,configureSettings} from './settings.js';
import {requireLocalSession,sessionEnded,showAuthFailure} from './local-login.js';
import {configureOperations,renderOperations,operationsHaveDrafts,renderNotes} from './operations.js';
import {configureCare,careHasDrafts,renderProjectCare} from './project-care.js';
import {renderLifecycle} from './project-lifecycle.js';
import {renderCredentials} from './technician-credentials.js';
import {renderAvailability} from './availability.js';
import {renderTechnicianLocation} from './technician-location.js';
import {renderClientDetails,clientDetailsSummary,clientDetailsHasDrafts} from './client-details.js';
import { configureWorkflows, renderWorkflow, workflowHasDrafts, addClientContactActions } from './workflows.js';
const main = document.querySelector('#content');
const globalInput = document.querySelector('#global-query');
const announcement = document.querySelector('#announcement');
const drafts = new Map();
const registers = new Map();
const projectTabs = new Map();
let renderVersion = 0;
let saving = false;
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
const cap = text => text ? text[0].toUpperCase() + text.slice(1) : 'Not recorded';
const initials = name => name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]).join('');
const avatar = name => { const n = el('span', initials(name), 'avatar'); n.setAttribute('aria-hidden', 'true'); return n; };
const date = value => value ? new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' }).format(new Date(`${value.slice(0, 10)}T12:00:00`)) : 'Not recorded';
const status = value => el('span', value === 'open' ? 'Opened' : cap(value), `badge ${value}`);
function projectStatus(p){const group=el('span',undefined,'project-status');group.append(status(p.status));if(p.invoiceRequired&&p.status!=='closed')group.append(el('span','Invoice required','badge invoice'));return group;}
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
  for (const p of [...projects].sort((a,b)=>Number(a.status==='closed')-Number(b.status==='closed')||String(b.reference).localeCompare(String(a.reference),'en-AU',{numeric:true}))) { const a = link('', `project/${p.id}`, 'project-link'); const text = el('span'); text.append(el('strong', p.title), el('small', `${p.reference}`));const description=String(p.summary||'').replace(/\s+/g,' ').trim();if(description)text.append(el('span',description.length>200?description.slice(0,197)+'…':description,'project-link-description'));a.append(text, projectStatus(p)); list.append(a); }
  box.append(list); return box;
}
function inspect(item, kind, slot) {
  const type = typeOf(kind); slot.replaceChildren(); slot.append(el('div', 'Quick view', 'inspector-top'));
  const body = el('div', undefined, 'inspector-body');
  if (!item) { body.append(empty('Select a record', 'Choose a row to see its details here.')); slot.append(body); return; }
  if (kind === 'projects') {
    body.append(el('span', item.reference, 'inspector-reference'), el('h2', item.title), projectStatus(item), el('p', item.summary));
    const context = el('div', undefined, 'inspector-section'); context.append(el('h3', 'Project details'), details([['Client', link(item.clientName, `client/${item.clientId}`)], ['Target date', date(item.dueDate)]])); body.append(context);
    const people = el('div', undefined, 'inspector-section'); people.append(el('h3', 'Working together'));
    for (const r of [...item.relationships].sort((a, b) => Number(b.role === 'Technician') - Number(a.role === 'Technician'))) { const a = link('', `${r.type}/${r.id}`, 'person-line'); const text = el('span'); text.append(el('strong', r.name), el('small', r.role)); a.append(avatar(r.name), text); people.append(a); }
    if (!item.relationships.length) people.append(el('p', 'No assignments recorded.'));
    body.append(people);
  } else {
    const name = nameOf(item); body.append(avatar(name), el('h2', name), el('p', kind === 'clients' ? 'Client record' : item.role));
    const context = el('div', undefined, 'inspector-section');
    if (kind === 'clients') context.append(details([['Email', item.person.email], ['Phone', item.person.phone], ['Linked projects', item.projects.length]]));
    else if (kind === 'people') context.append(details([['Email', item.email], ['Phone', item.phone], ['Linked projects', item.projects.length]]));
    else context.append(el('p', item.description), details([['Linked projects', item.projects.length]]));
    body.append(context);
    if (item.projects.length) { const linked = el('div', undefined, 'inspector-section'); linked.append(el('h3', 'Current context')); for (const p of item.projects.slice(0, 2)) { const a = link(p.title, `project/${p.id}`, 'person-line'); linked.append(a); } body.append(linked); }
  }
  body.append(link(kind === 'projects' ? 'Open project →' : 'Open record →', `${type}/${item.id}`, 'button primary')); slot.append(body);
}
async function register(view, kind) {
  const { items, limit } = await api(kind);
  const state = registers.get(kind) ?? { query: '', filter: 'all', sort: kind === 'projects' ? 'reference' : 'name', selected: null };
  registers.set(kind, state); returnRoute = kind;
  const descriptions = { projects: 'Projects in progress, the people involved, and the work to be done.', clients: 'A connected view of each person and the work supporting them.', people: 'Clients, technical members and the people supporting each request.', organisations: 'The organisations connected to our work.' };
  const head = heading(cap(kind), descriptions[kind], 'Administration'); head.append(el('span', `${items.length} ${kind === 'people' ? 'people' : kind}`, 'meta-note')); if (kind === 'projects') head.append(link('New project', 'new-project', 'button primary')); if(kind==='organisations')head.append(link('New organisation','new-organisation','button primary')); if (kind === 'people') head.append(link('New person', 'new-person', 'button primary')); if (kind === 'clients') head.append(link('New client', 'new-client', 'button primary')); view.append(head);
  const tabs = el('div', undefined, 'filter-tabs'); tabs.setAttribute('aria-label', `Filter ${kind}`);
  const filters = kind === 'projects' ? [['all', 'All projects', () => true], ['open', 'Open', p => p.status === 'open'], ['review', 'Review', p => p.status === 'review'], ['closed', 'Closed', p => p.status === 'closed'], ['feedback', 'Feedback', p => p.feedbackRequired], ['invoice', 'Invoice', p => p.invoiceRequired]] : [['all', `All ${kind}`, () => true], ...(kind === 'people' ? [...new Set(items.flatMap(p => p.roles ?? [p.role]))].sort().map(role => [role, role, p => (p.roles ?? [p.role]).includes(role)]) : [])];
  const layout = el('div', undefined, 'register-layout'); const box = el('section', undefined, 'register-panel'); box.setAttribute('aria-label', `${cap(kind)} register`); const inspector = el('aside', undefined, 'inspector'); inspector.setAttribute('aria-label', 'Selected record');
  const tools = el('div', undefined, 'register-tools'); const searchLabel = el('label'); const q = el('input'); q.type = 'search'; q.value = state.query; q.placeholder = `Filter ${kind}…`; q.setAttribute('aria-label', `Filter ${kind} by name or reference`); searchLabel.append(q);
  const sortLabel = el('label'); sortLabel.append(el('span', 'Sort by')); const sort = el('select'); sort.setAttribute('aria-label', `Sort ${kind}`);
  for (const [value, label] of kind === 'projects' ? [['reference', 'Reference'], ['name', 'Project title'], ['date', 'Target date'], ['client', 'Client name']] : [['name', 'Name A–Z'], ['reverse', 'Name Z–A']]) { const o = el('option', label); o.value = value; sort.append(o); }
  sort.value = state.sort; sortLabel.append(sort); tools.append(searchLabel, sortLabel);
  const tableSlot = el('div', undefined, 'table-wrap'); const foot = el('div', undefined, 'table-footer'); box.append(tools, tableSlot, foot); layout.append(box, inspector); view.append(tabs, layout);
  function draw() {
    tabs.replaceChildren();
    for (const [key, label, predicate] of filters) { const b = button('', () => { state.filter = key; draw(); tabs.querySelector('[aria-pressed=true]')?.focus(); }, 'filter-tab'); b.setAttribute('aria-pressed', String(state.filter === key)); b.append(el('span', label), el('span', String(items.filter(predicate).length), 'filter-count')); tabs.append(b); }
    const predicate = filters.find(f => f[0] === state.filter)?.[2] ?? (() => true);
    const query = state.query.toLowerCase().trim();
    const visible = items.filter(item => predicate(item) && [nameOf(item), item.reference, item.clientName, item.role, item.category, item.summary].filter(Boolean).join(' ').toLowerCase().includes(query));
    const key = item => state.sort === 'date' ? item.dueDate ?? '9999' : state.sort === 'client' ? item.clientName : state.sort === 'reference' ? item.reference : nameOf(item);
    visible.sort((a, b) => String(key(a)).localeCompare(String(key(b)), 'en-AU', { numeric: true }) * (state.sort === 'reverse' ? -1 : 1));
    if (!visible.some(i => i.id === state.selected)) state.selected = visible[0]?.id ?? null;
    const table = el('table', undefined, kind + '-table'); const thead = el('thead'); const tr = el('tr');
    const columns = kind === 'projects' ? ['Project', 'Client', 'Status', 'Target'] : kind === 'clients' ? ['Client', 'Projects'] : kind === 'people' ? ['Person', 'Role', 'Projects'] : ['Organisation', 'Type', 'Category', 'Projects'];
    columns.forEach((label, i) => { const th = el('th', label); th.scope = 'col'; if ((kind === 'projects' && i === 3)) th.className = 'optional-col'; tr.append(th); }); thead.append(tr); table.append(thead);
    const tbody = el('tbody');
    for (const item of visible) {
      const row = el('tr'); row.dataset.id = item.id; row.classList.toggle('selected', !matchMedia('(max-width:800px)').matches && item.id === state.selected);
      const first = el('td'); const control = link('',`${typeOf(kind)}/${item.id}`,'row-open'); control.setAttribute('aria-label', `Open ${nameOf(item)}`);
      const text = el('span'); text.append(el('span', nameOf(item), 'row-title'), el('span', kind === 'projects' ? `${item.reference}` : kind === 'clients' ? item.person.email : kind === 'people' ? item.email : item.description, 'row-sub'));
      if (kind === 'clients' || kind === 'people') { const identity = el('span', undefined, 'name-cell'); identity.append(avatar(nameOf(item)), text); control.append(identity); } else control.append(text); first.append(control); {const previewButton=button('Quick view',()=>choose(item),'text-button row-preview');previewButton.setAttribute('aria-label','Preview '+nameOf(item));first.append(previewButton);} row.append(first);
      if (kind === 'projects') { row.append(el('td', item.clientName)); const s = el('td'); s.append(projectStatus(item)); row.append(s, el('td', date(item.dueDate), 'optional-col')); }
      else if (kind === 'clients') row.append(el('td', String(item.projects.length)));
      else if(kind==='organisations')row.append(el('td',item.role||'Not recorded'),el('td',item.category||'Not specified'),el('td',String(item.projects.length))); else row.append(el('td',item.role),el('td',String(item.projects.length)));
      row.addEventListener('click', event => { if (!event.target.closest('button,a')) {location.hash=typeOf(kind)+'/'+item.id;} }); tbody.append(row);
    }
    table.append(tbody); tableSlot.replaceChildren(visible.length ? table : empty('No matching records', 'Try another filter or clear your search.'));
    foot.replaceChildren(el('span', `${visible.length} of ${items.length} records`), el('span', items.length >= limit ? `Showing the first ${limit} records` : 'Click a record to open · Quick view for a preview'));
    inspect(visible.find(i => i.id === state.selected), kind, inspector);
    function choose(item) { state.selected = item.id; if (window.matchMedia('(max-width: 800px)').matches) { location.hash = typeOf(kind) + '/' + item.id; return; } tbody.querySelectorAll('tr').forEach(r => { const selected = r.dataset.id === item.id; r.classList.toggle('selected', selected); r.querySelector('button')?.setAttribute('aria-pressed', String(selected)); }); inspect(item, kind, inspector); announce(`${nameOf(item)} selected. Quick view updated.`); }
  }
  q.addEventListener('input', () => { state.query = q.value; draw(); }); sort.addEventListener('change', () => { state.sort = sort.value; draw(); }); draw();
}
async function search(view, term) {
  returnRoute = `search/${encodeURIComponent(term)}`; globalInput.value = term;
  view.append(heading(term ? `Results for “${term}”` : 'Find a record', 'Search across clients, projects, people and organisations.', 'Workspace search'));
  if (!term) { view.append(empty('Start with a name or reference', 'Use the search field above. Press Ctrl K to jump there.')); return; }
  const { results } = await api(`search?q=${encodeURIComponent(term)}`); const box = el('div', undefined, 'results');
  if (!results.length) { box.append(empty('No matching records', 'Try a shorter name, a project title or a project number.'), link('New client', 'new-client', 'button secondary')); }
  for (const r of results) { const a = link('', `${r.type}/${r.id}`, 'result'); const text = el('span'); text.append(el('strong', r.label), el('small', r.description)); a.append(text, el('span', cap(r.type), 'result-type')); box.append(a); }
  view.append(el('p', `${results.length} matching record${results.length === 1 ? '' : 's'}${results.length === 50 ? ' · showing the first 50' : ''}`, 'muted'), box);
}
function recordHeader(view, eyebrow, title, meta, action) { const header = el('div', undefined, 'record-header'); const text = el('div'); text.append(el('div', eyebrow, 'eyebrow'), el('h1', title)); if (meta) text.append(meta); header.append(text); if (action) header.append(action); view.append(header); return header; }
async function client(view, id) {
  const c = await api(`clients/${id}`); view.append(link('← Back to people', 'people', 'breadcrumb'));
  const meta = el('div', undefined, 'record-meta'); meta.append(el('span', 'Client'), el('span', `${c.projects.length} linked projects`)); recordHeader(view, 'Client record', c.person.name, meta, link('New project', `new-project/${c.id}`, 'button primary'));
  const grid = el('div', undefined, 'detail-layout person-detail-layout'); const left = el('div'); const info = panel('Contact details'); info.append(details([['Email', c.person.email], ['Phone', c.person.phone]]), link('Edit profile & roles', 'edit-person/' + c.person.id, 'text-button'));
  const contacts = panel('Client contacts'); addClientContactActions(contacts, c); left.append(projectLinks(c.projects),clientDetailsSummary(c),info,contacts);await renderProfileDetails(left,c.person); const related = relationships(c.relationships); related.querySelector('h2').textContent = 'People linked through projects'; grid.append(left, related); view.append(el('div', undefined, 'heading-rule'), grid);
}
function auditPanel(p,operationsPromise,managed=false) {
  const names=new Map([[p.id,p.reference+' · '+p.title],[p.clientId,p.clientName],...p.relationships.map(r=>[r.id,r.name])]);
  const ids=auditReferenceIds(p.audit).filter(id=>!names.has(id));
  const resolve=(id,key)=>names.get(id)??(/^(person|client|organisation|org|project)-/.test(id)?({person:'Person',client:'Client',organisation:'Organisation',org:'Organisation',project:'Project'}[id.split('-')[0]]+' no longer available'):/^[a-f0-9-]{36}$/i.test(id)?(key==='invoiceId'?'Recorded invoice': 'Recorded item')+' (reference unavailable)':id);
  const box = panel('Audit trail');
  const render=()=>{
    box.replaceChildren(el('h2','Audit trail'),el('p','Saved changes, newest first. History records values at the time of each change. Current decisions are shown in Workflow. Development activity is not an authenticated staff audit trail.','muted'));
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
  let p = await api(`projects/${id}`); let tab = location.hash.split('/')[2]==='costs'?'Costs & invoices':projectTabs.get(id)??'Overview'; let editMode = drafts.has(id); let success = '';
  const destinations=['Overview','Files','Costs & invoices','Workflow history'];
  if(!destinations.includes(tab)&&!['Task','Edit details','Audit trail','Case-note history','Hold or resume work','Record hours','Prepare invoices','Print documents','Team','Funding','Feedback'].includes(tab)&&!tab.startsWith('Action:'))tab='Overview';
  view.classList.add('project-workspace');
  view.append(link('← All projects','projects','breadcrumb'));
  const meta=el('div',undefined,'record-meta'),header=recordHeader(view,p.reference,p.title,meta),headerActions=el('div',undefined,'project-more-wrap');header.firstElementChild.classList.add('project-identity');header.append(headerActions);
  const tabs=el('div',undefined,'record-tabs project-nav');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','Project detail');view.append(tabs);
  const subnav=el('div',undefined,'project-subnav');subnav.setAttribute('role','tablist');subnav.setAttribute('aria-label','Project section');view.append(subnav);view.insertBefore(tabs,header);view.insertBefore(subnav,header);
  const overview=el('section',undefined,'project-overview'),task=el('section',undefined,'project-task'),filesPane=el('section'),costsPane=el('section'),recordPane=el('section'),editPane=el('section');
  const content=el('div'),auditPane=el('section'),caseNotesPane=el('section');editPane.append(content);await renderProjectDetails(editPane,id);const operationsPromise=api(`projects/${id}/operations`);auditPane.append(button('← Project overview',()=>navigate('Overview'),'secondary'),el('p','Loading history…'));caseNotesPane.append(button('← Project overview',()=>navigate('Overview'),'secondary'));
  const taskForm=el('div',undefined,'project-task-form'),taskContext=el('aside',undefined,'project-task-context'),taskGrid=el('div',undefined,'project-task-grid');taskGrid.append(taskContext,taskForm);
  task.append(button('← Project overview',()=>navigate('Overview'),'secondary'),taskGrid);
  view.append(overview,task,filesPane,costsPane,recordPane,editPane,auditPane,caseNotesPane);
  const actionSource=el('div'),care=el('div'),fundingReference=el('div');
  const [projectOperations,projectLocation,adminDetails,adminOptions,workPlan]=await Promise.all([operationsPromise,api(`projects/${id}/location`),api(`projects/${id}/admin-details`),api('project-admin-options'),api(`projects/${id}/work-plan`)]);
  const lifecycle=await renderLifecycle(taskForm,p,{operations:projectOperations,recordTarget:recordPane,actionsTarget:actionSource,contextTarget:taskContext,onSaved:()=>projectTabs.set(id,'Overview'),openFiles:()=>{navigate('Files');filesPane.querySelector('input[type=file]')?.focus();}});
  auditPane.lastElementChild.replaceWith(auditPanel(p,operationsPromise,lifecycle.managed));
  await renderProjectCare(care,id);
  function flatten(section){for(const d of [...section.querySelectorAll('details')].reverse()){if(d.closest('.file-row'))continue;const summary=d.querySelector(':scope > summary'),replacement=el('section',undefined,'project-record-section');if(summary){replacement.append(el('h2',summary.textContent));summary.remove();}replacement.append(...d.childNodes);d.replaceWith(replacement);}}
  for(const child of [...care.children]){const name=child.querySelector(':scope > summary')?.textContent;if(child.classList.contains('project-files'))filesPane.append(child);else if(name==='NDIS reference')fundingReference.append(child);else if(name==='Work location')editPane.append(child);else costsPane.append(child);}
  flatten(filesPane);flatten(costsPane);flatten(recordPane);flatten(editPane);flatten(fundingReference);
  const ndisSave=fundingReference.querySelector('button[type="submit"]');if(ndisSave){ndisSave.dataset.label="Save NDIS reference";if(ndisSave.textContent==="Save")ndisSave.textContent="Save NDIS reference";}
  if(!recordPane.children.length){const empty=panel('Workflow history');empty.append(el('p','No workflow decisions have been recorded for this project yet. Operator notes are in Case notes; technical changes are in Audit trail.'));recordPane.append(empty);}
  filesPane.prepend(button('← Return to current task',()=>navigate('Task'),'secondary project-task-return'));
  costsPane.prepend(el('h2','Costs & invoices'));await renderInvoiceReferences(costsPane,id);
  for(const action of costsPane.querySelectorAll('a[href^="#operations/"]'))action.remove();
  const financeRelevant=!lifecycle.managed||['finance_clearance','work','customer_signoff','finance_finalisation','ready_to_close','closed'].includes(lifecycle.state?.stage);
  if(financeRelevant)costsPane.append(link('Prepare or review invoices','operations/'+id+'/invoices','button secondary'));else costsPane.append(el('p','Assessment is free. Invoice preparation becomes available after the client accepts the quote.','field-help'));

  const allNotes=panel('Case-note history');for(const n of projectOperations.notes){allNotes.append(el('p',n.text,'case-note'),el('small',`${n.actor||'Operator'} · ${new Date(n.at||n.createdAt).toLocaleString('en-AU')}`));}if(!projectOperations.notes.length)allNotes.append(el('p','No case notes recorded yet.','muted'));caseNotesPane.append(allNotes);
  const stages={enquiry:['Review the enquiry','Decide whether an assessment is needed for this work.','Record assessment decision'],assessment:['Complete the assessment','Arrange the assessment, keep its documents together and record the findings.','Record assessment findings'],quote:['Prepare the project quote','Use the assessment to set out the proposed work and estimated costs.','Prepare quote'],peer_review:['Arrange technical review','A technical member needs to review the solution and its quote.','Record technical review'],client_acceptance:['Confirm the client’s quote decision','Share the reviewed quote and record the confirmation you receive.','Record client decision'],finance_clearance:['Prepare the Finance handoff','Record Finance’s payment confirmation or approved exception before work begins.','Record Finance clearance'],work:['Carry out the agreed work','Keep progress notes and hours up to date, then record completion.','Update technical work'],customer_signoff:['Confirm the customer’s sign-off','Record acceptance of the completed work.','Record customer sign-off'],finance_finalisation:['Finalise the project costs','Record actual costs and Finance’s final confirmation.','Finalise costs'],ready_to_close:['Close the project','The final confirmations are recorded. Add the closure note.','Close project'],closed:['Project closed','Notes, documents and the full project history remain available.','Review completion']};
  const state=lifecycle.state,stage=state?.stage,held=!state?.closed&&!state?.cancellation&&(projectOperations.onHold||projectOperations.clientStopped),info=held?['Review the project hold','Work is paused. Review the hold and record the required consent before resuming.','Review hold or resume']:stages[stage]??['Review the project','This existing project retains its records. Begin the guided workflow when ready.','Review workflow'];
  const layout=el('div',undefined,'project-overview-grid'),left=el('div',undefined,'project-overview-action'),notes=el('section',undefined,'project-home-notes');overview.append(layout);
  const next=el('section',undefined,'panel project-next');next.append(el('p','NEXT ACTION','eyebrow'),el('h2',info[0]),el('p',info[1]));
  const warnings=(lifecycle.workGate?.reasons??[]).filter(r=>/hold|stop/i.test(r));if(stage==='work')warnings.push(...(lifecycle.workGate?.reasons??[]).filter(r=>!/hold|stop/i.test(r)));
  if(state?.cancellation)warnings.unshift('Cancelled: '+state.cancellation.reason);
  if(warnings.length){const warning=el('div',undefined,'message warning');warning.append(...[...new Set(warnings)].map(t=>el('p',t)));left.append(warning);}
  const revisionFeedback=state&&!state.closed&&!state.cancellation?(state.revisionRequested?.reason||(state.peerReview?.approved===false?state.peerReview.notes:'')):'';
  if(revisionFeedback){const feedback=panel('Changes requested');feedback.classList.add('revision-feedback');feedback.append(el('p',revisionFeedback,'workflow-comment'),button('View workflow history',()=>navigate('Workflow history'),'secondary'));left.append(feedback);}
  const quote=state?.quotes?.at(-1);if(quote)next.append(el('p',`Quote revision ${quote.version} · ${new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(quote.totalCents/100)}`,'project-next-evidence'));
  next.append(button(info[2]+' →',()=>navigate(held?'Hold or resume work':'Task'),'primary'));left.append(next);
  const brief=panel('The work');brief.append(el('p',p.summary||p.title,'record-summary'));
  const payerNames=new Map([[`client:${p.clientId}`,p.clientName]]);if(projectOperations.fundingContributors.length){const [people,organisations,clients]=await Promise.all([api('people'),api('organisations'),api('clients')]);for(const [type,items] of [['person',people.items],['organisation',organisations.items],['client',clients.items]])for(const item of items)payerNames.set(type+':'+item.id,item.person?.name??item.name);}
  const facts=el('div',undefined,'project-facts');const client=el('div');client.append(el('small','CLIENT'),link(p.clientName,`client/${p.clientId}`));facts.append(client);
  for(const [label,roles] of [['CONTACTS',['Carer','OT','Occupational therapist','Allied-health contact']],['REFERRER',['Referrer']],['FUNDER / PAYER',['Funder']],['TECHNICAL TEAM',['Technician']]]){
    const group=el('div');group.append(el('small',label));const members=p.relationships.filter(r=>roles.includes(r.role));
    if(label==='FUNDER / PAYER'&&projectOperations.fundingContributors.length){for(const c of projectOperations.fundingContributors)group.append(link((payerNames.get(c.type+':'+c.id)||'Recorded payer')+' · '+new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(c.amountCents/100),c.type+'/'+c.id));group.append(el('small','Agreed contributions · not receipts','field-help'));facts.append(group);continue;}
    if(label==='FUNDER / PAYER'&&p.coordination?.fundingStatus==='self'){group.append(link(p.clientName+' · Client pays',`client/${p.clientId}`));facts.append(group);continue;}
    if(!members.length)group.append(el('span',label==='TECHNICAL TEAM'?'Not assigned':'Not recorded','muted'));
    for(const member of members)group.append(link(member.name+(label==='CONTACTS'?' · '+member.role:member.id===p.coordination?.technicianId?' · Lead':''),(member.type==='organisation'?'organisation/':'person/')+member.id));facts.append(group);
  }
  brief.append(facts);const context=el('details',undefined,'project-context-details');context.append(el('summary','More project information'),details([['Programme',adminDetails.programme||'Not recorded'],['Coordinator',adminOptions.coordinators.find(a=>a.id===adminDetails.coordinatorAccountId)?.displayName||(adminDetails.coordinatorAccountId?'Previously assigned account':'Not assigned')],['Skills needed',p.coordination?.requiredSkills?.join(', ')||'Not specified'],['Target date',date(p.dueDate)],['Work location',[projectLocation.address,projectLocation.suburb,projectLocation.postcode].filter(Boolean).join(', ')||'Not recorded']]));brief.append(context);
  const quickActions=el('div',undefined,'project-overview-links');quickActions.append(link('Update team','coordination/'+id+'/team','text-button'),link('Update funding','coordination/'+id+'/funding','text-button'),button('Edit project details',()=>{editMode=false;navigate('Edit details');},'text-button'));brief.append(quickActions);brief.classList.add('project-home-brief');
  const finance=panel('Finance status');finance.classList.add('project-finance-summary');
  const money=value=>new Intl.NumberFormat('en-AU',{style:'currency',currency:'AUD'}).format(value/100),fullDate=value=>value?new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Adelaide',day:'numeric',month:'short',year:'numeric'}).format(new Date(value.includes('T')?value:value+'T12:00:00Z')):'Not recorded';
  const clearance=state?.financeClearance,lastPayment=[...(workPlan.payments??[])].sort((a,b)=>b.receivedOn.localeCompare(a.receivedOn))[0];
  const financeFacts=details([['Latest quote',quote?money(quote.totalCents)+' · Revision '+quote.version:'Not recorded'],['Quote recorded',fullDate(quote?.at)],['Finance clearance',clearance?.status==='paid'?'Payment confirmed':clearance?.status==='exempt'?'Authorised exemption':'Not recorded'],['Finance confirmation date',fullDate(clearance?.confirmedOn)],['Latest recorded receipt',fullDate(lastPayment?.receivedOn)],['Invoice required',p.invoiceRequired?'Yes':'No']]);finance.append(financeFacts);
  finance.append(el('p','Finance clearance is recorded through the workflow before technical work begins. Receipts and invoice records are available in Costs.','field-help'),button('View costs & invoices',()=>navigate('Costs & invoices'),'text-button'));
  // Each column stacks independently so a tall finance summary cannot push notes down.
  const workColumn=el('div',undefined,'project-overview-column'),financeColumn=el('div',undefined,'project-overview-column');
  workColumn.append(brief,notes);financeColumn.append(finance,left);layout.append(workColumn,financeColumn);
  renderNotes(notes,id,projectOperations,true);const firstNote=notes.querySelector('.case-note');if(firstNote)firstNote.before(el('h3','Recent notes','project-note-history-title'));const notesLink=notes.querySelector('a[href="#operations/'+id+'"]');if(notesLink)notesLink.replaceWith(button('View all case notes',()=>navigate('Case-note history'),'text-button'));
  const phase=el('ol',undefined,'project-phases'),groups=[['Assessment',['enquiry','assessment']],['Quote & approval',['quote','peer_review','client_acceptance','finance_clearance']],['Technical work',['work']],['Completion',['customer_signoff','finance_finalisation','ready_to_close','closed']]],phaseIndex=groups.findIndex(([,keys])=>keys.includes(stage));
  const milestones=state?.cancellation?[['Cancellation recorded',true,false],['Finance finalisation',Boolean(state.financeFinalisation),!state.financeFinalisation],['Closure',Boolean(state.closed),Boolean(state.financeFinalisation)&&!state.closed]]:groups.map(([name],i)=>[name,stage==='closed'||i<phaseIndex,stage!=='closed'&&i===phaseIndex]);
  for(const [i,[name,complete,current]] of milestones.entries()){const item=el('li',(complete?'✓ ':`${i+1} · `)+name);if(complete)item.className='complete';else if(current){item.setAttribute('aria-current','step');item.className='current';}phase.append(item);}if(lifecycle.managed)left.prepend(phase);
  const actionPanes=new Map();for(const [i,child] of [...actionSource.children].entries()){const title=child.querySelector(':scope > summary')?.textContent||child.querySelector('button[type=submit]')?.textContent||'Project action';const pane=el('section',undefined,'project-action-task');pane.append(button('← Project overview',()=>navigate('Overview'),'secondary'),el('h2',title),child);flatten(pane);actionPanes.set('Action:'+i,{title,pane});view.append(pane);if(pane.querySelector(':scope > .project-record-section > h2'))pane.querySelector(':scope > h2')?.remove();}
  const embedded=new Map([['Hold or resume work',{route:'operations',focus:'holds'}],['Record hours',{route:'operations',focus:'hours'}],['Prepare invoices',{route:'operations',focus:'invoices'}],['Print documents',{route:'documents'}],['Feedback',{route:'feedback'}],['Team',{route:'coordination',focus:'team'}],['Funding',{route:'coordination',focus:'funding'}]].map(([name,config])=>{const pane=el('section',undefined,'project-embedded-pane');pane.hidden=true;pane.tabIndex=-1;view.append(pane);return [name,{...config,pane,loaded:false,loading:null}];}));
  async function loadEmbedded(name){const entry=embedded.get(name);if(!entry||entry.loaded)return;if(entry.loading)return entry.loading;entry.pane.replaceChildren(el('p','Opening '+name.toLowerCase()+'…','loading'));entry.loading=(async()=>{const body=el('div');try{if(entry.route==='coordination')await renderWorkflow(body,'coordination',id,{embedded:true,focus:entry.focus,onCancel:()=>{entry.loaded=false;navigate('Overview');}});else if(entry.route==='feedback')await renderProjectFeedback(body,id);else await renderOperations(body,entry.route,id,{embedded:true,focus:entry.focus});if(name==='Team')await renderProjectCoordinator(body,id);entry.pane.replaceChildren(el('h2',name),body);if(name==='Funding')entry.pane.append(fundingReference);entry.loaded=true;}catch(error){entry.pane.replaceChildren(message(error.status?error.message:'This section could not load. Your project is still open.',true),button('Try again',()=>loadEmbedded(name),'secondary'));}finally{entry.loading=null;}})();return entry.loading;}
  const sections=[
    {label:'Overview',items:[['Overview','Overview']]},
    {label:'Case notes',items:[['Case-note history','Case notes']]},
    {label:'Team',items:[['Team','Team']]},
    {label:'Funding',items:[['Funding','Funding']]},
    {label:'Files',items:[['Files','Project files'],['Print documents','Print documents']]},
    {label:'Costs',items:[['Costs & invoices','Cost summary'],...(financeRelevant?[['Prepare invoices','Invoices']]:[])]},
    {label:'Hours',items:[['Record hours','Hours']]},
    {label:'Workflow',items:[['Task','Current step'],['Workflow history','Workflow history'],['Hold or resume work','Hold or resume work'],...[...actionPanes].map(([key,value])=>[key,value.title])]},
    {label:'Feedback',items:[['Feedback','Customer feedback']]},
    {label:'Details',items:[['Edit details','Project details']]},
    {label:'Audit trail',items:[['Audit trail','Audit trail']]}
  ];
  const more=button('Project sections',()=>{menu.hidden=!menu.hidden;more.setAttribute('aria-expanded',String(!menu.hidden));if(!menu.hidden)menu.querySelector('[aria-current=page],button')?.focus();},'secondary project-sections-toggle'),menu=el('div',undefined,'project-more-menu');menu.hidden=true;more.setAttribute('aria-expanded','false');more.setAttribute('aria-controls','project-more-menu');menu.id='project-more-menu';
  for(const section of sections)menu.append(button(section.label,()=>navigate(section.items[0][0]),''));
  headerActions.append(more,menu);headerActions.addEventListener('keydown',e=>{if(e.key==='Escape'){menu.hidden=true;more.setAttribute('aria-expanded','false');more.focus();}});
  const panes=new Map([['Overview',overview],['Task',task],['Files',filesPane],['Costs & invoices',costsPane],['Workflow history',recordPane],['Edit details',editPane],['Audit trail',auditPane],['Case-note history',caseNotesPane],...[...embedded].map(([key,value])=>[key,value.pane]),...[...actionPanes].map(([key,value])=>[key,value.pane])]);
  function tabButton(label,key,index,active,container,prefix){
    const b=button(label,()=>navigate(key),'');b.id=prefix+index;b.dataset.destination=key;b.setAttribute('role','tab');b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;b.setAttribute('aria-controls','project-focused-pane');
    b.addEventListener('keydown',async event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const buttons=[...container.querySelectorAll('[role=tab]')];const target=event.key==='Home'?buttons[0]:event.key==='End'?buttons.at(-1):buttons[(index+(event.key==='ArrowRight'?1:buttons.length-1))%buttons.length];const targetId=target.id;await navigate(target.dataset.destination);document.getElementById(targetId)?.focus();});return b;
  }
  view.addEventListener('click',event=>{const anchor=event.target.closest('a[href]');if(anchor&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&event.button===0){const [route,target,focus]=anchor.hash.slice(1).split('/');if(target===id){const section=route==='coordination'?(focus==='funding'?'Funding':'Team'):route==='documents'?'Print documents':route==='operations'?({hours:'Record hours',holds:'Hold or resume work',invoices:'Prepare invoices'})[focus]??'Prepare invoices':null;if(section){event.preventDefault();navigate(section);}}}if(!headerActions.contains(event.target)){menu.hidden=true;more.setAttribute('aria-expanded','false');}});
  async function navigate(name){tab=name;menu.hidden=true;more.setAttribute('aria-expanded','false');draw();await loadEmbedded(name);if(tab!==name)return;const destination=embedded.get(name)?.pane??(name==='Task'?task:name==='Overview'?overview:name==='Files'?filesPane:name==='Costs & invoices'?costsPane:name==='Workflow history'?recordPane:name==='Edit details'?editPane:name==='Audit trail'?auditPane:name==='Case-note history'?caseNotesPane:actionPanes.get(name)?.pane);destination?.focus({preventScroll:true});(tabs.getClientRects().length?tabs:header).scrollIntoView({block:'nearest'});}
  function draw(){
    projectTabs.set(id,tab);header.querySelector('h1').textContent=p.title;header.querySelector('.eyebrow').replaceChildren(el('small','Project no.'),el('strong',p.reference,'project-number'));financeFacts.lastElementChild.querySelector('dd').textContent=p.invoiceRequired?'Yes':'No';meta.replaceChildren();
    for(const [label,value]of [['Status',projectStatus(p)],['Workflow state',el('span',({enquiry:'Enquiry',assessment:'Assessment',quote:'Preparing quote',peer_review:'Technical review',client_acceptance:'Client acceptance',finance_clearance:'Invoice / payment clearance',work:'Technical work',customer_signoff:'Customer sign-off',finance_finalisation:'Final finance review',ready_to_close:'Ready to close',closed:'Completed'})[stage]||'Not started','workflow-stage')],['Next follow-up',el('span',fullDate(adminDetails.followUpOn))]]){const fact=el('div',undefined,'project-header-fact');fact.append(el('small',label),value);meta.append(fact);}header.append(meta,headerActions);
    const section=sections.find(group=>group.items.some(([key])=>key===tab))??sections[0];
    tabs.replaceChildren();sections.forEach((group,i)=>tabs.append(tabButton(group.label,group===section?tab:group.items[0][0],i,group===section,tabs,'project-tab-')));
    more.textContent='Sections · '+section.label+' ▾';more.setAttribute('aria-label','Project sections: '+section.label);
    [...menu.children].forEach((item,i)=>{if(sections[i]===section)item.setAttribute('aria-current','page');else item.removeAttribute('aria-current');});
    subnav.replaceChildren();subnav.hidden=section.items.length<2;
    section.items.forEach(([key,label],i)=>subnav.append(tabButton(label,key,i,key===tab,subnav,'project-subtab-')));
    for(const [key,pane]of panes){pane.hidden=key!==tab;pane.removeAttribute('id');pane.removeAttribute('aria-labelledby');pane.removeAttribute('role');pane.removeAttribute('aria-label');pane.tabIndex=-1;if(key===tab){pane.id='project-focused-pane';pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby',section.items.length>1?'project-subtab-'+section.items.findIndex(([k])=>k===tab):'project-tab-'+sections.indexOf(section));}}
    if(tab!=='Edit details')return;content.replaceChildren();if(success)content.append(message(success));const box=panel(editMode?'Edit project':'Project details');if(editMode)editForm(box);else{box.append(el('p',p.summary||p.title),details([['Opened',date(p.openedAt)],['Target date',date(p.dueDate)],['Feedback',p.feedbackRequired?'Required':'Not required'],['Invoice',p.invoiceRequired?'Required':'Not required']]),button('Edit project',()=>{editMode=true;draw();content.querySelector('input')?.focus();},'secondary'));}content.append(button('← Project overview',()=>navigate('Overview'),'secondary'),box,relationships(p.relationships));
  }
  function editForm(box) {
    const draft = drafts.get(id) ?? { version: p.version, title: p.title, status: p.status, feedbackRequired: p.feedbackRequired, invoiceRequired: p.invoiceRequired };
    const form = el('form', undefined, 'form-grid');
    const titleLabel = el('label'); titleLabel.append(el('span', 'Project title', 'field-label')); const input = el('input'); input.name = 'title'; input.required = true; input.maxLength = 120; input.value = draft.title; titleLabel.append(input);
    const stateLabel = el('label'); stateLabel.append(el('span', 'Status', 'field-label')); const select = el('select'); select.name = 'status'; for (const s of ['open', 'review', 'closed']) { const o = el('option', cap(s)); o.value = s; select.append(o); } select.value = draft.status; select.disabled=Boolean(lifecycle.managed); stateLabel.append(select); form.append(titleLabel, stateLabel);
    const checks = {}; for (const [key, label] of [['feedbackRequired', 'Feedback required'], ['invoiceRequired', 'Invoice required']]) { const l = el('label', undefined, 'checkbox'); const check = el('input'); check.type = 'checkbox'; check.name = key; check.checked = draft[key]; checks[key] = check; l.append(check, el('span', label)); form.append(l); }
    const read = () => ({ version: draft.version, title: input.value, status: select.value, feedbackRequired: checks.feedbackRequired.checked, invoiceRequired: checks.invoiceRequired.checked });
    form.addEventListener('input', () => { drafts.set(id, read()); success = ''; });
    form.append(el('p', lifecycle.managed?'Use the project workflow to close or reopen this project. Its number and history are retained.':'Use the guided workflow to record stage approvals before changing status.', 'muted'));
    const notice = el('div'); const actions = el('div', undefined, 'actions'); const save = el('button', 'Save changes', 'primary'); save.type = 'submit'; const cancel = button('Cancel edit', () => { drafts.delete(id); editMode = false; success = ''; draw(); header.querySelector('button')?.focus(); }, 'secondary'); actions.append(save, cancel); form.append(notice, actions); box.append(form);
    form.addEventListener('submit', async event => {
      event.preventDefault(); if (saving) return;
      if (!input.value.trim()) { input.setCustomValidity('Enter a project title.'); input.reportValidity(); input.addEventListener('input', () => input.setCustomValidity(''), { once: true }); return; }
      saving = true; save.disabled = true; cancel.disabled = true; input.disabled = true; select.disabled = true; Object.values(checks).forEach(c => c.disabled = true); tabs.querySelectorAll('button').forEach(b => b.disabled = true); save.textContent = 'Saving…'; drafts.set(id, read()); notice.replaceChildren(message('Saving your changes…'));
      try {
        p = await api(`projects/${id}`, read()); drafts.delete(id); editMode = false; success = 'Changes saved.'; announce('Project changes saved.'); draw(); header.querySelector('button')?.focus();
      } catch (error) {
        notice.replaceChildren(message(error.status ? error.message : 'Connection interrupted. Your draft is still here. Check the local service and try again.', true));
        if (error.status === 409) notice.append(button('Compare latest version', async () => {
          const compareButton = notice.querySelector('button'); compareButton.disabled = true;
          try { const latest = await api(`projects/${id}`); const comparison = panel('Latest saved version'); comparison.append(details([['Project title', latest.title], ['Status', cap(latest.status)], ['Feedback', displayValue(latest.feedbackRequired)], ['Invoice', displayValue(latest.invoiceRequired)]]), el('p', 'Your draft above has not changed. Compare each value before continuing.', 'muted')); comparison.append(button('Keep my draft against this version', () => { draft.version = latest.version; drafts.set(id, read()); comparison.replaceWith(message('Latest version acknowledged. Review your draft, then save to apply it.')); compareButton.remove(); }, 'secondary')); notice.append(comparison); }
          catch { notice.append(message('Could not load the latest version. Your draft is retained.', true)); compareButton.disabled = false; }
        }, 'secondary'));
      } finally { saving = false; save.disabled = false; cancel.disabled = false; input.disabled = false; select.disabled = Boolean(lifecycle.managed); Object.values(checks).forEach(c => c.disabled = false); tabs.querySelectorAll('button').forEach(b => b.disabled = false); save.textContent = 'Save changes'; }
    });
  }
  view.addEventListener('click',event=>{const a=event.target.closest('a');if(a?.getAttribute('href')==='#project/'+id+'/costs'){event.preventDefault();navigate('Costs & invoices');}});
  draw();await loadEmbedded(tab);
}
async function entity(view, type, id) {
  const item = await api(`${pathOf(type)}/${id}`); view.append(link(type==='person'?'← Back to people':'← Back to organisations',type==='person'?'people':'organisations','breadcrumb'));
  const meta = el('div', undefined, 'record-meta'); meta.append(el('span', item.roles?.join(' · ') ?? item.role)); recordHeader(view, type === 'person' ? 'Person record' : 'Organisation record', item.name, meta, type === 'person' ? link('Edit profile & roles', 'edit-person/' + id, 'button primary') : undefined);
  const grid = el('div', undefined, 'detail-layout person-detail-layout'); const left = el('div'); const info = panel(type === 'person' ? 'Contact details' : 'About this organisation');
  info.append(type === 'person' ? details([['Email', item.email], ['Phone', item.phone], ['Roles', item.roles?.join(', ') || item.role]]) : el('p', item.description, 'record-summary'));
  if (item.clientId) info.append(link('Client details & projects →', `client/${item.clientId}`, 'button primary'),link('New project for this person','new-project/'+item.clientId,'button secondary'));
  if(type==='organisation'){info.append(details([['Type',item.role||'Not recorded'],['Category (optional grouping)',item.category||'Not specified'],['Email',item.email||'Not recorded']]),link('Edit organisation','edit-organisation/'+id,'button secondary'));}
  left.append(info);
  if(type==='person')await renderProfileDetails(left,item);
  if (item.technician) {await renderTechnicianLocation(left,id);try{await renderCredentials(left,id);}catch(error){if(error.status!==403)throw error;left.append(message('Qualifications and clearances are restricted to authorised staff.'));}}
  if (item.technician) { const tech = panel('Technician details'); tech.append(details([['Skills', item.technician.skills.join(', ') || 'Not recorded'], ['General allocation status', cap(item.technician.availability)]])); tech.append(el('p','General allocation status is separate from dated calendar entries. Check the dates before assigning work.','field-help'),link('View calendar availability','availability/'+id,'text-button')); left.append(tech); } left.append(projectLinks(item.projects)); const context = panel('Record context'); context.append(el('p', 'People and organisations are relationship records. They do not represent staff sign-in accounts.', 'muted')); grid.append(left, context); view.append(el('div', undefined, 'heading-rule'), grid);
}
async function render() {
  if (saving) { announce('Please wait for the save to finish.'); return; }
  const ticket=++renderVersion;
  try{if(!await requireLocalSession(main,render,()=>ticket===renderVersion,()=>Boolean(drafts.size||workflowHasDrafts()||operationsHaveDrafts()||careHasDrafts()||clientDetailsHasDrafts()||saving)))return;if(ticket!==renderVersion)return;}catch{if(ticket!==renderVersion)return;showAuthFailure(render);return;}
  const [route = 'projects', raw = ''] = (location.hash.slice(1) || 'projects').split('/'); const view = el('div');
  main.replaceChildren(el('p', 'Loading workspace…', 'loading')); main.setAttribute('aria-busy', 'true');
  const active = ({ project: 'projects', client: 'people', person: 'people', organisation: 'organisations', 'organisation-category':'organisations','new-organisation':'organisations','edit-organisation':'organisations', clients:'people', dashboard: 'projects', 'new-person': 'people', 'edit-person': 'people', 'new-client': 'people', 'new-project': 'projects', coordination: 'projects', operations:'projects',documents:'projects','client-details':'people' })[route] ?? route;
  document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  try {
    const arg = decodeURIComponent(raw);
    if(route==='accounts') await renderAccounts(view);
    else if(route==='reports') await renderReports(view);
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
  if (ticket === renderVersion) { main.replaceChildren(view); main.removeAttribute('aria-busy'); main.focus({ preventScroll: true }); window.scrollTo(0, 0); document.title = `TADSA · ${view.querySelector('h1')?.textContent ?? 'Workspace'}`; }
}
// Debounced live suggestions keep focus in the field and reject stale responses.
const searchForm=document.querySelector('#global-search');
const preview=el('div',undefined,'search-preview');preview.id='global-results';preview.hidden=true;preview.setAttribute('role','listbox');preview.setAttribute('aria-label','Search suggestions');searchForm.append(preview);
globalInput.setAttribute('role','combobox');globalInput.setAttribute('aria-autocomplete','list');globalInput.setAttribute('aria-controls',preview.id);globalInput.setAttribute('aria-expanded','false');
let searchTimer,searchTicket=0,searchController,selectedSuggestion=-1;
function closeSearchPreview(){clearTimeout(searchTimer);searchTicket++;searchController?.abort();preview.hidden=true;globalInput.setAttribute('aria-expanded','false');globalInput.removeAttribute('aria-activedescendant');selectedSuggestion=-1;}
function selectSuggestion(index){const items=[...preview.querySelectorAll('[role=option]')];if(!items.length)return;selectedSuggestion=(index+items.length)%items.length;items.forEach((item,i)=>item.setAttribute('aria-selected',String(i===selectedSuggestion)));globalInput.setAttribute('aria-activedescendant',items[selectedSuggestion].id);items[selectedSuggestion].scrollIntoView({block:'nearest'});}
globalInput.addEventListener('input',()=>{closeSearchPreview();const q=globalInput.value.trim();if(!q)return;const ticket=searchTicket;searchTimer=setTimeout(async()=>{searchController=new AbortController();preview.replaceChildren(el('p','Searching…','search-preview-state'));preview.hidden=false;globalInput.setAttribute('aria-expanded','true');try{const response=await fetch('/api/search?q='+encodeURIComponent(q),{signal:searchController.signal});if(!response.ok)throw Error('Search unavailable');const data=await response.json();if(ticket!==searchTicket||globalInput.value.trim()!==q)return;preview.replaceChildren();for(const [i,result]of data.results.slice(0,7).entries()){const a=link('',result.type+'/'+result.id,'search-suggestion');a.id='search-suggestion-'+i;a.setAttribute('role','option');a.setAttribute('aria-selected','false');a.tabIndex=-1;const text=el('span');text.append(el('strong',result.label),el('small',result.description));a.append(text,el('span',cap(result.type),'result-type'));a.addEventListener('click',e=>{if(saving){e.preventDefault();announce('Please wait for the save to finish.');}closeSearchPreview();});preview.append(a);}if(!data.results.length)preview.append(el('p','No matching records. Try a name or reference.','search-preview-state'));const all=el('p',data.results.length+' matches · Enter for all results','search-preview-footer');preview.append(all);}catch(e){if(e.name==='AbortError'||ticket!==searchTicket)return;preview.replaceChildren(el('p','Search unavailable. Press Enter to try the full search.','search-preview-state'));}},180);});
globalInput.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSearchPreview();return;}if(!preview.hidden&&['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();selectSuggestion(selectedSuggestion<0?(e.key==='ArrowDown'?0:preview.querySelectorAll('[role=option]').length-1):selectedSuggestion+(e.key==='ArrowDown'?1:-1));}if(e.key==='Enter'&&!preview.hidden&&selectedSuggestion>=0){e.preventDefault();preview.querySelectorAll('[role=option]')[selectedSuggestion]?.click();}});
searchForm.addEventListener('focusout',()=>setTimeout(()=>{if(!searchForm.contains(document.activeElement))closeSearchPreview();},0));document.addEventListener('pointerdown',e=>{if(!searchForm.contains(e.target))closeSearchPreview();});window.addEventListener('hashchange',closeSearchPreview);

document.querySelector('#global-search').addEventListener('submit', event => { event.preventDefault(); closeSearchPreview(); if (saving) { announce('Please wait for the save to finish.'); return; } const target = `#search/${encodeURIComponent(globalInput.value.trim())}`; if (location.hash === target) render(); else location.hash = target; });
document.querySelector('.skip').addEventListener('click', event => { event.preventDefault(); main.focus(); });
window.addEventListener('keydown', event => { if (document.documentElement.dataset.authState==='ready' && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); if(drawerOpen)setDrawer(false,false);globalInput.focus(); globalInput.select(); } });
window.addEventListener('hashchange', event => { if (saving) { history.replaceState(null, '', new URL(event.oldURL).hash || '#projects'); announce('Your changes are saving. Please wait before leaving this record.'); const pending = main.querySelector('.message'); if (pending) pending.textContent = 'Your changes are saving. Please wait before leaving this record.'; return; } if(announcementRoute!==(location.hash||'#projects')){announcement.textContent='';document.querySelector('.save-toast')?.remove();clearTimeout(toastTimer);} render(); });
window.addEventListener('beforeunload', event => { if(sessionEnded||workspaceRestored)return; if (drafts.size || workflowHasDrafts() || operationsHaveDrafts() || careHasDrafts() || clientDetailsHasDrafts() || saving) { event.preventDefault(); event.returnValue = ''; } });
render();
// The desktop rail becomes a focus-contained navigation drawer on small screens.
const drawer=document.querySelector('#workspace-navigation'),drawerToggle=document.querySelector('#navigation-toggle'),drawerClose=document.querySelector('#navigation-close'),backdrop=document.querySelector('#navigation-backdrop'),mobileMedia=matchMedia('(max-width:800px)');
let drawerOpen=false;
function setDrawer(open,restoreFocus=true){drawerOpen=open&&mobileMedia.matches;document.body.classList.toggle('drawer-open',drawerOpen);drawerToggle.setAttribute('aria-expanded',String(drawerOpen));drawer.inert=mobileMedia.matches&&!drawerOpen;backdrop.hidden=!drawerOpen;document.querySelector('.workspace').inert=drawerOpen;document.querySelector('.mobile-navigation').inert=drawerOpen;if(drawerOpen){drawer.setAttribute('role','dialog');drawer.setAttribute('aria-modal','true');drawer.setAttribute('aria-label','Workspace navigation');drawerClose.focus();}else{drawer.removeAttribute('role');drawer.removeAttribute('aria-modal');drawer.removeAttribute('aria-label');if(restoreFocus&&mobileMedia.matches)drawerToggle.focus();}}
drawerToggle.addEventListener('click',()=>setDrawer(!drawerOpen));drawerClose.addEventListener('click',()=>setDrawer(false));backdrop.addEventListener('click',()=>setDrawer(false));drawer.addEventListener('click',e=>{const anchor=e.target.closest('a');if(anchor){const sameRoute=anchor.hash===(location.hash||'#projects');setDrawer(false,false);if(sameRoute)main.focus({preventScroll:true});}});mobileMedia.addEventListener('change',()=>setDrawer(false,false));
document.addEventListener('keydown',e=>{if(!drawerOpen)return;if(e.key==='Escape'){e.preventDefault();setDrawer(false);return;}if(e.key==='Tab'){const stops=[...drawer.querySelectorAll('a[href],button:not([disabled]),[tabindex="0"]')].filter(n=>n.getClientRects().length);const first=stops[0],last=stops.at(-1);if(e.shiftKey&&(document.activeElement===first||!drawer.contains(document.activeElement))){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
setDrawer(false,false);
window.addEventListener('tadsa-auth-locked',()=>setDrawer(false,false));
