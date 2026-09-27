// A classic script also runs from file://, unlike the application's ES module.
if (location.protocol === 'file:') {
  document.documentElement.dataset.localFile = 'true';
  document.querySelector('#launch-help').hidden = false;
} else {
  // HTTP IP-address labs lack randomUUID, but getRandomValues remains available.
  // Request IDs still use cryptographic randomness; HTTPS retains the native API.
  if (!crypto.randomUUID) {
    crypto.randomUUID = () => {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 15) | 64;
      bytes[8] = (bytes[8] & 63) | 128;
      const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
    };
  }
  const application = document.createElement('script');
  application.type = 'module';
  application.src = './app.js';
  application.onerror=()=>{const host=document.querySelector('#auth-form-host');if(!host)return;host.hidden=false;document.querySelector('#auth-status').textContent='';const message=document.createElement('p');message.textContent='The workspace could not load. Check the local service, then reload to try again.';const retry=document.createElement('button');retry.type='button';retry.textContent='Reload';retry.onclick=()=>location.reload();host.replaceChildren(message,retry);};
  document.head.append(application);
}
