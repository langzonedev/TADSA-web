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
const normal = value => value.toLowerCase().replace(/[\s\u00a0]+/g,' ').trim().replace(/[.?:]+$/,'');
const labels = new Map(fields.flatMap(([key,,...titles])=>titles.map(title=>[normal(title),key])));
const headings = new Set(['client information','if referred, by whom','authority to proceed and payment information','other information','additional contact details','self','agency','plan manager']);
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
  const answers={},additional=[];let section='';
  for(const [label,value] of rows){
    const name=normal(label);
    if(headings.has(name)){section=name;continue;}
    const key=labels.get(name);
    const text=clean(value);
    if(!key||((key==='authorityName'||key==='authorityAddress')&&section!=='authority to proceed and payment information')){
      if(label.trim()&&text)additional.push(label.trim()+'\n'+text);
      continue;
    }
    if(Object.hasOwn(answers,key))invalid('This contains repeated form fields. Select one notification at a time.');
    if(text)answers[key]=text;
  }
  if(additional.length)answers.additional=additional.join('\n\n');
  return validateAnswers(answers);
}

export function readReferralText(source) {
  if(typeof source!=='string'||source.length>1000000)invalid('Choose a single notification under 1 MB.');
  // Table copies with a tab preserve the beginning of additional question rows.
  // A plain multiline value has no reliable markers for future form questions.
  const sourceLines=source.replace(/\r\n?/g,'\n').split('\n');
  const pastedLabels=new Set(sourceLines.filter(line=>/^\s*[^\t]+\t+\S/.test(line)).map(line=>normal(line.split('\t')[0])).filter(Boolean));
  const lines=sourceLines.flatMap(line=>line.split('\t')).map(line=>line.trim()).filter(Boolean);
  const first=lines.findIndex(line=>labels.get(normal(line))==='need');
  if(first<0)invalid('The website enquiry fields were not found. Copy the form portion or choose its saved HTML email.');
  if(lines.slice(first+1).some(line=>labels.get(normal(line))==='need'))invalid('Choose one website notification at a time.');
  const rows=[];let current;
  for(const line of lines.slice(first)){
    if(/^This is an automated message sent from\b/i.test(line))break;
    const name=normal(line);
    const previous=current&&normal(current[0]);
    if(current&&!current[1]&&((previous==='ndis funding managed by'&&fundingChoices.has(name))||
        (previous==='authority to proceed and payment information - to be sent by'&&name==='email'))){
      current[1]=line;continue;
    }
    if(labels.has(name)||headings.has(name)||extraLabels.has(name)||pastedLabels.has(name)){
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
  const matches=[...content.querySelectorAll('td,th')].filter(item=>!item.querySelector('table')&&labels.get(normal(item.textContent))==='need');
  const tables=new Set(matches.map(item=>item.closest('table')).filter(Boolean));
  if(tables.size!==1)invalid('Choose one original website notification containing the enquiry table.');
  const [table]=tables;const rows=[];let current;
  for(const tr of table.rows){
    const cells=Array.from(tr.cells);
    if(cells.length===1){
      const label=cells[0].textContent.trim();current=[label,''];rows.push(current);
    }else if(cells.length===2){
      const label=cells[0].textContent.trim();
      if(label)rows.push([label,cells[1].textContent]);
      else if(current)current[1]=cells[1].textContent;
      current=null;
    }
  }
  return readAnswers(rows);
}
