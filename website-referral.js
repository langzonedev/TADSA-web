import {reviewDay} from './project-details-model.js';
// The office reviews the notification locally. Keep its answers separate from CRM identities and decisions.
const fields = [
  ['need','Request','Please provide a brief description of the problem or enquire.','Please provide a brief description of the problem or enquiry.'],
  ['client','Client name','Client Name'], ['birth','Client date of birth','Client Date of Birth'],
  ['address','Client address','Client Address'], ['phone','Client phone','Client Phone'], ['mobile','Client mobile','Client Mobile'],
  ['disability','Disability information as supplied','Please tell us a little about your disability'],
  ['contactEmail','Client, carer or parent email','Client, Carer or Parent Email'],
  ['ndis','NDIS funding as reported','Funded by NDIS?'], ['heard','How the client heard about TADSA','How did the client know about TADSA?'],
  ['referrer','Referrer name','Referee Name'], ['referrerPhone','Referrer phone','Referee Phone / Mobile'],
  ['referrerEmail','Referrer email','Referee Email'], ['quote','Quote requested','Is a quote required before we start the project?'],
  ['authorityName','Name supplied under authority and payment','Name'], ['authorityAddress','Address supplied under authority and payment','Address'],
  ['safety','Safety issues as reported','Are there any significant Safety Issues?'],
  ['attendance','Referrer or carer attendance','Does your referee/carer need to be in attendance for the assessment?'],
  ['additional','Other answers from the website form']
];
const normal = value => value.normalize('NFKC').toLowerCase()
  .replace(/\(\s*(?:required|optional)\s*\)\s*[*:]*$/,'').replace(/['’]s\b/g,'')
  .replace(/\be[- ]mail\b/g,'email').replace(/&/g,' and ').replace(/[^a-z0-9]+/g,' ').trim();
// Only use labels that identify the subject of the answer. A contact or payer
// name elsewhere in the form is never a substitute for the client's name.
const aliases = {
  need:['Request description','Enquiry description','Project description','Description of the problem or enquiry','What does the client need?','How can we help?'],
  client:['Client full name','Full name of client','Name of client','Name of the client','Client first and last name'],
  birth:['Client DOB','Date of birth of client'], address:['Client residential address','Residential address of client'],
  phone:['Client phone number','Client telephone','Client telephone number'],mobile:['Client mobile number','Client mobile phone'],
  contactEmail:['Client carer or parent email address'],referrer:['Referrer full name','Referrer name','Referee full name'],
  referrerPhone:['Referrer phone number','Referrer phone / mobile','Referee phone number'],referrerEmail:['Referrer email address','Referee email address'],
  ndis:['Is the client funded by NDIS?'],heard:['How did the client hear about TADSA?'],quote:['Is a quote required?']
};
const labels = new Map(fields.filter(([key])=>key!=='additional').flatMap(([key,label,...titles])=>
  [label,...titles,...(aliases[key]??[])].map(title=>[normal(title),key])));
const sections = new Map(Object.entries({
  client:['Client information','Client details'],referrer:['If referred, by whom','Referrer details','Referrer information','Referee details'],
  authority:['Authority to proceed and payment information','Authority and payment details'],
  other:['Other information','Additional contact details','Self','Agency','Plan manager']
}).flatMap(([section,titles])=>titles.map(title=>[normal(title),section])));
const scopedLabels=new Set(['name','full name','address','date of birth','dob']);
function fieldKey(name,section){
  if(name==='name'||name==='full name')return {client:'client',referrer:'referrer',authority:'authorityName'}[section];
  if(name==='address')return {client:'address',authority:'authorityAddress'}[section];
  if(section==='client'&&['date of birth','dob'].includes(name))return 'birth';
  return labels.get(name);
}
// Gravity Forms conditionally includes these questions. Retain them as supplied
// without treating them as part of a preceding identity, funding or safety answer.
const extraLabels = new Set([
  'If photos or diagrams are available, please attach them here','Is this request in the current NDIS plan',
  'NDIS Number','Plan Start Date','Plan End Date','NDIS funding managed by','Authority to proceed and payment information - to be sent by',
  'Email','NDIS Plan - Start Date','NDIS Plan - End Date','Support Budget','Item Number','NDIS Support Category','NDIS Support Item',
  'Details','Business Name','Additonal Contact','Additional Contact','Contact Name','Contact Phone','Contact Mobile','Contact Email',
  'Relation to Client','Referee Organisation','Invoicing Details','Comments'
].map(normal));
const fundingChoices = new Set(['self','agency','plan manager']);
const singleLineFields = new Set(['client','phone','mobile','birth','contactEmail','referrer','referrerPhone','referrerEmail','ndis','quote','safety','attendance']);
const invalid = message => { throw Object.assign(new Error(message),{status:422}); };
const clean = value => value.replace(/\u00a0/g,' ').replace(/\r/g,'').split('\n').map(line=>line.trim()).filter(line=>line && !/^map it$/i.test(line)).join('\n');
const record = value => value && typeof value === 'object' && !Array.isArray(value);

export function validateWebsiteReferral(value) {
  if(!record(value)||Object.keys(value).length!==2||!record(value.answers)||typeof value.receivedOn!=='string')invalid('Check the website referral and its received date.');
  const day=value.receivedOn;
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||day<'1900-01-01'||day>reviewDay()||!Number.isFinite(Date.parse(day))||new Date(day).toISOString().slice(0,10)!==day)invalid('Enter the date the office received the website enquiry, up to today.');
  return {receivedOn:day,answers:validateAnswers(value.answers)};
}

function validateAnswers(input){
  const answers={};
  for(const [key] of fields){
    if(!Object.hasOwn(input,key))continue;
    const text=input[key];
    if(typeof text!=='string'||!text.trim()||text.length>6000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text))invalid('A website answer is empty, too long or contains unsupported characters.');
    answers[key]=text.trim();
  }
  if(!answers.need||!answers.client||Object.keys(answers).length!==Object.keys(input).length)invalid('Use one completed Technical Assistance Project Enquiry notification with a request and client name.');
  if(JSON.stringify(answers).length>35000)invalid('This referral exceeds the intake limit. Enter it manually and retain the original in Project files.');
  return answers;
}

