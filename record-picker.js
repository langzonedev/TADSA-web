// Lightweight server search; native controls preserve keyboard interaction.
export function selectionLabel(item){
 const detail=[item.reference,item.address,item.suburb,item.postcode].filter(Boolean).join(' · ');
 return item.name+(detail?' · '+detail:'')+(item.directoryStatus!=='current'?' · '+(item.directoryStatus==='inactive'?'Inactive':'Needs review'):'');
}
async function selectionRequest(path,signal){
 const response=await fetch('/api/'+path,{signal}),value=await response.json();
 if(!response.ok)throw Object.assign(Error(value.error||'Selection search failed.'),{status:response.status});return value;
}
export function createRecordPicker({label,kind,role='',status='active',selectedId='',onChange=()=>{},request=selectionRequest,required=false,name='',debounceMs=250,acceptItem=()=>true}){
 const node=(tag,text)=>{const element=document.createElement(tag);if(text!==undefined)element.textContent=text;return element;};
 const element=node('div');element.className='workflow-field record-picker';
 const searchLabel=node('label'),search=node('input');search.type='search';search.maxLength=100;search.setAttribute('aria-label','Search '+label);searchLabel.append(node('span','Search '+label),search);
 const choiceLabel=node('label'),select=node('select');select.required=required;select.name=name;select.setAttribute('aria-label',label);choiceLabel.append(node('span',label),select);
 const message=node('p');message.className='field-help';message.setAttribute('role','status');message.setAttribute('aria-live','polite');const scope=node('p','Search '+kind+(role?' with the '+role+' role':'')+' · '+(status==='active'?'Current and Needs review records; inactive saved selections remain visible.':status==='all'?'All directory statuses.':status+' records.'));scope.className='field-help';
 const more=node('button','Load more');more.type='button';more.className='secondary';more.hidden=true;element.append(searchLabel,choiceLabel,scope,message,more);
 let items=new Map(),selected=selectedId,pinned=null,nextAfter=null,timer,controller,identityController,generation=0,identityGeneration=0,disposed=false,disabled=false,loading=false;
 function render(){
  const options=[node('option','Choose '+label)];options[0].value='';
  if(pinned&&!items.has(pinned.id))items=new Map([[pinned.id,pinned],...items]);
  if(selected&&!items.has(selected)){const pending=node('option','Selected record · '+selected+' (details unavailable)');pending.value=selected;options.push(pending);}
  for(const item of items.values()){const option=node('option',selectionLabel(item));option.value=item.id;options.push(option);}
  select.replaceChildren(...options);select.value=selected;more.hidden=!nextAfter;more.disabled=disabled||loading;
 }
 async function load(append=false){
  controller?.abort();controller=new AbortController();const current=++generation,signal=controller.signal;loading=true;more.disabled=true;message.textContent='Searching…';
  const params=new URLSearchParams({kind,q:search.value,role,status,limit:'50',...(append&&nextAfter?{after:nextAfter}:{})});
  try{const result=await request('selections?'+params,signal);if(disposed||current!==generation)return;
   if(!append)items=new Map();for(const item of result.items){if(acceptItem(item))items.set(item.id,item);}nextAfter=result.nextAfter;message.textContent=result.items.length?'Choose a record from the results.'+(nextAfter?' More results are available.':''):'No matching records. Try another search.';render();
  }catch(error){if(disposed||current!==generation||error.name==='AbortError')return;message.textContent=error.message+' Your selected record is retained.';}
  finally{if(!disposed&&current===generation){loading=false;more.disabled=disabled;}}
 }
 async function setValue(id){
  selected=id||'';pinned=null;identityController?.abort();identityController=new AbortController();const current=++identityGeneration;render();if(!selected)return;
  try{const result=await request('selections/'+kind+'/'+encodeURIComponent(selected),identityController.signal);if(disposed||current!==identityGeneration)return;pinned=result.item;render();}
  catch(error){if(disposed||current!==identityGeneration||error.name==='AbortError')return;message.textContent='Selected record could not be loaded. '+error.message;}
 }
 search.addEventListener('input',()=>{clearTimeout(timer);controller?.abort();generation++;nextAfter=null;more.hidden=true;timer=setTimeout(()=>void load(),debounceMs);});
 search.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(timer);void load();}});
 select.addEventListener('change',()=>{selected=select.value;pinned=items.get(selected)??null;identityController?.abort();identityGeneration++;onChange(selected,pinned);});
 more.addEventListener('click',()=>{if(!loading&&!disabled)void load(true);});
 render();const ready=Promise.all([setValue(selectedId),load()]);
 return {element,search,select,ready,setValue,reload:()=>load(),setDisabled(value){disabled=!!value;search.disabled=disabled;select.disabled=disabled;more.disabled=disabled||loading;},destroy(){disposed=true;clearTimeout(timer);controller?.abort();identityController?.abort();generation++;identityGeneration++;}};
}
