export const organisationRoleSuggestions=Object.freeze(['Funder','Business','Service provider','Sponsor','Allied-health organisation']);
export function organisationRoles(value,legacyRole=''){
 const roles=value===undefined?(legacyRole?[legacyRole]:[]):value;
 if(!Array.isArray(roles)||!roles.length||roles.length>20||roles.some(r=>typeof r!=='string'||!r.trim()||r.trim().length>120||/[\u0000-\u001f\u007f]/.test(r))||new Set(roles.map(r=>r.trim().toLowerCase())).size!==roles.length)throw Object.assign(Error('Choose distinct organisation roles within the field limits.'),{status:422});
 return roles.map(r=>r.trim());
}
