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
