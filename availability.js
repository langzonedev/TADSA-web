import {node,action,link,notice,request,field,editor} from './project-care.js';
const localDay=date=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const move=(day,n)=>{const d=new Date(day+'T12:00:00');d.setDate(d.getDate()+n);return localDay(d);};
const dateOf=day=>new Date(day+'T12:00:00');
const state={technician:'all',scale:'week',date:localDay(new Date())};
let selectedCalendar=null,resetOnEntry=false;
window.addEventListener('hashchange',event=>{if(new URL(event.oldURL).hash.startsWith('#availability')&&!location.hash.startsWith('#availability'))resetOnEntry=true;});
const statuses={available:['✓','Available'],limited:['◐','Limited availability'],unavailable:['×','Unavailable'],unknown:['?','Not recorded']};
function range(){
 const d=dateOf(state.date),year=d.getFullYear();
 if(state.scale==='week'){const start=move(state.date,-((d.getDay()+6)%7));return [start,move(start,6)];}
 if(state.scale==='month')return [localDay(new Date(year,d.getMonth(),1)),localDay(new Date(year,d.getMonth()+1,0))];
 return [state.date,`${year}-12-31`];
}
export async function renderAvailability(view,personId,isCurrent=()=>true){
 if(personId)state.technician=personId;else if(resetOnEntry){state.technician='all';selectedCalendar=null;}resetOnEntry=false;
 const technicians=await request('technicians');if(!isCurrent())return;
 const people=[...technicians.items].sort((a,b)=>a.name.localeCompare(b.name,'en-AU'));
 if(state.technician!=='all'&&!people.some(t=>t.id===state.technician))state.technician='all';
 view.classList.add('availability-workspace');
 view.append(node('h1','Calendar availability'),node('p','Compare all technicians below. Select dates in one row, choose a status, then Save availability. Calendar dates and the general allocation status both need checking before assigning work.','subtitle'));
 const controls=node('div',null,'availability-controls'),board=node('section',null,'availability-timeline'),forms=node('section',null,'availability-editor');view.append(controls,forms,board);
 const person=field(controls,'Technician',state,'technician','text',[['all','All technicians'],...people.map(t=>[t.id,t.name])]);
 const all=action('Show all technicians',()=>{state.technician='all';person.value='all';selectedCalendar=null;if(location.hash.startsWith('#availability/'))history.replaceState(null,'','#availability');draw();});controls.append(all);
 const scale=field(controls,'View',state,'scale','text',[['week','Week'],['month','Month'],['year','Year']]);
 const date=field(controls,'Date',state,'date','date');date.min='1900-01-01';date.max='9998-12-31';
 const arrows=node('div',null,'actions availability-period-controls');
 const changePeriod=n=>{const previousDate=state.date,d=dateOf(state.date);if(state.scale==='week')state.date=move(state.date,n*7);else if(state.scale==='month')state.date=localDay(new Date(d.getFullYear(),d.getMonth()+n,1));else state.date=localDay(new Date(d.getFullYear()+n,0,1));if(state.date<'1900-01-01'||state.date>'9998-12-31'){state.date=previousDate;return;}date.value=state.date;draw();};
 arrows.append(action('← Previous',()=>changePeriod(-1)),action('Today',()=>{state.date=localDay(new Date());date.value=state.date;draw();}),action('Next →',()=>changePeriod(1)));controls.append(arrows);let pickingRange=false,rangeStart=null;const rangeButton=action('Select date range',()=>{pickingRange=!pickingRange;rangeStart=null;rangeButton.setAttribute('aria-pressed',String(pickingRange));rangeButton.textContent=pickingRange?'Cancel range selection':'Select date range';rangeHint.textContent=pickingRange?'Select the first day, then the last day in the same technician’s row.':'Tip: drag across days with a mouse, or use Select date range. Shift + click also selects a range.';});rangeButton.setAttribute('aria-pressed','false');controls.append(rangeButton);const rangeHint=node('p','Tip: drag across days with a mouse, or use Select date range. Shift + click also selects a range.','field-help');view.append(rangeHint);view.insertBefore(rangeHint,board);
 const legend=node('div',null,'availability-legend availability-status-controls');legend.setAttribute('role','group');legend.setAttribute('aria-label','Set availability for selected dates');const statusButtons=new Map();let activeEditor=null;
 const selectionHelp=node('p','Select a technician’s dates to enable these status buttons.','availability-selection-help');selectionHelp.setAttribute('role','status');
 for(const [key,[symbol,label]]of Object.entries(statuses)){const b=action(`${symbol} ${label}`,()=>{if(!activeEditor||activeEditor.d.pending)return;activeEditor.statusControl.value=key;activeEditor.statusControl.dispatchEvent(new Event('change',{bubbles:true}));});b.className='availability-status '+key;b.dataset.actionStyle='navigation';b.setAttribute('aria-label','Set '+label.toLowerCase());b.setAttribute('aria-pressed','false');b.disabled=true;statusButtons.set(key,b);legend.append(b);}
 view.insertBefore(legend,forms);view.insertBefore(selectionHelp,forms);
 const resetCells=()=>board.querySelectorAll('button[data-day]').forEach(x=>{for(const key of Object.keys(statuses))x.classList.toggle(key,key===x.dataset.savedStatus);x.textContent=statuses[x.dataset.savedStatus]?.[0]||'?';x.title=x.dataset.savedTitle;x.setAttribute('aria-label',x.dataset.savedLabel);x.classList.remove('availability-draft');});
 const disableStatusButtons=()=>{activeEditor=null;for(const b of statusButtons.values()){b.disabled=true;b.setAttribute('aria-pressed','false');}selectionHelp.textContent='Select a technician’s dates to enable these status buttons.';};
 const calendars=new Map(),loadWaiters=[];let activeLoads=0,generation=0,lastValidDate=state.date;
 async function draw(){
  pickingRange=false;rangeStart=null;rangeButton.textContent='Select date range';rangeButton.setAttribute('aria-pressed','false');lastValidDate=state.date;const current=++generation,[start,end]=range(),visible=people.filter(t=>state.technician==='all'||t.id===state.technician);
  board.replaceChildren(notice('Loading availability…'));board.setAttribute('aria-busy','true');forms.replaceChildren();disableStatusButtons();all.hidden=state.technician==='all';
  let cursor=0;const failures=new Set();
  await Promise.all(Array.from({length:Math.min(4,visible.length)},async()=>{while(cursor<visible.length){if(current!==generation||!isCurrent())return;const t=visible[cursor++];if(calendars.has(t.id))continue;while(activeLoads>=4)await new Promise(resolve=>loadWaiters.push(resolve));if(current!==generation||!isCurrent()){loadWaiters.shift()?.();return;}if(calendars.has(t.id)){loadWaiters.shift()?.();continue;}activeLoads++;try{calendars.set(t.id,await request('availability/'+t.id));}catch{failures.add(t.id);}finally{activeLoads--;loadWaiters.shift()?.();}}}));
  if(current!==generation||!isCurrent())return;
  board.replaceChildren();board.removeAttribute('aria-busy');
  const formattedDays=new Map(),dateFormatter=new Intl.DateTimeFormat('en-AU',{day:'numeric',month:'short',year:'numeric'});const format=day=>{if(!formattedDays.has(day))formattedDays.set(day,dateFormatter.format(dateOf(day)));return formattedDays.get(day);};
  board.append(node('h2',`${format(start)} – ${format(end)}`));
  if(!visible.length){board.append(notice('No current technicians are listed. Choose an existing person and add the Technician role to their profile, or add a person if they are not in the directory.'),link('Choose an existing person','people'),link('Add a new person','new-person'));return;}
  if(failures.size){board.append(notice('Some calendars could not load. Their availability is not shown.',true),action('Retry calendars',draw));}
  board.append(node('p',state.scale==='year'?'Year view shows the selected date to 31 December. Scroll across to later dates.':'Scroll across if needed. Unrecorded dates are unknown; confirm availability before assigning work.','field-help'));
  const days=[];for(let day=start;day<=end;day=move(day,1))days.push(day);
  const scroll=node('div',null,'availability-scroll');scroll.tabIndex=0;scroll.setAttribute('role','region');scroll.setAttribute('aria-label','Technician availability calendar, scroll horizontally for more dates');
  const table=node('table',null,'availability-table '+state.scale);table.setAttribute('aria-label',`${state.scale} availability, ${format(start)} to ${format(end)}`);
  const head=node('thead'),hr=node('tr'),corner=node('th','Technician');corner.scope='col';hr.append(corner);
  for(const day of days){const th=node('th');th.scope='col';th.append(node('span',dateOf(day).toLocaleDateString('en-AU',{month:'short'})),node('strong',dateOf(day).toLocaleDateString('en-AU',{day:'numeric'})),node('small',dateOf(day).toLocaleDateString('en-AU',{weekday:'short'})));if(day===localDay(new Date()))th.className='today';hr.append(th);}head.append(hr);table.append(head);
  const body=node('tbody');let first=true;
  for(const t of visible){const row=node('tr'),name=node('th');name.scope='row';name.append(link(t.name,'person/'+t.id),node('small','General allocation: '+(t.availability==='unknown'?'Not recorded':t.availability)));row.append(name);const calendar=calendars.get(t.id);
   if(!calendar){const cell=node('td','Calendar unavailable');cell.colSpan=days.length;row.append(cell);body.append(row);continue;}
   let entryIndex=0;const entries=[...calendar.entries].sort((a,b)=>a.startDate.localeCompare(b.startDate));
   for(const day of days){while(entryIndex<entries.length&&entries[entryIndex].endDate<day)entryIndex++;const candidate=entries[entryIndex],entry=candidate&&candidate.startDate<=day&&candidate.endDate>=day?candidate:null,key=entry?.status||'unknown',[symbol,label]=statuses[key]||statuses.unknown;
    const cell=node('td'),b=node('button',symbol,'availability-cell '+key);b.type='button';b.dataset.person=t.id;b.dataset.day=day;b.tabIndex=first?0:-1;first=false;b.title=`${t.name} · ${format(day)} · ${label}${entry?.note?' · '+entry.note:''}`;b.setAttribute('aria-label',`${t.name}, ${format(day)}: ${label}. Edit availability`);b.dataset.savedStatus=key;b.dataset.savedTitle=b.title;b.dataset.savedLabel=b.getAttribute('aria-label');if(selectedCalendar?.personId===t.id&&selectedCalendar.day===day)b.setAttribute('aria-pressed','true');cell.append(b);row.append(cell);
   }body.append(row);
  }table.append(body);scroll.append(table);board.append(scroll);
  const selectedCell=table.querySelector('button[aria-pressed="true"]');if(selectedCell){table.querySelector('button[tabindex="0"]')?.setAttribute('tabindex','-1');selectedCell.tabIndex=0;requestAnimationFrame(()=>{if(isCurrent())scroll.scrollLeft=Math.max(0,selectedCell.closest('td').offsetLeft-210);});}
  let drag=null,suppressClick=false;
  const markRange=(personId,a,b)=>{const lo=a<b?a:b,hi=a<b?b:a;table.querySelectorAll('button[data-day]').forEach(x=>{const selected=x.dataset.person===personId&&x.dataset.day>=lo&&x.dataset.day<=hi;x.classList.toggle('range-selected',selected);x.setAttribute('aria-pressed',String(selected));});};
  const chooseRange=(a,b)=>{if(a.personId!==b.personId){rangeHint.textContent='Select the last day in the same technician’s row.';return;}const lo=a.day<b.day?a.day:b.day,hi=a.day<b.day?b.day:a.day;pickingRange=false;rangeStart=null;rangeButton.textContent='Select date range';rangeButton.setAttribute('aria-pressed','false');rangeHint.textContent='Date range selected. Choose a status above the calendar, then Save availability.';markRange(a.personId,lo,hi);table.querySelectorAll('button[data-day]').forEach(x=>{x.removeAttribute('aria-pressed');if(x.dataset.person===a.personId&&x.dataset.day===lo)x.setAttribute('aria-pressed','true');});edit(people.find(t=>t.id===a.personId),calendars.get(a.personId),lo,true,hi);};
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
  selectedCalendar={personId:t.id,day,endDay};forms.replaceChildren();const heading=node('h2',`${t.name} · ${dateOf(day).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'})}`);heading.tabIndex=-1;forms.append(heading,action('Close date editor',()=>{forms.replaceChildren();selectedCalendar=null;disableStatusButtons();resetCells();const b=board.querySelector('button[aria-pressed="true"]');board.querySelectorAll('button[data-day]').forEach(x=>{x.classList.remove('range-selected');x.removeAttribute('aria-pressed');});b?.focus({preventScroll:true});}));
  const selectedEntries=calendar.entries.filter(e=>e.startDate<=endDay&&e.endDate>=day);
  const selectedStatuses=new Set(selectedEntries.map(e=>e.status));let covered=day;for(const e of [...selectedEntries].sort((a,b)=>a.startDate.localeCompare(b.startDate))){if(e.startDate>covered)selectedStatuses.add('unknown');if(e.endDate>=endDay){covered=null;break;}if(e.endDate>=covered)covered=move(e.endDate,1);}if(covered!==null&&covered<=endDay)selectedStatuses.add('unknown');
  const sameNote=!selectedStatuses.has('unknown')&&selectedEntries.every(e=>e.note===selectedEntries[0]?.note);
  const initial={id:null,version:0,calendarVersion:calendar.version,startDate:day,endDate:endDay,status:selectedStatuses.size===1?[...selectedStatuses][0]:'',note:sameNote?(selectedEntries[0]?.note||''):''};

  let statusControl;
  const dateEditor=editor(forms,'calendar/'+t.id+'/range/'+day+'/'+endDay,initial,null,(form,d)=>{
   const details=node('details',null,'availability-date-details');details.append(node('summary','Dates and optional note'));const fields=node('div',null,'availability-detail-fields');details.append(fields);form.append(details);
   field(fields,'Start date',d,'startDate','date').required=true;field(fields,'End date',d,'endDate','date').required=true;
   statusControl=field(fields,'Availability',d,'status','text',[['','Choose availability'],['available','Available'],['limited','Limited availability'],['unavailable','Unavailable'],['unknown','Not recorded']]);
   const note=field(fields,'Availability note',d,'note','textarea');const showNote=()=>{note.closest('label').hidden=d.status==='unknown';};statusControl.addEventListener('change',showNote);showNote();
   fields.append(node('p','Saving replaces availability only for these dates. Other dates are kept. Not recorded clears availability and notes for the selected dates.','field-help'));
  },`availability/${t.id}/entries`,'POST',d=>{if(!statuses[d.status])throw Error('Choose an availability status using the buttons above the calendar.');return Object.fromEntries(['requestId','id','version','calendarVersion','startDate','endDate','status','note'].map(k=>[k,k==='note'&&d.status==='unknown'?'':d[k]]));},{
   saveLabel:'Save availability',
   draftReview:{route:'availability/'+t.id,label:'Availability — '+t.name+' · '+day+' to '+endDay,restore:()=>{state.technician=t.id;state.date=day;selectedCalendar={personId:t.id,day,endDay};resetOnEntry=false;}},
   onSaved:()=>{const savedStart=dateEditor.d.startDate,savedEnd=dateEditor.d.endDate;selectedCalendar={personId:t.id,day:savedStart,endDay:savedEnd};const [start,end]=range();if(savedStart<start||savedStart>end)state.date=savedStart;},
   reviewLabel:'Apply my dates to the latest calendar',
   reviewConflict:async d=>{const latest=await request('availability/'+t.id);const affected=latest.entries.filter(e=>e.startDate<=d.endDate&&e.endDate>=d.startDate);return {version:0,calendarVersion:latest.version,message:'Latest saved availability in your selection: '+(affected.map(e=>`${e.startDate} to ${e.endDate}: ${statuses[e.status][1]}${e.note?' — '+e.note:''}`).join('; ')||'Not recorded')+'. Review these values before applying your draft.'};},
   onAcceptReview:(d,review)=>{d.calendarVersion=review.calendarVersion;}
  });
  activeEditor={...dateEditor,statusControl};for(const b of statusButtons.values())b.disabled=Boolean(dateEditor.d.pending);
  const showSelection=()=>{const {startDate,endDate,status}=dateEditor.d;if(!/^\d{4}-\d{2}-\d{2}$/.test(startDate)||!/^\d{4}-\d{2}-\d{2}$/.test(endDate)||endDate<startDate)return;
   selectedCalendar={personId:t.id,day:startDate,endDay:endDate};const dates=startDate===endDate?dateOf(startDate).toLocaleDateString('en-AU',{day:'numeric',month:'long',year:'numeric'}):startDate+' to '+endDate;
   heading.textContent=t.name+' · '+dates;const dirty=['startDate','endDate','status','note'].some(key=>dateEditor.d[key]!==initial[key]);
   selectionHelp.textContent=dirty?`${t.name}: unsaved preview — ${statuses[status]?.[1]||'choose a status'}. Select Save availability to keep this change.`:`${t.name}: ${statuses[status]?.[1]||'Mixed availability'} for selected dates. Choose a status to make a change.`;
   for(const [key,b]of statusButtons){b.setAttribute('aria-pressed',String(key===status));b.disabled=Boolean(dateEditor.d.pending);}
   resetCells();board.querySelectorAll('button[data-day]').forEach(x=>{const selected=x.dataset.person===t.id&&x.dataset.day>=startDate&&x.dataset.day<=endDate;x.classList.toggle('range-selected',selected);x.setAttribute('aria-pressed',String(selected));if(selected&&statuses[status]){for(const key of Object.keys(statuses))x.classList.toggle(key,key===status);x.textContent=statuses[status][0];x.classList.toggle('availability-draft',dirty);x.title=x.dataset.savedTitle+(dirty?' · Unsaved preview: '+statuses[status][1]:'');x.setAttribute('aria-label',x.dataset.savedLabel+(dirty?' Unsaved preview: '+statuses[status][1]+'.':''));}});
  };
  dateEditor.form.addEventListener('input',showSelection);dateEditor.form.addEventListener('change',showSelection);showSelection();
  // Keep focus and the selected cells in place so the top status buttons are
  // reachable without jumping down to a second editing area.
  if(focus)heading.scrollIntoView({behavior:'smooth',block:'nearest'});

 }
 person.addEventListener('change',()=>{if(location.hash.startsWith('#availability/'))history.replaceState(null,'','#availability');draw();});scale.addEventListener('change',draw);date.addEventListener('change',()=>{if(date.validity.valid&&/^\d{4}-\d{2}-\d{2}$/.test(date.value)){state.date=date.value;draw();}else{state.date=lastValidDate;date.value=lastValidDate;}});
 await draw();
}
