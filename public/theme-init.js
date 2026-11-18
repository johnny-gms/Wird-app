// Applique le thème avant le premier rendu (évite le flash). Fichier externe : la politique de sécurité (CSP) interdit les scripts dans la page.
try {
  var t = localStorage.getItem('wird-theme');
  var dark = t === 'dark' || ((!t || t === 'system') && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
} catch (e) {}
