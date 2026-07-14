function ensureDeleteConfirmStyles() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('ccw-delete-confirm-style')) return;
  const style = document.createElement('style');
  style.id = 'ccw-delete-confirm-style';
  style.textContent = `
.ccw-delete-confirm-overlay{position:fixed;inset:0;z-index:5000;background:rgba(15,23,42,.58);display:flex;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;backdrop-filter:blur(3px);}
.ccw-delete-confirm-dialog{width:min(480px,100%);background:#fff;border-radius:18px;box-shadow:0 28px 90px rgba(15,23,42,.28);border:1px solid rgba(203,213,225,.95);box-sizing:border-box;color:#0F172A;font-family:inherit;overflow:hidden;animation:ccwDeleteConfirmIn .14s ease-out;}
.ccw-delete-confirm-top{display:flex;gap:14px;padding:22px 22px 16px;align-items:flex-start;}
.ccw-delete-confirm-icon{width:44px;height:44px;border-radius:14px;background:#FEE2E2;color:#DC2626;display:flex;align-items:center;justify-content:center;flex:0 0 auto;box-shadow:inset 0 0 0 1px #FECACA;}
.ccw-delete-confirm-icon svg{width:22px;height:22px;display:block;}
.ccw-delete-confirm-copy{min-width:0;flex:1;}
.ccw-delete-confirm-eyebrow{margin:0 0 4px;color:#DC2626;font-size:11px;font-weight:850;letter-spacing:.08em;text-transform:uppercase;line-height:1.2;}
.ccw-delete-confirm-title{margin:0;font-size:21px;font-weight:900;line-height:1.18;letter-spacing:0;color:#0F172A;}
.ccw-delete-confirm-msg{margin:12px 22px 0;color:#991B1B;font-size:16px;font-weight:850;line-height:1.45;}
.ccw-delete-confirm-detail{margin:16px 22px 0;padding:12px 14px;border-radius:12px;background:#FFF7ED;border:1px solid #FDBA74;color:#9A3412;font-size:13px;font-weight:850;line-height:1.35;word-break:break-word;display:flex;align-items:flex-start;gap:9px;}
.ccw-delete-confirm-detail::before{content:"";width:7px;height:7px;border-radius:999px;background:#F97316;flex:0 0 auto;margin-top:5px;box-shadow:0 0 0 4px #FFEDD5;}
.ccw-delete-confirm-foot{margin-top:20px;padding:16px 22px 20px;background:#F8FAFC;border-top:1px solid #E2E8F0;}
.ccw-delete-confirm-actions{display:flex;justify-content:flex-end;gap:10px;flex-wrap:wrap;}
.ccw-delete-confirm-btn{height:42px;border-radius:12px;border:1px solid #CBD5E1;background:#fff;color:#0F172A;font:inherit;font-size:13px;font-weight:850;padding:0 18px;cursor:pointer;min-width:124px;transition:background .14s ease,border-color .14s ease,transform .12s ease,box-shadow .14s ease;}
.ccw-delete-confirm-btn:hover{background:#F1F5F9;border-color:#94A3B8;}
.ccw-delete-confirm-btn:active{transform:translateY(1px);}
.ccw-delete-confirm-btn:focus-visible{outline:3px solid rgba(59,130,246,.26);outline-offset:2px;}
.ccw-delete-confirm-btn--danger{background:#DC2626;border-color:#DC2626;color:#fff;box-shadow:0 8px 20px rgba(220,38,38,.22);}
.ccw-delete-confirm-btn--danger:hover{background:#B91C1C;border-color:#B91C1C;box-shadow:0 10px 24px rgba(185,28,28,.26);}
@keyframes ccwDeleteConfirmIn{from{opacity:0;transform:translateY(8px) scale(.985);}to{opacity:1;transform:translateY(0) scale(1);}}
@media (max-width:520px){
  .ccw-delete-confirm-overlay{align-items:flex-end;padding:12px;}
  .ccw-delete-confirm-dialog{border-radius:18px;}
  .ccw-delete-confirm-top{padding:20px 18px 14px;}
  .ccw-delete-confirm-msg{margin-left:18px;margin-right:18px;}
  .ccw-delete-confirm-detail{margin-left:18px;margin-right:18px;}
  .ccw-delete-confirm-foot{padding:14px 18px 18px;}
  .ccw-delete-confirm-actions{display:grid;grid-template-columns:1fr;}
  .ccw-delete-confirm-btn{width:100%;min-width:0;}
}
html[data-theme='dark'] .ccw-delete-confirm-dialog{background:#111827;border-color:#334155;color:#F8FAFC;}
html[data-theme='dark'] .ccw-delete-confirm-title{color:#F8FAFC;}
html[data-theme='dark'] .ccw-delete-confirm-msg{color:#FCA5A5;}
html[data-theme='dark'] .ccw-delete-confirm-icon{background:#3F1D24;color:#FCA5A5;box-shadow:inset 0 0 0 1px #7F1D1D;}
html[data-theme='dark'] .ccw-delete-confirm-detail{background:#2B2118;border-color:#92400E;color:#FDBA74;}
html[data-theme='dark'] .ccw-delete-confirm-detail::before{background:#FB923C;box-shadow:0 0 0 4px rgba(251,146,60,.18);}
html[data-theme='dark'] .ccw-delete-confirm-foot{background:#0F172A;border-top-color:#334155;}
html[data-theme='dark'] .ccw-delete-confirm-btn{background:#172033;border-color:#334155;color:#F8FAFC;}
html[data-theme='dark'] .ccw-delete-confirm-btn:hover{background:#1E293B;border-color:#475569;}
html[data-theme='dark'] .ccw-delete-confirm-btn--danger{background:#DC2626;border-color:#DC2626;color:#fff;}
html[data-theme='dark'] .ccw-delete-confirm-btn--danger:hover{background:#B91C1C;border-color:#B91C1C;}
`;
  document.head.appendChild(style);
}

