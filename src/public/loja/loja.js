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

function cardHTML(p) {
  var preco = (p.promotion_price != null && Number(p.promotion_price) > 0)
    ? Number(p.promotion_price)
    : Number(p.sale_value || 0);
  var esgotado = (p.estoque != null && Number(p.estoque) <= 0);
  var btnAttrs = esgotado
    ? 'disabled class="btn" aria-disabled="true"'
    : 'class="btn accent-btn"' +
      ' data-id="' + esc(String(p.id)) + '"' +
      ' data-name="' + esc(p.name) + '"' +
      ' data-price="' + esc(String(preco)) + '"' +
      ' data-image="' + esc(p.image || '') + '"' +
      ' data-franchise="' + esc(p.franchise || '') + '"' +
      ' onclick="lojaAddToCart(this)"';
  var btnLabel = esgotado ? 'Esgotado' : 'Adicionar';
  return (
    '<article class="product-card">' +
      '<div class="product-card__media">' +
        '<a href="produto.html?id=' + esc(String(p.id)) + '" tabindex="-1" aria-hidden="true">' +
          imgHTML(p, '') +
        '</a>' +
        '<span class="brand-badge">' + esc(p.franchise || '') + '</span>' +
      '</div>' +
      '<div class="product-card__body">' +
        '<a href="produto.html?id=' + esc(String(p.id)) + '" class="product-card__name">' + esc(p.name) + '</a>' +
        precoHTML(p) +
        '<button ' + btnAttrs + ' type="button">' + btnLabel + '</button>' +
      '</div>' +
    '</article>'
  );
}

function lojaAddToCart(btn) {
  Cart.addItem({
    id: btn.dataset.id,
    name: btn.dataset.name,
    price: Number(btn.dataset.price) || 0,
    image: btn.dataset.image || null,
    franchise: btn.dataset.franchise || ''
  }, 1);
  var orig = btn.textContent;
  btn.textContent = 'Adicionado ✓';
  setTimeout(function () { btn.textContent = orig; }, 1000);
}
