export const addressKey=values=>values.map(value=>String(value??'').trim().replace(/\s+/g,' ').toLowerCase()).filter(Boolean).join(' | ');
const invalid=()=>{throw Object.assign(new Error('Choose the address again to save valid map coordinates.'),{status:422});};
export function validateGeocode(value,values){
 if(value===null)return null;
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='addressKey,latitude,longitude,matchedAt,provider')invalid();
 if(!Number.isFinite(value.latitude)||value.latitude < -90||value.latitude >90||!Number.isFinite(value.longitude)||value.longitude < -180||value.longitude >180)invalid();
 if(!['geoapify','photon'].includes(value.provider)||typeof value.matchedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value.matchedAt)||!Number.isFinite(Date.parse(value.matchedAt))||new Date(value.matchedAt).toISOString()!==value.matchedAt)invalid();
 if(!addressKey(values)||value.addressKey!==addressKey(values))invalid();
 return {...value};
}
export function preserveGeocode(input,saved,values){
 if(input!==undefined)return validateGeocode(input,values);
 if(!saved||saved.addressKey!==addressKey(values))return null;
 return validateGeocode(saved,values);
}
export function proximityKm(a,b){
 if(!a||!b||![a.latitude,a.longitude,b.latitude,b.longitude].every(Number.isFinite))return null;
 const rad=Math.PI/180,dlat=(b.latitude-a.latitude)*rad,dlon=(b.longitude-a.longitude)*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2;
 return 6371*2*Math.atan2(Math.sqrt(Math.min(1,h)),Math.sqrt(Math.max(0,1-h)));
}
