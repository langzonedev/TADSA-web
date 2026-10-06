import {preserveGeocode} from './location-geocode.js';
export const contactGeocodeValues=d=>[d.addressLine1,d.addressLine2,d.suburb,d.state,d.postcode];
export const EQUIPMENT_OPTIONS=['Electric welding','MIG welding','Gas welding','Aluminium welding','Metal lathe','Wood lathe','Milling machine','Bandsaw','Guillotine','Bender','Tube bender','Saw bench'];
const contactDefaults={homePhone:'',workPhone:'',mobilePhone:'',preferredPhone:'',language:'',addressLine1:'',addressLine2:'',suburb:'',state:'',postcode:'',organisationId:''};
export const ALLIED_HEALTH_PROFESSIONS=[['','Not recorded'],['occupational-therapist','Occupational therapist (OT)'],['physiotherapist','Physiotherapist'],['psychologist','Psychologist'],['other','Other']];
const professionDefaults={alliedHealthProfession:'',alliedHealthProfessionOther:''};
const capabilityDefaults={visitClients:'unknown',drives:'unknown',vehicle:'',interests:'',equipment:[],equipmentNotes:''};
export const createProfileDetails=()=>({contact:{...contactDefaults,...professionDefaults},capabilities:{...capabilityDefaults,equipment:[]}});
export function normaliseProfileDetails(saved={}){const defaults=createProfileDetails();return {contact:{...defaults.contact,...saved.contact},capabilities:{...defaults.capabilities,...saved.capabilities}};}
const fail=message=>{throw Error(message);};
function exact(value,keys){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))fail('Supply exactly the fields for this profile section.');}
function text(value,max){if(typeof value!=='string'||value.trim().length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value))fail('Enter valid profile text within the field limits.');return value.trim();}
export function validateProfileDetails(input,savedContact={}){
 exact(input,['requestId','version','section','details']);
 if(typeof input.requestId!=='string'||!/^[a-zA-Z0-9-]{8,100}$/.test(input.requestId))fail('A valid save request identifier is required.');
 if(!Number.isSafeInteger(input.version)||input.version<0)fail('A current profile version is required.');
 if(!['contact','capabilities'].includes(input.section))fail('Choose contact details or technician capabilities.');
 const d=input.details,result={},hasProfession=input.section==='contact'&&Object.hasOwn(d??{},'alliedHealthProfession');exact(d,[...Object.keys(input.section==='contact'?contactDefaults:capabilityDefaults),...(hasProfession?Object.keys(professionDefaults):[]),...(input.section==='contact'&&Object.hasOwn(d??{},'geocode')?['geocode']:[])]);
 if(input.section==='contact'){
  for(const [key,max]of Object.entries({homePhone:40,workPhone:40,mobilePhone:40,language:120,addressLine1:250,addressLine2:250,suburb:120,state:80,postcode:20,organisationId:120}))result[key]=text(d[key],max);
  if(!['','home','work','mobile'].includes(d.preferredPhone))fail('Choose a preferred phone channel.');result.preferredPhone=d.preferredPhone;
  if(result.preferredPhone&&!result[result.preferredPhone+'Phone'])fail('Enter the selected preferred phone number or clear the preference.');
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
