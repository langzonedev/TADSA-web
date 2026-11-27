import {directoryPhoneDigits} from './profile-details-model.js';

const fields={name:120,phone:40,mobile:40,dateOfBirth:10,postcode:4};
const invalid=message=>{throw Object.assign(Error(message),{status:422});};
export function validateReferralIdentity(input){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==Object.keys(fields).length)
    invalid('Supply the client identity fields for one website enquiry.');
  const identity={};
  for(const [key,limit] of Object.entries(fields)){
    if(typeof input[key]!=='string'||input[key].length>limit||/[\u0000-\u001f\u007f]/.test(input[key]))
      invalid('Check the client identity fields from this enquiry.');
    identity[key]=input[key].trim();
  }
  if(!identity.name&&!referralPhoneVariants(identity.phone,identity.mobile).length)
    invalid('Supply a client name or a complete phone number to check the directory.');
  if(identity.dateOfBirth){
    const date=new Date(identity.dateOfBirth+'T00:00:00Z');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(identity.dateOfBirth)||!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==identity.dateOfBirth)
      invalid('Use a valid date of birth.');
  }
  if(identity.postcode&&!/^\d{4}$/.test(identity.postcode))invalid('Use a four-digit postcode.');
  return identity;
}

export const referralName=value=>(value??'').trim().toLowerCase().replace(/\./g,'').replace(/\s+/g,' ');

// Use whole numbers. Inferring an area code from a local number could combine
// unrelated households. Include the optional domestic trunk in printed +61 (0).
export function referralPhoneVariants(...values){
  const result=new Set();
  for(const value of values){
    const digits=directoryPhoneDigits(value);
    if(!digits)continue;
    result.add(digits);
    const national=/^(?:0|(?:00)?610?)([23478]\d{8})$/.exec(digits);
    if(national)for(const prefix of ['0','61','0061','610','00610'])result.add(prefix+national[1]);
  }
  return [...result];
}

function nameComparison(submitted,stored){
  if(!submitted||!stored)return 'unknown';
  if(submitted===stored)return 'match';
  const a=submitted.split(' '),b=stored.split(' ');
  if(a.length>=2&&b.length>=2&&a.at(-1)===b.at(-1)&&a[0][0]===b[0][0]&&
      (a[0]===b[0]||a[0].length===1||b[0].length===1))return 'partial';
  return 'different';
}

const compare=(left,right)=>!left||!right?'unknown':left===right?'match':'different';
function phoneComparison(submitted,saved,hasComparableNumber){
  const digits=directoryPhoneDigits(submitted);
  if(!digits)return 'unknown';
  if(saved.includes(digits))return 'match';
  return hasComparableNumber?'different':'unknown';
}
export function compareReferralIdentity(submitted,candidate){
  const numbers=referralPhoneVariants(candidate.phone,candidate.mobile,candidate.homePhone,candidate.workPhone);
  const hasPhone=[candidate.phone,candidate.homePhone,candidate.workPhone].some(value=>directoryPhoneDigits(value));
  const hasMobile=Boolean(directoryPhoneDigits(candidate.mobile))||numbers.some(number=>/^04\d{8}$/.test(number));
  return {
    name:nameComparison(referralName(submitted.name),referralName(candidate.name)),
    dateOfBirth:compare(submitted.dateOfBirth,candidate.dateOfBirth),
    phone:phoneComparison(submitted.phone,numbers,hasPhone),mobile:phoneComparison(submitted.mobile,numbers,hasMobile),
    postcode:compare(submitted.postcode,candidate.postcode)
  };
}

export function rankedReferralMatches(submitted,candidates){
  const matches=[];
  for(const candidate of candidates){
    const comparison=compareReferralIdentity(submitted,candidate);
    const phone=comparison.phone==='match'||comparison.mobile==='match';
    const sameName=comparison.name==='match',sameDob=comparison.dateOfBirth==='match';
    if(!sameName&&!phone&&!(comparison.name==='partial'&&sameDob))continue;
    // DOB and phone corroborate identity independently. A name alone still
    // warrants explicit review. Postcode is supporting information only.
    const rank=(sameDob?8:0)+(phone?6:0)+(sameName?4:0)+(comparison.postcode==='match'?1:0);
    matches.push({candidate,comparison,rank});
  }
  matches.sort((a,b)=>b.rank-a.rank||a.candidate.name.localeCompare(b.candidate.name,'en-AU')||a.candidate.id.localeCompare(b.candidate.id,'en-AU',{numeric:true}));
  return {items:matches.slice(0,20).map(({candidate,comparison})=>({...candidate,comparison})),more:matches.length>20};
}

// Projection for both the device workspace and the explicit memory test double.
export function localReferralMatches(data,input){
  const submitted=validateReferralIdentity(input);
  const people=new Map(data.people.map(p=>[p.id,p]));
  const candidates=[];
  for(const c of data.clients){
    const person=people.get(c.personId);
    if(!person)continue;
    const contact=data.profileDetails?.[person.id]?.contact??{},details=c.details??{};
    candidates.push({id:c.id,personId:person.id,reference:'CL-'+c.id.slice(7),name:person.name,
      dateOfBirth:contact.dateOfBirth??'',phone:person.phone??'',mobile:contact.mobilePhone??'',
      homePhone:contact.homePhone??'',workPhone:contact.workPhone??'',address:details.residentialAddress??'',
      suburb:details.residentialSuburb??'',state:details.residentialState??'',postcode:details.residentialPostcode??'',
      directoryStatus:person.active===false?'inactive':contact.directoryStatus??person.directoryStatus??'current'});
  }
  return rankedReferralMatches(submitted,candidates);
}

