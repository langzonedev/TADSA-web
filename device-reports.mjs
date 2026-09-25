import {installModelExtensions,fail} from './device-model.mjs';
import {validateReportQuery,applyReportQuery} from './report-model.js';
// Deliberately project only the reporting allowlist; never include case notes,
// credentials, banking information, file bodies, or other nested records.
export function deviceReportRows(d,dataset){
 const source=d[dataset];
 if(!Array.isArray(source)||source.length>10000)fail('This device report is limited to 10,000 source records.');
 if(dataset==='organisations')return source.map(o=>({id:o.id,name:o.name,category:o.category??'',email:o.email??'',role:o.role??'',description:o.description??''}));
 if(dataset==='people')return source.map(p=>({id:p.id,name:p.name,email:p.email??'',phone:p.phone??'',roles:p.active===false?[]:[...(p.roles??[])]}));
 if(d.people.length>10000||d.clients.length>10000)fail('This device report is limited to 10,000 linked people and clients.');
 let invoiceCount=0;
 const people=new Map(d.people.map(p=>[p.id,p.name])),clients=new Map(d.clients.map(c=>[c.id,c.personId]));
 return source.map(p=>{
  const operations=d.operations[p.id],quote=d.lifecycles[p.id]?.quotes?.at(-1),invoices=operations?.invoices;
  invoiceCount+=invoices?.length??0;
  if(invoiceCount>100000)fail('This device report contains too many invoice records. Use the database application for larger reports.');
  return {id:p.id,reference:p.reference,title:p.title,status:p.status,clientName:people.get(clients.get(p.clientId))??'',
   hoursWorked:typeof operations?.actualMinutes==='number'?operations.actualMinutes/60:null,
   hoursRemaining:operations?.workEstimateRecorded!==false&&typeof operations?.remainingMinutes==='number'?operations.remainingMinutes/60:null,
   quoteTotal:typeof quote?.totalCents==='number'?quote.totalCents/100:null,
   invoicedTotal:invoices?.length?invoices.reduce((sum,i)=>sum+i.snapshot.totalCents,0)/100:null};
 });
}
installModelExtensions(({d,parts,method,input,phase})=>{
 if(phase==='guard'||parts.join('/')!=='reports/query'||method!=='POST')return;
 const query=validateReportQuery(input);
 return applyReportQuery(deviceReportRows(d,query.dataset),query);
});
