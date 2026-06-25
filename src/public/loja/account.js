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
