import {preserveGeocode} from './location-geocode.js';
export function profileContactPhone(primary, contact = {}) {
 const preferred=contact.preferredPhone&&contact[contact.preferredPhone+'Phone'];
 return {number:preferred||primary||contact.mobilePhone||contact.homePhone||contact.workPhone||'',preferredChannel:preferred?contact.preferredPhone:''};
}
export function directoryPhoneDigits(value){
 if(typeof value!=='string'||!/^[+()\d\s.-]+$/.test(value))return '';
 const digits=value.replace(/\D/g,'');
 return digits.length>=6&&digits.length<=16?digits:'';
}
export function matchesDirectoryPhone(digits,primary,contact={}){
 return Boolean(digits)&&[primary,contact.mobilePhone,contact.homePhone,contact.workPhone].some(number=>directoryPhoneDigits(number)===digits);
}
export const contactGeocodeValues=d=>[d.addressLine1,d.addressLine2,d.suburb,d.state,d.postcode];
export const EQUIPMENT_OPTIONS=['Electric welding','MIG welding','Gas welding','Aluminium welding','Metal lathe','Wood lathe','Milling machine','Bandsaw','Guillotine','Bender','Tube bender','Saw bench'];
const contactDefaults={homePhone:'',workPhone:'',mobilePhone:'',preferredPhone:'',language:'',addressLine1:'',addressLine2:'',suburb:'',state:'',postcode:'',organisationId:''};
export const MEMBERSHIP_STATUSES=['Not recorded','Member','Non-member'];
export const MAILING_COHORTS=['Board member','Life member','Honouree life member','Staff member','Technical member – active','Technical member – inactive','Technical member – past','Non-technical member','Accounting support','Marketing support','Donor','Client','Allied health','Occupational therapist','Physiotherapist','Other therapist','Funder','Carer','Parent','Referrer','Supplier','IT support','Other'];
export function mailingDetails(input) {
 const result={};
 if(Object.hasOwn(input,'membershipStatus')){
  if(!MEMBERSHIP_STATUSES.includes(input.membershipStatus))throw Error('Choose a membership status from the list.');
  result.membershipStatus=input.membershipStatus;
 }
 if(Object.hasOwn(input,'cohorts')){
  const selected=input.cohorts;
  if(!Array.isArray(selected)||selected.length>MAILING_COHORTS.length||new Set(selected).size!==selected.length||selected.some(name=>!MAILING_COHORTS.includes(name)))throw Error('Select distinct mailing groups from the list.');
  if(selected.filter(name=>name.startsWith('Technical member – ')).length>1)throw Error('Select one current technical membership status.');
  result.cohorts=MAILING_COHORTS.filter(name=>selected.includes(name));
 }
 return result;
}
export const ALLIED_HEALTH_PROFESSIONS=[['','Not recorded'],['occupational-therapist','Occupational therapist (OT)'],['physiotherapist','Physiotherapist'],['psychologist','Psychologist'],['speech-pathologist','Speech pathologist'],['other','Other']];
// Search and relationship eligibility include both generations of directory records.
// Stored roles and the separate mailing groups continue to describe actual selections.
export function matchingPersonRoles(roles,profession){
 const allied='Allied-health contact',ot='Occupational therapist';
 if(roles.includes(ot)&&!roles.includes(allied))return [...roles,allied];
 if(roles.includes(allied)&&!roles.includes(ot)&&profession==='occupational-therapist')return [...roles,ot];
 return roles;
}
const overviewDefaults={disability:'',dateOfBirth:'',additionalComments:''};
const professionDefaults={alliedHealthProfession:'',alliedHealthProfessionOther:''};
const capabilityDefaults={visitClients:'unknown',drives:'unknown',vehicle:'',interests:'',equipment:[],equipmentNotes:''};
export const DIRECTORY_STATUSES=[['current','Current'],['inactive','Inactive'],['review','Needs review']];
export const recordDirectoryStatus=record=>record.directoryStatus??record.person?.directoryStatus??(record.active===false?'inactive':record.role==='Unclassified'?'review':'current');
export const createProfileDetails=()=>({contact:{...contactDefaults,...professionDefaults,...overviewDefaults,directoryStatus:'current'},capabilities:{...capabilityDefaults,equipment:[]}});
export function initialLanguageDetails(language){
 const details=createProfileDetails();
 details.contact.language=text(language,120);
 return details;
}
// Only these reviewed fields can be written while creating a client from a referral.
export function referralClientProfile(client, requestId){
 const optional=['homePhone','mobilePhone','dateOfBirth','disability'];
 const allowed=['name','email','phone','allowDuplicate','initialAddress','ndisNumber',...optional];
 if(!client||typeof client!=='object'||Array.isArray(client)||Object.keys(client).some(key=>!allowed.includes(key))||
    ['name','phone','email'].some(key=>typeof client[key]!=='string'||/[\u0000-\u001f\u007f]/.test(client[key]))||
    typeof client.allowDuplicate!=='boolean')throw Error('Check the reviewed new client details.');
 if(Object.hasOwn(client,'ndisNumber')&&(typeof client.ndisNumber!=='string'||!/^[0-9 ]{3,30}$/.test(client.ndisNumber)||!/[0-9]{3}/.test(client.ndisNumber.replace(/ /g,''))))throw Error('Check the client NDIS participant number.');
 const details=createProfileDetails();
 for(const key of optional)if(Object.hasOwn(client,key))details.contact[key]=client[key];
 if(!optional.some(key=>details.contact[key]!==''))return null;
 details.contact=validateProfileDetails({requestId,section:'contact',version:0,details:details.contact}).details;
 return details;
}
export function normaliseProfileDetails(saved={}){const defaults=createProfileDetails();return {contact:{...defaults.contact,...saved.contact},capabilities:{...defaults.capabilities,...saved.capabilities}};}
const fail=message=>{throw Error(message);};
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))fail('Supply exactly the fields for this profile section.');}
function text(value,max){if(typeof value!=='string'||value.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))fail('Enter valid profile text within the field limits.');return value.trim();}
export function validateProfileDetails(input,savedContact={}){
 exact(input,['requestId','version','section','details']);
 if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(input.requestId))fail('A valid save request identifier is required.');
 if(!Number.isSafeInteger(input.version)||input.version<0)fail('A current profile version is required.');
 if(!['contact','capabilities'].includes(input.section))fail('Choose contact details or technician capabilities.');
 const d=input.details,result={},hasProfession=input.section==='contact'&&Object.hasOwn(d??{},'alliedHealthProfession');exact(d,[...Object.keys(input.section==='contact'?contactDefaults:capabilityDefaults),...(hasProfession?Object.keys(professionDefaults):[]),...(input.section==='contact'?Object.keys(overviewDefaults).filter(key=>Object.hasOwn(d??{},key)):[]),...(input.section==='contact'&&Object.hasOwn(d??{},'directoryStatus')?['directoryStatus']:[]),...(input.section==='contact'&&Object.hasOwn(d??{},'geocode')?['geocode']:[])]);
 if(input.section==='contact'){
  for(const [key,max]of Object.entries({homePhone:40,workPhone:40,mobilePhone:40,language:120,addressLine1:250,addressLine2:250,suburb:120,state:80,postcode:20,organisationId:120}))result[key]=text(d[key],max);
  if(!['','home','work','mobile'].includes(d.preferredPhone))fail('Choose a preferred phone channel.');result.preferredPhone=d.preferredPhone;
  if(result.preferredPhone&&!result[result.preferredPhone+'Phone'])fail('Enter the selected preferred phone number or clear the preference.');
    for(const [key,max]of Object.entries({disability:1000,additionalComments:2000,dateOfBirth:10}))result[key]=text(Object.hasOwn(d,key)?d[key]:savedContact[key]??'',max);
  if(result.dateOfBirth){const value=result.dateOfBirth,parsed=new Date(value+'T00:00:00Z');if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value.startsWith('0000')||!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==value||value>new Date().toISOString().slice(0,10))fail('Enter a valid date of birth that is not in the future.');}
  result.directoryStatus=Object.hasOwn(d,'directoryStatus')?d.directoryStatus:savedContact.directoryStatus??'current';
  if(!DIRECTORY_STATUSES.some(([key])=>key===result.directoryStatus))fail('Choose Current, Inactive or Needs review for this record.');
  const profession=hasProfession?d:savedContact;
  result.alliedHealthProfession=hasProfession?profession.alliedHealthProfession:profession.alliedHealthProfession??'';
  result.alliedHealthProfessionOther=text(hasProfession?profession.alliedHealthProfessionOther:profession.alliedHealthProfessionOther??'',120);
  if(!ALLIED_HEALTH_PROFESSIONS.some(([key])=>key===result.alliedHealthProfession))fail('Choose an allied health profession from the list.');
  if(result.alliedHealthProfession==='other'&&!result.alliedHealthProfessionOther)fail('Enter the other allied health profession.');
  if(result.alliedHealthProfession!=='other'&&result.alliedHealthProfessionOther)fail('Choose Other to record an additional profession.');
  result.geocode=preserveGeocode(d.geocode,savedContact?.geocode,contactGeocodeValues(result));
 }else{
  for(const key of ['visitClients','drives']){if(!['unknown','yes','no'].includes(d[key]))fail('Choose not recorded, yes or no for travel capabilities.');result[key]=d[key];}
  for(const [key,max]of Object.entries({vehicle:200,interests:1000,equipmentNotes:1000}))result[key]=text(d[key],max);
  if(!Array.isArray(d.equipment)||d.equipment.length>EQUIPMENT_OPTIONS.length||new Set(d.equipment).size!==d.equipment.length||d.equipment.some(x=>!EQUIPMENT_OPTIONS.includes(x)))fail('Choose equipment from the available list without duplicates.');
  result.equipment=[...d.equipment];
 }
 return {section:input.section,details:result};
}
