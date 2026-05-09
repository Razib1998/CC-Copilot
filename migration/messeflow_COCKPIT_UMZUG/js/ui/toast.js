function toast(title,body,cls=''){
  const el=document.createElement('div');
  el.className='toast '+(cls||'');
  el.innerHTML=`<div class="tt">${title}</div><div class="tb">${body}</div>`;
  document.getElementById('toasts').appendChild(el);
  setTimeout(()=>el.remove(),4000);
}

window.toast = toast;
window.showToast = toast;