export function referralRows(answers) {
  return fields.filter(([key])=>answers[key]).map(([key,label])=>[label,answers[key]]);
}

function readAnswers(rows) {
  const answers={},additional=[],candidates=[];let section='';
  for(const [label,value] of rows){
    const name=normal(label);
    const text=clean(value);
    if(!text){
      section=sections.get(name)??'';
      continue;
    }
    const key=fieldKey(name,section);
    if(!key){
      if(label.trim()){
        additional.push(label.trim()+'\n'+text);
        if(!extraLabels.has(name))candidates.push({id:String(candidates.length),label:label.trim(),value:text});
      }
      continue;
    }
    if(Object.hasOwn(answers,key))invalid('This contains repeated form fields. Select one notification at a time.');
    answers[key]=text;
  }
  if(additional.length)answers.additional=additional.join('\n\n');
  const missing=['client','need'].filter(key=>!answers[key]);
  if(missing.length&&candidates.length>=missing.length){
    throw Object.assign(new Error('Choose the website answers for the unrecognised questions.'),{status:422,referralMapping:{answers,candidates,missing}});
  }
  return validateAnswers(answers);
}

export function resolveReferralMapping(mapping,choices){
  const answers={...mapping.answers};
  const selected=new Set();
  for(const key of mapping.missing){
    const candidate=mapping.candidates.find(item=>item.id===choices[key]);
    if(!candidate||selected.has(candidate.id))invalid('Choose a separate answer for each missing question.');
    answers[key]=candidate.value;selected.add(candidate.id);
  }
  // The source label and answer remain visible in the other website answers.
  return validateAnswers(answers);
}

