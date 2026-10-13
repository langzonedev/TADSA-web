// Nonblocking, in-page confirmation. Callers retain authority over the action.
const active=new WeakMap();let sequence=0;
export function requestInlineConfirmation(anchor,{title,message,confirmLabel='Confirm',isCurrent=()=>true}={}){
 if(active.has(anchor))return active.get(anchor);
 const current=()=>{try{return anchor.isConnected&&isCurrent();}catch{return false;}};
 if(!current())return Promise.resolve(false);
 let resolve;const result=new Promise(r=>{resolve=r;});active.set(anchor,result);
 const panel=document.createElement('section'),heading=document.createElement('h3'),description=document.createElement('p'),actions=document.createElement('div'),cancel=document.createElement('button'),confirm=document.createElement('button');
 panel.className='message warning';panel.setAttribute('role','alertdialog');panel.setAttribute('aria-modal','false');heading.id='inline-confirmation-'+(++sequence);panel.setAttribute('aria-labelledby',heading.id);description.id=heading.id+'-description';panel.setAttribute('aria-describedby',description.id);heading.textContent=title;description.textContent=message;actions.className='actions';cancel.type=confirm.type='button';cancel.className='secondary';confirm.className='primary';cancel.textContent='Cancel';confirm.textContent=confirmLabel;actions.append(cancel,confirm);panel.append(heading,description,actions);anchor.parentNode.insertBefore(panel,anchor.nextSibling);
 let settled=false,observer;
 const finish=value=>{if(settled)return;settled=true;observer?.disconnect();active.delete(anchor);panel.remove();if(anchor.isConnected&&!anchor.disabled)anchor.focus({preventScroll:true});resolve(value);};
 cancel.addEventListener('click',()=>finish(false));confirm.addEventListener('click',()=>finish(Boolean(current())));
 panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();finish(false);}else if(event.key==='Tab'){const buttons=[cancel,confirm],index=buttons.indexOf(document.activeElement);if(event.shiftKey&&index===0){event.preventDefault();confirm.focus();}else if(!event.shiftKey&&index===1){event.preventDefault();cancel.focus();}}});
 if(typeof MutationObserver!=='undefined'){observer=new MutationObserver(()=>{if(!anchor.isConnected||!panel.isConnected)finish(false);});observer.observe(document.body,{childList:true,subtree:true});}
 cancel.focus({preventScroll:true});return result;
}
