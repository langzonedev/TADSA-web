export const PROJECT_CONTACT_ROLES=Object.freeze(['Contact','Carer','OT','Occupational therapist','Allied-health contact','Referrer']);
export function validateProjectContact(input){
 const keys=['requestId','version','operation','type','id','role'];
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length!==keys.length||keys.some(k=>!Object.hasOwn(input,k)))throw Error('Supply only the project contact decision fields.');
 if(typeof input.requestId!=='string'||!/^[a-f\d]{8}-[a-f\d]{4}-[1-5][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(input.requestId))throw Error('A valid save request identity is required.');
 if(!Number.isSafeInteger(input.version)||input.version<1)throw Error('A valid project version is required.');
 if(!['add','remove'].includes(input.operation)||!['person','organisation'].includes(input.type)||!PROJECT_CONTACT_ROLES.includes(input.role))throw Error('Choose a person or organisation and a supported project contact role.');
 // Device v1 keeps UUID-suffixed identities. Bound the typed identifier like
 // native backups, then let each store verify the exact record exists.
 if(typeof input.id!=='string'||input.id.length>100||!(input.type==='person'?/^person-[a-z\d-]+$/i:/^org-[a-z\d-]+$/i).test(input.id))throw Error('Choose an existing matching record.');
 return Object.fromEntries(keys.map(k=>[k,input[k]]));
}
export const sameProjectContact=(a,b)=>a.type===b.type&&a.id===b.id&&a.role===b.role;