export function readReferralText(source) {
  if(typeof source!=='string'||source.length>1000000)invalid('Choose a single notification under 1 MB.');
  const lines=source.replace(/\r\n?/g,'\n').split('\n').map(line=>line.trim()).filter(Boolean);
  const colonPair=line=>line.match(/^([^:\t]{1,180}):\s+(.+)$/);
  const labelledLines=lines.filter(line=>{const pair=colonPair(line);return pair&&labels.has(normal(pair[1]));}).length>=2;
  function splitPair(line){
    const tab=line.indexOf('\t');
    if(tab>0)return [line.slice(0,tab),line.slice(tab+1).trim()];
    const pair=colonPair(line);
    if(pair&&(labelledLines||labels.has(normal(pair[1]))))return [pair[1],pair[2]];
    return null;
  }
  const recognised=line=>{
    const pair=splitPair(line),name=normal(pair?pair[0]:line);
    return labels.has(name)||sections.has(name)||extraLabels.has(name)||scopedLabels.has(name);
  };
  let first=lines.findIndex(recognised);
  if(first<0)invalid('The website enquiry fields were not found. Copy the form portion or choose its saved HTML email.');
  // A renamed question may precede the first recognised row in a copied table.
  while(first>0&&lines[first-1].includes('\t'))first--;
  const rows=[];let current,finished=false;
  for(const line of lines.slice(first)){
    if(/^This is an automated message sent from\b/i.test(line)){finished=true;continue;}
    if(finished){
      if(labels.get(normal(splitPair(line)?.[0]??line))==='need')invalid('Choose one website notification at a time.');
      continue;
    }
    const pair=splitPair(line);
    if(pair){current=pair;rows.push(current);continue;}
    const name=normal(line);
    const previous=current&&normal(current[0]);
    if(current&&!current[1]&&((previous==='ndis funding managed by'&&fundingChoices.has(name))||
        (previous==='authority to proceed and payment information to be sent by'&&name==='email'))){
      current[1]=line;continue;
    }
    if(recognised(line)){
      current=[line,''];rows.push(current);
    }else if(current){
      if(current[1]&&singleLineFields.has(labels.get(previous)))invalid('The pasted text has unclear field boundaries. Choose the saved HTML email to keep the answers separate.');
      current[1]+=(current[1]?'\n':'')+line;
    }
  }
  return readAnswers(rows);
}

export function readReferralHtml(source) {
  if(typeof source!=='string'||source.length>1000000)invalid('Choose a single HTML notification under 1 MB.');
  // The detached template is inert. Only copy text, never its elements or links, into the application.
  const template=document.createElement('template');template.innerHTML=source;
  const content=template.content;
  for(const element of content.querySelectorAll('script,style,iframe,object,embed,svg,img,template,noscript'))element.remove();
  for(const link of content.querySelectorAll('a'))if(normal(link.textContent)==='map it')link.remove();
  for(const br of content.querySelectorAll('br'))br.replaceWith('\n');
  // Paragraphs are common when the table has passed through an Office client.
  for(const block of content.querySelectorAll('p,div'))block.append('\n');
  const candidates=[];
  for(const table of content.querySelectorAll('table')){
    const rows=htmlRows(table);
    const known=new Set();let section='';
    for(const [label,value] of rows){
      const name=normal(label);
      if(!value.trim()){section=sections.get(name)??'';continue;}
      const key=fieldKey(name,section);
      if(key)known.add(key);
    }
    if(known.has('need')||known.has('client')||known.size>=2)candidates.push(rows);
  }
  if(!candidates.length)invalid('Choose one original website notification containing the enquiry table.');
  if(candidates.length>1)throw Object.assign(new Error('Choose one website notification at a time.'),{status:422,noPlainFallback:true});
  try{return readAnswers(candidates[0]);}
  catch(error){error.noPlainFallback=true;throw error;}
}

function htmlRows(table){
  const rows=[];let current;
  for(const tr of table.rows){
    const cells=Array.from(tr.cells);
    if(cells.some(cell=>cell.querySelector('table'))){current=null;continue;}
    if(cells.length===1){
      const text=cells[0].textContent.trim();
      if(!text)continue;
      // Gravity Forms uses a spanning cell for a label, followed by an
      // indented value row. Also accept a semantic header/value pair of rows.
      if(current?.header&&cells[0].tagName==='TD'&&cells[0].colSpan===1){current[1]=text;current=null;continue;}
      current=[text,''];current.header=cells[0].tagName==='TH';rows.push(current);
    }else if(cells.length===2){
      const label=cells[0].textContent.trim();
      if(label)rows.push([label,cells[1].textContent]);
      else if(current)current[1]=cells[1].textContent;
      current=null;
    }
  }
  return rows;
}
