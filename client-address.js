export const RESIDENTIAL_FIELDS=['residentialSuburb','residentialState','residentialPostcode'];
export const AUSTRALIAN_STATES=['ACT','NSW','NT','QLD','SA','TAS','VIC','WA'];
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
