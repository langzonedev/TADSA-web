import {renderAccounts} from './accounts.js';
import {renderReports} from './reports.js';
import {renderSettings,configureSettings} from './settings.js';
import {requireLocalSession,sessionEnded,showAuthFailure} from './local-login.js';
import {configureOperations,renderOperations,operationsHaveDrafts,renderNotes} from './operations.js';
import {configureCare,careHasDrafts,renderProjectCare} from './project-care.js';
import {renderLifecycle} from './project-lifecycle.js';
import {renderCredentials} from './technician-credentials.js';
import {renderAvailability} from './availability.js';
import {renderClientDetails,clientDetailsSummary,clientDetailsHasDrafts} from './client-details.js';
import { configureWorkflows, renderWorkflow, workflowHasDrafts, addClientContactActions } from './workflows.js';
const main = document.querySelector('#content');
const globalInput = document.querySelector('#global-query');
const announcement = document.querySelector('#announcement');
const drafts = new Map();
const registers = new Map();
const projectTabs = new Map();
const projectSections=new Map();
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
const status = value => el('span', cap(value), `badge ${value}`);
const nameOf = item => item.person?.name ?? item.name ?? item.title;
const typeOf = kind => ({ projects: 'project', clients: 'client', people: 'person', organisations: 'organisation' })[kind];
const pathOf = type => ({ project: 'projects', client: 'clients', person: 'people', organisation: 'organisations' })[type];
let toastTimer;function announce(text) { announcement.textContent = text;if(/\b(saved|created|linked|removed)\b/i.test(text)){document.querySelector('.save-toast')?.remove();const toast=el('div',text,'save-toast');toast.setAttribute('aria-hidden','true');document.body.append(toast);clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.remove(),2800);} }
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
  for (const p of [...projects].sort((a,b)=>Number(a.status==='closed')-Number(b.status==='closed')||String(b.reference).localeCompare(String(a.reference),'en-AU',{numeric:true}))) { const a = link('', `project/${p.id}`, 'project-link'); const text = el('span'); text.append(el('strong', p.title), el('small', `${p.reference}`));const description=String(p.summary||'').replace(/\s+/g,' ').trim();if(description)text.append(el('span',description.length>200?description.slice(0,197)+'…':description,'project-link-description'));a.append(text, status(p.status)); list.append(a); }
  box.append(list); return box;
}
function inspect(item, kind, slot) {
  const type = typeOf(kind); slot.replaceChildren(); slot.append(el('div', 'Quick view', 'inspector-top'));
  const body = el('div', undefined, 'inspector-body');
  if (!item) { body.append(empty('Select a record', 'Choose a row to see its details here.')); slot.append(body); return; }
  if (kind === 'projects') {
    body.append(el('span', item.reference, 'inspector-reference'), el('h2', item.title), status(item.status), el('p', item.summary));
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
  const head = heading(cap(kind), descriptions[kind], 'Administration'); head.append(el('span', `${items.length} ${kind === 'people' ? 'people' : kind}`, 'meta-note')); if (kind === 'projects') head.append(link('New project', 'new-project', 'button primary')); if (kind === 'people') head.append(link('New person', 'new-person', 'button primary')); if (kind === 'clients') head.append(link('New client', 'new-client', 'button primary')); view.append(head);
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
    const visible = items.filter(item => predicate(item) && [nameOf(item), item.reference, item.clientName, item.role, item.summary].filter(Boolean).join(' ').toLowerCase().includes(query));
    const key = item => state.sort === 'date' ? item.dueDate ?? '9999' : state.sort === 'client' ? item.clientName : state.sort === 'reference' ? item.reference : nameOf(item);
    visible.sort((a, b) => String(key(a)).localeCompare(String(key(b)), 'en-AU', { numeric: true }) * (state.sort === 'reverse' ? -1 : 1));
    if (!visible.some(i => i.id === state.selected)) state.selected = visible[0]?.id ?? null;
    const table = el('table', undefined, kind + '-table'); const thead = el('thead'); const tr = el('tr');
    const columns = kind === 'projects' ? ['Project', 'Client', 'Status', 'Target'] : kind === 'clients' ? ['Client', 'Projects'] : kind === 'people' ? ['Person', 'Role', 'Projects'] : ['Organisation', 'Role', 'Projects'];
    columns.forEach((label, i) => { const th = el('th', label); th.scope = 'col'; if ((kind === 'projects' && i === 3)) th.className = 'optional-col'; tr.append(th); }); thead.append(tr); table.append(thead);
    const tbody = el('tbody');
    for (const item of visible) {
      const row = el('tr'); row.dataset.id = item.id; row.classList.toggle('selected', !matchMedia('(max-width:800px)').matches && item.id === state.selected);
      const first = el('td'); const control = button('', () => choose(item), 'row-open'); control.setAttribute('aria-label', `${matchMedia('(max-width:800px)').matches?'Open':'Preview'} ${nameOf(item)}`); if(!matchMedia('(max-width:800px)').matches)control.setAttribute('aria-pressed', String(item.id === state.selected));
      const text = el('span'); text.append(el('span', nameOf(item), 'row-title'), el('span', kind === 'projects' ? `${item.reference}` : kind === 'clients' ? item.person.email : kind === 'people' ? item.email : item.description, 'row-sub'));
      if (kind === 'clients' || kind === 'people') { const identity = el('span', undefined, 'name-cell'); identity.append(avatar(nameOf(item)), text); control.append(identity); } else control.append(text); first.append(control); row.append(first);
      if (kind === 'projects') { row.append(el('td', item.clientName)); const s = el('td'); s.append(status(item.status)); row.append(s, el('td', date(item.dueDate), 'optional-col')); }
      else if (kind === 'clients') row.append(el('td', String(item.projects.length)));
      else row.append(el('td', item.role), el('td', String(item.projects.length)));
      row.addEventListener('click', event => { if (!event.target.closest('button,a')) choose(item); }); tbody.append(row);
    }
    table.append(tbody); tableSlot.replaceChildren(visible.length ? table : empty('No matching records', 'Try another filter or clear your search.'));
    foot.replaceChildren(el('span', `${visible.length} of ${items.length} records`), el('span', items.length >= limit ? `Showing the first ${limit} records` : 'Select a row for a closer look'));
    inspect(visible.find(i => i.id === state.selected), kind, inspector);
    function choose(item) { state.selected = item.id; if (window.matchMedia('(max-width: 800px)').matches) { location.hash = typeOf(kind) + '/' + item.id; return; } tbody.querySelectorAll('tr').forEach(r => { const selected = r.dataset.id === item.id; r.classList.toggle('selected', selected); r.querySelector('button').setAttribute('aria-pressed', String(selected)); }); inspect(item, kind, inspector); announce(`${nameOf(item)} selected. Quick view updated.`); }
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
  const c = await api(`clients/${id}`); view.append(link('← Back to workspace', returnRoute, 'breadcrumb'));
  const meta = el('div', undefined, 'record-meta'); meta.append(el('span', 'Client'), el('span', `${c.projects.length} linked projects`)); recordHeader(view, 'Client record', c.person.name, meta, link('New project', `new-project/${c.id}`, 'button primary'));
  const grid = el('div', undefined, 'detail-layout'); const left = el('div'); const info = panel('Contact details'); info.append(details([['Email', c.person.email], ['Phone', c.person.phone]]), link('Edit profile & roles', 'edit-person/' + c.person.id, 'text-button'));
  const contacts = panel('Client contacts'); addClientContactActions(contacts, c); left.append(projectLinks(c.projects),clientDetailsSummary(c),info,contacts); const related = relationships(c.relationships); related.querySelector('h2').textContent = 'People linked through projects'; grid.append(left, related); view.append(el('div', undefined, 'heading-rule'), grid);
}
const fieldNames = { title: 'Project title', status: 'Status', feedbackRequired: 'Feedback required', invoiceRequired: 'Invoice required' };
const displayValue = value => typeof value === 'boolean' ? value ? 'Required' : 'Not required' : String(value ?? 'Not recorded');
function auditPanel(p) {
  const box = panel('Project activity'); box.append(el('p', 'Saved changes, newest first. Development activity is not an authenticated staff audit trail.', 'muted'));
  if (!p.audit.length) box.append(empty('No changes recorded yet', 'Updates to this project will appear here after saving.'));
  for (const a of p.audit) { const row = el('div', undefined, 'audit'); row.append(el('strong', a.action), el('small', `${a.actor} · ${new Date(a.at).toLocaleString('en-AU')}`)); for (const [key, value] of Object.entries(a.changes).filter(([key])=>!['primaryRecordId','primaryReference','primary_record_id'].includes(key))) row.append(el('p', `${fieldNames[key] ?? key}: ${displayValue(value.from)} → ${displayValue(value.to)}`)); box.append(row); }
  return box;
}
async function project(view, id) {
  let p = await api(`projects/${id}`); let tab = projectTabs.get(id)??'Current step'; let editMode = drafts.has(id); let success = '';
  view.append(link('← All projects', 'projects', 'breadcrumb'));
  const meta = el('div', undefined, 'record-meta'); const header = recordHeader(view, p.reference, p.title, meta); const tabs = el('div', undefined, 'record-tabs'); tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', 'Project detail'); const content = el('div'); view.append(tabs, content);
  const headerActions=el('div',undefined,'actions record-header-actions');header.append(headerActions);
  function foldPanel(box,label){const section=el('details',undefined,'care-details overview-section'),key=id+'/'+label;section.append(el('summary',label));box.querySelector('h2')?.remove();section.append(box);section.open=projectSections.get(key)??!matchMedia('(max-width:800px)').matches;section.addEventListener('toggle',()=>{projectSections.set(key,section.open);if(section.open&&matchMedia('(max-width:800px)').matches)for(const other of view.querySelectorAll('.overview-section'))if(other!==section)other.open=false;});return section;}
  const phoneNotes=el('div',undefined,'current-step-pane'),notesPane=el('div'),recordPane=el('div'),actionsPane=el('div');
  view.insertBefore(phoneNotes,content);view.append(notesPane,recordPane,actionsPane);recordPane.append(content);
  const projectOperations=await api(`projects/${id}/operations`);renderNotes(notesPane,id,projectOperations);
  const latestNote=projectOperations.notes[0];if(latestNote){const handover=el('aside',undefined,'panel latest-project-note');handover.append(el('strong','Latest case note'),el('p',latestNote.text),button('View or add case notes',()=>{tab='Case notes';draw();notesPane.querySelector('textarea')?.focus();},'secondary'));phoneNotes.append(handover);}
  const goStep=()=>{tab='Current step';draw();tabs.querySelector('[aria-selected=true]')?.focus();};
  const care=el('div',undefined,'project-care-pane');care.hidden=true;care.id='project-care-content';view.append(care);
  const lifecycle=await renderLifecycle(phoneNotes,p,{recordTarget:recordPane,actionsTarget:actionsPane,openFiles:()=>{tab='Step files';draw();care.querySelector('.project-files input')?.focus();}});
  await renderProjectCare(care,id);
  const returnToStep=button('← Return to current step',goStep,'secondary');care.prepend(returnToStep);
  for(const pane of [notesPane,recordPane,actionsPane])pane.prepend(button('← Return to current step',goStep,'secondary'));
  actionsPane.append(link('Hours, invoices & holds','operations/'+id,'button secondary'),link('Print documents','documents/'+id,'button secondary'));
  view.addEventListener('click',event=>{const target=event.target.closest('a[href]');if(target&&/^#(?:operations|coordination|documents|person)\//.test(target.getAttribute('href')))projectTabs.set(id,'Current step');});
  function draw() {
    projectTabs.set(id,tab);
    header.querySelector('h1').textContent = p.title; header.querySelector('button')?.remove(); meta.replaceChildren(status(p.status), link(p.clientName, `client/${p.clientId}`), el('span', lifecycle.managed ? 'Guided project' : p.kind || 'Project'));
    if (!editMode && tab==='Project record') headerActions.append(button('Edit project', () => { editMode = true; tab = 'Project record'; draw(); content.querySelector('input')?.focus(); }, 'secondary'));
    tabs.replaceChildren();
    const tabNames=['Current step','Case notes','Details & files','Project record','Project actions'];
    for (const name of tabNames) { const b = button(name, () => { tab = name; draw(); tabs.querySelector('[aria-selected=true]')?.focus(); }, ''); b.setAttribute('role', 'tab'); b.tabIndex = (tab === name || (tab==='Step files'&&name==='Current step')) ? 0 : -1; b.setAttribute('aria-selected', String(tab === name || (tab==='Step files'&&name==='Current step'))); b.addEventListener('keydown', event => { if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) { event.preventDefault(); tab = event.key === 'Home' ? tabNames[0] : event.key === 'End' ? tabNames.at(-1) : tabNames[(tabNames.indexOf(tab==='Step files'?'Current step':tab)+(event.key==='ArrowRight'?1:tabNames.length-1))%tabNames.length]; draw(); tabs.querySelector('[aria-selected=true]')?.focus(); } }); b.id = `tab-${name.toLowerCase().replaceAll(' ','-')}`; b.setAttribute('aria-controls', name==='Details & files'?'project-care-content':'project-tab-content'); tabs.append(b); }
    content.id = 'project-tab-content'; content.removeAttribute('role'); content.removeAttribute('aria-labelledby'); content.replaceChildren();
    phoneNotes.hidden=tab!=='Current step';notesPane.hidden=tab!=='Case notes';recordPane.hidden=tab!=='Project record';actionsPane.hidden=tab!=='Project actions';
    care.hidden=!['Details & files','Step files'].includes(tab);content.hidden=tab!=='Project record';
    for(const child of care.children)child.hidden=tab==='Step files'&&child!==returnToStep&&!child.classList.contains('project-files');
    const files=care.querySelector('.project-files');if(tab==='Step files'&&files)files.open=true;
    care.setAttribute('role','tabpanel');care.setAttribute('aria-labelledby',tab==='Step files'?'tab-current-step':'tab-details-&-files');
    for(const [pane,name] of [[phoneNotes,'current-step'],[notesPane,'case-notes'],[recordPane,'project-record'],[actionsPane,'project-actions']]){pane.setAttribute('role','tabpanel');pane.setAttribute('aria-labelledby','tab-'+name);pane.id='project-'+name;}
    for(const control of tabs.children){const name=control.textContent;control.setAttribute('aria-controls',name==='Details & files'||(name==='Current step'&&tab==='Step files')?'project-care-content':'project-'+name.toLowerCase().replaceAll(' ','-'));}
    if(tab!=='Project record')return;
    if (success) content.append(message(success));
    content.append(auditPanel(p));
    const grid = el('div', undefined, 'detail-layout'); const left = el('div'); const box = panel(editMode ? 'Edit project' : 'Project details');
    if (editMode) editForm(box); else { box.append(el('p', p.summary, 'record-summary'), details([['Target date', date(p.dueDate)], ['Opened', date(p.openedAt)], ['Workflow', lifecycle.managed ? 'Assessment through delivery' : p.kind], ['Feedback', p.feedbackRequired ? 'Required' : 'Not required'], ['Invoice', p.invoiceRequired ? 'Required' : 'Not required']])); if (!lifecycle.managed && p.kind === 'Assessment') box.append(el('p', 'An assessment request does not authorise making equipment.', 'muted')); }
    left.append(editMode?box:foldPanel(box,'Project details'));
    if (!editMode && p.coordination) { const allocation = panel('Funding & technician'); const c = p.coordination; const payer = c.fundingStatus === 'unknown' ? 'Not known yet — follow up' : c.fundingStatus === 'self' ? p.clientName : p.relationships.find(r => r.id === c.payerId)?.name ?? 'Selected payer'; allocation.append(details([['Expected payer', payer], ['Funding notes', c.fundingNotes || 'None recorded'], ['Skills needed', c.requiredSkills.join(', ') || 'Not specified'], ['Technician', p.relationships.find(r => r.id === c.technicianId)?.name || 'Not assigned yet']]), link('Update funding or technician', `coordination/${p.id}`, 'button secondary'), el('p', 'Funding and allocation are recorded plans. They do not authorise work or spending.', 'muted')); left.append(foldPanel(allocation,'Funding & technician')); } grid.append(left,editMode?relationships(p.relationships):foldPanel(relationships(p.relationships),'People & organisations')); content.append(grid);
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
  draw();
}
async function entity(view, type, id) {
  const item = await api(`${pathOf(type)}/${id}`); view.append(link('← Back to workspace', returnRoute, 'breadcrumb'));
  const meta = el('div', undefined, 'record-meta'); meta.append(el('span', item.roles?.join(' · ') ?? item.role)); recordHeader(view, type === 'person' ? 'Person record' : 'Organisation record', item.name, meta, type === 'person' ? link('Edit profile & roles', 'edit-person/' + id, 'button primary') : undefined);
  const grid = el('div', undefined, 'detail-layout'); const left = el('div'); const info = panel(type === 'person' ? 'Contact details' : 'About this organisation');
  info.append(type === 'person' ? details([['Email', item.email], ['Phone', item.phone], ['Roles', item.roles?.join(', ') || item.role]]) : el('p', item.description, 'record-summary'));
  if (item.clientId) info.append(link('Open client record →', `client/${item.clientId}`, 'text-button'));
  if (item.technician) await renderCredentials(left,id);
  if (item.technician) { const tech = panel('Technician details'); tech.append(details([['Skills', item.technician.skills.join(', ') || 'Not recorded'], ['Availability', cap(item.technician.availability)]])); left.append(tech); } left.append(info, projectLinks(item.projects)); const context = panel('Record context'); context.append(el('p', 'People and organisations are relationship records. They do not represent staff sign-in accounts.', 'muted')); grid.append(left, context); view.append(el('div', undefined, 'heading-rule'), grid);
}
async function render() {
  if (saving) { announce('Please wait for the save to finish.'); return; }
  const ticket=++renderVersion;
  try{if(!await requireLocalSession(main,render,()=>ticket===renderVersion,()=>Boolean(drafts.size||workflowHasDrafts()||operationsHaveDrafts()||careHasDrafts()||clientDetailsHasDrafts()||saving)))return;if(ticket!==renderVersion)return;}catch{if(ticket!==renderVersion)return;showAuthFailure(render);return;}
  const [route = 'projects', raw = ''] = (location.hash.slice(1) || 'projects').split('/'); const view = el('div');
  main.replaceChildren(el('p', 'Loading workspace…', 'loading')); main.setAttribute('aria-busy', 'true');
  const active = ({ project: 'projects', client: 'clients', person: 'people', organisation: 'organisations', dashboard: 'projects', 'new-person': 'people', 'edit-person': 'people', 'new-client': 'clients', 'new-project': 'projects', coordination: 'projects', operations:'projects',documents:'projects','client-details':'clients' })[route] ?? route;
  document.querySelectorAll('[data-nav]').forEach(a => { if (a.dataset.nav === active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  try {
    const arg = decodeURIComponent(raw);
    if(route==='accounts') await renderAccounts(view);
    else if(route==='reports') await renderReports(view);
    else if(route==='settings') await renderSettings(view);
    else if (route==='client-details') await renderClientDetails(view,arg,{announce,setSaving:value=>{saving=value;},request:async(path,method='GET',body)=>{const response=await fetch('/api/'+path,{method,...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});const data=await response.json();if(!response.ok){const e=Error(data.error);e.status=response.status;throw e;}return data;}});
    else if(route==='availability') await renderAvailability(view);
    else if(await renderOperations(view,route,arg)) { /* Case workspace supplied. */ }
    else if (await renderWorkflow(view, route, arg)) { /* Workflow view supplied. */ }
    else if (['projects', 'clients', 'people', 'organisations'].includes(route)) await register(view, route);
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
window.addEventListener('hashchange', event => { if (saving) { history.replaceState(null, '', new URL(event.oldURL).hash || '#projects'); announce('Your changes are saving. Please wait before leaving this record.'); const pending = main.querySelector('.message'); if (pending) pending.textContent = 'Your changes are saving. Please wait before leaving this record.'; return; } render(); });
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
