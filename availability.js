import {node,action,link,notice,request,field,editor} from './project-care.js';
const localDay=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const move=(day,n)=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return localDay(d);};
const dateOf=day=>new Date(day+'T12:00:00');
const state={technician:'all',scale:'week',date:localDay(new Date())};
let selectedCalendar=null;
const statuses={available:['✓','Available'],limited:['◐','Limited availability'],unavailable:['×','Unavailable'],unknown:['?','Not recorded']};
function range(){
 const d=dateOf(state.date),year=d.getFullYear();
 if(state.scale==='week'){const start=move(state.date,-((d.getDay()+6)%7));return [start,move(start,6)];}
 if(state.scale==='month')return [localDay(new Date(year,d.getMonth(),1)),localDay(new Date(year,d.getMonth()+1,0))];
 return [state.date,`${year}-12-31`];
}
export async function renderAvailability(view,personId,isCurrent=()=>true){
 if(personId)state.technician=personId;
 const technicians=await request('technicians');if(!isCurrent())return;
 const people=[...technicians.items].sort((a,b)=>a.name.localeCompare(b.name,'en-AU'));
 if(state.technician!=='all'&&!people.some(t=>t.id===state.technician))state.technician='all';
 view.classList.add('availability-workspace');
 view.append(node('h1','Calendar availability'),node('p','Select a day to record dated availability. Calendar entries do not change the general allocation status on the person profile. Check both before assigning work.','subtitle'));
 const controls=node('div',null,'availability-controls'),board=node('section',null,'availability-timeline'),forms=node('section',null,'availability-editor');view.append(controls,board,forms);
 const person=field(controls,'Technician',state,'technician','text',[['all','All technicians'],...people.map(t=>[t.id,t.name])]);
 const scale=field(controls,'View',state,'scale','text',[['week','Week'],['month','Month'],['year','Year']]);
 const date=field(controls,'Date',state,'date','date');date.min='1900-01-01';date.max='9998-12-31';
 const arrows=node('div',null,'actions availability-period-controls');
 const changePeriod=n=>{const previousDate=state.date,d=dateOf(state.date);if(state.scale==='week')state.date=move(state.date,n*7);else if(state.scale==='month')state.date=localDay(new Date(d.getFullYear(),d.getMonth()+n,1));else state.date=localDay(new Date(d.getFullYear()+n,0,1));if(state.date<'1900-01-01'||state.date>'9998-12-31'){state.date=previousDate;return;}date.value=state.date;draw();};
 arrows.append(action('← Previous',()=>changePeriod(-1)),action('Today',()=>{state.date=localDay(new Date());date.value=state.date;draw();}),action('Next →',()=>changePeriod(1)));controls.append(arrows);let pickingRange=false,rangeStart=null;const rangeButton=action('Select date range',()=>{pickingRange=!pickingRange;rangeStart=null;rangeButton.setAttribute('aria-pressed',String(pickingRange));rangeButton.textContent=pickingRange?'Cancel range selection':'Select date range';rangeHint.textContent=pickingRange?'Select the first day, then the last day in the same technician’s row.':'Tip: drag across days with a mouse, or use Select date range. Shift + click also selects a range.';});rangeButton.setAttribute('aria-pressed','false');controls.append(rangeButton);const rangeHint=node('p','Tip: drag across days with a mouse, or use Select date range. Shift + click also selects a range.','field-help');view.append(rangeHint);view.insertBefore(rangeHint,board);
 const legend=node('p',null,'availability-legend');for(const [key,[symbol,label]]of Object.entries(statuses))legend.append(node('span',`${symbol} ${label}`,'availability-key '+key));legend.append(node('span','▣ Selected dates','availability-key selected-dates'));view.append(legend);view.insertBefore(legend,board);
 const calendars=new Map(),loadWaiters=[];let activeLoads=0,generation=0,lastValidDate=state.date;
 async function draw(){
  pickingRange=false;rangeStart=null;rangeButton.textContent='Select date range';rangeButton.setAttribute('aria-pressed','false');lastValidDate=state.date;const current=++generation,[start,end]=range(),visible=people.filter(t=>state.technician==='all'||t.id===state.technician);
  board.replaceChildren(notice('Loading availability…'));board.setAttribute('aria-busy','true');forms.replaceChildren();
  let cursor=0;const failures=new Set();
  await Promise.all(Array.from({length:Math.min(4,visible.length)},async()=>{while(cursor<visible.length){if(current!==generation||!isCurrent())return;const t=visible[cursor++];if(calendars.has(t.id))continue;while(activeLoads>=4)await new Promise(resolve=>loadWaiters.push(resolve));if(current!==generation||!isCurrent()){loadWaiters.shift()?.();return;}if(calendars.has(t.id)){loadWaiters.shift()?.();continue;}activeLoads++;try{calendars.set(t.id,await request('availability/'+t.id));}catch{failures.add(t.id);}finally{activeLoads--;loadWaiters.shift()?.();}}}));
  if(current!==generation||!isCurrent())return;
  board.replaceChildren();board.removeAttribute('aria-busy');
  const formattedDays=new Map(),dateFormatter=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric'});const format=day=>{if(!formattedDays.has(day))formattedDays.set(day,dateFormatter.format(dateOf(day)));return formattedDays.get(day);};
  board.append(node('h2',`${format(start)} – ${format(end)}`));
  if(!visible.length){board.append(notice('Add a person with the Technician role to begin.'),link('Add person','new-person'));return;}
  if(failures.size){board.append(notice('Some calendars could not load. Their availability is not shown.',true),action('Retry calendars',draw));}
  board.append(node('p',state.scale==='year'?'Year view shows the selected date to 31 December. Scroll across to later dates.':'Scroll across if needed. Unrecorded dates are unknown; confirm availability before assigning work.','field-help'));
  const days=[];for(let day=start;day<=end;day=move(day,1))days.push(day);
  const scroll=node('div',null,'availability-scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Technician availability calendar, scroll horizontally for more dates');
  const table=node('table',null,'availability-table '+state.scale);table.setAttribute('aria-label',`${state.scale} availability, ${format(start)} to ${format(end)}`);
  const head=node('thead'),hr=node('tr'),corner=node('th','Technician');corner.scope='col';hr.append(corner);
  for(const day of days){const th=node('th');th.scope='col';th.append(node('span',dateOf(day).toLocaleDateString('en-AU',{month:'short'})),node('strong',dateOf(day).toLocaleDateString('en-AU',{day:'numeric'})),node('small',dateOf(day).toLocaleDateString('en-AU',{weekday:'short'})));if(day===localDay(new Date()))th.className='today';hr.append(th);}head.append(hr);table.append(head);
  const body=node('tbody');let first=true;
  for(const t of visible){const row=node('tr'),name=node('th');name.scope='row';name.append(link(t.name,'person/'+t.id),node('small','General allocation: '+t.availability));row.append(name);const calendar=calendars.get(t.id);
   if(!calendar){const cell=node('td','Calendar unavailable');cell.colSpan=days.length;row.append(cell);body.append(row);continue;}
   let entryIndex=0;const entries=[...calendar.entries].sort((a,b)=>a.startDate.localeCompare(b.startDate));
   for(const day of days){while(entryIndex<entries.length&&entries[entryIndex].endDate<day)entryIndex++;const candidate=entries[entryIndex],entry=candidate&&candidate.startDate<=day&&candidate.endDate>=day?candidate:null,key=entry?.status||'unknown',[symbol,label]=statuses[key]||statuses.unknown;
    const cell=node('td'),b=node('button',symbol,'availability-cell '+key);b.type='button';b.dataset.person=t.id;b.dataset.day=day;b.tabIndex=first?0:-1;first=false;b.title=`${t.name} · ${format(day)} · ${label}${entry?.note?' · '+entry.note:''}`;b.setAttribute('aria-label',`${t.name}, ${format(day)}: ${label}. Edit availability`);if(selectedCalendar?.personId===t.id&&selectedCalendar.day===day)b.setAttribute('aria-pressed','true');cell.append(b);row.append(cell);
   }body.append(row);
  }table.append(body);scroll.append(table);board.append(scroll);
  const selectedCell=table.querySelector('button[aria-pressed="true"]');if(selectedCell){table.querySelector('button[tabindex="0"]')?.setAttribute('tabindex','-1');selectedCell.tabIndex=0;requestAnimationFrame(()=>{if(isCurrent())scroll.scrollLeft=Math.max(0,selectedCell.closest('td').offsetLeft-210);});}
  let drag=null,suppressClick=false;
  const markRange=(personId,a,b)=>{const lo=a<b?a:b,hi=a<b?b:a;table.querySelectorAll('button[data-day]').forEach(x=>{const selected=x.dataset.person===personId&&x.dataset.day>=lo&&x.dataset.day<=hi;x.classList.toggle('range-selected',selected);x.setAttribute('aria-pressed',String(selected));});};
  const chooseRange=(a,b)=>{if(a.personId!==b.personId){rangeHint.textContent='Select the last day in the same technician’s row.';return;}const lo=a.day<b.day?a.day:b.day,hi=a.day<b.day?b.day:a.day;pickingRange=false;rangeStart=null;rangeButton.textContent='Select date range';rangeButton.setAttribute('aria-pressed','false');rangeHint.textContent='Date range selected. Choose availability and save below.';markRange(a.personId,lo,hi);table.querySelectorAll('button[data-day]').forEach(x=>{x.removeAttribute('aria-pressed');if(x.dataset.person===a.personId&&x.dataset.day===lo)x.setAttribute('aria-pressed','true');});edit(people.find(t=>t.id===a.personId),calendars.get(a.personId),lo,true,hi);};
  table.onpointerdown=e=>{const b=e.target.closest('button[data-day]');if(e.pointerType!=='mouse'||e.button!==0||!b||pickingRange)return;drag={personId:b.dataset.person,day:b.dataset.day,last:b.dataset.day,moved:false};b.setPointerCapture(e.pointerId);};
  table.onpointermove=e=>{if(!drag||!(e.buttons&1))return;const b=document.elementFromPoint(e.clientX,e.clientY)?.closest('button[data-day]');if(!b||b.dataset.person!==drag.personId)return;if(b.dataset.day!==drag.last){drag.moved=true;drag.last=b.dataset.day;e.preventDefault();markRange(drag.personId,drag.day,drag.last);}};
  table.onpointerup=()=>{if(drag?.moved){suppressClick=true;setTimeout(()=>{suppressClick=false;},0);chooseRange(drag,{personId:drag.personId,day:drag.last});}drag=null;};table.onpointerleave=e=>{if(!e.buttons)drag=null;};table.onpointercancel=()=>{drag=null;};
  table.onclick=e=>{if(suppressClick){suppressClick=false;return;}const b=e.target.closest('button[data-day]');if(!b)return;const point={personId:b.dataset.person,day:b.dataset.day};if(pickingRange){if(!rangeStart){rangeStart=point;markRange(point.personId,point.day,point.day);rangeHint.textContent='Now select the last day in the same technician’s row.';}else chooseRange(rangeStart,point);return;}if(e.shiftKey&&selectedCalendar){chooseRange(selectedCalendar,point);return;}table.querySelectorAll('button[data-day]').forEach(x=>{x.tabIndex=-1;x.removeAttribute('aria-pressed');x.classList.remove('range-selected');});b.tabIndex=0;b.setAttribute('aria-pressed','true');const t=people.find(p=>p.id===b.dataset.person);edit(t,calendars.get(t.id),b.dataset.day,true);};
  table.onkeydown=e=>{const b=e.target.closest('button[data-day]');if(!b)return;const row=b.closest('tr'),cells=[...row.querySelectorAll('button[data-day]')],index=cells.indexOf(b);let target;
   if(e.key==='ArrowLeft')target=cells[Math.max(0,index-1)];if(e.key==='ArrowRight')target=cells[Math.min(cells.length-1,index+1)];if(e.key==='Home')target=cells[0];if(e.key==='End')target=cells.at(-1);if(e.key==='ArrowUp')target=row.previousElementSibling?.querySelectorAll('button[data-day]')[index];if(e.key==='ArrowDown')target=row.nextElementSibling?.querySelectorAll('button[data-day]')[index];if(target){e.preventDefault();b.tabIndex=-1;target.tabIndex=0;target.focus();}
  };
  if(selectedCalendar?.endDay&&selectedCalendar.endDay!==selectedCalendar.day)markRange(selectedCalendar.personId,selectedCalendar.day,selectedCalendar.endDay);
  if(selectedCalendar&&visible.some(t=>t.id===selectedCalendar.personId)&&selectedCalendar.day>=start&&selectedCalendar.day<=end&&calendars.has(selectedCalendar.personId))edit(people.find(t=>t.id===selectedCalendar.personId),calendars.get(selectedCalendar.personId),selectedCalendar.day,false,selectedCalendar.endDay);
 }
 function edit(t,calendar,day,focus,endDay=day){
  selectedCalendar={personId:t.id,day,endDay};forms.replaceChildren();const heading=node('h2',`${t.name} · ${dateOf(day).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})}`);heading.tabIndex=-1;forms.append(heading,action('Close date editor',()=>{forms.replaceChildren();selectedCalendar=null;const b=board.querySelector('button[aria-pressed="true"]');board.querySelectorAll('button[data-day]').forEach(x=>{x.classList.remove('range-selected');x.removeAttribute('aria-pressed');});b?.focus({preventScroll:true});}));
  const selectedEntries=calendar.entries.filter(e=>e.startDate<=endDay&&e.endDate>=day);
  const selectedStatuses=new Set(selectedEntries.map(e=>e.status));let covered=day;for(const e of [...selectedEntries].sort((a,b)=>a.startDate.localeCompare(b.startDate))){if(e.startDate>covered)selectedStatuses.add('unknown');if(e.endDate>=endDay){covered=null;break;}if(e.endDate>=covered)covered=move(e.endDate,1);}if(covered!==null&&covered<=endDay)selectedStatuses.add('unknown');
  const sameNote=!selectedStatuses.has('unknown')&&selectedEntries.every(e=>e.note===selectedEntries[0]?.note);
  const initial={id:null,version:0,calendarVersion:calendar.version,startDate:day,endDate:endDay,status:selectedStatuses.size===1?[...selectedStatuses][0]:'',note:sameNote?(selectedEntries[0]?.note||''):''};
  forms.append(node('p','Saving replaces availability only for the selected dates. Days outside the selection keep their current availability and notes. Choose Not recorded to clear availability and notes for these dates.','field-help'));
  const dateEditor=editor(forms,'calendar/'+t.id+'/range/'+day+'/'+endDay,initial,'Availability dates',(form,d)=>{field(form,'Start date',d,'startDate','date').required=true;field(form,'End date',d,'endDate','date').required=true;const status=field(form,'Availability',d,'status','text',[['','Choose availability'],['available','Available'],['limited','Limited availability'],['unavailable','Unavailable'],['unknown','Not recorded']]);status.required=true;const note=field(form,'Availability note',d,'note','textarea');const showNote=()=>{note.closest('label').hidden=d.status==='unknown';};status.addEventListener('change',showNote);showNote();},`availability/${t.id}/entries`,'POST',d=>Object.fromEntries(['requestId','id','version','calendarVersion','startDate','endDate','status','note'].map(k=>[k,k==='note'&&d.status==='unknown'?'':d[k]])),{
   onSaved:()=>{const savedStart=dateEditor.d.startDate,savedEnd=dateEditor.d.endDate;selectedCalendar={personId:t.id,day:savedStart,endDay:savedEnd};const [start,end]=range();if(savedStart<start||savedStart>end)state.date=savedStart;},
   reviewLabel:'Apply my dates to the latest calendar',
   reviewConflict:async d=>{const latest=await request('availability/'+t.id);const affected=latest.entries.filter(e=>e.startDate<=d.endDate&&e.endDate>=d.startDate);return {version:0,calendarVersion:latest.version,message:'Latest saved availability in your selection: '+(affected.map(e=>`${e.startDate} to ${e.endDate}: ${statuses[e.status][1]}${e.note?' — '+e.note:''}`).join('; ')||'Not recorded')+'. Review these values before applying your draft.'};},
   onAcceptReview:(d,review)=>{d.calendarVersion=review.calendarVersion;}
  });
  const showSelection=()=>{const {startDate,endDate}=dateEditor.d;if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||endDate<startDate)return;selectedCalendar={personId:t.id,day:startDate,endDay:endDate};heading.textContent=t.name+' · '+(startDate===endDate?dateOf(startDate).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'}):startDate+' to '+endDate);board.querySelectorAll('button[data-day]').forEach(x=>{const selected=x.dataset.person===t.id&&x.dataset.day>=startDate&&x.dataset.day<=endDate;x.classList.toggle('range-selected',selected);x.setAttribute('aria-pressed',String(selected));});};
  dateEditor.form.addEventListener('input',showSelection);showSelection();
  if(focus){heading.focus({preventScroll:true});forms.scrollIntoView({behavior:'smooth',block:'start'});}
 }
 person.addEventListener('change',()=>{if(location.hash.startsWith('#availability/'))history.replaceState(null,'','#availability');draw();});scale.addEventListener('change',draw);date.addEventListener('change',()=>{if(date.validity.valid&&/^\d{4}-\d{2}-\d{2}$/.test(date.value)){state.date=date.value;draw();}else{state.date=lastValidDate;date.value=lastValidDate;}});
 await draw();
}
