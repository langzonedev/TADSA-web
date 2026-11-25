import {preserveGeocode,validateGeocode} from './location-geocode.js';
export const RESIDENTIAL_FIELDS=['residentialSuburb','residentialState','residentialPostcode'];
export const CLIENT_GEOCODE_FIELDS=['residentialGeocode','workGeocode'];
export const residentialGeocodeValues=d=>[d.residentialAddress,d.residentialSuburb,d.residentialState,d.residentialPostcode];
export function clientGeocodes(input,saved,address){
 const values=residentialGeocodeValues(address),residentialGeocode=preserveGeocode(input.residentialGeocode,saved?.residentialGeocode,values);
 if(address.sameAsResidential){
  if(input.workGeocode!==undefined){const supplied=validateGeocode(input.workGeocode,values);if(Boolean(supplied)!==Boolean(residentialGeocode)||(supplied&&Object.keys(supplied).some(k=>supplied[k]!==residentialGeocode[k])))throw Object.assign(Error('Work coordinates must match the residential address when the addresses are the same.'),{status:422});}
  return {residentialGeocode,workGeocode:residentialGeocode};
 }
 return {residentialGeocode,workGeocode:preserveGeocode(input.workGeocode,saved?.workGeocode,[address.workAddress])};
}
export const AUSTRALIAN_STATES=['ACT','NSW','NT','QLD','SA','TAS','VIC','WA'];
export function addressPostalSuffix(address){
 const match=String(address??'').match(/\b(SA|VIC|NSW|QLD|NT|ACT|TAS|WA)(?:\s*,\s*|\s+)(\d{4})(?:,?\s+Australia)?[.,\s]*$/i);
 return match?{state:match[1].toUpperCase(),postcode:match[2]}:null;
}
// The first address belongs to the client residence or to the non-client contact.
// Both use the same ordered address components for geocoding.
export function initialPersonAddress(input){
 if(input===undefined)return null;
 const invalid=()=>{throw Object.assign(new Error('Enter a valid street, suburb, state and postcode, or leave unknown fields blank.'),{status:422});};
 const keys=['street','suburb','state','postcode'];
 if(!input||typeof input!=='object'||Array.isArray(input)||!keys.every(k=>Object.hasOwn(input,k))||Object.keys(input).some(k=>!keys.includes(k)&&k!=='geocode'))invalid();
 const address={};
 for(const [key,max] of [['street',250],['suburb',100],['state',3],['postcode',4]]){
  const value=input[key];
  if(typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value))invalid();
  address[key]=value.trim().toUpperCase();
  if(address[key].length>max)invalid();
 }
 if(address.state&&!AUSTRALIAN_STATES.includes(address.state)||address.postcode&&!/^\d{4}$/.test(address.postcode))invalid();
 address.geocode=validateGeocode(input.geocode===undefined?null:input.geocode,keys.map(k=>address[k]));
 return keys.some(k=>address[k])?address:null;
}
export function initialClientResidence(address){
 return {residentialAddress:address.street,residentialSuburb:address.suburb,residentialState:address.state,residentialPostcode:address.postcode,
  sameAsResidential:true,workAddress:address.street,residentialGeocode:address.geocode,workGeocode:address.geocode};
}
export function initialContactAddress(address){
 return {addressLine1:address.street,suburb:address.suburb,state:address.state,postcode:address.postcode,geocode:address.geocode};
}
// Legacy address text is never parsed or rewritten. Missing additive fields retain
// their saved values so older clients can continue to update contact information.
export function residentialFields(input={},saved={}){
 const result={};
 for(const key of RESIDENTIAL_FIELDS){
  const value=Object.hasOwn(input,key)?input[key]:(saved[key]??'');
  if(typeof value!=='string'||/[\x00-\x1f\x7f]/.test(value))throw Object.assign(new Error('Enter valid residential address fields.'),{status:422});
  result[key]=value.trim();
 }
 if(result.residentialSuburb.length>100)throw Object.assign(new Error('Residential suburb must be at most 100 characters.'),{status:422});
 if(result.residentialState&&!AUSTRALIAN_STATES.includes(result.residentialState))throw Object.assign(new Error('Choose an Australian state or territory.'),{status:422});
 if(result.residentialPostcode&&!/^[0-9]{4}$/.test(result.residentialPostcode))throw Object.assign(new Error('Residential postcode must be four digits.'),{status:422});
 return result;
}
export const residentialAddressText=details=>[details?.residentialAddress,[details?.residentialSuburb,details?.residentialState,details?.residentialPostcode].filter(Boolean).join(' ')].filter(Boolean).join(', ');
