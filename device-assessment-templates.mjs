import {installModelExtensions,fail} from './device-model.mjs';
installModelExtensions(ctx=>{
 const {d,parts,method,input,actorContext,event}=ctx,[kind,id,action]=parts;
 if(kind!=='assessment-templates')return;
 if(ctx.phase==='guard'){
  if(method!=='GET'&&actorContext&&actorContext.role!=='administrator')fail('Administrator access is required to change assessment templates.',403);
  return;
 }
 const items=d.assessmentTemplates??[],current=items.at(-1)?.revision??0;
 const projection=()=>({version:items.at(-1)?.revision??0,maxBytes:10485760,items:items.toReversed().map(({dataBase64,...file})=>structuredClone(file))});
 if(method==='GET'){
  if(!id)return projection();
  if(action!=='download')return;
  const file=items.find(x=>String(x.revision)===id);if(!file)fail('Template revision not found.',404);
  return {deviceDownload:true,name:file.name,mimeType:file.mime,bytes:Uint8Array.from(atob(file.dataBase64),c=>c.charCodeAt(0))};
 }
 if(method!=='POST'||id)return;
 if(!input||Object.keys(input).length!==5||!['requestId','version','name','mime','dataBase64'].every(k=>Object.hasOwn(input,k))||!Number.isSafeInteger(input.version)||input.version<0)fail('Supply the current template version and a document.');
 if(input.version!==current)fail('The assessment template changed. Reload Settings and review the current template before uploading.',409);
 const types={'application/pdf':'pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document':'docx'};
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>180||/[\\/<>:"|?*\u0000-\u001f\u007f]/.test(input.name)||/[. ]$/.test(input.name)||input.name.startsWith('.')||!types[input.mime]||input.name.split('.').pop().toLowerCase()!==types[input.mime])fail('Choose a PDF or DOCX document with a plain filename.');
 if(typeof input.dataBase64!=='string'||input.dataBase64.length>13981016||input.dataBase64.length%4||!/^[A-Za-z0-9+/]*={0,2}$/.test(input.dataBase64))fail('Invalid template encoding.');
 let raw;try{raw=atob(input.dataBase64);}catch{fail('Invalid template encoding.');}
 if(!raw.length||raw.length>10485760||btoa(raw)!==input.dataBase64)fail('Template exceeds the 10 MB limit or is empty.');
 if(input.mime==='application/pdf'?(!raw.startsWith('%PDF-')||!raw.slice(-1024).includes('%%EOF')):(!raw.startsWith('PK')||!raw.includes('word/document.xml')))fail('Template contents do not match the document type.');
 const audit=event('settings','assessment-template','Assessment template uploaded',{revision:current+1,name:input.name.trim()});
 items.push({revision:current+1,name:input.name.trim(),mime:input.mime,size:raw.length,dataBase64:input.dataBase64,createdAt:audit.at,createdBy:audit.actor});d.assessmentTemplates=items;return projection();
});
