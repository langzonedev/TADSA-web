import {areaIncludes,locationRegion} from './service-regions.js';
import {contactGeocodeValues} from './profile-details-model.js';
import {residentialGeocodeValues} from './client-address.js';
import {postcodePoint} from './postcode-locations.js';
import {addressKey,preserveGeocode,proximityKm} from './location-geocode.js';

// Contact addresses are useful for postcode matching, but are not assumed to be
// workshops, service coverage, or permission to travel. An explicit base takes priority.
export function technicianLocation(settings,contact={}) {
 const explicit=Boolean(settings&&(settings.location_recorded||settings.base_address||settings.suburb||settings.postcode||settings.geocode));
 if(explicit){
  const baseAddress=settings.base_address??'',suburb=settings.suburb??'',postcode=settings.postcode??'';
  return {baseAddress,suburb,postcode,geocode:preserveGeocode(undefined,settings.geocode,[baseAddress,suburb,postcode]),locationSource:'technician-base'};
 }
 const baseAddress=[contact.addressLine1,contact.addressLine2].filter(Boolean).join(', '),suburb=contact.suburb??'',postcode=contact.postcode??'';
 const geocode=preserveGeocode(undefined,contact.geocode,contactGeocodeValues(contact));
 return {baseAddress,suburb,postcode,geocode,...(contact.state?{state:contact.state}:{}),locationSource:baseAddress||suburb||postcode?'person-contact':'unrecorded'};
}

function trailingPostcode(address='') {
 const match=(address||'').match(/\b(?:SA|VIC|NSW|QLD|NT|ACT|TAS|WA)\s+(\d{4})(?:,?\s+Australia)?\s*$/i);
 return match?.[1]??'';
}

export function clientMatchLocation(client={}) {
 if(client.sameAsResidential===false || (!client.sameAsResidential && client.workAddress && client.workAddress!==client.residentialAddress)){
  return {source:'client-work',address:client.workAddress||'',suburb:'',postcode:trailingPostcode(client.workAddress),geocode:preserveGeocode(undefined,client.workGeocode,[client.workAddress])};
 }
 return {source:'client-residential',state:client.residentialState||'',address:client.residentialAddress||client.workAddress||'',suburb:client.residentialSuburb||'',postcode:client.residentialPostcode||trailingPostcode(client.residentialAddress),geocode:preserveGeocode(undefined,client.residentialGeocode,residentialGeocodeValues(client))};
}

export function projectMatchLocation(stored={},client={}) {
 const area=stored.serviceArea||'',inherited=clientMatchLocation(client);
 // Older work plans may save the displayed client street when only funding fields change.
 const copiedStreet=stored.location&&addressKey([stored.location])===addressKey([inherited.address]);
 if(!stored.suburb&&!stored.postcode&&!stored.geocode&&(!stored.location||copiedStreet))return {...inherited,serviceArea:area};
 return {source:'project',address:stored.location||'',suburb:stored.suburb||'',postcode:stored.postcode||trailingPostcode(stored.location),serviceArea:area,
  geocode:preserveGeocode(undefined,stored.geocode,[stored.location,stored.suburb,stored.postcode])};
}

function locationPoint(location){
 if(location.geocode)return location.geocode;
 const point=postcodePoint(location.postcode);
 return point?{latitude:point.lat,longitude:point.lon}:null;
}

export function workRegion(target) {
 return target.serviceArea || locationRegion(target);
}

// A metro-wide declaration covers each metro subregion. A broader search
// also finds technicians serving a named part of the selected region.
export function declaredAreasInRegion(areas,region) {
 return region ? (areas??[]).filter(id=>areaIncludes(id,region)||areaIncludes(region,id)) : [];
}

export function technicianMatchesFilters(technician,{region='',mode='either',postcode='',radius=''}={}) {
 if(region) {
  const located=areaIncludes(region,technician.baseRegion);
  const serves=declaredAreasInRegion(technician.serviceAreas,region).length>0;
  if (!(mode==='coverage'?serves:mode==='base'?located:located||serves)) return false;
 }
 const base=technician.baseLocation??technician;
 if(postcode && !String(base.postcode||'').startsWith(postcode.trim()))return false;
 if(radius && !(Number.isFinite(technician.distanceKm)&&technician.distanceKm<=Number(radius)))return false;
 return true;
}

export function rankTechnicians(directory,target,skills=[]){
 const destination=locationPoint(target),region=workRegion(target);
 return directory.map(technician=>{
  const base=technician.baseLocation??technician;
  const skillMatch=skills.every(skill=>technician.skills.includes(skill));
  const postcodeMatch=target.postcode&&base.postcode?target.postcode===base.postcode:null;
  const baseRegion=locationRegion(base);
  const areaMatch=region?declaredAreasInRegion(technician.serviceAreas,region).length>0:null;
  const exact=Boolean(target.geocode&&base.geocode);
  const sameArea=postcodeMatch&&!exact;
  const km=sameArea?null:proximityKm(destination,locationPoint(base));
  const distanceBasis=sameArea?'same-postcode':km===null?null:exact?'address':'postcode';
  const locationReason=sameArea?'Same recorded postcode; distance unknown':km!==null?
    (exact?km.toFixed(1)+' km straight-line between saved map positions':(km<1?'Under 1 km':'About '+Math.round(km)+' km')+' straight-line (postcode estimate)'):
    areaMatch?'Recorded coverage in the work region':'Distance unknown';
  const matchLevel=!skillMatch?'missing-skills':postcodeMatch?'same-postcode':km!==null?'distance':areaMatch?'service-area':'skills-only';
  return {...technician,skillMatch,postcodeMatch,areaMatch,baseRegion,matchLevel,locationReason,distanceBasis,distanceKm:km,
    matchReasons:[skillMatch?(skills.length?'All requested skills recorded':'No skills requested'):'Requested skills are missing',locationReason]};
 }).sort((a,b)=>Number(b.skillMatch)-Number(a.skillMatch)
   || Number(a.availability==='unavailable')-Number(b.availability==='unavailable')
   || Number(b.distanceBasis==='same-postcode')-Number(a.distanceBasis==='same-postcode')
   || (a.distanceKm??Infinity)-(b.distanceKm??Infinity)
   || Number(Boolean(b.areaMatch))-Number(Boolean(a.areaMatch))
   || a.openCount-b.openCount || a.name.localeCompare(b.name,'en-AU') || a.id.localeCompare(b.id));
}
