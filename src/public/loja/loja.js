function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtBRL(v){ return 'R$ ' + Number(v||0).toFixed(2).replace('.',','); }
function precoHTML(p){
  const promo = p.promotion_price != null && Number(p.promotion_price) > 0;
  const venda = Number(p.sale_value||0), pp = Number(p.promotion_price||0);
  return promo
    ? `<span class="price">${fmtBRL(pp)} <s>${fmtBRL(venda)}</s></span>`
    : `<span class="price">${fmtBRL(venda)}</span>`;
}
function imgHTML(p, cls=''){
  return p.image
    ? `<img class="${cls}" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
    : `<div class="img-ph ${cls}"><span>${esc(p.franchise||'')}</span><small>${esc(p.name)}</small></div>`;
}
function syncCartCount(){ if (typeof Cart === 'undefined') return; const el=document.getElementById('cart-count'); if(el){ const n=Cart.getCount(); el.textContent=n; el.style.display=n?'flex':'none'; } }
document.addEventListener('DOMContentLoaded', syncCartCount);
document.addEventListener('cart:changed', syncCartCount);
