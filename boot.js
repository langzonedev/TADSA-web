// A classic script also runs from file://, unlike the application's ES module.
if (location.protocol === 'file:') {
  document.documentElement.dataset.localFile = 'true';
  document.querySelector('#launch-help').hidden = false;
} else {
  const application = document.createElement('script');
  application.type = 'module';
  application.src = './app.js';
  application.onerror=()=>{const host=document.querySelector('#auth-form-host');if(!host)return;host.hidden=false;document.querySelector('#auth-status').textContent='';const message=document.createElement('p');message.textContent='The workspace could not load. Check the local service, then reload to try again.';const retry=document.createElement('button');retry.type='button';retry.textContent='Reload';retry.onclick=()=>location.reload();host.replaceChildren(message,retry);};
  document.head.append(application);
}
