// In-tab draft discovery only. Saving remains an explicit action in each form.
const sources=new Map(),locations=new Map();let tray,openDraft,queued=false;
const baselines=new WeakMap();
const draftMetadata=new Set(['requestId','personRequestId','version','baseVersion','dirty','pending','personPending','contactBaseline','step','technicianQuery','technicianPage','needsAcknowledgement','payerLabel','filterArea','filterPostcode','forProject','showAll','saveUnconfirmed','reviewedConflict']);
// Compare editable values, not navigation/search state or save bookkeeping.
export function draftSnapshot(d){
 const normal=value=>{if(value==null||value===''||value===false)return undefined;if(Array.isArray(value)){const a=value.map(normal).filter(v=>v!==undefined);return a.length?a:undefined;}if(typeof value==='object'){const entries=Object.keys(value).sort().filter(k=>!draftMetadata.has(k)).map(k=>[k,normal(value[k])]).filter(([,v])=>v!==undefined);return entries.length?Object.fromEntries(entries):undefined;}return typeof value==='number'?String(value):value;};
 return JSON.stringify(normal(d)??{});
}
export function baselineDraft(d,reset=false){if(reset||!baselines.has(d))baselines.set(d,draftSnapshot(d));return d;}
export function draftChanged(d){return Boolean(d.pending||d.personPending||d.saveUnconfirmed||d.reviewedConflict||!baselines.has(d)||baselines.get(d)!==draftSnapshot(d));}
export function registerDraftSource(name,read){sources.set(name,read);}
export function pendingDrafts(){return [...sources].flatMap(([source,read])=>read().map(item=>({...item,token:source+':'+item.key,...locations.get(source+':'+item.key)})));}
export function trackDraftForm(form,source,key,options={}){
 const token=source+':'+key,route=options.route||location.hash.slice(1)||'projects';form.dataset.draftKey=token;
 const remember=()=>{const pane=form.closest('[data-project-section]'),label=options.label||form.querySelector('button[type=submit]')?.dataset.label||form.querySelector('button[type=submit]')?.textContent||'Form changes',context=options.context||form.closest('[data-record-context]')?.dataset.recordContext||locations.get(token)?.context;locations.set(token,{restore:options.restore,route,section:options.section||pane?.dataset.projectSection,label,context});refreshDraftReview();};
 if(!locations.has(token))locations.set(token,{restore:options.restore,route,section:options.section,label:options.label||'Form changes',context:options.context});
 form.addEventListener('input',remember);form.addEventListener('change',remember);form.addEventListener('submit',remember);
 if(options.showState===false)return;const state=document.createElement('p');state.className='draft-form-state';state.hidden=true;state.setAttribute('role','status');form.prepend(state);
}
export function refreshDraftReview(){if(!tray||queued)return;queued=true;queueMicrotask(()=>{queued=false;draw();});}
function draw(){
 for(const form of document.querySelectorAll('form[data-draft-key]')){const location=locations.get(form.dataset.draftKey),context=form.closest('[data-record-context]')?.dataset.recordContext;if(location&&!location.context&&context)location.context=context;}
 const items=pendingDrafts();tray.hidden=!items.length;const summary=tray.querySelector('summary');summary.textContent=items.length+' unfinished '+(items.length===1?'form':'forms')+' — review before leaving';
 const list=tray.querySelector('ul'),existing=new Map([...list.children].map(n=>[n.dataset.token,n]));for(const item of items){let li=existing.get(item.token);if(li)existing.delete(item.token);else{li=document.createElement('li');li.dataset.token=item.token;const b=document.createElement('button');b.type='button';b.className='secondary';li.append(b,document.createElement('span'));list.append(li);}const b=li.firstElementChild,label='Review '+(item.label||'unsaved changes')+(item.context?' — '+item.context:'');if(b.textContent!==label)b.textContent=label;b.onclick=()=>openDraft(item);const note=li.lastElementChild;note.hidden=!item.pending;note.textContent=item.pending?'Save not confirmed — review and retry safely.':'';}for(const li of existing.values())li.remove();
 for(const form of document.querySelectorAll('form[data-draft-key]')){const item=items.find(i=>i.token===form.dataset.draftKey),state=form.querySelector('.draft-form-state');if(state){state.hidden=!item;state.textContent=item?.pending?'Save not confirmed. Use the form’s retry button.':'Unsaved changes. Use this form’s save button to keep them.';}}
}
export function installDraftReview(main,open){
 openDraft=open;tray=document.createElement('details');tray.className='draft-review';tray.hidden=true;tray.setAttribute('aria-label','Unfinished forms');const summary=document.createElement('summary'),help=document.createElement('p');help.textContent='Saved records are kept. These unfinished edits are held only in this tab. Review each form, then save or discard it before closing or reloading.';tray.append(summary,help,document.createElement('ul'));main.before(tray);
 for(const name of ['input','change','click','submit'])document.addEventListener(name,refreshDraftReview);
 window.addEventListener('tadsa-saved',refreshDraftReview);return tray;
}
export function revealDraftForm(token){
 let form=[...document.querySelectorAll('[data-draft-key]')].find(n=>n.dataset.draftKey===token);if(!form){document.querySelector('.contact-editor-toggle[aria-expanded=false]')?.click();form=[...document.querySelectorAll('[data-draft-key]')].find(n=>n.dataset.draftKey===token);}if(!form)return false;
 const editArea=form.closest('.contact-editor-area');if(editArea?.hidden)editArea.parentElement.querySelector('.contact-editor-toggle')?.click();
 for(let parent=form.parentElement;parent;parent=parent.parentElement)if(parent.tagName==='DETAILS')parent.open=true;
 form.scrollIntoView({block:'center'});(form.querySelector('input:not([disabled]),select:not([disabled]),textarea:not([disabled]),button[type=submit]')||form).focus({preventScroll:true});return true;
}