const absentAnswer=/^(?:[^\p{L}\p{N}]+|n\s*[./]?\s*a\.?|none|no|nil|unknown|not (?:applicable|known|provided|recorded|supplied))$/iu;
export function needsManualReferrerReview(answers){
  const name=answers?.referrer?.trim();
  return Boolean(name&&!absentAnswer.test(name)&&!referrerIdentity(answers).name);
}
function personAnswer(value,limit){
  const answer=typeof value==='string'?value.trim():'';
  return answer.length>limit||/[\u0000-\u001f\u007f]/.test(answer)||absentAnswer.test(answer)?'':answer;
}
export function referralPersonName(value){
  return personAnswer(typeof value==='string'?value.replace(/\s*\r?\n\s*/g,' '):'',120);
}
export function referralContactNumber(value){
  const number=personAnswer(value,40);
  return /\d/.test(number)?number:'';
}
export function referrerIdentity(answers){
  const email=personAnswer(answers?.referrerEmail,254);
  return {name:referralPersonName(answers?.referrer),phone:referralContactNumber(answers?.referrerPhone),
    email:/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?email:''};
}
export function validateReferrerIdentity(input){
  if(!input||Object.keys(input).length!==3||!['name','phone','email'].every(k=>typeof input[k]==='string'))invalid('Supply the named referrer and their contact details.');
  const identity=referrerIdentity({referrer:input.name,referrerPhone:input.phone,referrerEmail:input.email});
  if(!identity.name||Object.keys(identity).some(k=>identity[k]!==input[k].trim()))invalid('Check the referrer’s name and contact details.');
  return identity;
}
export function rankedReferrerMatches(identity,records){
  const nameKey=referralName(identity.name),emailKey=identity.email.toLowerCase(),phones=referralPhoneVariants(identity.phone);
  const matches=[];
  for(const record of records){
    const nameMatch=referralName(record.name)===nameKey;
    const numbers=[record.phone,record.mobile,record.homePhone,record.workPhone].filter(Boolean);
    const matchingNumber=numbers.find(value=>referralPhoneVariants(value).some(n=>phones.includes(n)));
    const contactMatch=Boolean(matchingNumber||(emailKey&&emailKey===record.email?.trim().toLowerCase()));
    if(nameMatch||contactMatch)matches.push({id:record.id,name:record.name,phone:matchingNumber||numbers[0]||'',email:record.email??'',
      directoryStatus:record.directoryStatus??'current',nameMatch,contactMatch});
  }
  const score=r=>Number(r.nameMatch)*2+Number(r.contactMatch);
  matches.sort((a,b)=>score(b)-score(a)||a.name.localeCompare(b.name,'en-AU')||a.id.localeCompare(b.id,'en-AU',{numeric:true}));
  return {items:matches.slice(0,20),more:matches.length>20};
}
export function localReferrerMatches(data,input){
  const identity=validateReferrerIdentity(input);
  return rankedReferrerMatches(identity,data.people.map(p=>{
    const contact=data.profileDetails?.[p.id]?.contact??{};
    return {...p,mobile:contact.mobilePhone,homePhone:contact.homePhone,workPhone:contact.workPhone,
      directoryStatus:p.active===false?'inactive':contact.directoryStatus??p.directoryStatus??'current'};
  }));
}
export function reviewedReferrerChoice(choice,matches,identity){
  const changed=()=>{throw Object.assign(Error('The referrer matches have changed. Check the directory again before saving.'),{status:409,code:'REFERRER_REVIEW_CHANGED'});};
  if(!choice||typeof choice!=='object'||Array.isArray(choice))invalid('Review the named referrer before saving.');
  if(Object.keys(choice).length===1&&choice.client===true)return {client:true};
  if(typeof choice.personId==='string'&&Object.keys(choice).every(k=>['personId','additions'].includes(k))){
    const match=matches.items.find(p=>p.id===choice.personId&&p.directoryStatus!=='inactive');
    if(!match)changed();
    if(!Object.hasOwn(choice,'additions'))return {personId:choice.personId};
    const values=choice.additions;
    if(!match.nameMatch||!values||typeof values!=='object'||Array.isArray(values)||!Object.keys(values).length)invalid('Only missing contact details for the named referrer can be added.');
    for(const [key,value] of Object.entries(values)){
      if(!['email','phone'].includes(key)||!value||value!==identity[key])invalid('Choose a phone or email supplied for this referrer.');
      if(match[key])changed();
    }
    return {personId:choice.personId,additions:{...values}};
  }
  if(Object.keys(choice).length!==2||choice.create!==true||!Array.isArray(choice.reviewedIds)||choice.reviewedIds.some(id=>typeof id!=='string'))invalid('Choose a matching person or confirm that the referrer needs a new People record.');
  if(isSelfReferralLabel(identity.name))invalid('Use the client record for a self-referral.');
  const reviewed=new Set(choice.reviewedIds);
  if(matches.more||reviewed.size!==choice.reviewedIds.length||reviewed.size!==matches.items.length||matches.items.some(p=>!reviewed.has(p.id)))changed();
  return {create:true};
}
export const isSelfReferralLabel=name=>/^(?:self(?:[- ]referr(?:al|ed))?|myself|(?:the )?client)$/i.test(name?.trim()??'');
export function checkSelfReferral(identity,clientName){
  if(referralName(identity.name)!==referralName(clientName)&&!isSelfReferralLabel(identity.name))invalid('Choose the client as referrer only when the form names the client or says self-referral.');
}
