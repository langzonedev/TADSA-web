export const organisationRoleSuggestions=Object.freeze(['Funder','Business','Service provider','Sponsor','Allied-health organisation']);
export function organisationRoles(value,legacyRole=''){
 const roles=value===undefined?(legacyRole?[legacyRole]:[]):value;
 if(!Array.isArray(roles)||!roles.length||roles.length>20||roles.some(r=>typeof r!=='string'||!r.trim()||r.trim().length>120||/[\u0000-\u001f\u007f]/.test(r))||new Set(roles.map(r=>r.trim().toLowerCase())).size!==roles.length)throw Object.assign(Error('Choose distinct organisation roles within the field limits.'),{status:422});
 return roles.map(r=>r.trim());
}

export const ORGANISATION_CONTACT_FIELDS=Object.freeze(['website','phone','ndisProviderNumber','contactName']);
export function organisationContactDetails(input={},previous={}){
 const values={};
 for(const [key,max] of Object.entries({website:2000,phone:40,ndisProviderNumber:80,contactName:200})){
  const value=Object.hasOwn(input,key)?input[key]:previous[key]??'';
  if(typeof value!=='string'||value.trim().length>max||/[\u0000-\u001f\u007f]/.test(value))throw Object.assign(Error('Complete organisation contact fields within their limits.'),{status:422});
  values[key]=value.trim();
 }
 if(values.website){
  const supplied=values.website;
  // Accept a bare public domain for convenience, but never an active scheme,
  // embedded credentials, whitespace, a protocol-relative URL or backslashes.
  if(/\s|\\/.test(supplied)||supplied.startsWith('//'))throw Object.assign(Error('Enter a valid website address using http or https.'),{status:422});
  const address=/^[a-z][a-z\d+.-]*:/i.test(supplied)?supplied:'https://'+supplied;
  let url;try{url=new URL(address);}catch{throw Object.assign(Error('Enter a valid website address using http or https.'),{status:422});}
  if(!['http:','https:'].includes(url.protocol)||!url.hostname||url.username||url.password||url.href.length>2000)throw Object.assign(Error('Enter a valid website address using http or https, without a username or password.'),{status:422});
  values.website=url.href;
 }
 return values;
}
