// Lightweight server search; native controls preserve keyboard interaction.
export function selectionLabel(item){
 const detail=[item.reference,item.address,item.suburb,item.postcode].filter(Boolean).join(' · ');
 return item.name+(detail?' · '+detail:'')+(item.directoryStatus!=='current'?' · '+(item.directoryStatus==='inactive'?'Inactive':'Needs review'):'');
}
async function selectionRequest(path,signal){
 const response=await fetch('/api/'+path,{signal}),value=await response.json();
 if(!response.ok)throw Object.assign(Error(value.error||'Selection search failed.'),{status:response.status});return value;
}
export function createRecordPicker({label,kind,role='',status='active',selectedId='',onChange=()=>{},onConfirm=null,request=selectionRequest,required=false,name='',debounceMs=250,acceptItem=()=>true}){
 const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
 const element=node('div');element.className='workflow-field record-picker';
 const searchLabel=node('label'),search=node('input');search.type='search';search.maxLength=100;search.placeholder='Type a name, reference or contact detail';search.setAttribute('aria-label','Search '+label);searchLabel.append(node('span',label),search);
 // Keep the matching records visible: a collapsed select concealed live search
 // results and looked like a second search action. Native listboxes also retain
 // keyboard selection and required-field validation without an ARIA imitation.
 const choiceLabel=node('label'),select=node('select');select.size=6;select.required=required;select.name=name;select.setAttribute('aria-label',label);choiceLabel.append(select);
 const message=node('p');message.className='field-help';message.setAttribute('role','status');message.setAttribute('aria-live','polite');const scope=node('p','Search '+kind+(role?' with the '+role+' role':'')+' · '+(status==='active'?'Current and Needs review records; inactive saved selections remain visible.':status==='all'?'All directory statuses.':status+' records.'));scope.className='field-help';
 const selection=node('div');selection.className='record-picker-selection';selection.setAttribute('role','status');selection.setAttribute('aria-live','polite');
 const more=node('button','Load more');more.type='button';more.className='secondary';more.hidden=true;element.append(searchLabel,choiceLabel,selection,scope,message,more);
 let items=new Map(),selected=selectedId,pinned=null,nextAfter=null,timer,controller,identityController,generation=0,identityGeneration=0,disposed=false,disabled=false,loading=false;
 function showSelection(){
  selection.classList.toggle('has-selection',Boolean(selected));
  const item=pinned?.id===selected?pinned:items.get(selected);
  selection.replaceChildren(node('strong',selected?'Selected '+label.toLocaleLowerCase('en-AU')+':':'No '+label.toLocaleLowerCase('en-AU')+' selected'));
  if(selected)selection.append(node('span',item?selectionLabel(item):'Record '+selected+' · details unavailable'));
 }
 function render(){
  const options=[node('option','Choose '+label)];options[0].value='';
  if(pinned&&!items.has(pinned.id))items=new Map([[pinned.id,pinned],...items]);
  if(selected&&!items.has(selected)){const pending=node('option','Selected record · '+selected+' (details unavailable)');pending.value=selected;options.push(pending);}
  for(const item of items.values()){const option=node('option',selectionLabel(item));option.value=item.id;options.push(option);}
  select.replaceChildren(...options);select.value=selected;select.disabled=disabled||loading;search.setCustomValidity(required&&!selected?'Select a matching record from the results.':'');more.hidden=!nextAfter;more.disabled=disabled||loading;showSelection();
 }
 async function load(append=false){
  controller?.abort();controller=new AbortController();const current=++generation,signal=AbortSignal.any([controller.signal,AbortSignal.timeout(12000)]);loading=true;select.disabled=true;more.disabled=true;message.textContent='Searching…';
  const params=new URLSearchParams({kind,q:search.value,role,status,limit:'50',...(append&&nextAfter?{after:nextAfter}:{})});
  try{const result=await request('selections?'+params,signal);if(disposed||current!==generation)return;
   if(!append)items=new Map();let accepted=0;for(const item of result.items){if(acceptItem(item)){items.set(item.id,item);accepted++;}}nextAfter=result.nextAfter;message.textContent=accepted?'Select a matching record from the list.'+(nextAfter?' More results are available.':''):'No matching records. Try another search.';render();
  }catch(error){if(disposed||current!==generation||error.name==='AbortError')return;message.textContent=error.message+' Your selected record is retained.';}
  finally{if(!disposed&&current===generation){loading=false;select.disabled=disabled;more.disabled=disabled;}}
 }
 async function setValue(id){
  selected=id||'';pinned=null;identityController?.abort();identityController=new AbortController();const current=++identityGeneration;render();if(!selected)return;
  try{const result=await request('selections/'+kind+'/'+encodeURIComponent(selected),AbortSignal.any([identityController.signal,AbortSignal.timeout(12000)]));if(disposed||current!==identityGeneration)return;pinned=result.item;render();}
  catch(error){if(disposed||current!==identityGeneration||error.name==='AbortError')return;message.textContent='Selected record could not be loaded. '+error.message;}
 }
 search.addEventListener('input',()=>{clearTimeout(timer);controller?.abort();generation++;loading=true;items=new Map();nextAfter=null;render();message.textContent='Searching…';timer=setTimeout(()=>void load(),debounceMs);});
 search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(timer);void load();}});
 function choose(){selected=select.value;pinned=items.get(selected)??null;search.setCustomValidity(required&&!selected?'Select a matching record from the results.':'');identityController?.abort();identityGeneration++;showSelection();onChange(selected,pinned);}
 select.addEventListener('change',choose);
 if(onConfirm){
  choiceLabel.append(node('small','Click a name to select it, then Continue. Double-click a name to select and continue.'));
  select.addEventListener('dblclick',event=>{if(disposed||disabled||loading||!select.value)return;if(event.target instanceof HTMLOptionElement&&event.target.value!==select.value)return;choose();onConfirm(selected,pinned);});
  select.addEventListener('keydown',event=>{if(event.key==='Enter'&&!disposed&&!disabled&&!loading&&select.value){event.preventDefault();choose();onConfirm(selected,pinned);}});
 }
 more.addEventListener('click',()=>{if(!loading&&!disabled)void load(true);});
 render();const ready=Promise.all([setValue(selectedId),load()]);
 return {element,search,select,ready,setValue,reload:()=>load(),setDisabled(value){disabled=!!value;search.disabled=disabled;select.disabled=disabled||loading;more.disabled=disabled||loading;},destroy(){disposed=true;clearTimeout(timer);controller?.abort();identityController?.abort();generation++;identityGeneration++;}};
}
