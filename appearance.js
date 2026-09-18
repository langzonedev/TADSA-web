// Apply device preferences before the stylesheet paints, in either storage mode.
(()=>{
 const key='tadsa-preferences-v1',colour=matchMedia('(prefers-color-scheme: dark)'),motion=matchMedia('(prefers-reduced-motion: reduce)');
 function apply(){let p={};try{p=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}document.documentElement.dataset.theme=p.theme==='dark'||(p.theme!=='light'&&colour.matches)?'dark':'light';document.documentElement.dataset.motion=p.motion==='reduced'||motion.matches?'reduced':'standard';}
 apply();colour.addEventListener('change',apply);motion.addEventListener('change',apply);addEventListener('storage',e=>{if(e.key===key||e.key===null)apply();});addEventListener('tadsa-preferences',apply);
})();
