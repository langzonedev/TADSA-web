let locations;
async function getLocations() {
  if (!locations) {
    const {default: catalogue} = await import('./postal-localities.js');
    locations = Object.entries(catalogue).flatMap(([region, names]) => {
      const [state, postcode] = region.split(' ');
      return names.map(name => ({name, key: name.toLowerCase(), state, postcode}));
    });
  }
  return locations;
}

export function attachLocalityPicker(fields) {
  const suburb = fields.elements?.[fields.suburb];
  const postcode = fields.elements?.[fields.postcode];
  const state = fields.elements?.[fields.state];
  if (!suburb || !postcode) return;

  let revision = 0;
  let active;
  const results = document.createElement('div');
  results.className = 'locality-options';
  results.setAttribute('role', 'group');
  results.setAttribute('aria-label', 'Matching Australian localities');
  function close() {
    revision++;
    results.hidden = true;
    results.replaceChildren();
  }
  function choose(place) {
    if (active.disabled || active.closest('[inert]')) return;
    for (const [control, value] of [[suburb, place.name], [postcode, place.postcode], [state, place.state]]) {
      if (!control) continue;
      control.value = value;
      control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', {bubbles:true}));
    }
    close();
    active.focus();
  }
  async function suggest(input) {
    close();
    // Form fills from saved records or a selected street already supply their own locality.
    if (document.activeElement !== input || input.disabled) return;
    const query = input.value.trim().toLowerCase();
    if (input === postcode ? !/^\d{4}$/.test(query) : query.length < 2) return;
    const ticket = revision;
    let all;
    try { all = await getLocations(); } catch { return; }
    if (ticket !== revision || !input.isConnected) return;
    const matches = all.filter(p => input === postcode ? p.postcode === query : p.key.startsWith(query));
    const priority = p => Number(p.key === query) * 4 + Number(p.state === (state?.value || 'SA')) * 2 + Number(p.postcode === postcode.value);
    matches.sort((a,b) => priority(b) - priority(a) || a.name.localeCompare(b.name));
    if (!matches.length) return;
    active = input;
    input.parentElement.after(results);
    for (const place of matches.slice(0,8)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button';
      button.textContent = place.name + ' · ' + place.state + ' ' + place.postcode;
      button.addEventListener('mousedown', event => event.preventDefault());
      button.onclick = () => choose(place);
      results.append(button);
    }
    const credit = document.createElement('a');
    credit.textContent = 'Locality data: GeoNames';
    credit.href = 'https://www.geonames.org/';
    credit.target = '_blank';
    credit.rel = 'noopener noreferrer';
    credit.className = 'field-help';
    results.append(credit);
    results.hidden = false;
  }
  for (const input of [suburb, postcode]) {
    input.addEventListener('input', () => void suggest(input));
    input.addEventListener('blur', event => { if (!results.contains(event.relatedTarget)) close(); });
    input.addEventListener('keydown', event => {
      if (event.key === 'ArrowDown' && !results.hidden && results.firstChild) {
        event.preventDefault();
        results.firstChild.focus();
      } else if (event.key === 'Escape') close();
    });
  }
  results.addEventListener('focusout', event => { if (!results.contains(event.relatedTarget)) close(); });
  results.addEventListener('keydown', event => { if (event.key === 'Escape') { active.focus(); close(); } });
}
