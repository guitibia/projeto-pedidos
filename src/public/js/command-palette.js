(function () {
  // Não ativar na tela de login
  if (location.pathname.endsWith('/login.html')) return;

  const NAV = [
    { label: 'Dashboard',    icon: 'bi-speedometer2', url: '/' },
    { label: 'Clientes',     icon: 'bi-people',       url: '/clientes.html' },
    { label: 'Produtos',     icon: 'bi-box-seam',     url: '/produtos.html' },
    { label: 'Pedidos',      icon: 'bi-bag-check',    url: '/pedidos.html' },
    { label: 'Estoque',      icon: 'bi-archive',      url: '/estoque.html' },
    { label: 'Promissórias', icon: 'bi-receipt',      url: '/promissorias.html' },
  ];
  const ACTIONS = [
    { label: 'Novo pedido',  icon: 'bi-cart-plus',  url: '/pedidos.html' },
    { label: 'Novo produto', icon: 'bi-plus-square', url: '/produtos.html' },
    { label: 'Atalhos de teclado', icon: 'bi-keyboard', help: true },
  ];

  let entities = null;          // cache: { clients, products, orders }
  let loading  = false;
  let items    = [];            // itens renderizados atualmente
  let active   = -1;

  function injectStyles() {
    const css = `
      .cmdk-overlay { position:fixed; inset:0; background:rgba(0,0,0,.55); z-index:10000; display:none; align-items:flex-start; justify-content:center; padding-top:12vh; }
      .cmdk-overlay.open { display:flex; }
      .cmdk-box { width:min(620px,92vw); background:var(--bg-card); border:1px solid var(--border); border-radius:14px; box-shadow:0 16px 48px rgba(0,0,0,.6); overflow:hidden; }
      .cmdk-input { width:100%; border:none; background:transparent; color:var(--text-primary); font-size:1rem; padding:1rem 1.1rem; outline:none; border-bottom:1px solid var(--border); }
      .cmdk-list { max-height:52vh; overflow-y:auto; padding:.4rem; }
      .cmdk-item { display:flex; align-items:center; gap:.7rem; padding:.6rem .7rem; border-radius:9px; cursor:pointer; color:var(--text-primary); font-size:.9rem; }
      .cmdk-item.active, .cmdk-item:hover { background:var(--bg-hover); }
      .cmdk-item .cmdk-ico { width:20px; text-align:center; color:var(--accent); }
      .cmdk-item .cmdk-type { margin-left:auto; font-size:.7rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:.5px; }
      .cmdk-empty { padding:1rem; color:var(--text-muted); font-size:.85rem; text-align:center; }
      .cmdk-foot { border-top:1px solid var(--border); padding:.5rem .9rem; font-size:.72rem; color:var(--text-muted); display:flex; gap:1rem; flex-wrap:wrap; }
      .cmdk-foot kbd { background:var(--bg-hover); border:1px solid var(--border); border-radius:5px; padding:0 .35rem; font-size:.7rem; }
      .cmdk-help-grid { display:grid; grid-template-columns:auto 1fr; gap:.5rem 1rem; padding:1.1rem 1.2rem; }
      .cmdk-help-grid kbd { background:var(--bg-hover); border:1px solid var(--border); border-radius:6px; padding:.1rem .45rem; font-size:.78rem; color:var(--text-primary); justify-self:start; }
      .cmdk-help-grid span { color:var(--text-muted); font-size:.85rem; }
      .cmdk-title { padding:.9rem 1.1rem .2rem; font-weight:700; color:var(--text-heading); font-size:.95rem; }
      .cmdk-help-sec { padding:.85rem 1.2rem .2rem; font-size:.72rem; text-transform:uppercase; letter-spacing:.5px; color:var(--text-muted); font-weight:700; }
      .cmdk-help-actions { display:grid; grid-template-columns:repeat(2,1fr); gap:.4rem; padding:.2rem 1.1rem .4rem; }
      .cmdk-qa { display:flex; align-items:center; gap:.6rem; padding:.55rem .7rem; border-radius:9px; background:var(--bg-hover); border:1px solid var(--border); color:var(--text-primary); font-size:.85rem; cursor:pointer; text-align:left; }
      .cmdk-qa:hover { border-color:var(--accent); }
      .cmdk-qa i { color:var(--accent); }
      .cmdk-help-box { max-height:80vh; overflow-y:auto; }
    `;
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
  }

  function buildDom() {
    const overlay = document.createElement('div');
    overlay.className = 'cmdk-overlay';
    overlay.id = 'cmdk-overlay';
    overlay.innerHTML = `
      <div class="cmdk-box" role="dialog" aria-label="Command palette">
        <input class="cmdk-input" id="cmdk-input" type="text" placeholder="Buscar páginas, clientes, produtos, pedidos..." autocomplete="off">
        <div class="cmdk-list" id="cmdk-list"></div>
        <div class="cmdk-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navegar</span>
          <span><kbd>Enter</kbd> abrir</span>
          <span><kbd>?</kbd> atalhos</span>
          <span><kbd>Esc</kbd> fechar</span>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const help = document.createElement('div');
    help.className = 'cmdk-overlay';
    help.id = 'cmdk-help';
    help.innerHTML = `
      <div class="cmdk-box cmdk-help-box" role="dialog" aria-label="Ajuda e atalhos">
        <div class="cmdk-title"><i class="bi bi-keyboard me-2"></i>Ajuda &amp; Atalhos</div>
        <div class="cmdk-help-sec">Acesso rápido</div>
        <div class="cmdk-help-actions" id="cmdk-help-actions"></div>
        <div class="cmdk-help-sec">Atalhos de teclado</div>
        <div class="cmdk-help-grid">
          <kbd>Ctrl K</kbd><span>Abrir a busca rápida</span>
          <kbd>/</kbd><span>Abrir a busca rápida</span>
          <kbd>n</kbd><span>Ir para Pedidos (novo pedido)</span>
          <kbd>p</kbd><span>Ir para Produtos</span>
          <kbd>c</kbd><span>Ir para Clientes</span>
          <kbd>d</kbd><span>Ir para o Dashboard</span>
          <kbd>e</kbd><span>Ir para Estoque</span>
          <kbd>?</kbd><span>Abrir esta ajuda</span>
          <kbd>Esc</kbd><span>Fechar</span>
        </div>
        <div class="cmdk-foot"><span>As letras só funcionam fora de campos de texto.</span></div>
      </div>`;
    document.body.appendChild(help);
    renderHelpActions();

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    help.addEventListener('mousedown', (e) => { if (e.target === help) help.classList.remove('open'); });
    document.getElementById('cmdk-input').addEventListener('input', () => render());
  }

  function isTyping() {
    const el = document.activeElement;
    return el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
  }

  function open() {
    document.getElementById('cmdk-overlay').classList.add('open');
    const input = document.getElementById('cmdk-input');
    input.value = '';
    input.focus();
    render();
    if (!entities && !loading) loadEntities();
  }
  function close() { document.getElementById('cmdk-overlay').classList.remove('open'); }
  function openHelp() { close(); document.getElementById('cmdk-help').classList.add('open'); }

  function renderHelpActions() {
    const box = document.getElementById('cmdk-help-actions');
    if (!box) return;
    const quick = [...NAV, ...ACTIONS.filter(a => !a.help)];
    box.innerHTML = quick.map((it, i) =>
      `<button class="cmdk-qa" data-i="${i}"><i class="bi ${it.icon}"></i> ${escapeHtml(it.label)}</button>`).join('');
    box.querySelectorAll('.cmdk-qa').forEach(el => {
      el.addEventListener('click', () => { const it = quick[parseInt(el.dataset.i)]; if (it && it.url) window.location = it.url; });
    });
  }

  function render() {
    const q = document.getElementById('cmdk-input').value.trim().toLowerCase();
    const fixed = [...NAV.map(n => ({ ...n, type: 'Ir para' })), ...ACTIONS.map(a => ({ ...a, type: 'Ação' }))];
    let list = q ? fixed.filter(i => i.label.toLowerCase().includes(q)) : fixed;

    if (q.length >= 2 && entities) {
      entities.clients.filter(c => c.name.toLowerCase().includes(q)).slice(0, 6)
        .forEach(c => list.push({ label: c.name, icon: 'bi-person', type: 'Cliente', url: '/clientes.html?client=' + c.id }));
      entities.products.filter(p => p.name.toLowerCase().includes(q) || String(p.code).toLowerCase().includes(q)).slice(0, 6)
        .forEach(p => list.push({ label: `${p.name} — COD ${p.code}`, icon: 'bi-box', type: 'Produto', url: '/produtos.html?q=' + encodeURIComponent(p.name) }));
      entities.orders.filter(o => String(o.id).includes(q) || (o.client_name || '').toLowerCase().includes(q)).slice(0, 6)
        .forEach(o => list.push({ label: `#${o.id} — ${o.client_name}`, icon: 'bi-bag', type: 'Pedido', url: '/pedidos.html?order=' + o.id }));
    }

    items = list;
    active = list.length ? 0 : -1;
    const box = document.getElementById('cmdk-list');
    if (!list.length) { box.innerHTML = '<div class="cmdk-empty">Nada encontrado</div>'; return; }
    box.innerHTML = list.map((it, i) =>
      `<div class="cmdk-item ${i === 0 ? 'active' : ''}" data-i="${i}">
         <span class="cmdk-ico"><i class="bi ${it.icon}"></i></span>
         <span>${escapeHtml(it.label)}</span>
         <span class="cmdk-type">${it.type}</span>
       </div>`).join('');
    box.querySelectorAll('.cmdk-item').forEach(el => {
      el.addEventListener('mousedown', (ev) => { ev.preventDefault(); execute(items[parseInt(el.dataset.i)]); });
    });
  }

  function setActive(i) {
    const els = document.querySelectorAll('#cmdk-list .cmdk-item');
    if (!els.length) return;
    active = (i + els.length) % els.length;
    els.forEach((el, idx) => el.classList.toggle('active', idx === active));
    els[active].scrollIntoView({ block: 'nearest' });
  }

  function execute(item) {
    if (!item) return;
    if (item.help) { close(); openHelp(); return; }
    if (item.url) { window.location = item.url; }
  }

  async function loadEntities() {
    loading = true;
    try {
      const [cR, pR, oR] = await Promise.all([
        Auth.apiFetch('/api/clients'),
        Auth.apiFetch('/api/products/all'),
        Auth.apiFetch('/api/orders'),
      ]);
      entities = {
        clients:  await cR.json(),
        products: await pR.json(),
        orders:   await oR.json(),
      };
      if (document.getElementById('cmdk-overlay').classList.contains('open')) render();
    } catch (_) {
      entities = { clients: [], products: [], orders: [] };
    } finally { loading = false; }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function onKeydown(e) {
    const overlayOpen = document.getElementById('cmdk-overlay').classList.contains('open');
    const helpOpen    = document.getElementById('cmdk-help').classList.contains('open');

    // Abrir palette
    if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); open(); return; }

    if (overlayOpen) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(active + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); execute(items[active]); }
      else if (e.key === 'Escape') { close(); }
      return;
    }
    if (helpOpen) { if (e.key === 'Escape') document.getElementById('cmdk-help').classList.remove('open'); return; }

    if (isTyping()) return;  // letras só fora de campos

    if (e.key === '/') { e.preventDefault(); open(); }
    else if (e.key === '?') { e.preventDefault(); openHelp(); }
    else if (e.key === 'n') { window.location = '/pedidos.html'; }
    else if (e.key === 'p') { window.location = '/produtos.html'; }
    else if (e.key === 'c') { window.location = '/clientes.html'; }
    else if (e.key === 'd') { window.location = '/'; }
    else if (e.key === 'e') { window.location = '/estoque.html'; }
  }

  function init() {
    injectStyles();
    buildDom();
    document.addEventListener('keydown', onKeydown);
    window.CommandPalette = { open, close, openHelp };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