/**
 * @param {{ title?: string, itemLabel?: string, message?: string }} [opts]
 * @returns {Promise<boolean>}
 */
export function confirmDelete(opts = {}) {
  if (typeof document === 'undefined') return Promise.resolve(false);
  ensureDeleteConfirmStyles();
  const title = opts.title || 'Löschen bestätigen';
  const message =
    opts.message ||
    'Diese Aktion löscht den Eintrag dauerhaft.';
  const itemLabel = opts.itemLabel != null ? String(opts.itemLabel).trim() : '';

  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'ccw-delete-confirm-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="ccw-delete-confirm-dialog">
        <div class="ccw-delete-confirm-top">
          <div class="ccw-delete-confirm-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10 11v6"></path><path d="M14 11v6"></path><path d="M4 7h16"></path><path d="M6 7l1 14h10l1-14"></path><path d="M9 7V4h6v3"></path>
            </svg>
          </div>
          <div class="ccw-delete-confirm-copy">
            <p class="ccw-delete-confirm-eyebrow">Endgültige Aktion</p>
            <h3 class="ccw-delete-confirm-title">${escapeHtml(title)}</h3>
          </div>
        </div>
        <p class="ccw-delete-confirm-msg">${escapeHtml(message)}</p>
        ${itemLabel ? `<div class="ccw-delete-confirm-detail">${escapeHtml(itemLabel)}</div>` : ''}
        <div class="ccw-delete-confirm-foot">
          <div class="ccw-delete-confirm-actions">
            <button type="button" class="ccw-delete-confirm-btn" data-ccw-delete-cancel>Abbrechen</button>
            <button type="button" class="ccw-delete-confirm-btn ccw-delete-confirm-btn--danger" data-ccw-delete-confirm>Löschen</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    let done = false;
    const close = (value) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      overlay.remove();
      resolve(value);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') close(false);
    };
    document.addEventListener('keydown', onKey);
    overlay.addEventListener('click', (ev) => {
      const t = ev.target;
      if (t === overlay) return close(false);
      if (!(t instanceof Element)) return;
      if (t.closest('[data-ccw-delete-cancel]')) return close(false);
      if (t.closest('[data-ccw-delete-confirm]')) return close(true);
    });
    const cancel = overlay.querySelector('[data-ccw-delete-cancel]');
    if (cancel instanceof HTMLElement) cancel.focus();
  });
}

function escapeHtml(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
