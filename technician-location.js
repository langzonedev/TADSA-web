import {node,action,link,request,field,editor} from './project-care.js';
const editing=new Set();
export async function renderTechnicianLocation(view,id){
 const [calendar,options]=await Promise.all([request('availability/'+id),request('availability-options')]);
 const box=node('section',null,'panel technician-profile-location'),summary=node('div'),forms=node('div');box.append(node('h2','Location & service areas'),summary,forms);view.append(box);
 summary.append(node('p',[calendar.baseAddress,calendar.suburb,calendar.postcode].filter(Boolean).join(', ')||'Base location not recorded.'));
 const areas=calendar.serviceAreas.map(id=>options.serviceAreas.find(area=>area.id===id)?.label||id);summary.append(node('p',areas.length?'Service areas: '+areas.join(', '):'Service areas not recorded.'));
 const edit=action('Edit location & service areas',()=>{editing.add(id);draw();});summary.append(edit,link('View technician availability','availability/'+id));
 function draw(){edit.hidden=editing.has(id);forms.hidden=!editing.has(id);if(!editing.has(id)||forms.children.length)return;
  forms.append(node('p','These details belong to this technician and are used when matching projects by postcode or service area. They do not estimate travel distance.','field-help'));
  const location=editor(forms,'technician-location/'+id,{version:calendar.version,baseAddress:calendar.baseAddress||'',suburb:calendar.suburb||'',postcode:calendar.postcode||''},'Technician base location',(form,d)=>{const address=field(form,'Base address',d,'baseAddress');address.maxLength=500;const suburb=field(form,'Suburb or town',d,'suburb');suburb.maxLength=120;const code=field(form,'Postcode',d,'postcode');code.inputMode='numeric';code.maxLength=4;code.pattern='[0-9]{4}';},`availability/${id}/location`,'PUT',d=>Object.fromEntries(['requestId','version','baseAddress','suburb','postcode'].map(k=>[k,d[k]])));
  const coverage=editor(forms,'areas/'+id,{version:calendar.version,serviceAreas:[...calendar.serviceAreas]},'Service areas',(form,d)=>{for(const area of [...options.serviceAreas].sort((a,b)=>a.label.localeCompare(b.label,'en-AU'))){const check=field(form,area.label,{checked:d.serviceAreas.includes(area.id)},'checked','checkbox');check.onchange=()=>{d.serviceAreas=check.checked?[...d.serviceAreas,area.id]:d.serviceAreas.filter(x=>x!==area.id);};}},`availability/${id}/areas`,'PUT',d=>({requestId:d.requestId,version:d.version,serviceAreas:d.serviceAreas}));
  for(const [entry,label]of [[location,'Save base location'],[coverage,'Save service areas']]){const button=entry.form.querySelector('button[type=submit]');button.dataset.label=label;if(!entry.d.pending)button.textContent=label;}
 }
 draw();
}
