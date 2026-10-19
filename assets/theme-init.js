/* Tema scelto dall'utente (se c'e'): applicato subito, prima che la pagina venga disegnata (nessun "lampo" di tema sbagliato). */
(function () {
  try {
    var t = localStorage.getItem('tl_theme_v1');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* senza storage: segue il sistema */ }
})();
