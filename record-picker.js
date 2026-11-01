// Shared record search: committed identity is separate from an editable query.
export function selectionLabel(item){
 const detail=[item.reference||item.id,item.phone,item.email,item.address,item.suburb,item.postcode].filter(Boolean).join(' · ');
 return item.name+(detail?' · '+detail:'')+(item.directoryStatus!=='current'?' · '+(item.directoryStatus==='inactive'?'Inactive':'Needs review'):'');
}
async function selectionRequest(path,signal){
 const response=await fetch('/api/'+path,{signal}),value=await response.json();
 if(!response.ok)throw Object.assign(Error(value.error||'Selection search failed.'),{status:response.status});return value;
}
let pickerSequence=0;
export function createRecordPicker({label,kind,role='',status='active',selectedId='',onChange=()=>{},request=selectionRequest,required=false,name='',debounceMs=250,acceptItem=()=>true}){
 const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
 const element=node('div');element.className='workflow-field record-picker';
 const searchLabel=node('label'),search=node('input');search.type='search';search.maxLength=100;search.autocomplete='off';search.placeholder='Type a name, reference or contact detail';search.setAttribute('aria-label','Search '+label);
 const choiceLabel=node('div'),select=node('select');select.size=6;select.tabIndex=-1;select.name=name;select.id='record-results-'+(++pickerSequence);select.setAttribute('aria-label',label);
 // The native listbox keeps familiar mouse/keyboard browsing. Validation lives
 // on the visible search field, including when the result list is collapsed.
 search.setAttribute('role','combobox');search.setAttribute('aria-autocomplete','list');search.setAttribute('aria-controls',select.id);search.setAttribute('aria-expanded','false');search.setAttribute('aria-haspopup','listbox');search.setAttribute('aria-required',String(required));choiceLabel.append(select);
 const field=node('div');field.className='record-picker-field';searchLabel.append(node('span',label),search);
 const clear=node('button','Clear');clear.type='button';clear.className='secondary record-picker-clear';clear.setAttribute('aria-label','Clear '+label);field.append(searchLabel,clear);
 const message=node('p');message.className='field-help';message.setAttribute('role','status');message.setAttribute('aria-live','polite');
 const scope=node('p','Search '+kind+(role?' with the '+role+' role':'')+' · '+(status==='active'?'Current and Needs review records; inactive saved selections remain visible.':status==='all'?'All directory statuses.':status+' records.'));scope.className='field-help';
 const more=node('button','Load more');more.type='button';more.className='secondary';more.hidden=true;element.append(field,choiceLabel,scope,message,more);
 let items=new Map(),selected=selectedId,pinned=null,nextAfter=null,timer,controller,identityController,generation=0,identityGeneration=0,disposed=false,disabled=false,loading=false,open=!selectedId,query='',editing=false,skipFocus=false,navigating=false,activeId='',resultIds=new Set(),lastPointer=null,clickGuard=null,guardTimer;
 const selectedItem=()=>pinned?.id===selected?pinned:items.get(selected);
 const selectedName=()=>selected?(selectedItem()?.name||'Selected record · '+selected):'';
 function validity(){search.setCustomValidity(editing?'Choose a matching record, or press Escape to keep the current selection.':required&&!selected?'Select a matching record from the results.':'');}
 function render(){
  const options=[node('option','Choose '+label)];options[0].value='';
  if(pinned&&!items.has(pinned.id))items=new Map([...items,[pinned.id,pinned]]);
  if(selected&&!items.has(selected)){const pending=node('option','Selected record · '+selected+' (details unavailable)');pending.value=selected;options.push(pending);}
  for(const item of items.values()){const option=node('option',selectionLabel(item));option.value=item.id;option.id=select.id+'-'+item.id;options.push(option);}
  select.replaceChildren(...options);select.value=activeId||selected;select.disabled=disabled||loading;search.disabled=disabled;clear.disabled=disabled;clear.hidden=!selected;choiceLabel.hidden=!open;scope.hidden=!open;more.hidden=!open||!nextAfter;more.disabled=disabled||loading;
  search.setAttribute('aria-expanded',String(open));search.setAttribute('aria-activedescendant',open&&activeId?select.id+'-'+activeId:'');element.classList.toggle('has-selection',Boolean(selected)&&!editing);
  if(!editing)search.value=selectedName();search.title=selectedItem()?selectionLabel(selectedItem()):'';validity();
 }
 function cancelSearch(){clearTimeout(timer);controller?.abort();generation++;loading=false;}
 function focusField(){skipFocus=true;search.focus?.();skipFocus=false;}
 function close(){cancelSearch();activeId='';open=false;editing=false;query='';render();message.textContent=selected?'Selected. Click or type in the field to change.':'';}
 async function load(append=false){
  controller?.abort();controller=new AbortController();const current=++generation,signal=AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]);loading=true;select.disabled=true;more.disabled=true;message.textContent='Searching…';
  const params=new URLSearchParams({kind,q:query,role,status,limit:'50',...(append&&nextAfter?{after:nextAfter}:{})});
  try{const result=await request('selections?'+params,signal);if(disposed||current!==generation)return;
   if(!append){items=new Map();resultIds=new Set();activeId='';}let accepted=0;for(const item of result.items){if(acceptItem(item)){items.set(item.id,item);resultIds.add(item.id);accepted++;}}nextAfter=result.nextAfter;
   message.textContent=open?(accepted?'Click or double-click a name to select. Use Arrow Down and Enter with the keyboard.'+(nextAfter?' More results are available.':''):'No matching records. Try another search.'):(selected?'Selected. Click or type in the field to change.':'');render();
  }catch(error){if(disposed||current!==generation||error.name==='AbortError')return;message.textContent=error.message+' Your selected record is retained. Press Enter in the search field to retry.';}
  finally{if(!disposed&&current===generation){loading=false;select.disabled=disabled;more.disabled=disabled;}}
 }
 async function setValue(id){
  cancelSearch();activeId='';selected=id||'';pinned=items.get(selected)??null;open=!selected;editing=false;query='';identityController?.abort();identityController=new AbortController();const current=++identityGeneration;render();if(!selected){message.textContent='';return;}
  try{const result=await request('selections/'+kind+'/'+encodeURIComponent(selected),AbortSignal.any([identityController.signal,AbortSignal.timeout(12000)]));if(disposed||current!==identityGeneration)return;pinned=result.item;render();}
  catch(error){if(disposed||current!==identityGeneration||error.name==='AbortError')return;message.textContent='Selected record could not be loaded. '+error.message;}
 }
 function browse(){if(disposed||disabled||skipFocus||open)return;clickGuard?.abort();clearTimeout(guardTimer);open=true;query='';render();search.select?.();void load();}
 search.addEventListener('focus',browse);search.addEventListener('click',browse);
 search.addEventListener('input',()=>{if(disposed||disabled)return;clickGuard?.abort();clearTimeout(guardTimer);query=search.value;editing=true;open=true;activeId='';cancelSearch();loading=true;items=new Map();nextAfter=null;render();message.textContent='Searching…';timer=setTimeout(()=>void load(),debounceMs);});
 search.addEventListener('keydown',event=>{
  clickGuard?.abort();clearTimeout(guardTimer);
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation?.();close();}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
   event.preventDefault();lastPointer=null;if(!open)browse();
   if(!loading){const matches=[...items.keys()].filter(id=>resultIds.has(id)),index=matches.indexOf(activeId);activeId=matches[index<0?(event.key==='ArrowDown'?0:matches.length-1):Math.max(0,Math.min(matches.length-1,index+(event.key==='ArrowDown'?1:-1)))]||'';select.value=activeId;search.setAttribute('aria-activedescendant',activeId?select.id+'-'+activeId:'');select.selectedOptions?.[0]?.scrollIntoView?.({block:'nearest'});}
  }
  if(event.key==='Enter'){event.preventDefault();lastPointer=null;if(open&&activeId&&!loading)choose();else if(open){clearTimeout(timer);void load();}else browse();}
 });
  // Closing a list moves the controls below it. Consume only the remaining
 // pointer clicks of this selection gesture so a double-click cannot activate
 // a newly exposed Save/Continue button at the same screen position.
 function guardSelectionGesture(){
  if(!lastPointer||Date.now()-lastPointer.time>600||!document.addEventListener)return;
  clickGuard?.abort();clearTimeout(guardTimer);clickGuard=new AbortController();const point=lastPointer;
  const guard=event=>{if(event.type==='pointerdown'&&(Math.abs(event.clientX-point.x)>5||Math.abs(event.clientY-point.y)>5)){clickGuard?.abort();clearTimeout(guardTimer);return;}if(event.detail===0&&event.type==='click')return;if(Math.abs(event.clientX-point.x)<=5&&Math.abs(event.clientY-point.y)<=5){event.preventDefault();event.stopImmediatePropagation();}};
  for(const type of ['pointerdown','mousedown','mouseup','click','dblclick'])document.addEventListener(type,guard,{capture:true,signal:clickGuard.signal});
  guardTimer=setTimeout(()=>clickGuard?.abort(),600);lastPointer=null;
 }
 select.addEventListener('pointerdown',event=>{lastPointer={x:event.clientX,y:event.clientY,time:Date.now()};});
 function choose(){
  if(disposed||disabled||loading)return;
  const id=select.value,item=items.get(id)??null;if(id&&!item)return;
  guardSelectionGesture();const changed=id!==selected;selected=id;pinned=item;identityController?.abort();identityGeneration++;close();focusField();
  if(changed)onChange(selected,pinned);
 }
 select.addEventListener('change',()=>{if(!navigating)choose();});
 select.addEventListener('click',choose);select.addEventListener('dblclick',choose);
 select.addEventListener('keydown',event=>{
  lastPointer=null;navigating=['ArrowDown','ArrowUp','Home','End','PageDown','PageUp'].includes(event.key);
  if(event.key==='Enter'){event.preventDefault();choose();}
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation?.();close();focusField();}
 });
 select.addEventListener('keyup',()=>{navigating=false;});
 element.addEventListener('focusout',event=>{if(!element.contains?.(event.relatedTarget)){close();}});
 clear.addEventListener('click',()=>{if(disabled||disposed)return;void setValue('');onChange('',null);focusField();void load();});
 more.addEventListener('click',()=>{if(!loading&&!disabled)void load(true);});
 render();const ready=Promise.all([setValue(selectedId),load()]);
 const picker={element,search,select,ready,setValue,reload:()=>load(),setDisabled(value){disabled=!!value;render();},destroy(){disposed=true;cancelSearch();clearTimeout(guardTimer);clickGuard?.abort();identityController?.abort();identityGeneration++;}};element.recordPicker=picker;return picker;
}
