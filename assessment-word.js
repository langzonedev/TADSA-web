import {storedZip} from './finance-pack.js';

export const wordMime='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const xml=value=>String(value??'').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const issuer='TADSA · Technology for Ageing & Disability SA';

// Read the reviewed request's structure so the Word copy and on-screen request
// use the same project, contacts, instructions and authorisation language.
export function requestParagraphs(html){
 const parsed=new DOMParser().parseFromString(html,'text/html');
 const rows=[['brand',issuer],...Array.from(parsed.querySelectorAll('header .issuer > div'),n=>['detail',n.textContent]),['title',parsed.querySelector('h1').textContent]];
 for(const section of parsed.body.children){
  if(section.tagName==='HEADER')continue;
  if(section.tagName==='DL'){
   for(const pair of section.children)rows.push(['fact',pair.querySelector('dt').textContent,pair.querySelector('dd').textContent]);
  }else if(section.tagName==='H2')rows.push(['heading',section.textContent]);
  else if(section.tagName==='P')rows.push(['body',section.textContent]);
 }
 return rows;
}

export function reportParagraphs(project,client,visit,technicians){
 return [
  ['brand',issuer],['title','Assessment report'],
  ['fact','Project',project.reference+' · '+project.title],['fact','Client',client.person?.name||project.clientName],
  ['fact','Visit address',visit||'To be confirmed'],['fact','Assigned technician',technicians||'To be confirmed'],
  ['heading','Work requested'],['body',project.summary||'To be confirmed'],
  ['heading','Assessment findings'],['body','Complete after the visit and return this form to the project manager.'],
  ['entry','Visit date and technician completing this report'],['entry','Client requirements and observations'],
  ['entry','Feasibility, risks and safety considerations'],['entry','Recommended approach and next steps'],
  ['heading','Estimates'],['entry','Materials, parts and estimated cost ($)'],['entry','Estimated work hours'],
  ['entry','Estimated return travel time and distance'],['entry','Consumables and other costs ($)']
 ];
}

function paragraph([kind,label,answer]){
 const format={brand:[18,'415469',true],title:[34,'182E46',true],heading:[24,'19455A',true],detail:[17,'415469',false],fact:[21,'172536',false],entry:[21,'172536',true],body:[21,'172536',false]}[kind];
 const run=(value,bold)=>'<w:r><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'+(bold?'<w:b/>':'')+'<w:color w:val="'+format[1]+'"/><w:sz w:val="'+format[0]+'"/></w:rPr>'+String(value??'').split(/\r?\n/).map((line,i)=>(i?'<w:br/>':'')+'<w:t xml:space="preserve">'+xml(line)+'</w:t>').join('')+'</w:r>';
 const text=kind==='fact'?run(label+'  ',true)+run(answer||'Not recorded',false):run(label,format[2]);
 const gap=kind==='heading'?170:kind==='title'?90:0;
 const following=kind==='title'||kind==='heading'||kind==='entry'?'<w:keepNext/>':'';
 const body='<w:p><w:pPr>'+following+'<w:spacing w:before="'+gap+'" w:after="50"/></w:pPr>'+text+'</w:p>';
 return kind==='entry'?body+'<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="B5C0CB"/></w:pBdr><w:spacing w:after="75"/></w:pPr><w:r><w:t> </w:t></w:r></w:p>':body;
}

export async function assessmentWordFile(name,rows){
 const ns='http://schemas.openxmlformats.org/';
 const doc='<w:document xmlns:w="'+ns+'wordprocessingml/2006/main"><w:body>'+rows.map(paragraph).join('')+'<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="850" w:bottom="850" w:left="1134" w:right="1134"/></w:sectPr></w:body></w:document>';
 const zip=storedZip([
  {name:'[Content_Types].xml',data:'<Types xmlns="'+ns+'package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'},
  {name:'_rels/.rels',data:'<Relationships xmlns="'+ns+'package/2006/relationships"><Relationship Id="rId1" Type="'+ns+'officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
  {name:'word/document.xml',data:doc}
 ]);
 const bytes=new Uint8Array(await zip.arrayBuffer());
 let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
 return {name,mime:wordMime,dataBase64:btoa(binary)};
}
