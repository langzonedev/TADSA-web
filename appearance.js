// Apply device preferences before the stylesheet paints, in either storage mode.
(()=>{
 const key='tadsa-preferences-v1',colour=matchMedia('(prefers-color-scheme: dark)'),motion=matchMedia('(prefers-reduced-motion: reduce)');
 function apply(){let p={};try{p=JSON.parse(localStorage.getItem(key)||'{}')||{};}catch{}document.documentElement.dataset.theme=p.theme==='dark'||(p.theme!=='light'&&colour.matches)?'dark':'light';document.documentElement.dataset.motion=p.motion==='reduced'||motion.matches?'reduced':'standard';}
 function applySidebar(){let collapsed=false;try{collapsed=localStorage.getItem('tadsa-sidebar-collapsed')==='true';}catch{}document.documentElement.dataset.sidebar=collapsed?'collapsed':'expanded';}
 apply();applySidebar();colour.addEventListener('change',apply);motion.addEventListener('change',apply);addEventListener('storage',e=>{if(e.key===key||e.key===null)apply();if(e.key==='tadsa-sidebar-collapsed'||e.key===null)applySidebar();});addEventListener('tadsa-preferences',apply);
})();
