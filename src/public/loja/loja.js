function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function fmtBRL(v){ return 'R$ ' + Number(v||0).toFixed(2).replace('.',','); }
function precoHTML(p){
  const promo = p.promotion_price != null && Number(p.promotion_price) > 0;
  const venda = Number(p.sale_value||0), pp = Number(p.promotion_price||0);
  return promo
    ? `<span class="price">${fmtBRL(pp)} <s>${fmtBRL(venda)}</s></span>`
    : `<span class="price">${fmtBRL(venda)}</span>`;
}
// % de desconto (item ou global; o backend já preenche promotion_price nos dois casos). 0 = sem desconto.
function descontoPct(p){
  const venda = Number(p.sale_value||0);
  const pp = (p.promotion_price!=null) ? Number(p.promotion_price) : 0;
  return (pp > 0 && pp < venda && venda > 0) ? Math.round((venda - pp) / venda * 100) : 0;
}
function imgHTML(p, cls=''){
  return p.image
    ? `<img class="${cls}" src="${esc(p.image)}" alt="${esc(p.name)}" loading="lazy">`
    : `<div class="img-ph ${cls}"><span>${esc(p.franchise||'')}</span><small>${esc(p.name)}</small></div>`;
}
function lojaToast(msg, href) {
  var safeHref = (href && /^(https?:\/\/|\/)/.test(href)) ? href : null;
  var t = document.createElement('div');
  t.className = 'loja-toast';
  t.setAttribute('role', 'status');
  t.innerHTML = esc(msg) + (safeHref ? ' <a href="' + esc(safeHref) + '">Entrar</a>' : '');
  document.body.appendChild(t);
  requestAnimationFrame(function () { t.classList.add('loja-toast--show'); });
  setTimeout(function () { t.classList.remove('loja-toast--show'); setTimeout(function () { t.remove(); }, 300); }, 3200);
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
        '<button class="card-fav" type="button" data-fav="' + esc(String(p.id)) + '" onclick="lojaToggleFav(this)" aria-label="Favoritar" aria-pressed="false"><i class="bi bi-heart"></i></button>' +
        '<a href="produto.html?id=' + esc(String(p.id)) + '" tabindex="-1" aria-hidden="true">' +
          imgHTML(p, '') +
        '</a>' +
        (descontoPct(p) ? '<span class="discount-badge">' + descontoPct(p) + '% OFF</span>' : '') +
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

// ── Banner de consentimento de cookies (LGPD) — global em todas as páginas da loja ──
(function cookieBanner(){
  try { if (localStorage.getItem('loja_cookie_consent') === '1') return; } catch (e) { return; }
  document.addEventListener('DOMContentLoaded', function () {
    var b = document.createElement('div');
    b.className = 'cookie-banner';
    b.setAttribute('role', 'region');
    b.setAttribute('aria-label', 'Aviso de cookies');
    b.innerHTML = '<p>Usamos cookies para melhorar sua experiência. Veja nossa ' +
      '<a href="/loja/privacidade.html">Política de Privacidade</a>.</p>' +
      '<button class="btn accent-btn" id="cookie-ok" type="button">Aceitar</button>';
    document.body.appendChild(b);
    document.getElementById('cookie-ok').onclick = function () {
      try { localStorage.setItem('loja_cookie_consent', '1'); } catch (e) {}
      b.remove();
    };
  });
})();

// ── Sincroniza o link de conta no header conforme estado de login ──
function syncAccountLink() {
  var el = document.getElementById('account-link');
  if (!el) return;
  var logged = false;
  try { logged = !!localStorage.getItem('loja_token'); } catch (e) {}
  el.setAttribute('href', logged ? '/loja/conta.html' : '/loja/entrar.html');
  el.setAttribute('title', logged ? 'Minha conta' : 'Entrar ou cadastrar');
  el.setAttribute('aria-label', logged ? 'Minha conta' : 'Entrar ou cadastrar');
}
function lojaLogout() {
  try { localStorage.removeItem('loja_token'); localStorage.removeItem('loja_user'); } catch (e) {}
  window.location = '/loja/';
}
document.addEventListener('DOMContentLoaded', syncAccountLink);
