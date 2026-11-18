// Approximate Australian service-area inference. Explicit technician coverage is
// stored separately; this module only describes a recorded geographic location.
import {polygons,postalLocalities,namesOutsideSA,postcodesOutsideSA} from './service-region-data.js';

const metroDistricts = new Set(['eastern','western','southern','northern']);
const regionIds = new Set([...metroDistricts,'metro','regional','adelaide-hills']);
const sharedNames = new Set(namesOutsideSA);
const sharedPostcodes = new Set(postcodesOutsideSA);

export function areaIncludes(selected, specific) {
  return regionIds.has(selected) && (selected === specific || selected === 'metro' && metroDistricts.has(specific));
}

function commonRegion(regions) {
  if (regions.length && regions.every(region => region === regions[0])) return regions[0];
  if (regions.length && regions.every(region => areaIncludes('metro', region))) return 'metro';
  return '';
}

const postcodeRegions = new Map();
const namedRegions = new Map();
for (const [code, localities] of Object.entries(postalLocalities)) {
  postcodeRegions.set(code, commonRegion(Object.values(localities)));
  for (const [name, region] of Object.entries(localities)) {
    const previous = namedRegions.get(name);
    namedRegions.set(name, previous === undefined ? region : commonRegion([previous,region]));
  }
}

// A small band around a simplified border avoids presenting a precise side for
// an address closer to it than the source simplification tolerance.
const border = 0.00015;
function polygonMatch(x,y,rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i=1; i<ring.length; i++) {
      const [ax,ay] = ring[i-1], [bx,by] = ring[i];
      if (y < Math.min(ay,by)-border || y > Math.max(ay,by)+border) continue;
      if (x >= Math.min(ax,bx)-border && x <= Math.max(ax,bx)+border) {
        const dx=bx-ax, dy=by-ay, length=dx*dx+dy*dy;
        const t=length ? Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/length)) : 0;
        if (Math.hypot(x-ax-t*dx,y-ay-t*dy) <= border) return 'border';
      }
      if ((ay>y)!==(by>y) && x < ax+(y-ay)*(bx-ax)/(by-ay)) inside=!inside;
    }
  }
  return inside ? 'inside' : 'outside';
}

const pinCache = new Map();
function pinRegion(latitude,longitude) {
  const key = latitude + ',' + longitude;
  if (pinCache.has(key)) return pinCache.get(key);
  const regions = [];
  let touchesBorder = false;
  for (const [region,[west,south,east,north],rings] of polygons) {
    if (longitude < west-border || longitude > east+border || latitude < south-border || latitude > north+border) continue;
    const match = polygonMatch(longitude,latitude,rings);
    if (match !== 'outside') regions.push(region);
    if (match === 'border') touchesBorder=true;
  }
  // A common metro parent is usable across two metro districts, but a single
  // intersected border could face the ocean or another state.
  const result = touchesBorder && regions.length < 2 ? '' : commonRegion(regions);
  if (pinCache.size >= 512) pinCache.delete(pinCache.keys().next().value);
  pinCache.set(key,result);
  return result;
}

export function locationRegion(location={}) {
  if (!location) return '';
  const state = String(location.state || '').trim().toUpperCase();
  if (state && state !== 'SA' && state !== 'SOUTH AUSTRALIA') return '';
  const {latitude,longitude} = location.geocode || {};
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) return pinRegion(latitude,longitude);

  const code = String(location.postcode || '').trim();
  const name = String(location.suburb || '').trim().replace(/\s+/g,' ').toLowerCase();
  if (code) {
    if (!Object.hasOwn(postalLocalities,code) || !state && sharedPostcodes.has(code)) return '';
    const places = postalLocalities[code];
    return name ? (Object.hasOwn(places,name) ? places[name] : '') : postcodeRegions.get(code);
  }
  if (!name || !state && sharedNames.has(name)) return '';
  return namedRegions.get(name) || '';
}
