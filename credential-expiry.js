export function adelaideToday(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-AU',{timeZone:'Australia/Adelaide',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now).map(p=>[p.type,p.value]));
 return `${parts.year}-${parts.month}-${parts.day}`;
}
export function credentialExpiry(expiresOn,today=adelaideToday()){
 if(!expiresOn)return {status:'undated',label:'Expiry not recorded',days:null};
 const days=Math.round((Date.parse(expiresOn+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);
 if(!Number.isFinite(days))return {status:'undated',label:'Expiry not recorded',days:null};
 if(days<0)return {status:'expired',label:'Expired',days};
 if(days===0)return {status:'due',label:'Expires today',days};
 if(days<=30)return {status:'due',label:`Expires in ${days} day${days===1?'':'s'}`,days};
 return {status:'current',label:'More than 30 days remaining',days};
}
export function credentialExpiryReport(people,today=adelaideToday()){
 const rows=[];
 for(const person of people){let count=0;
  for(const [key,category]of [['clearances','Clearance'],['safetyTraining','Safety training'],['qualifications','Qualification']])for(const entry of person.credentials?.[key]??[]){count++;rows.push({personId:person.id,name:person.name,category,title:entry.title,expiresOn:entry.expiresOn,...credentialExpiry(entry.expiresOn,today)});}
  if(!count)rows.push({personId:person.id,name:person.name,category:'Credentials',title:'No credentials recorded',expiresOn:'',...credentialExpiry('',today)});
 }
 const order={expired:0,due:1,undated:2,current:3};
 rows.sort((a,b)=>order[a.status]-order[b.status]||(a.expiresOn||'9999').localeCompare(b.expiresOn||'9999')||a.name.localeCompare(b.name,'en-AU')||a.title.localeCompare(b.title,'en-AU'));
 return {today,warningDays:30,technicianCount:people.length,rows};
}
