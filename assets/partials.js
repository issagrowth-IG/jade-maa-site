/* Nav + Footer partagés — injectés pour rester DRY et cohérents */
(function () {
  /* Cloudflare sert les URL sans .html (/retraites, pas /retraites.html) :
     on compare donc des noms normalises, sinon la surbrillance ne s'allume
     jamais en production. La rubrique reste allumee sur ses sous-pages. */
  const nom = (s) => (s.split('/').pop() || 'index').replace(/\.html$/, '') || 'index';
  const P = nom(location.pathname);
  const SOUS_PAGES = {
    'retraites': ['retraite-le-manoir', 'retraite-le-plessis'],
    'evenements': ['conference-dans-ma-valise'],
  };
  const active = (f) => {
    const cle = nom(f);
    return (P === cle || (SOUS_PAGES[cle] || []).includes(P))
      ? ' class="active-link"' + (P === cle ? ' aria-current="page"' : '') : '';
  };

  const NAV = `
  <nav class="nav">
    <div class="nav-in">
      <a href="index.html" class="brand">Jade Maa</a>
      <div class="nav-links">
        <a href="qui-suis-je.html"${active('qui-suis-je.html')}>À propos</a>
        <a href="la-bonne-methode.html"${active('la-bonne-methode.html')}>La bonne méthode</a>
        <a href="retraites.html"${active('retraites.html')}>Les séjours</a>
        <a href="evenements.html"${active('evenements.html')}>Les événements</a>
        <a href="le-livre.html"${active('le-livre.html')}>Le livre</a>
      </div>
      <button class="burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </nav>`;

  const FOOTER = `
  <footer id="contact">
    <div class="ft-row">
      <a href="index.html" class="ft-sig">Jade Maa</a>
      <div class="ft-mid">
        <span class="bar"></span>
        <span class="ft-tag">Plus jamais sans moi.<span class="hrt">♡</span></span>
        <span class="bar"></span>
      </div>
      <div class="ft-socials">
        <a href="https://www.instagram.com/jade_maa_/" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg></a>
        <a href="https://www.youtube.com/@Jade_maa" target="_blank" rel="noopener" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
        <a href="https://open.spotify.com/show/26oaeCXsMFOzNKTQeoOZuI" target="_blank" rel="noopener" aria-label="Spotify"><svg viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.96-.6-.12-.421.18-.84.6-.96 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/></svg></a>
      </div>
    </div>
    <div class="ft-bottom">
      <span>© 2026 Jade Maa</span>
      <nav>
        <a href="https://fr.trustpilot.com/review/jade-maa.com" target="_blank" rel="noopener">Avis Trustpilot</a>
        <a href="mailto:contact@jade-maa.com">Contact</a>
        <a href="cgv.html">CGV</a>
        <a href="mentions-legales.html">Mentions légales</a>
        <a href="politique-de-confidentialite.html">Confidentialité</a>
      </nav>
    </div>
  </footer>`;

  const nm = document.getElementById('nav-mount');
  const fm = document.getElementById('footer-mount');
  if (nm) nm.outerHTML = NAV;
  if (fm) fm.outerHTML = FOOTER;
})();
