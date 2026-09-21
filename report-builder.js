import {REPORT_DATASETS,REPORT_OPERATORS,validateReportQuery} from './report-model.js';
import {node,action,notice} from './project-care.js';
const clone=v=>JSON.parse(JSON.stringify(v));
const storageKey='tadsa-report-definitions-v1';
export function csvCell(value){let text=String(value??'');if(/^[\s\u0000-\u001f]*[=+@\-＝＋＠－]/u.test(text)||/^[\t\r\n]/.test(text))text='\t'+text;return '"'+text.replaceAll('"','""')+'"';}
export function renderReportBuilder(view){
 let query={dataset:'organisations',columns:[],filters:[],limit:50,offset:0},result=null,requestController,sequence=0,disposed=false;
 const lifetime=new AbortController();const dispose=()=>{disposed=true;sequence++;requestController?.abort();lifetime.abort();};window.addEventListener('hashchange',dispose,{once:true,signal:lifetime.signal});
 const heading=node('p','Choose what you need, add conditions, then run your report. Changes here never alter the records.','subtitle');
 const builder=node('form',null,'panel report-builder');const fields=node('div',null,'report-controls'),filterBox=node('div'),columnBox=node('fieldset',null,'report-columns'),output=node('section',null,'report-output');output.setAttribute('aria-live','polite');
 const feedback=node('div'),run=node('button','Run report','primary');run.type='submit';const cancel=action('Cancel report',()=>{sequence++;requestController?.abort();run.disabled=false;cancel.hidden=true;output.removeAttribute('aria-busy');output.replaceChildren(notice('Report cancelled. Adjust the filters or run it again.'));});cancel.hidden=true;
 const savedBox=node('div',null,'report-saved'),savedState=node('p',null,'field-help');let selectedName='',modified=false;
 view.append(heading,builder,output);builder.append(savedBox,fields,filterBox,columnBox,feedback);const controls=node('div',null,'actions');controls.append(run,cancel);builder.append(controls);
 function datasets(){return Object.entries(REPORT_DATASETS);}
 function config(){return REPORT_DATASETS[query.dataset];}
 function fieldList(){return config().fields;}
 function labelControl(parent,label,input){const box=node('label',null,'workflow-field');box.append(node('span',label,'field-label'),input);input.setAttribute('aria-label',label);parent.append(box);return input;}
 function select(parent,label,items,value,onChange){const input=node('select');for(const [value,label] of items){const option=node('option',label);option.value=value;input.append(option);}input.value=value;input.onchange=()=>onChange(input.value);return labelControl(parent,label,input);}
 function invalidate(markModified=true){if(markModified&&selectedName)modified=true;savedState.textContent=selectedName?(modified?'Unsaved changes to “'+selectedName+'”. Save these choices to update it.':'Selected report: '+selectedName):'';sequence++;requestController?.abort();run.disabled=false;cancel.hidden=true;result=null;query.offset=0;output.removeAttribute('aria-busy');output.replaceChildren(node('p','Run the report to see results for these choices.','field-help'));}

 function operators(field){return REPORT_OPERATORS[field.type]??REPORT_OPERATORS.text;}
 function draw(){
  fields.replaceChildren();select(fields,'Report on',datasets().map(([key,c])=>[key,c.label]),query.dataset,value=>{query={dataset:value,columns:[...REPORT_DATASETS[value].defaultColumns],filters:[],limit:50,offset:0};invalidate();draw();});
  select(fields,'Sort by',fieldList().map(f=>[f.key,f.label]),query.sort?.field??fieldList()[0].key,value=>{query.sort={field:value,direction:query.sort?.direction??'asc'};invalidate();});
  select(fields,'Order',[['asc','A to Z / lowest first'],['desc','Z to A / highest first']],query.sort?.direction??'asc',value=>{query.sort={field:query.sort?.field??fieldList()[0].key,direction:value};invalidate();});
  select(fields,'Rows per page',[['25','25'],['50','50'],['100','100']],String(query.limit),value=>{query.limit=Number(value);invalidate();});
  filterBox.replaceChildren(node('h2','Only include records where…'),node('p','All conditions must match. Leave conditions empty to include every record. Missing numbers do not count as zero.','field-help'));
  query.filters.forEach((filter,index)=>{
   const row=node('div',null,'report-filter');const f=fieldList().find(f=>f.key===filter.field)??fieldList()[0];
   select(row,'Field '+(index+1),fieldList().map(f=>[f.key,f.label]),f.key,value=>{const field=fieldList().find(f=>f.key===value);query.filters[index]={field:value,operator:operators(field)[0].value,value:''};invalidate();draw();});
   select(row,'Condition '+(index+1),operators(f).map(o=>[o.value,o.label]),filter.operator,value=>{filter.operator=value;filter.value='';invalidate();draw();});
   if(!['is_empty','is_not_empty'].includes(filter.operator)){
    const opts=f.options;
    if(opts){select(row,'Value '+(index+1),[['','Choose…'],...opts.map(o=>typeof o==='string'?[o,o]:[o.value,o.label])],String(filter.value??''),value=>{filter.value=value;invalidate();});}
    else{const input=node('input');input.type=f.type==='number'?'number':f.type==='date'?'date':'text';if(f.type==='number')input.step='any';input.maxLength=200;input.value=filter.value??'';input.required=true;input.oninput=()=>{filter.value=f.type==='number'&&input.value!==''?Number(input.value):input.value;invalidate();};labelControl(row,'Value '+(index+1),input);}
   }
   row.append(action('Remove condition '+(index+1),()=>{query.filters.splice(index,1);invalidate();draw();}));filterBox.append(row);
  });
  const add=action('Add condition',()=>{const f=fieldList()[0];query.filters.push({field:f.key,operator:operators(f)[0].value,value:''});invalidate();draw();});add.disabled=query.filters.length>=8;filterBox.append(add);
  columnBox.replaceChildren(node('legend','Columns to show'));for(const f of fieldList()){const label=node('label',null,'checkbox'),input=node('input');input.type='checkbox';input.checked=query.columns.includes(f.key);input.onchange=()=>{query.columns=input.checked?[...query.columns,f.key]:query.columns.filter(key=>key!==f.key);invalidate();};label.append(input,node('span',f.label));columnBox.append(label);}
 }
 function savedReports(){try{const values=JSON.parse(localStorage.getItem(storageKey)||'[]');return Array.isArray(values)?values.slice(0,20).filter(v=>{try{return typeof v.name==='string'&&v.name.length<=60&&Boolean(validateReportQuery(v.query));}catch{return false;}}):[];}catch{return [];}}
 function drawSaved(){
  savedBox.replaceChildren();const name=node('input');name.maxLength=60;name.placeholder='e.g. Government contacts';name.value=selectedName;labelControl(savedBox,'Report name',name);
  savedBox.append(action('Save these choices',()=>{
   const reportName=name.value.trim();if(!reportName){name.focus();return;}
   try{validateReportQuery(query);const saved=savedReports().filter(s=>s.name!==reportName);saved.unshift({name:reportName,query:clone(query)});localStorage.setItem(storageKey,JSON.stringify(saved.slice(0,20)));selectedName=reportName;modified=false;feedback.replaceChildren(notice('Report choices saved on this device.'));drawSaved();}
   catch{feedback.replaceChildren(notice('Complete the conditions before saving. Device storage must also be available.',true));}
  }));
  const saved=savedReports();if(saved.length){
   const choices=select(savedBox,'Saved reports',[['','Choose a saved report'],...saved.map(s=>[s.name,s.name])],selectedName,value=>{
    if(!value){selectedName='';modified=false;drawSaved();return;}
    const report=savedReports().find(s=>s.name===value);if(!report){selectedName='';drawSaved();return;}
    query=clone(report.query);selectedName=report.name;modified=false;invalidate(false);draw();drawSaved();
   });
   const remove=action('Delete selected saved report',()=>{
    if(!selectedName)return;const deletedName=selectedName;
    try{localStorage.setItem(storageKey,JSON.stringify(savedReports().filter(s=>s.name!==deletedName)));selectedName='';modified=false;drawSaved();feedback.replaceChildren(notice('Saved report “'+deletedName+'” deleted. The current report choices remain available.'));}
    catch{feedback.replaceChildren(notice('Could not delete these saved choices.',true));}
   });remove.disabled=!choices.value;savedBox.append(remove);
  }
  savedState.textContent=selectedName?(modified?'Unsaved changes to “'+selectedName+'”. Save these choices to update it.':'Selected report: '+selectedName):'';savedBox.append(savedState);
 }

 function format(value,field){if(value===null||value===undefined||value==='')return 'Not recorded';if(Array.isArray(value))return value.join(', ');if(field.type==='number')return new Intl.NumberFormat('en-AU',{maximumFractionDigits:2}).format(value);return String(value);}
 function show(){
  output.replaceChildren();const rows=result.rows;const meta=config();const columns=query.columns.map(key=>fieldList().find(f=>f.key===key));
  output.append(node('h2',`${rows.length} ${meta.label.toLowerCase()} shown`),node('p',`Rows ${rows.length?query.offset+1:0}–${query.offset+rows.length}${result.hasMore?' · More results available':''}. Page actions use the displayed rows; matching exports include up to 1,000 records.`,'field-help'));
  const actions=node('div',null,'actions');const download=action('Download this page (CSV)',()=>{const lines=[columns.map(f=>csvCell(f.label)).join(','),...rows.map(row=>columns.map(f=>csvCell(Array.isArray(row[f.key])?row[f.key].join('; '):row[f.key])).join(','))];const url=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download='tadsa-'+query.dataset+'-page-'+(Math.floor(query.offset/query.limit)+1)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});download.disabled=!rows.length;actions.append(download,action('Download matching records (up to 1,000)',()=>exportMatching(false)));if(query.columns.includes('email'))actions.append(action('Get matching emails (up to 1,000 records)',()=>exportMatching(true)));
  if(query.columns.includes('email'))actions.append(action('Get email list for this page',()=>{const emails=[...new Set(rows.map(row=>String(row.email??'').trim().toLowerCase()).filter(email=>/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(email)))];const box=node('section',null,'panel');box.append(node('h3',`${emails.length} unique email addresses`),node('p','Copy these into BCC in your email app. Check recipients and consent before sending. No email is sent from this report.','field-help'));const text=node('textarea');text.readOnly=true;text.value=emails.join('; ');labelControl(box,'Email addresses for BCC',text);box.append(action('Copy email addresses',async()=>{try{await navigator.clipboard.writeText(text.value);feedback.replaceChildren(notice('Email addresses copied.'));}catch{text.focus();text.select();}}));output.querySelector('.report-email')?.remove();box.classList.add('report-email');output.append(box);}));output.append(actions);
  if(!rows.length)output.append(notice('No records match. Try removing a condition or changing its value.'));
  else{const wrap=node('div',null,'report-table-wrap'),table=node('table'),head=node('thead'),tr=node('tr');for(const f of columns){const th=node('th',f.label);th.scope='col';tr.append(th);}head.append(tr);const body=node('tbody');for(const row of rows){const tr=node('tr');for(const f of columns){const td=node('td');if(['name','reference','title'].includes(f.key)&&row.id){const a=node('a',format(row[f.key],f));a.href='#'+({organisations:'organisation',people:'person',projects:'project'})[query.dataset]+'/'+row.id;td.append(a);}else td.textContent=format(row[f.key],f);tr.append(td);}body.append(tr);}table.append(head,body);wrap.tabIndex=0;wrap.setAttribute('aria-label','Report results; scroll horizontally for more columns');wrap.append(table);output.append(wrap);}
  const pages=node('div',null,'actions');const prev=action('Previous page',()=>{query.offset=Math.max(0,query.offset-query.limit);load();});prev.disabled=query.offset===0;const next=action('Next page',()=>{query.offset+=query.limit;load();});next.disabled=!result.hasMore;pages.append(prev,next);output.append(pages);
 }
 async function exportMatching(emailsOnly){
  requestController?.abort();requestController=new AbortController();const controller=requestController,current=++sequence,snapshot=clone(query);run.disabled=true;cancel.hidden=false;const timeout=setTimeout(()=>controller.abort(),12000);const rows=[];let more=false;
  try{
   for(let offset=0;offset<1000;offset+=100){
    if(current!==sequence||disposed)return;feedback.replaceChildren(notice('Preparing export: '+rows.length+' records collected…'));
    const response=await fetch('/api/reports/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...snapshot,offset,limit:100}),signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'Export unavailable.');if(current!==sequence||disposed)return;rows.push(...data.rows);more=data.hasMore;if(!more)break;
   }
   feedback.replaceChildren(notice(`${rows.length} records collected.${more?' Limit reached: this is the first 1,000 matches. Narrow the conditions for a complete smaller list.':''} Results reflect records read during this export.`));
   if(emailsOnly){const emails=[...new Set(rows.map(row=>String(row.email??'').trim().toLowerCase()).filter(email=>/^[^\s@;,]+@[^\s@;,]+\.[^\s@;,]+$/.test(email)))];const box=node('section',null,'panel report-email');box.append(node('h3',emails.length+' unique email addresses'),node('p','Copy into BCC in your email app. No email is sent by this report.','field-help'));const text=node('textarea');text.readOnly=true;text.value=emails.join('; ');labelControl(box,'Matching email addresses for BCC',text);box.append(action('Copy matching email addresses',async()=>{try{await navigator.clipboard.writeText(text.value);}catch{text.focus();text.select();}}));output.querySelector('.report-email')?.remove();output.append(box);}
   else{const columns=snapshot.columns.map(key=>REPORT_DATASETS[snapshot.dataset].fields.find(f=>f.key===key));const lines=[columns.map(f=>csvCell(f.label)).join(','),...rows.map(row=>columns.map(f=>csvCell(Array.isArray(row[f.key])?row[f.key].join('; '):row[f.key])).join(','))];const url=URL.createObjectURL(new Blob(['\ufeff'+lines.join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=node('a');a.href=url;a.download='tadsa-'+snapshot.dataset+(more?'-first-1000':'-matching')+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  }catch(error){if(current===sequence&&!disposed)feedback.replaceChildren(notice(error.name==='AbortError'?'Export timed out. Narrow the conditions and try again. No partial file was downloaded.':error.message,true));}
  finally{clearTimeout(timeout);if(current===sequence&&!disposed){run.disabled=false;cancel.hidden=true;}}
 }
 async function load(){
  if(!builder.reportValidity())return;if(!query.columns.length||query.columns.length>12){feedback.replaceChildren(notice('Choose between 1 and 12 columns.',true));return;}
  requestController?.abort();requestController=new AbortController();const controller=requestController,current=++sequence;const timeout=setTimeout(()=>controller.abort(),12000);run.disabled=true;cancel.hidden=false;feedback.replaceChildren();output.setAttribute('aria-busy','true');output.replaceChildren(node('p','Finding matching records…','loading'));
  try{const response=await fetch('/api/reports/query',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(query),signal:controller.signal});const data=await response.json();if(!response.ok)throw Error(data.error||'Report unavailable.');if(current!==sequence||disposed)return;result=data;show();}
  catch(error){if(current===sequence&&!disposed)output.replaceChildren(notice(error.name==='AbortError'?'The report took too long. Add a more specific condition and try again.':error.message,true));}
  finally{clearTimeout(timeout);if(current===sequence&&!disposed){run.disabled=false;cancel.hidden=true;output.removeAttribute('aria-busy');}}
 }
 builder.onsubmit=e=>{e.preventDefault();query.offset=0;load();};

 query.columns=[...config().defaultColumns];drawSaved();draw();invalidate(false);return dispose;
}
