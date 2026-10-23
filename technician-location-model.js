import {preserveGeocode} from './location-geocode.js';

// Contact addresses are useful for postcode matching, but are not assumed to be
// workshops, service coverage, or permission to travel. An explicit base takes priority.
export function technicianLocation(settings,contact={}) {
 const explicit=Boolean(settings&&(settings.location_recorded||settings.base_address||settings.suburb||settings.postcode||settings.geocode));
 if(explicit){
  const baseAddress=settings.base_address??'',suburb=settings.suburb??'',postcode=settings.postcode??'';
  return {baseAddress,suburb,postcode,geocode:preserveGeocode(undefined,settings.geocode,[baseAddress,suburb,postcode]),locationSource:'technician-base'};
 }
 const baseAddress=[contact.addressLine1,contact.addressLine2].filter(Boolean).join(', '),suburb=contact.suburb??'',postcode=contact.postcode??'';
 return {baseAddress,suburb,postcode,geocode:null,locationSource:baseAddress||suburb||postcode?'person-contact':'unrecorded'};
}
