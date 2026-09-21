import {installModelExtensions,dispatch,fail} from './device-model.mjs';
import {businessSettings,updateBusiness} from './device-business.mjs';
const areas=['western','southern','northern','eastern','adelaide-hills','metro','regional'];
const eligible=p=>p?.roles.includes('Administrator')&&p.roles.every(r=>['Administrator','Technician'].includes(r));
const location=(d,p,project)=>{const stored=d.workPlans[p.id]??{};return {projectId:p.id,version:p.version,address:stored.location||d.clients.find(c=>c.id===project(p).clientId)?.details?.workAddress||'',suburb:stored.suburb??'',postcode:stored.postcode??'',serviceArea:stored.serviceArea??''};};
const monthAt=at=>{const v=Object.fromEntries(new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Adelaide',year:'numeric',month:'2-digit'}).formatToParts(new Date(at)).map(x=>[x.type,x.value]));return v.year+'-'+v.month;};
installModelExtensions(ctx=>{
 const {d,parts,method,input,find,version,bump,project,ops,event,str}=ctx,[kind,id,sub]=parts;
 if(ctx.phase==='guard'){
  if(kind==='projects'&&sub==='work-plan'&&method==='PUT'&&input.ndisApproved&&!eligible(d.people.find(p=>p.id===input.ndisApprovedBy)))fail('Select an existing administrator as approver.');
  if(kind==='projects'&&sub==='operations'&&method==='PUT'){const before=ops(id),changed=input.approvedBy!==before.approvedBy||input.approvedOn!==before.approvedOn,stopping=input.clientStopped&&!before.clientStopped;if(!stopping&&((!d.lifecycles?.[id]&&input.workApproved&&(!before.workApproved||changed||input.actualMinutes>before.actualMinutes))||(!d.lifecycles?.[id]&&input.fundingExceptionReason&&(input.fundingExceptionReason!==before.fundingExceptionReason||changed))||(!d.lifecycles?.[id]&&before.clientStopped&&!input.clientStopped))&&!eligible(d.people.find(p=>p.id===input.approvedBy)))fail('Select an existing administrator as approver.');}
  return;
 }
 if(kind==='business-settings'){if(method==='GET')return structuredClone(businessSettings(d));if(method==='PUT')return updateBusiness(d,input,ctx);}
 if(kind==='availability'&&sub==='location'&&method==='PUT'){
  const person=find('people',id);if(!person.roles.includes('Technician'))fail('Select a technician.');const calendar=d.calendars[id]??{personId:id,version:0,serviceAreas:[],entries:[]};if(calendar.version!==input.version)fail('This calendar changed.',409,{code:'VERSION_CONFLICT'});const next={baseAddress:str(input.baseAddress,500),suburb:str(input.suburb,120),postcode:str(input.postcode,4)};if(next.postcode&&!/^\d{4}$/.test(next.postcode))fail('Postcode must contain four digits or be blank.');if(Object.keys(next).some(k=>(calendar[k]??'')!==next[k])){Object.assign(calendar,next);calendar.version++;event('people',id,'Technician base location updated',next);}d.calendars[id]=calendar;return calendar;
 }
 if(kind==='projects'&&sub==='location'){
  const p=find('projects',id);if(method==='GET')return location(d,p,project);
  if(method==='PUT'){version(p,input.version);const next={address:str(input.address,500),suburb:str(input.suburb,120),postcode:str(input.postcode,4),serviceArea:str(input.serviceArea,80)};if(next.postcode&&!/^\d{4}$/.test(next.postcode))fail('Postcode must contain four digits or be blank.');if(next.serviceArea&&!areas.includes(next.serviceArea))fail('Select a known service area.');const old=location(d,p,project);if(Object.keys(next).some(k=>old[k]!==next[k])){d.workPlans[id]={...d.workPlans[id],location:next.address,suburb:next.suburb,postcode:next.postcode,serviceArea:next.serviceArea};if(d.operations[id]){d.operations[id].workApproved=false;d.operations[id].reviewRequired=true;}bump(p,'Project location updated',{from:old,to:next});}return location(d,p,project);}
 }
 if(kind==='projects'&&sub==='technician-matches'&&method==='GET'){const p=find('projects',id),where=location(d,p,project),directory=dispatch(d,'technicians'),items=directory.items.map(t=>{const skillMatch=p.coordination.requiredSkills.every(s=>t.skills.includes(s)),postcodeMatch=where.postcode&&t.postcode?where.postcode===t.postcode:null,areaMatch=where.serviceArea?t.serviceAreas.includes(where.serviceArea):null;return {...t,skillMatch,postcodeMatch,areaMatch,matchLevel:!skillMatch?'missing-skills':postcodeMatch?'same-postcode':areaMatch?'service-area':'skills-only',matchReasons:[skillMatch?'All requested skills recorded':'Requested skills are missing',postcodeMatch?'Same recorded postcode':areaMatch?'Serves the selected area':'Location fit not established']};});const rank={'same-postcode':0,'service-area':1,'skills-only':2,'missing-skills':3};items.sort((a,b)=>rank[a.matchLevel]-rank[b.matchLevel]||a.openCount-b.openCount||a.name.localeCompare(b.name));return {projectId:id,location:where,items};}
 if(kind==='reports'&&method==='GET'){
  const month=ctx.query.get('month');
  if(typeof month!=='string'||!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month.startsWith('0000-'))fail('Select a month using YYYY-MM.');
  if(d.projects.length>10000||d.people.length>10000)fail('This device report is limited to 10,000 projects and people.');
  let scanned=d.statusEvents.length;
  for(const p of d.projects){scanned+=(d.operations[p.id]?.invoices?.length??0)+(d.workPlans[p.id]?.payments?.length??0);if(scanned>100000)fail('This device report contains too many activity records. Use the database application for larger reports.');}
  if(scanned>100000)fail('This device report contains too many activity records. Use the database application for larger reports.');
  const projectList=d.projects.map(({id,reference,title,status})=>({id,reference,title,status})),byId=new Map(projectList.map(p=>[p.id,p])),knownCreated=new Set(),knownClosed=new Set(),events=[];
  for(const e of d.statusEvents){if(e.fromStatus===null)knownCreated.add(e.id);if(e.toStatus==='closed')knownClosed.add(e.id);if(monthAt(e.at)===month&&byId.has(e.id))events.push({...e,...byId.get(e.id)});}
  events.sort((a,b)=>b.at.localeCompare(a.at));
  const unique=items=>[...new Map([...items].sort((a,b)=>a.at.localeCompare(b.at)).map(x=>[x.id,x])).values()],created=events.filter(x=>x.fromStatus===null),closed=events.filter(x=>x.toStatus==='closed'),reopened=events.filter(x=>x.fromStatus==='closed'&&x.toStatus!=='closed'),recent=events.slice(0,100),open=projectList.filter(p=>p.status!=='closed'),statusCounts={open:0,review:0,closed:0};
  for(const p of projectList)statusCounts[p.status]++;
  const assignments=new Map();
  for(const p of d.projects){if(p.status==='closed')continue;for(const id of p.coordination.technicianIds){const value=assignments.get(id)??{projectCount:0,remainingMinutes:0};value.projectCount++;value.remainingMinutes+=d.operations[p.id]?.remainingMinutes??0;assignments.set(id,value);}}
  const workload=d.people.filter(p=>p.roles.includes('Technician')).map(p=>({id:p.id,name:p.name,...(assignments.get(p.id)??{projectCount:0,remainingMinutes:0})})).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,100);
  const invoices=[],payments=[];let invoicedCents=0,receivedCents=0;
  for(const p of d.projects){
   const invoiceRows=d.operations[p.id]?.invoices??[],numbers=new Map(invoiceRows.map(i=>[i.id,i.number]));
   for(const i of invoiceRows)if((i.snapshot.invoiceDate?.slice(0,7)??monthAt(i.at))===month){invoicedCents+=i.snapshot.totalCents;if(invoices.length<100)invoices.push({...i,projectId:p.id,projectReference:p.reference});}
   for(const pay of d.workPlans[p.id]?.payments??[])if(pay.receivedOn.startsWith(month+'-')){receivedCents+=pay.amountCents;if(payments.length<100)payments.push({...pay,projectId:p.id,number:numbers.get(pay.invoiceId)});}
  }
  return {month,timeZone:'Australia/Adelaide',detailLimit:100,detailNotice:'Lists are limited to 100 records and activity lists use the latest 100 events. Totals include all matching records.',created:{count:unique(created).length,items:unique(recent.filter(x=>x.fromStatus===null)),unknownHistoricalCount:projectList.filter(p=>!knownCreated.has(p.id)).length},closed:{count:unique(closed).length,eventCount:closed.length,items:unique(recent.filter(x=>x.toStatus==='closed')),unknownHistoricalCount:projectList.filter(p=>p.status==='closed'&&!knownClosed.has(p.id)).length},reopened:{count:unique(reopened).length,eventCount:reopened.length,items:unique(recent.filter(x=>x.fromStatus==='closed'&&x.toStatus!=='closed'))},currentOpen:{count:open.length,items:open.slice(0,100)},statusCounts,workload,billing:{invoicedCents,receivedCents,invoices,payments}};
 }
});
