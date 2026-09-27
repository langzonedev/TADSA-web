import {addressKey,proximityKm} from './location-geocode.js';
const SETTINGS='tadsa.address-lookup.v1',USAGE='tadsa.address-usage.v1';
const cache=new Map();let lastRequest=0;
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
export function lookupSettings(){try{const s=JSON.parse(localStorage.getItem(SETTINGS));return {provider:['geoapify','photon','manual'].includes(s?.provider)?s.provider:'photon',key:typeof s?.key==='string'?s.key:''};}catch{return {provider:'photon',key:''};}}
export function saveLookupSettings(value){if(!['geoapify','photon','manual'].includes(value.provider)||typeof value.key!=='string'||value.key.length>256)throw Error('Choose valid address lookup settings.');localStorage.setItem(SETTINGS,JSON.stringify({provider:value.provider,key:value.key.trim()}));cache.clear();}
const states={'South Australia':'SA','New South Wales':'NSW','Victoria':'VIC','Queensland':'QLD','Western Australia':'WA','Tasmania':'TAS','Northern Territory':'NT','Australian Capital Territory':'ACT'};
export function addressResults(data,provider){
 const rows=provider==='geoapify'?data?.results:data?.features?.map(f=>({...f.properties,lon:f.geometry?.coordinates?.[0],lat:f.geometry?.coordinates?.[1]}));
 if(!Array.isArray(rows))return [];
 return rows.slice(0,20).flatMap(p=>{
  if(String(p.country_code??p.countrycode).toLowerCase()!=='au'||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat < -90||p.lat>90||p.lon < -180||p.lon>180)return [];
  const stateCode=String(p.state_code??'').replace(/^AU-/i,''),state=Object.values(states).includes(stateCode)?stateCode:states[p.state]??'';
  if(typeof p.street!=='string'||!p.street.trim())return [];
  const name=!p.housenumber&&typeof p.name==='string'&&p.name!==p.street?p.name+', ':'';
  const street=name+[p.housenumber,p.street].filter(Boolean).join(' '),suburb=p.suburb||p.city||p.town||p.village||p.district||'',postcode=/^[0-9]{4}$/.test(String(p.postcode??''))?String(p.postcode):'';
  if(!street||typeof suburb!=='string'||!suburb||!state||!postcode)return [];
  const label=[street,suburb,state,postcode].join(', ');
  if(street.length>250||suburb.length>100||label.length>500)return [];
  return [{street,suburb,state,postcode,label,latitude:p.lat,longitude:p.lon,provider}];
 }).filter((p,i,all)=>all.findIndex(x=>x.label===p.label)===i).slice(0,5);
}
async function providerRequest(url,signal){
 if(navigator.onLine===false)throw Error('Offline — enter the address manually.');
 const today=new Date().toISOString().slice(0,10);let usage;
 try{usage=JSON.parse(localStorage.getItem(USAGE));}catch{}
 if(usage?.date!==today)usage={date:today,count:0};
 if(usage.count>=250)throw Error('This browser’s daily lookup limit is reached. Manual entry remains available.');
 if(Date.now()-lastRequest<900)throw Error('Please pause briefly and try again.');
 lastRequest=Date.now();usage.count++;
 try{localStorage.setItem(USAGE,JSON.stringify(usage));}catch{throw Error('Lookup usage cannot be tracked in this browser. Enter the address manually.');}
 const controller=new AbortController(),abort=()=>controller.abort();signal?.addEventListener('abort',abort,{once:true});
 if(signal?.aborted)controller.abort();const timer=setTimeout(abort,7000);
 try{
  const response=await fetch(url,{signal:controller.signal,credentials:'omit',referrerPolicy:'strict-origin-when-cross-origin'});
  if(!response.ok)throw Error('Online lookup is unavailable or its allowance is exhausted. Enter the address manually.');
  return await response.json();
 }catch(error){if(error instanceof TypeError||error instanceof SyntaxError)throw Error('Online lookup is unavailable. Enter the address manually or try again later.');throw error;
 }finally{clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function lookupAddress(text,signal){
 const config=lookupSettings(),q=String(text).trim();if(q.length<4||q.length>250)return [];
 if(config.provider==='manual')throw Error('Manual address entry is selected in Settings.');
 if(config.provider==='geoapify'&&!config.key)throw Error('Add a free Geoapify key in Settings → Address suggestions, or choose Photon. You can enter the address manually.');
 const cacheKey=config.provider+'|'+q.toLowerCase();if(cache.has(cacheKey))return cache.get(cacheKey);
 const url=new URL(config.provider==='geoapify'?'https://api.geoapify.com/v1/geocode/autocomplete':'https://photon.komoot.io/api/');
 if(config.provider==='geoapify'){url.search=new URLSearchParams({text:q,filter:'countrycode:au',format:'json',limit:'5',lang:'en',apiKey:config.key}).toString();}
 else url.search=new URLSearchParams({q,limit:'5',lang:'en',bbox:'112,-44,154,-10'}).toString();
 const result=addressResults(await providerRequest(url.href,signal),config.provider);
 if(cache.size>=50)cache.delete(cache.keys().next().value);cache.set(cacheKey,result);return result;
}
export function attachAddressLookup(input,{draft,fields,geoField}={}){
 // fields maps provider parts to the form's saved keys. Unmapped locality is
 // included in address text, never silently dropped from a selected address.
 const form=input.closest('form'),box=node('div');box.className='address-lookup';
 const status=node('p','Type at least four characters for Australian address suggestions. Manual entry always works.');status.className='field-help';status.setAttribute('role','status');
 const list=node('div');list.className='address-suggestions';const id='address-'+crypto.randomUUID();list.id=id;list.setAttribute('role','listbox');list.setAttribute('aria-label','Address suggestions');
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
 const attribution=node('p');attribution.className='field-help';const providerLink=node('a','Geoapify'),osm=node('a','OpenStreetMap contributors');providerLink.href='https://www.geoapify.com/';osm.href='https://www.openstreetmap.org/copyright';for(const a of [providerLink,osm]){a.target='_blank';a.rel='noopener noreferrer';}attribution.append('Online address text is sent to the selected service. Powered by ',providerLink,' / Photon · © ',osm,'.');
 box.append(list,status,attribution);input.parentElement.after(box);
 let timer,controller,revision=0,active=-1,items=[],applying=false;
 const close=()=>{list.replaceChildren();input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
 // Resolve controls by the supplied elements, avoiding assumptions about labels.
 const set=(key,value)=>{draft[key]=value;const control=fields.elements?.[key]??(key===fields.street?input:null);if(control){control.value=value;control.dispatchEvent(new Event(control.tagName==='SELECT'?'change':'input',{bubbles:true}));}};
 const values=()=>fields.keys.map(key=>draft[key]);
 const choose=item=>{
  if(input.disabled||form.closest('[inert]'))return;
  applying=true;revision++;controller?.abort();clearTimeout(timer);
  let street=item.street;if(!fields.state)street+=', '+item.state;if(!fields.suburb&&!fields.postcode)street=item.label;
  set(fields.street,street);for(const part of ['suburb','state','postcode'])if(fields[part])set(fields[part],item[part]);
  // Address line 2 is retained for unit/access details; a provider never erases it.
  if(geoField)draft[geoField]={latitude:item.latitude,longitude:item.longitude,provider:item.provider,matchedAt:new Date().toISOString(),addressKey:addressKey(values())};
  applying=false;close();status.textContent='Address selected. Check the street, unit and locality before saving; map positions are approximate.';input.dispatchEvent(new Event('change',{bubbles:true}));input.focus();
 };
 const invalidate=()=>{if(applying)return;if(geoField)draft[geoField]=null;revision++;controller?.abort();clearTimeout(timer);close();};
 for(const key of fields.keys){const c=fields.elements?.[key]??(key===fields.street?input:null);c?.addEventListener(c.tagName==='SELECT'?'change':'input',invalidate);}
 input.addEventListener('input',()=>{if(applying)return;const own=++revision;clearTimeout(timer);controller?.abort();close();if(input.value.trim().length<4)return;
  timer=setTimeout(async()=>{if(!input.isConnected||input.disabled)return;controller=new AbortController();status.textContent='Finding addresses…';try{items=await lookupAddress(input.value,controller.signal);if(own!==revision||!input.isConnected||input.disabled)return;close();for(const [index,item]of items.entries()){const option=node('button',item.label);option.type='button';option.id=id+'-'+index;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.tabIndex=-1;option.addEventListener('mousedown',e=>e.preventDefault());option.onclick=()=>choose(item);list.append(option);}input.setAttribute('aria-expanded',String(items.length>0));status.textContent=items.length?'Choose an address, or keep typing manually.':'No complete address found. Keep typing or enter it manually.';}catch(error){if(own===revision&&input.isConnected){close();status.textContent=error.name==='AbortError'?'Lookup timed out. Manual entry remains available.':error.message;}}},1000);
 });
 input.addEventListener('keydown',e=>{if(e.key==='Escape'){revision++;controller?.abort();clearTimeout(timer);close();return;}if(!list.children.length)return;if(['ArrowDown','ArrowUp'].includes(e.key)){e.preventDefault();active=(active+(e.key==='ArrowDown'?1:-1)+items.length)%items.length;[...list.children].forEach((n,i)=>n.setAttribute('aria-selected',String(i===active)));input.setAttribute('aria-activedescendant',list.children[active].id);}else if(e.key==='Enter'&&active>=0){e.preventDefault();choose(items[active]);}});
 input.addEventListener('blur',()=>setTimeout(()=>{if(!box.contains(document.activeElement)){revision++;controller?.abort();clearTimeout(timer);close();}},150));
 return box;
}
export function renderLookupSettings(parent){
 const box=node('section');box.className='panel';box.append(node('h2','Address suggestions'),node('p','These settings apply to this browser. Use a Geoapify Free plan key for address suggestions and driving estimates, or Photon for account-free suggestions. Both depend on internet access; all addresses can be entered manually.'));
 const config=lookupSettings(),label=node('label','Address lookup provider'),select=node('select');select.setAttribute('aria-label','Address lookup provider');for(const [value,text]of [['geoapify','Geoapify — free account'],['photon','Photon — public community service'],['manual','Manual entry only']]){const o=node('option',text);o.value=value;select.append(o);}select.value=config.provider;label.append(select);
 const keyLabel=node('label','Geoapify API key'),key=node('input');key.type='password';key.autocomplete='off';key.maxLength=256;key.value=config.key;key.setAttribute('aria-label','Geoapify API key');keyLabel.append(key);
 const help=node('p','An application programming interface (API) key connects this browser to your free account. Keep that account on its Free plan and restrict the key to your app’s website origins. The app caps requests at 250 per browser per UTC day; your provider account allowance is shared across browsers. No paid fallback is used.');help.className='field-help';
 const setup=node('a','Create a free Geoapify key');setup.href='https://myprojects.geoapify.com/';setup.target='_blank';setup.rel='noopener noreferrer';const feedback=node('p');feedback.setAttribute('role','status');const save=node('button','Save address lookup settings');save.type='button';save.onclick=()=>{try{saveLookupSettings({provider:select.value,key:key.value});feedback.textContent='Address lookup settings saved for this browser.';}catch{feedback.textContent='Settings could not be saved. Check that browser storage is available.';}};
 const toggle=()=>keyLabel.hidden=select.value!=='geoapify';select.onchange=toggle;toggle();box.append(label,keyLabel,help,setup,save,feedback);parent.append(box);
}
export async function drivingEstimate(from,to){
 const config=lookupSettings();if(config.provider!=='geoapify'||!config.key)throw Error('Driving estimates need a free Geoapify key in Settings. You can also open directions in maps.');
 if(!from||!to)throw Error('Select and save both addresses from suggestions first.');
 const url=new URL('https://api.geoapify.com/v1/routing');url.search=new URLSearchParams({waypoints:`${from.latitude},${from.longitude}|${to.latitude},${to.longitude}`,mode:'drive',units:'metric',apiKey:config.key}).toString();
 const data=await providerRequest(url.href),p=data?.features?.[0]?.properties;if(!Number.isFinite(p?.distance)||p.distance<0||!Number.isFinite(p?.time)||p.time<0)throw Error('No driving route returned. Straight-line distance is not a road estimate.');return {km:p.distance/1000,minutes:p.time/60};
}
export function renderTravelComparison(parent,location,technicians){
 const box=node('details');box.className='care-details';box.append(node('summary','Compare technician travel'),node('p','Distances use saved map positions and are approximate. Straight-line proximity is available offline; driving estimates need internet and do not include live traffic. Check skills, availability and the actual work address before assigning anyone.'));
 const target=location.geocode;if(!target){box.append(node('p','Select and save the project work address from suggestions to compare distances.'));parent.append(box);return;}
 const rows=technicians.map(t=>({...t,point:t.geocode??t.baseLocation?.geocode,km:proximityKm(target,t.geocode??t.baseLocation?.geocode)})).sort((a,b)=>(a.km??Infinity)-(b.km??Infinity)||a.name.localeCompare(b.name));
 for(const t of rows){const row=node('div');row.className='travel-row';row.append(node('strong',t.name),node('span',t.km===null?'Base map position not recorded':`${t.km.toFixed(1)} km straight-line`));if(t.point){const status=node('span'),button=node('button','Estimate driving');button.type='button';button.onclick=async()=>{button.disabled=true;status.textContent='Checking route…';try{const route=await drivingEstimate(t.point,target);status.textContent=`${route.km.toFixed(1)} km · about ${Math.round(route.minutes)} minutes driving (not live traffic)`;}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};const maps=node('a','Open driving directions');maps.href='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(`${t.point.latitude},${t.point.longitude}`)+'&destination='+encodeURIComponent(`${target.latitude},${target.longitude}`)+'&travelmode=driving';maps.target='_blank';maps.rel='noopener noreferrer';row.append(button,maps,status);}box.append(row);}
 box.append(node('p','Routing: Geoapify · OpenStreetMap data.'));parent.append(box);
}
