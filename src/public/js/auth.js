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

  // Preenche o nome do usuário na sidebar
  function initSidebar() {
    const user = getUser();
    const el = document.getElementById('sidebar-user');
    if (el && user) el.textContent = `Olá, ${user.username}!`;

    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) logoutBtn.addEventListener('click', logout);
  }

  return { getToken, getUser, setSession, clearSession, isLoggedIn, requireAuth, apiFetch, logout, initSidebar };
})();
