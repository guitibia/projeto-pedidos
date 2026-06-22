(function () {
  try { if (localStorage.getItem('theme') === 'light') document.documentElement.setAttribute('data-theme', 'light'); } catch (e) {}
})();
function toggleTheme() {
  var isLight = document.documentElement.getAttribute('data-theme') === 'light';
  if (isLight) { document.documentElement.removeAttribute('data-theme'); try { localStorage.setItem('theme', 'dark'); } catch (e) {} }
  else { document.documentElement.setAttribute('data-theme', 'light'); try { localStorage.setItem('theme', 'light'); } catch (e) {} }
  syncThemeBtn();
}
function syncThemeBtn() {
  var b = document.getElementById('theme-toggle');
  if (!b) return;
  var isLight = document.documentElement.getAttribute('data-theme') === 'light';
  b.innerHTML = isLight ? '<i class="bi bi-moon-stars"></i> Tema escuro' : '<i class="bi bi-sun"></i> Tema claro';
}
document.addEventListener('DOMContentLoaded', syncThemeBtn);
