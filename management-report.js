// Shared report definitions. No writes and no inference of sending, payment or delivery.
const zone=new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Adelaide',year:'numeric',month:'2-digit'});
export function reportMonth(at){if(!at)return '';const d=new Date(at);if(!Number.isFinite(d.valueOf()))return '';const p=Object.fromEntries(zone.formatToParts(d).map(x=>[x.type,x.value]));return p.year+'-'+p.month;}
const dayMonth=day=>typeof day==='string'?day.slice(0,7):'';
const unique=rows=>[...new Map(rows.map(p=>[p.id,p])).values()];
const sum=(rows,key)=>rows.reduce((n,r)=>n+(r[key]??0),0);
export function buildManagementReport(data,month){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||month.startsWith('0000'))throw Object.assign(Error('Select a valid reporting month.'),{status:422});
 const {projects=[],events=[],invoices=[],feedback=[],technicians=[]}=data;
 if(projects.length>10000||technicians.length>10000||events.length+invoices.length+feedback.length+projects.reduce((n,p)=>n+(p.history?.length??0),0)>100000)throw Object.assign(Error('Management report exceeds its supported record limit. Narrow the source workspace before reporting.'),{status:422});
 const byId=new Map(projects.map(p=>[p.id,p])),invoiceMap=new Map();let linesScanned=0;
 for(const invoice of invoices){const list=invoiceMap.get(invoice.projectId)??[];list.push(invoice);invoiceMap.set(invoice.projectId,list);linesScanned+=invoice.snapshot?.lines?.length??0;}
 if(linesScanned>1000000)throw Object.assign(Error('Too many invoice lines for this report.'),{status:422});
 const inMonth=events.filter(e=>reportMonth(e.at)===month&&byId.has(e.projectId));
 const cohort=predicate=>unique(inMonth.filter(predicate).map(e=>byId.get(e.projectId)));
 const created=cohort(e=>e.fromStatus===null),closed=cohort(e=>e.toStatus==='closed');
 const history=projects.flatMap(p=>(p.history??[]).map((event,index)=>({...event,project:p,index})));
 const cancelled=unique(history.filter(e=>e.action==='cancel'&&reportMonth(e.at)===month).map(e=>e.project));
 const programme=e=>e.programme??e.project.programme??'';
 const latestPerProject=rows=>[...rows.reduce((map,e)=>{const old=map.get(e.project.id);if(!old||e.at>old.at||e.at===old.at&&e.index>old.index)map.set(e.project.id,e);return map;},new Map()).values()];
 const deliveries=latestPerProject(history.filter(e=>e.action==='work'&&e.data?.deliveredOn&&Number.isInteger(e.data.deliveredQuantity))).filter(e=>programme(e)==='FW'&&dayMonth(e.data.deliveredOn)===month);
 const deliveryProjects=deliveries.map(e=>e.project);
 const cancellations=latestPerProject(history.filter(e=>e.action==='cancel'&&programme(e)==='FW'&&reportMonth(e.at)===month));
 const issues=[...new Map(history.filter(e=>e.action==='issueQuote'&&programme(e)==='FW'&&dayMonth(e.data?.sentOn)===month).map(e=>[e.project.id+'/'+e.data.quoteVersion,e])).values()];
 const feedbackProjects=unique(feedback.filter(f=>f.completed===true&&dayMonth(f.recordedOn)===month&&byId.has(f.projectId)).map(f=>byId.get(f.projectId)));
 const compact=p=>({id:p.id,reference:p.reference??'',title:p.title??p.name??''});
 function metric(key,label,value,unit,definition,rows=[],missingCount=0,knownValue=value){return {key,label,value,unit,definition,missingCount,knownValue,count:rows.length,items:rows.slice(0,100).map(compact)};}
 function invoiceMetrics(rows,prefix,label){let total=0,fee=0,missing=0;
  for(const p of rows)for(const i of invoiceMap.get(p.id)??[]){const snap=i.snapshot,totalLines=sum(snap.lines??[],'amountCents');total+=snap.totalCents??0;
   if(!snap.lines?.length||snap.lines.some(l=>!l.category||l.category==='unclassified')){missing++;}
   const service=sum((snap.lines??[]).filter(l=>l.category==='service_charge'),'amountCents');
   // Allocate the saved invoice total (including its recorded tax) proportionately.
   if(totalLines>0)fee+=Math.round(service*(snap.totalCents??0)/totalLines);
  }
  return [metric(prefix+'Invoices','Recorded invoices — '+label,total,'currency','Whole-project draft invoice totals, regardless of invoice date; includes the tax recorded in each invoice. Not official Finance reconciliation.',rows),metric(prefix+'ServiceCharges','Service charges — '+label,missing?null:fee,'currency','Only invoice lines explicitly classified Service charge, with their proportional share of recorded invoice tax. Unclassified invoices make this total incomplete.',rows,missing,fee)];
 }
 const unknownHours=closed.filter(p=>!Number.isFinite(p.actualMinutes)).length,knownHours=closed.reduce((n,p)=>n+(Number.isFinite(p.actualMinutes)?p.actualMinutes:0),0)/60;
 const unknownCancelled=cancellations.filter(e=>!Number.isInteger(e.data?.cancelledQuantity)).length,knownCancelled=cancellations.reduce((n,e)=>n+(e.data?.cancelledQuantity??0),0);
 const knownCreation=new Set(events.filter(e=>e.fromStatus===null).map(e=>e.projectId)),knownClosure=new Set(events.filter(e=>e.toStatus==='closed').map(e=>e.projectId));
 const anyDelivery=new Set(history.filter(e=>e.action==='work'&&e.data?.deliveredOn&&Number.isInteger(e.data.deliveredQuantity)).map(e=>e.project.id));
 const missingDelivery=unique(history.filter(e=>programme(e)==='FW'&&e.action==='work'&&e.data?.status==='complete'&&!anyDelivery.has(e.project.id)).map(e=>e.project)).length;
 const unknownProgrammes=projects.filter(p=>!p.programme).length;
 return {month,groups:[
  {key:'projects',label:'Projects · all programmes, including Freedom Wheels',metrics:[
   metric('created','Projects created',created.length,'count','Recorded creation date in this month, not an inferred enquiry-received date.',created),
   metric('closed','Projects closed',closed.length,'count','Distinct projects with a closure event in this month, including cancelled closures and projects subsequently reopened.',closed),
   metric('closedHours','Recorded hours — closed projects',unknownHours?null:knownHours,'hours','Current whole-project recorded hours, counted once per project closed in this month. Includes Freedom Wheels; not just hours worked during this month.',closed,unknownHours,knownHours),
   ...invoiceMetrics(closed,'closed','closed projects'),
   metric('cancelled','Projects cancelled',cancelled.length,'count','Distinct projects with a cancellation recorded in this month, independent of later closure or reopening.',cancelled)]},
  {key:'freedomWheels',label:'Freedom Wheels',metrics:[
   metric('fwQuotesIssued','Quote revisions recorded as sent',issues.length,'count','One per project and quote revision, by the explicitly recorded sent date. Saving or downloading a quote is not counted.',unique(issues.map(e=>e.project))),
   metric('fwBikesDelivered','Bikes delivered · final handover',deliveries.reduce((n,e)=>n+e.data.deliveredQuantity,0),'count','Total bikes for projects whose final handover date is in this month. Latest explicit delivery record replaces earlier corrections; partial deliveries are not counted until final handover.',deliveryProjects),
   ...invoiceMetrics(deliveryProjects,'fwDelivered','delivered projects'),
   metric('fwBikesCancelled','Bikes cancelled',unknownCancelled?null:knownCancelled,'count','Explicit total bike quantity in each project’s latest cancellation during this month. Missing quantities are not treated as zero.',cancellations.map(e=>e.project),unknownCancelled,knownCancelled)]},
  {key:'feedback',label:'Feedback',metrics:[metric('feedbackCompleted','Projects with completed feedback',feedbackProjects.length,'count','Distinct projects with an explicitly completed response dated in this month. Follow-up comments and older unclassified entries are not completed responses.',feedbackProjects)]},
  {key:'technicians',label:'Technical members · current position',metrics:[metric('activeTechnicians','Active technician profiles now',unique(technicians).length,'count','Current distinct people with an active Technician role. This is not a historical month-end membership or availability count.',unique(technicians))]}
 ],coverage:{unknownClosure:projects.filter(p=>p.status==='closed'&&!knownClosure.has(p.id)).length,missingDelivery,unknownCreation:projects.filter(p=>!knownCreation.has(p.id)).length,unknownProgramme:unknownProgrammes,unclassifiedFeedback:feedback.filter(f=>f.completed===undefined&&dayMonth(f.recordedOn)===month).length,legacyProgrammeEvents:history.filter(e=>['cancel','work','issueQuote'].includes(e.action)&&e.programme==null).length},notice:'Based on currently saved records. Corrections can restate earlier months. Projects includes Freedom Wheels; do not add the two groups together. Monetary figures are recorded draft invoice amounts, not bank or official Finance reconciliation.'};
}
export function managementReportCsv(report){
 const cell=value=>'"'+String(value??'').replace(/"/g,'""')+'"';
 const rows=[['Month','Group','Measure','Value','Unit','Missing records','Known portion','Definition']];
 for(const group of report.groups)for(const m of group.metrics)rows.push([report.month,group.label,m.label,m.value===null?'Not fully recorded':m.unit==='currency'?(m.value/100).toFixed(2):m.value,m.unit,m.missingCount,m.unit==='currency'?(m.knownValue/100).toFixed(2):m.knownValue,m.definition]);
 const coverageLabels={unknownCreation:'Projects without creation history',unknownClosure:'Closed projects without closure history',missingDelivery:'Completed FW projects without final delivery evidence',unknownProgramme:'Projects without a programme',unclassifiedFeedback:'Feedback entries this month without completion classification',legacyProgrammeEvents:'Historical workflow events using current programme'};
 for(const [key,count]of Object.entries(report.coverage))rows.push([report.month,'Reporting basis',coverageLabels[key],count,'count','','','Coverage across saved records, except feedback entries which use the selected month. Missing event dates are not allocated to a month.']);
 rows.push([report.month,'Reporting basis','Definitions','','','','',report.notice]);
 return '\ufeff'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
