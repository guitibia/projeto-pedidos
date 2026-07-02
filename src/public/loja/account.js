const StoreAuth = (() => {
  const TKEY = 'loja_token', UKEY = 'loja_user';
  function getToken() { return localStorage.getItem(TKEY); }
  function getUser() { try { return JSON.parse(localStorage.getItem(UKEY)); } catch { return null; } }
  function isLoggedIn() { return !!getToken(); }
  function setSession(token, user) { localStorage.setItem(TKEY, token); localStorage.setItem(UKEY, JSON.stringify(user || {})); }
  function logout() { localStorage.removeItem(TKEY); localStorage.removeItem(UKEY); }
  async function api(path, opts = {}) {
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    const t = getToken();
    if (t) headers['Authorization'] = 'Bearer ' + t;
    return fetch('/api/loja/auth' + path, Object.assign({}, opts, { headers }));
  }
  return { getToken, getUser, isLoggedIn, setSession, logout, api };
})();

// ── Favoritos (atrelado à conta) ──
const Favorites = (() => {
  const ids = new Set();
  let loaded = false;

  function authHeaders() {
    const t = StoreAuth.getToken();
    return t ? { 'Authorization': 'Bearer ' + t } : {};
  }
  function updateCount() {
    const el = document.getElementById('fav-count');
    if (!el) return;
    const n = ids.size;
    el.textContent = n;
    el.style.display = (StoreAuth.isLoggedIn() && n > 0) ? 'flex' : 'none';
  }
  function syncHearts() {
    const nodes = document.querySelectorAll('[data-fav]');
    nodes.forEach(function (el) {
      const fid = parseInt(el.getAttribute('data-fav'), 10);
      const on = ids.has(fid);
      el.classList.toggle('is-fav', on);
      el.setAttribute('aria-pressed', on ? 'true' : 'false');
      const icon = el.querySelector('i');
      if (icon) icon.className = on ? 'bi bi-heart-fill' : 'bi bi-heart';
    });
  }
  async function load() {
    if (!StoreAuth.isLoggedIn()) { loaded = true; updateCount(); return; }
    try {
      const r = await fetch('/api/loja/favoritos/ids', { headers: authHeaders() });
      if (r.ok) {
        const arr = await r.json();
        ids.clear();
        (arr || []).forEach(function (x) { ids.add(Number(x)); });
      }
    } catch (e) {}
    loaded = true;
    updateCount();
    syncHearts();
  }
  function isLoaded() { return loaded; }
  function isFav(id) { return ids.has(Number(id)); }
  async function toggle(id) {
    id = Number(id);
    const had = ids.has(id);
    if (had) ids.delete(id); else ids.add(id);   // otimista
    updateCount(); syncHearts();
    try {
      if (had) {
        const res = await fetch('/api/loja/favoritos/' + id, { method: 'DELETE', headers: authHeaders() });
        if (!res.ok) throw new Error('HTTP ' + res.status);
      } else {
        const res = await fetch('/api/loja/favoritos', {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, authHeaders()),
          body: JSON.stringify({ productId: id })
        });
        if (!res.ok) throw new Error('HTTP ' + res.status);
      }
    } catch (e) {
      if (had) ids.add(id); else ids.delete(id);  // reverte em erro
      updateCount(); syncHearts();
    }
  }
  document.addEventListener('DOMContentLoaded', load);
  return { load, isLoaded, isFav, toggle, syncHearts };
})();

function lojaToggleFav(btn) {
  if (typeof StoreAuth === 'undefined' || !StoreAuth.isLoggedIn()) {
    lojaToast('Entre na sua conta para favoritar ❤', '/loja/entrar.html');
    return;
  }
  const id = btn.getAttribute('data-fav');
  if (id) Favorites.toggle(id);
}

// ── Menu rápido da conta (dropdown no header) ──
function initAccountMenu() {
  var link = document.getElementById('account-link');
  if (!link) return;
  if (!StoreAuth.isLoggedIn()) return; // deslogado: link normal para entrar.html (syncAccountLink cuida do href)

  var user = StoreAuth.getUser() || {};
  var nome = (user.name || 'Minha conta');
  var email = (user.email || '');

  // wrapper posicionado
  var wrap = document.createElement('div');
  wrap.className = 'account-menu-wrap';
  link.parentNode.insertBefore(wrap, link);
  wrap.appendChild(link);

  link.setAttribute('href', '/loja/conta.html');
  link.setAttribute('aria-haspopup', 'true');
  link.setAttribute('aria-expanded', 'false');

  var menu = document.createElement('div');
  menu.className = 'account-menu';
  menu.setAttribute('role', 'menu');
  menu.innerHTML =
    '<div class="account-menu__head"><strong></strong><span></span></div>' +
    '<a role="menuitem" href="/loja/conta.html"><i class="bi bi-person"></i> Meus dados</a>' +
    '<a role="menuitem" href="/loja/meus-pedidos.html"><i class="bi bi-bag-check"></i> Meus pedidos</a>' +
    '<a role="menuitem" href="/loja/favoritos.html"><i class="bi bi-heart"></i> Favoritos</a>' +
    '<button type="button" role="menuitem" class="account-menu__logout"><i class="bi bi-box-arrow-right"></i> Sair</button>';
  // preencher nome/email com textContent (evita XSS)
  menu.querySelector('.account-menu__head strong').textContent = 'Olá, ' + nome;
  menu.querySelector('.account-menu__head span').textContent = email;
  wrap.appendChild(menu);

  function open() { wrap.classList.add('open'); link.setAttribute('aria-expanded', 'true'); }
  function close() { wrap.classList.remove('open'); link.setAttribute('aria-expanded', 'false'); }
  function toggle() { wrap.classList.contains('open') ? close() : open(); }

  link.addEventListener('click', function (e) { e.preventDefault(); toggle(); });
  menu.querySelector('.account-menu__logout').addEventListener('click', function () {
    StoreAuth.logout(); window.location = '/loja/';
  });
  document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) close(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
}
document.addEventListener('DOMContentLoaded', initAccountMenu);
