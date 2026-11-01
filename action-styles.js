// Shared action presentation. Explicit intent is preferred for new controls;
// compatibility rules cover existing editors without styling record-name links.
const intents=new Set(['edit','primary','secondary','destructive','navigation']);
const excluded='[role="tab"],[role="tablist"],[role="menu"],.project-more-menu,.sidebar,#global-search,.environment,.row-open,.row-preview,.filter-tab,.availability-cell,.calendar-day,.address-suggestions,.record-picker';
const editRoute=/^#(?:edit-person|edit-organisation|client-details|coordination)(?:\/|$)/;
const neutralVerb=/^(?:Cancel|Discard|Delete|Remove|Unlink|Revoke|Disable|Deactivate|Reset|Clear|Back|Return)\b/i;
export function actionIntent(control){
 if(!control?.matches?.('a,button,summary')||control.closest(excluded))return null;
 const explicit=control.getAttribute('data-action-style');
 if(intents.has(explicit))return explicit==='navigation'?null:explicit;
 const text=control.textContent.trim();
 // A label alone is insufficient for links: a person's name can begin "Edit".
 if(control.matches('a')){
  if(/^\s*(?:Edit|Update)\b/.test(text)&&editRoute.test(control.getAttribute('href')||''))return 'edit';
  if(control.classList.contains('primary')&&control.classList.contains('button'))return 'primary';
  if(control.classList.contains('button')&&control.classList.contains('secondary'))return 'secondary';
  return null;
 }
 if(neutralVerb.test(text))return 'secondary';
 if(/^(?:Edit|Update)\b/.test(text)&&text!=='Update ready')return 'edit';
 if(control.classList.contains('primary'))return 'primary';
 if(control.classList.contains('secondary'))return 'secondary';
 return null;
}
function applyControl(control){
 const intent=actionIntent(control);
 for(const value of ['edit','primary','secondary','destructive'])control.classList.toggle('app-action-'+value,intent===value);
 control.classList.toggle('app-action',Boolean(intent));
 // Retire the earlier label-only treatment when a control is no longer an edit
 // action (for example a record whose name happens to begin with "Edit").
 if(intent!=='edit')control.classList.remove('outlined-action');
}
export function styleAction(control,intent){
 if(!intents.has(intent))throw new TypeError('Choose a supported action style.');
 control.setAttribute('data-action-style',intent);applyControl(control);return control;
}
export function applyActionStyles(root){
 if(root?.matches?.('a,button,summary'))applyControl(root);
 for(const control of root?.querySelectorAll?.('a,button,summary')??[])applyControl(control);
}
export function installActionStyles(root){
 applyActionStyles(root);
 const observer=new MutationObserver(records=>{
  const targets=new Set();
  for(const record of records){
   const target=record.target.nodeType===3?record.target.parentElement:record.target;
   if(record.type==='attributes')targets.add(target);
   else{
    const control=target?.closest?.('a,button,summary');if(control)targets.add(control);
    for(const node of record.addedNodes??[])if(node.nodeType===1)targets.add(node);
   }
  }
  for(const target of targets)if(root.contains(target))applyActionStyles(target);
 });
 // Ignore our generated classes: only semantic intent/labels/routes trigger a
 // new classification, so rendering an editor never creates an observer loop.
 observer.observe(root,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['data-action-style','href','role','type']});
 return ()=>observer.disconnect();
}
