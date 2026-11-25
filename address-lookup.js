import {attachLocalityPicker} from './locality-picker.js';
import {addressKey,proximityKm} from './location-geocode.js';
const SETTINGS='tadsa.address-lookup.v1',USAGE='tadsa.address-usage.v1';
const cache=new Map();let lastRequest=0;
const node=(tag,text)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;};
const hosted=()=>globalThis.document?.documentElement?.dataset.hostedStaging==='true';
const offline=()=>globalThis.document?.documentElement?.dataset.offlinePreview==='true';
const SA_LOCATOR='https://location.sa.gov.au/arcgis/rest/services/Locators/SAGAF_PLUS/GeocodeServer/findAddressCandidates';
function providers(){
 return hosted()?['locationsa','manual']:['auto','locationsa','geoapify','photon','manual'];
}
export function lookupSettings(){
 const fallback=hosted()||offline()?'manual':'auto';
 if(offline())return {provider:'manual',key:'',region:'SA'};
 try{
  const s=JSON.parse(localStorage.getItem(hosted()?SETTINGS+'.staging':SETTINGS));
  return {provider:providers().includes(s?.provider)?s.provider:fallback,key:!hosted()&&typeof s?.key==='string'?s.key:'',region:!hosted()&&s?.region==='au'?'au':'SA'};
 }catch{return {provider:fallback,key:'',region:'SA'};}
}
export function saveLookupSettings(value){
 if(offline()||!providers().includes(value.provider)||typeof value.key!=='string'||value.key.length>256||value.region&&!['SA','au'].includes(value.region))throw Error('Choose valid address lookup settings.');
 localStorage.setItem(hosted()?SETTINGS+'.staging':SETTINGS,JSON.stringify({provider:value.provider,key:hosted()?'':value.key.trim(),region:value.region==='au'?'au':'SA'}));cache.clear();
}
const states={'South Australia':'SA','New South Wales':'NSW','Victoria':'VIC','Queensland':'QLD','Western Australia':'WA','Tasmania':'TAS','Northern Territory':'NT','Australian Capital Territory':'ACT'};
export function addressResults(data,provider,preferredState='',query=''){
 if(provider==='locationsa'){
  if(data?.error)throw Error('Location SA is unavailable. Enter the address manually or try again later.');
  const results=[],typed=query.trim().toUpperCase();
  const unit=typed.match(/^(?:(?:UNIT|SHOP|SUITE|FLAT|APARTMENT)\s+)?([A-Z0-9-]+)\s*[/,]\s*(\d+[A-Z]?(?:-\d+[A-Z]?)?)\b/)||
    typed.match(/^(?:UNIT|SHOP|SUITE|FLAT|APARTMENT)\s+([A-Z0-9-]+)\s+(\d+[A-Z]?(?:-\d+[A-Z]?)?)\b/);
  const number=unit?.[2]??typed.match(/^(\d+[A-Z]?(?:-\d+[A-Z]?)?)\s/)?.[1];
  for(const candidate of (Array.isArray(data?.candidates)?data.candidates:[]).slice(0,20)){
   const a=candidate?.attributes,point=candidate?.location;
   if(!a||a.Addr_type!=='Address'||candidate.score<80||!Number.isFinite(candidate.score)||!Number.isFinite(point?.y)||!Number.isFinite(point?.x)||point.y< -39||point.y> -25||point.x<128||point.x>142)continue;
   const postcode=String(a.Postcode??''),suburb=String(a.Locality??'').trim(),street=String(candidate.address??'').split(',')[0].trim();
   if(!street||!suburb||street.length>250||suburb.length>100||a.State!=='SOUTH AUSTRALIA'||!/^\d{4}$/.test(postcode)||number&&String(a.HouseNumber).toUpperCase()!==number||unit&&unit[1]!==String(a.UnitNumber??'').toUpperCase())continue;
   const label=[street,suburb,'SA',postcode].join(', ');
   if(!results.some(row=>row.label===label))results.push({street,suburb,state:'SA',postcode,label,latitude:point.y,longitude:point.x,provider});
  }
  return results.slice(0,5);
 }
 const rows=provider==='geoapify'?data?.results:data?.features?.map(f=>({...f.properties,lon:f.geometry?.coordinates?.[0],lat:f.geometry?.coordinates?.[1]}));
 if(!Array.isArray(rows))return [];
 // These adapters do not expose a verified unit field. Keep the operator's
 // complete unit address intact if the provider only identifies a building.
 if(/^(?:(?:unit|shop|suite|flat|apartment)\s+[a-z0-9-]+\b|[a-z0-9-]+\s*\/\s*\d)/i.test(query.trim()))return [];
 const houseNumber=query.trim().match(/^(\d+[a-z]?(?:-\d+[a-z]?)?)\s/i)?.[1]?.toUpperCase();
 return rows.slice(0,20).flatMap(p=>{
  if(!p||houseNumber&&String(p.housenumber??'').toUpperCase()!==houseNumber)return [];
  if(String(p.country_code??p.countrycode).toLowerCase()!=='au'||!Number.isFinite(p.lat)||!Number.isFinite(p.lon)||p.lat < -90||p.lat>90||p.lon < -180||p.lon>180)return [];
  const stateCode=String(p.state_code??'').replace(/^AU-/i,''),state=Object.values(states).includes(stateCode)?stateCode:states[p.state]??'';
  if(typeof p.street!=='string'||!p.street.trim())return [];
  const name=!p.housenumber&&typeof p.name==='string'&&p.name!==p.street?p.name+', ':'';
  const street=name+[p.housenumber,p.street].filter(Boolean).join(' '),suburb=p.suburb||p.city||p.town||p.village||p.district||'',postcode=/^[0-9]{4}$/.test(String(p.postcode??''))?String(p.postcode):'';
  if(!street||typeof suburb!=='string'||!suburb||!state||!postcode)return [];
  const label=[street,suburb,state,postcode].join(', ');
  if(street.length>250||suburb.length>100||label.length>500)return [];
  return [{street,suburb,state,postcode,label,latitude:p.lat,longitude:p.lon,provider}];
 }).filter((p,i,all)=>all.findIndex(x=>x.label===p.label)===i).sort((a,b)=>Number(b.state===preferredState)-Number(a.state===preferredState)).slice(0,5);
}
export function addressQuery(text,config,locality={}){
 const q=String(text).trim();
 const explicit=Object.entries(states).find(([name,code])=>new RegExp('\\b('+name+'|'+code+')\\b','i').test(q))?.[1];
 const localState=String(locality.state||'').trim();
 const normalizedState=Object.entries(states).find(([name,code])=>name.toLowerCase()===localState.toLowerCase()||code===localState.toUpperCase())?.[1];
 const preferredState=explicit||normalizedState||(config.region==='au'?'':'SA');
 // Separate locality fields refine a partial street query, but an explicitly
 // typed state/postcode takes precedence over an old locality still in the form.
 const parts=[q];
 if(!explicit&&!/\b\d{4}\s*$/.test(q))for(const value of [locality.suburb,locality.postcode])if(value&&!q.toLowerCase().includes(String(value).toLowerCase()))parts.push(value);
 const query=parts.join(', ');
 const postcode=q.match(/\s(\d{4})$/)?.[1]||(!explicit?locality.postcode:'');
 const outsideSA=Boolean(postcode&&!/^5\d{3}$/.test(postcode));
 const numbered=/^(?:(?:unit|shop|suite|flat|apartment)\s+)?\d/i.test(q);
 const provider=config.provider==='auto'?(preferredState==='SA'&&!outsideSA&&numbered?'locationsa':'photon'):config.provider;
 if(provider==='locationsa'){
  if(explicit&&explicit!=='SA'||outsideSA)throw Error('Location SA covers South Australia. Enter interstate addresses manually or choose an Australian provider where available.');
  const url=new URL(SA_LOCATOR);
  url.search=new URLSearchParams({'Single Line Input':query,f:'json',outSR:'4326',outFields:'Addr_type,UnitNumber,HouseNumber,Locality,State,Postcode',maxLocations:'10'});
  return {url:url.href,preferredState,provider};
 }
 const url=new URL(provider==='geoapify'?'https://api.geoapify.com/v1/geocode/autocomplete':'https://photon.komoot.io/api/');
 if(config.provider==='geoapify')url.search=new URLSearchParams({text:query,filter:'countrycode:au',format:'json',limit:'10',lang:'en',apiKey:config.key,...(preferredState==='SA'?{bias:'proximity:138.6007,-34.9285'}:{})}).toString();
 else url.search=new URLSearchParams({q:query,limit:'10',lang:'en',bbox:'112,-44,154,-10',countrycode:'AU',...(preferredState==='SA'?{lat:'-34.9285',lon:'138.6007',zoom:'7',location_bias_scale:'0.1'}:{})}).toString();
 return {url:url.href,preferredState,provider};
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
export async function lookupAddress(text,signal,locality={}){
 const config=lookupSettings(),q=String(text).trim();if(q.length<4||q.length>250)return [];
 if(config.provider==='manual')throw Error('Manual address entry is selected in Settings.');
 if(config.provider==='geoapify'&&!config.key)throw Error('Add a free Geoapify key in Settings → Address suggestions, or choose Photon. You can enter the address manually.');
 const query=addressQuery(q,config,locality),cacheKey=query.url+'|'+query.preferredState;if(cache.has(cacheKey))return cache.get(cacheKey);
 const result=addressResults(await providerRequest(query.url,signal),query.provider,query.preferredState,q);
 if(cache.size>=50)cache.delete(cache.keys().next().value);cache.set(cacheKey,result);return result;
}
export function attachAddressLookup(input,{draft,fields,geoField}={}){
 // Normalise operator edits before the form records its draft or binds coordinates.
 // Reading an old address or editing unrelated fields does not rewrite saved text.
 if(geoField)for(const key of fields.keys){
  const control=fields.elements?.[key]??(key===fields.street?input:null);
  if(!control||control.tagName==='SELECT')continue;
  control.addEventListener('input',event=>{
   if(event.isComposing)return;
   const value=control.value,upper=value.toUpperCase();
   if(upper===value)return;
   const start=control.selectionStart,end=control.selectionEnd;
   control.value=upper;
   if(start!==null&&end!==null)control.setSelectionRange(value.slice(0,start).toUpperCase().length,value.slice(0,end).toUpperCase().length);
  },true);
 }
 attachLocalityPicker(fields);
 // fields maps provider parts to the form's saved keys. Unmapped locality is
 // included in address text, never silently dropped from a selected address.
 const form=input.closest('form'),box=node('div');box.className='address-lookup';
 const onlineHint='Type at least four characters, including a suburb or postcode for better matches. '+(lookupSettings().region==='SA'?'South Australian matches are preferred. ':'')+'Manual entry always works.';
 const lookupHint=()=>lookupSettings().provider==='manual'?'Enter the address manually.':onlineHint;
 const status=node('p',lookupHint());status.className='field-help';status.setAttribute('role','status');
 const list=node('div');list.className='address-suggestions';const id='address-'+crypto.randomUUID();list.id=id;list.setAttribute('role','listbox');list.setAttribute('aria-label','Address suggestions');
 input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-controls',id);input.setAttribute('aria-expanded','false');input.autocomplete='off';
 const attribution=node('p');attribution.className='field-help';
 const sourceLink=(text,href)=>{const a=node('a',text);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;};
 const enable=node('button','Enable online address suggestions');enable.type='button';enable.className='secondary';
 function updateLookupHelp(){
  const provider=lookupSettings().provider;
  enable.hidden=!hosted()||offline()||provider!=='manual';
  attribution.replaceChildren();
  if(provider==='manual'){
   if(!enable.hidden)attribution.append('Enable to send typed street and locality to Location SA for suggestions in this browser.');
   return;
  }
  attribution.append('Address lookup sends typed street and locality to ');
  if(provider==='auto'||provider==='locationsa')attribution.append(sourceLink('Location SA','https://location.sa.gov.au/'));
  if(provider==='auto')attribution.append(' or ');
  if(provider==='auto'||provider==='photon')attribution.append('Photon (© ',sourceLink('OpenStreetMap contributors','https://www.openstreetmap.org/copyright'),')');
  if(provider==='geoapify')attribution.append(sourceLink('Geoapify','https://www.geoapify.com/'),' · © ',sourceLink('OpenStreetMap contributors','https://www.openstreetmap.org/copyright'));
  attribution.append('.');
 }
 updateLookupHelp();box.append(list,status,attribution,enable);input.parentElement.after(box);
 enable.onclick=()=>{try{saveLookupSettings({provider:'locationsa',key:'',region:'SA'});updateLookupHelp();input.focus();schedule();}catch{status.textContent='Browser settings could not be saved. Enter the address manually.';}};
 input.addEventListener('focus',updateLookupHelp);
 let timer,controller,revision=0,active=-1,items=[],applying=false;
 const close=()=>{list.replaceChildren();input.setAttribute('aria-expanded','false');input.removeAttribute('aria-activedescendant');active=-1;};
 const dismiss=()=>{
  if(list.children.length||status.textContent==='Finding addresses…')status.textContent=lookupHint();
  revision++;controller?.abort();clearTimeout(timer);close();
 };
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
 function schedule(){if(applying)return;const own=++revision;clearTimeout(timer);controller?.abort();close();status.textContent=lookupHint();if(input.value.trim().length<4||lookupSettings().provider==='manual')return;
  timer=setTimeout(async()=>{if(!input.isConnected||input.disabled)return;controller=new AbortController();status.textContent='Finding addresses…';try{items=await lookupAddress(input.value,controller.signal,Object.fromEntries(['suburb','state','postcode'].map(part=>[part,fields[part]?draft[fields[part]]:''])));if(own!==revision||!input.isConnected||input.disabled)return;close();for(const [index,item]of items.entries()){const option=node('button',item.label);option.type='button';option.id=id+'-'+index;option.setAttribute('role','option');option.setAttribute('aria-selected','false');option.tabIndex=-1;option.addEventListener('mousedown',e=>e.preventDefault());option.onclick=()=>choose(item);list.append(option);}input.setAttribute('aria-expanded',String(items.length>0));status.textContent=items.length?'Choose an address, or keep typing manually.':'No complete address found. Keep typing or enter it manually.';}catch(error){if(own===revision&&input.isConnected){close();status.textContent=error.name==='AbortError'?'Lookup timed out. Manual entry remains available.':error.message;}}},1000);
 }
 input.addEventListener('input',schedule);
 input.addEventListener('keydown',e=>{
  if(e.key==='Escape'){dismiss();return;}
  if(!list.children.length)return;
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
   e.preventDefault();
   const forward=e.key==='ArrowDown';
   active=active<0?(forward?0:items.length-1):(active+(forward?1:-1)+items.length)%items.length;
   [...list.children].forEach((n,i)=>n.setAttribute('aria-selected',String(i===active)));
   input.setAttribute('aria-activedescendant',list.children[active].id);
  }else if(e.key==='Enter'&&active>=0){e.preventDefault();choose(items[active]);}
 });
 input.addEventListener('blur',()=>setTimeout(()=>{if(document.activeElement!==input&&!box.contains(document.activeElement))dismiss();},150));
 return box;
}
export function renderLookupSettings(parent){
 if(offline())return;
 const box=node('details');box.className='care-details workflow-panel address-lookup-settings';box.append(node('summary','Address suggestions (optional)'),node('p','You can enter every address manually without setting anything up. These optional settings apply only to this browser. Suggestions send typed street and locality to the selected online service.'));
 const form=node('div');form.className='form-grid';box.append(form);
 const config=lookupSettings(),label=node('label'),select=node('select');label.className='workflow-field';const providerLabel=node('span','Address lookup provider');providerLabel.className='field-label';label.append(providerLabel);select.setAttribute('aria-label','Address lookup provider');for(const [value,text]of [['auto','Australian addresses — Location SA and Photon'],['locationsa','Location SA — free South Australian addresses'],['geoapify','Geoapify — free account'],['photon','Photon — public community service'],['manual','Manual entry only']].filter(([id])=>providers().includes(id))){const o=node('option',text);o.value=value;select.append(o);}select.value=config.provider;label.append(select);
 const keyLabel=node('label'),key=node('input');keyLabel.className='workflow-field';const keyTitle=node('span','Geoapify API key');keyTitle.className='field-label';keyLabel.append(keyTitle);key.type='password';key.autocomplete='off';key.maxLength=256;key.value=config.key;key.setAttribute('aria-label','Geoapify API key');keyLabel.append(key);
 const help=node('p','An application programming interface (API) key connects this browser to your free account. Keep that account on its Free plan and restrict the key to your app’s website origins. The app caps requests at 250 per browser per UTC day; your provider account allowance is shared across browsers. No paid fallback is used.');help.className='field-help';
 const setup=node('a','Create a free Geoapify key');setup.href='https://myprojects.geoapify.com/';setup.target='_blank';setup.rel='noopener noreferrer';const feedback=node('p');feedback.className='field-help';feedback.setAttribute('role','status');const actions=node('div');actions.className='actions';const save=node('button','Save address lookup settings');save.className='primary';save.type='button';save.onclick=()=>{try{saveLookupSettings({provider:select.value,key:key.value,region:region.value});feedback.textContent='Address lookup settings saved for this browser.';}catch{feedback.textContent='Settings could not be saved. Check that browser storage is available.';}};
 const regionLabel=node('label','Preferred address search area'),region=node('select');region.setAttribute('aria-label','Preferred address search area');for(const [value,label]of [['SA','South Australia first'],['au','All Australia']]){const option=node('option',label);option.value=value;region.append(option);}region.value=config.region;regionLabel.append(region);if(!hosted())form.append(regionLabel);
 const toggle=()=>{keyLabel.hidden=help.hidden=setup.hidden=select.value!=='geoapify';};select.onchange=toggle;toggle();actions.append(save);form.append(label,keyLabel,help,setup,actions,feedback);parent.append(box);
}
export async function drivingEstimate(from,to){
 const config=lookupSettings();if(config.provider!=='geoapify'||!config.key)throw Error('Driving estimates need a free Geoapify key in Settings. You can also open directions in maps.');
 if(!from||!to)throw Error('Select and save both addresses from suggestions first.');
 const url=new URL('https://api.geoapify.com/v1/routing');url.search=new URLSearchParams({waypoints:`${from.latitude},${from.longitude}|${to.latitude},${to.longitude}`,mode:'drive',units:'metric',apiKey:config.key}).toString();
 const data=await providerRequest(url.href),p=data?.features?.[0]?.properties;if(!Number.isFinite(p?.distance)||p.distance<0||!Number.isFinite(p?.time)||p.time<0)throw Error('No driving route returned. Straight-line distance is not a road estimate.');return {km:p.distance/1000,minutes:p.time/60};
}
export function renderTravelComparison(parent,location,technicians){
 const box=node('details');box.className='care-details';box.append(node('summary','Compare technician travel'),node('p','Distances use saved map positions and are approximate. Straight-line proximity is available offline; driving estimates need internet and do not include live traffic. Check skills, availability and the actual work address before assigning anyone.'));
 const target=location.geocode;if(!target){box.append(node('p','Postcode estimates appear beside team candidates when available. Save map positions for a more precise travel comparison.'));parent.append(box);return;}
 const rows=technicians.map(t=>({...t,point:t.geocode??t.baseLocation?.geocode,km:proximityKm(target,t.geocode??t.baseLocation?.geocode)})).sort((a,b)=>(a.km??Infinity)-(b.km??Infinity)||a.name.localeCompare(b.name));
 for(const t of rows){const row=node('div');row.className='travel-row';row.append(node('strong',t.name),node('span',t.km===null?'Base map position not recorded':`${t.km.toFixed(1)} km straight-line`));if(t.point&&document.documentElement.dataset.hostedStaging!=='true'){const status=node('span'),button=node('button','Estimate driving');button.type='button';button.onclick=async()=>{button.disabled=true;status.textContent='Checking route…';try{const route=await drivingEstimate(t.point,target);status.textContent=`${route.km.toFixed(1)} km · about ${Math.round(route.minutes)} minutes driving (not live traffic)`;}catch(e){status.textContent=e.message;}finally{button.disabled=false;}};const maps=node('a','Open driving directions');maps.href='https://www.google.com/maps/dir/?api=1&origin='+encodeURIComponent(`${t.point.latitude},${t.point.longitude}`)+'&destination='+encodeURIComponent(`${target.latitude},${target.longitude}`)+'&travelmode=driving';maps.target='_blank';maps.rel='noopener noreferrer';row.append(button,maps,status);}box.append(row);}
 box.append(node('p','Routing: Geoapify · OpenStreetMap data.'));parent.append(box);
}
