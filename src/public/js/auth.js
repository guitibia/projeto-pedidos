// Utilitário de autenticação para o front-end
// Inclua este arquivo em todas as páginas: <script src="/js/auth.js"></script>

const Auth = (() => {
  const TOKEN_KEY = 'sp_token';
  const USER_KEY  = 'sp_user';

  function getToken() {
    return localStorage.getItem(TOKEN_KEY);
  }

  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
  }

  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }

  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  function isLoggedIn() {
    return !!getToken();
  }

  // Redireciona para login se não estiver autenticado
  function requireAuth() {
    if (!isLoggedIn()) {
      window.location.href = '/login.html';
    }
  }

  // fetch com Authorization header automático
  async function apiFetch(url, options = {}) {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...(options.headers || {})
    };

    const res = await fetch(url, { ...options, headers });

    if (res.status === 401 || res.status === 403) {
      clearSession();
      window.location.href = '/login.html';
      const err = new Error('Sessão expirada');
      err.name = 'SessionExpiredError';
      throw err;
    }

    return res;
  }

  async function logout() {
    clearSession();
    window.location.href = '/login.html';
  }

  // Itens do menu lateral — fonte ÚNICA (evita duplicar a sidebar em cada página).
  // Para adicionar/alterar um item do menu, mexa só aqui.
  const NAV_ITEMS = [
    { href: '/painel.html',       icon: 'bi-speedometer2',   label: 'Dashboard' },
    { href: '/clientes.html',     icon: 'bi-people',         label: 'Clientes' },
    { href: '/produtos.html',     icon: 'bi-box-seam',       label: 'Produtos' },
    { href: '/pedidos.html',      icon: 'bi-bag-check',      label: 'Pedidos' },
    { href: '/estoque.html',      icon: 'bi-archive',        label: 'Estoque' },
    { href: '/notas.html',        icon: 'bi-receipt-cutoff', label: 'Notas' },
    { href: '/entrega.html',      icon: 'bi-truck',          label: 'Entrega' },
    { href: '/promissorias.html', icon: 'bi-receipt',        label: 'Promissórias' },
    { href: '/demanda.html',      icon: 'bi-card-checklist', label: 'Pedidos das Clientes' },
    { href: '#', icon: 'bi-keyboard', label: 'Atalhos', onclick: 'window.CommandPalette && CommandPalette.openHelp(); return false;' },
  ];

  // Monta os links do menu no <nav class="sidebar-nav"> (deixado vazio no HTML de cada página),
  // marcando como ativo o item cuja href bate com a URL atual.
  function renderSidebarNav() {
    const nav = document.querySelector('nav.sidebar-nav');
    if (!nav) return;
    const path = window.location.pathname;
    nav.innerHTML = NAV_ITEMS.map((it) => {
      const active = it.href !== '#' && path === it.href ? ' active' : '';
      const onclick = it.onclick ? ` onclick="${it.onclick}"` : '';
      return `<a class="nav-link${active}" href="${it.href}"${onclick}><i class="bi ${it.icon}"></i> ${it.label}</a>`;
    }).join('');
  }

  // Preenche o nome do usuário na sidebar e monta o menu
  function initSidebar() {
    renderSidebarNav();

    const user = getUser();
    const el = document.getElementById('sidebar-user');
    if (el && user) el.textContent = `Olá, ${user.username}!`;

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }

  return { getToken, getUser, setSession, clearSession, isLoggedIn, requireAuth, apiFetch, logout, initSidebar };
})();
