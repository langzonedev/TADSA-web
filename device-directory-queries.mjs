// Pure reads over fictional device records. No graph hydration or storage writes.
const kinds={clients:['client','client'],people:['person','person'],organisations:['org','organisation']};
const knownRoles=['Client','Technician','Occupational therapist','Administrator','Carer','Referrer','Allied-health contact','Funder'];
const fail=(message,status=422)=>{throw Object.assign(Error(message),{status});};
const validText=(s,max)=>typeof s==='string'&&s.length<=max&&!/[\u0000-\u001f\u007f]/.test(s);
const idOf=(kind,id)=>{if(!Object.hasOwn(kinds,kind)||typeof id!=='string'||!new RegExp('^'+kinds[kind][0]+'-[0-9]{1,20}$').test(id))fail('Choose a valid selection identity.');return id;};
const compare=(a,b)=>{const x=Array.from(a),y=Array.from(b);for(let i=0;i<Math.min(x.length,y.length);i++){const delta=x[i].codePointAt(0)-y[i].codePointAt(0);if(delta)return Math.sign(delta);}return Math.sign(x.length-y.length);};
const statusMatch=(r,status)=>status==='all'||r.directoryStatus===status||status==='active'&&['current','review'].includes(r.directoryStatus);
const publicSelection=({technicianEligible,workSearch,description,category,nameKey,projectCount,...row})=>row;
const publicRegister=({technicianEligible,workSearch,nameKey,type,...row})=>row;
function rows(d,kind,register=false){
 const clients=new Map(d.clients.map(c=>[c.personId,c])),people=new Map(d.people.map(p=>[p.id,p]));
 const person=(p,c)=>{const roles=[...new Set(p.roles??[p.role])].sort(compare),owner=clients.get(p.id),details=(c??(register?owner:null))?.details??{};return {id:c?.id??p.id,name:p.name,type:c?'client':'person',personId:p.id,clientId:owner?.id??null,reference:c||register&&owner?'CL-'+(c??owner).id.slice(7):register?'':null,roles,directoryStatus:d.profileDetails?.[p.id]?.contact?.directoryStatus??'current',email:p.email??'',phone:p.phone??'',address:details.residentialAddress??'',suburb:details.residentialSuburb??'',state:details.residentialState??'',postcode:details.residentialPostcode??'',workSearch:register?details.workAddress??'':'',description:'',category:'',technicianEligible:Boolean(p.technician)&&roles.every(r=>knownRoles.includes(r))};};
 if(kind==='clients')return d.clients.map(c=>person(people.get(c.personId),c));
 if(kind==='people')return d.people.map(p=>person(p));
 return d.organisations.map(o=>({id:o.id,name:o.name,type:'organisation',personId:null,clientId:null,reference:register?'':null,roles:o.roles?.length?[...o.roles]:[o.role],directoryStatus:o.directoryStatus??'current',email:o.email??'',phone:'',address:'',suburb:'',state:'',postcode:'',workSearch:'',description:o.description??'',category:o.category??'',technicianEligible:false}));
}
function fields(params,register){
 const allowed=register?['kind','q','status','role','direction','limit','after']:['kind','q','role','status','limit','after'];
 for(const key of params.keys())if(!allowed.includes(key)||params.getAll(key).length!==1)fail('Use each directory search field once.');
 const kind=params.get('kind');if(!Object.hasOwn(kinds,kind)||register&&kind==='clients')fail('Choose a valid directory kind.');
 const raw=params.get('q')??'',rawRole=params.get('role')??'',q=raw.trim().toLowerCase(),role=register?rawRole:rawRole.trim(),status=params.get('status')??(register?'active':'current'),limit=params.get('limit')??'50',direction=params.get('direction')??'asc';
 if(!validText(register?raw:q,100)||!validText(role,120)||!['active','all','current','inactive','review'].includes(status)||!['asc','desc'].includes(direction)||! /^[1-9][0-9]{0,2}$/.test(limit)||Number(limit)>100)fail('Choose valid bounded directory filters.');
 const after=params.get('after')??'';if(after&&!register)idOf(kind,after);
 return {kind,q,role,status,direction,limit:Number(limit),after};
}
const encode=value=>btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');
const decode=value=>JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(value.replaceAll('-','+').replaceAll('_','/')),c=>c.charCodeAt(0))));
async function registers(d,params){
 const value=fields(params,true),scope=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({kind:value.kind,q:value.q,status:value.status,role:value.role,direction:value.direction})))),b=>b.toString(16).padStart(2,'0')).join('');let cursor=null;
 if(value.after){try{if(value.after.length>2048||! /^[A-Za-z0-9_-]+$/.test(value.after))throw Error();cursor=decode(value.after);if(Object.keys(cursor).sort().join(',')!=='id,nameKey,scope,v'||cursor.v!==1||cursor.scope!==scope||!validText(cursor.nameKey,400))throw Error();idOf(value.kind,cursor.id);}catch{fail('The register page does not match these filters. Start at the first page.');}}
 const matching=rows(d,value.kind,true).filter(r=>!value.q||[r.name,r.id,r.clientId,r.reference,r.email,r.phone,r.address,r.suburb,r.state,r.postcode,r.workSearch,r.description,r.category,'['+r.roles.map(role=>JSON.stringify(role)).join(', ')+']'].join(' ').toLowerCase().includes(value.q));
 const statuses=Object.fromEntries(['all','active','current','inactive','review'].map(s=>[s,matching.filter(r=>statusMatch(r,s)).length])),roles=[...new Set(matching.flatMap(r=>r.roles))].sort(compare).map(role=>({role,total:matching.filter(r=>r.roles.includes(role)).length}));
 let filtered=matching.filter(r=>statusMatch(r,value.status)&&(!value.role||r.roles.includes(value.role))).map(r=>({...r,nameKey:r.name.toLowerCase()}));const total=filtered.length,sign=value.direction==='asc'?1:-1,order=(a,b)=>sign*(compare(a.nameKey,b.nameKey)||compare(a.id,b.id));filtered.sort(order);if(cursor)filtered=filtered.filter(r=>order(r,cursor)>0);
 const page=filtered.slice(0,value.limit),last=page.at(-1),projectIds=new Map();
 for(const rel of d.relationships){if(rel.active===false)continue;const key=rel.type+':'+rel.id;if(!projectIds.has(key))projectIds.set(key,new Set());projectIds.get(key).add(rel.projectId);}
 for(const row of page){const related=new Set(projectIds.get((value.kind==='people'?'person':'organisation')+':'+row.id));if(value.kind==='people'&&row.clientId)for(const p of d.projects)if(p.clientId===row.clientId)related.add(p.id);row.projectCount=related.size;}
 return {items:page.map(publicRegister),total,statuses,roles,limit:value.limit,nextAfter:filtered.length>value.limit?encode({v:1,scope,nameKey:last.nameKey,id:last.id}):null};
}
const projectSortKey=value=>String(value??'').toLowerCase().match(/[0-9]+|[^0-9]+/g)?.map(token=>{if(!/^[0-9]+$/.test(token))return '1'+token;const digits=token.replace(/^0+/,'')||'0';return '0'+String(digits.length).padStart(6,'0')+digits;}).join('~')??'';
const projectMatch=(r,status)=>status==='all'||r.status===status||status==='feedback'&&r.feedbackRequired||status==='invoice'&&r.invoiceRequired;
async function projectRegister(d,params){
 for(const key of params.keys())if(!['kind','q','status','role','sort','direction','limit','after'].includes(key)||params.getAll(key).length!==1)fail('Use each project register field once.');
 const raw=params.get('q')??'',q=raw.trim().toLowerCase(),status=params.get('status')??'all',sort=params.get('sort')??'reference',direction=params.get('direction')??'asc',limit=params.get('limit')??'50';
 if(params.get('kind')!=='projects'||!validText(raw,100)||(params.get('role')??'')!==''||!['all','open','review','closed','feedback','invoice'].includes(status)||!['reference','name','date','client'].includes(sort)||!['asc','desc'].includes(direction)||! /^[1-9][0-9]{0,2}$/.test(limit)||Number(limit)>100)fail('Choose valid bounded project register filters.');
 const scope=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({kind:'projects',q,status,sort,direction})))),b=>b.toString(16).padStart(2,'0')).join('');let cursor=null;const after=params.get('after');
 if(after){try{if(after.length>8192||! /^[A-Za-z0-9_-]+$/.test(after))throw Error();cursor=decode(after);if(Object.keys(cursor).sort().join(',')!=='id,scope,sortKey,v'||cursor.v!==1||cursor.scope!==scope||!validText(cursor.sortKey,4096)||typeof cursor.id!=='string'||! /^project-[A-Za-z0-9-]{1,100}$/.test(cursor.id))throw Error();}catch{fail('The project register page does not match these filters. Start at the first page.');}}
 const clients=new Map(d.clients.map(c=>[c.id,c])),people=new Map(d.people.map(p=>[p.id,p]));
 const matching=d.projects.map(p=>{const client=clients.get(p.clientId),person=people.get(client?.personId);if(!client||!person)fail('Saved project has a missing client identity.',503);const life=d.lifecycles?.[p.id],details=client.details??{};return {id:p.id,reference:p.reference,title:p.title,clientId:client.id,clientName:person.name,status:p.status,cancelled:!!life?.cancellation,financeHandoff:!!life?.financeHandoff,feedbackRequired:!!p.feedbackRequired,invoiceRequired:!!p.invoiceRequired,dueDate:p.dueDate??null,summary:p.summary??'',suburb:details.residentialSuburb??'',state:details.residentialState??'',postcode:details.residentialPostcode??''};}).filter(r=>!q||[r.title,r.reference,r.clientName,r.summary,r.suburb,r.state,r.postcode].join(' ').toLowerCase().includes(q));
 const statuses=Object.fromEntries(['all','open','review','closed','feedback','invoice'].map(s=>[s,matching.filter(r=>projectMatch(r,s)).length]));let filtered=matching.filter(r=>projectMatch(r,status)).map(r=>({...r,sortKey:projectSortKey(sort==='reference'?r.reference:sort==='name'?r.title:sort==='client'?r.clientName:r.dueDate??'9999-12-31')}));const total=filtered.length,sign=direction==='asc'?1:-1,order=(a,b)=>sign*(compare(a.sortKey,b.sortKey)||compare(a.id,b.id));filtered.sort(order);if(cursor)filtered=filtered.filter(r=>order(r,cursor)>0);const page=filtered.slice(0,Number(limit)),last=page.at(-1);
 return {items:page.map(({sortKey,summary,suburb,state,postcode,...row})=>row),total,statuses,limit:Number(limit),nextAfter:filtered.length>Number(limit)?encode({v:1,scope,sortKey:last.sortKey,id:last.id}):null};
}
export function deviceDirectoryQuery(d,path,method,params,actor){
 const parts=path.split('/');if(!['selections','registers'].includes(parts[0]))return undefined;
 if(!actor?.id)fail('Sign in to the device demonstration first.',401);
 if(!['administrator','coordinator'].includes(actor.role))fail('A workspace account is required.',403);
 if(method!=='GET')fail('Directory lookup only supports reading.',405);
 if(parts[0]==='registers'){if(parts.length!==1)fail('Record not found.',404);return params.get('kind')==='projects'?projectRegister(d,params):registers(d,params);}
 if(parts.length===3){const [,kind,id]=parts;idOf(kind,id);const row=rows(d,kind).find(r=>r.id===id);if(!row)fail('Selection record not found.',404);return {item:publicSelection(row)};}
 if(parts.length!==1)fail('Record not found.',404);
 const value=fields(params,false),matching=rows(d,value.kind).filter(r=>(!value.q||[r.name,r.reference,r.id,r.email,r.phone,r.address,r.suburb,r.state,r.postcode].join(' ').toLowerCase().includes(value.q))&&(!value.role||r.roles.includes(value.role))&&(value.role!=='Technician'||r.technicianEligible)&&statusMatch(r,value.status)&&(!value.after||compare(r.id,value.after)>0)).sort((a,b)=>compare(a.id,b.id));
 const page=matching.slice(0,value.limit);return {items:page.map(publicSelection),limit:value.limit,nextAfter:matching.length>value.limit?page.at(-1).id:null};
}
