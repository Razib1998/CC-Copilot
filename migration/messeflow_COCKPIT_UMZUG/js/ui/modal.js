function openModal(h,c,wide=false){ document.getElementById('modal-h').textContent=h; document.getElementById('modal-c').innerHTML=c; document.getElementById('modal-bg').classList.add('open'); document.getElementById('modal-box').classList.toggle('wide',wide); }
function closeModal(){ document.getElementById('modal-bg').classList.remove('open'); document.getElementById('modal-box').classList.remove('wide'); }
function closeMBG(e){ if(e.target===document.getElementById('modal-bg')) closeModal(); }

window.openModal = openModal;
window.closeModal = closeModal;
window.closeMBG = closeMBG;
