// In-tab draft discovery only. Saving remains an explicit action in each form.
const sources=new Map(),locations=new Map();let tray,openDraft,queued=false;
export function registerDraftSource(name,read){sources.set(name,read);}
export function pendingDrafts(){return [...sources].flatMap(([source,read])=>read().map(item=>({...item,token:source+':'+item.key,...locations.get(source+':'+item.key)})));}
export function trackDraftForm(form,source,key,options={}){
 const token=source+':'+key,route=options.route||location.hash.slice(1)||'projects';form.dataset.draftKey=token;
 const remember=()=>{const pane=form.closest('[data-project-section]'),label=options.label||form.querySelector('button[type=submit]')?.dataset.label||form.querySelector('button[type=submit]')?.textContent||'Form changes';locations.set(token,{restore:options.restore,route,section:options.section||pane?.dataset.projectSection,label});refreshDraftReview();};
 if(!locations.has(token))locations.set(token,{restore:options.restore,route,section:options.section,label:options.label||'Form changes'});
 form.addEventListener('input',remember);form.addEventListener('change',remember);form.addEventListener('submit',remember);
 const state=document.createElement('p');state.className='draft-form-state';state.hidden=true;state.setAttribute('role','status');form.prepend(state);
}
export function refreshDraftReview(){if(!tray||queued)return;queued=true;queueMicrotask(()=>{queued=false;draw();});}
function draw(){
 const items=pendingDrafts();tray.hidden=!items.length;const summary=tray.querySelector('summary');summary.textContent=items.length+' unfinished '+(items.length===1?'form':'forms')+' — review before leaving';
 const list=tray.querySelector('ul');list.replaceChildren();for(const item of items){const li=document.createElement('li'),b=document.createElement('button');b.type='button';b.className='secondary';b.textContent='Review '+(item.label||'unsaved changes');b.onclick=()=>openDraft(item);li.append(b);if(item.pending){const note=document.createElement('span');note.textContent=' Save not confirmed — review and retry safely.';li.append(note);}list.append(li);}
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
