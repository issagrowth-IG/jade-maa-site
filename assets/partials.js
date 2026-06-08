/* Nav + Footer partagés — injectés pour rester DRY et cohérents */
(function () {
  const P = (location.pathname.split('/').pop() || 'index.html');
  const isHome = (P === 'index.html' || P === '');
  const active = (f) => P === f ? ' class="active-link" aria-current="page"' : '';

  const NAV = `
  <nav class="nav">
    <div class="nav-in">
      <a href="index.html" class="brand">Jade <em>Maa</em></a>
      <div class="nav-links">
        <a href="qui-suis-je.html"${active('qui-suis-je.html')}>Qui suis-je</a>
        <a href="la-bonne-methode.html"${active('la-bonne-methode.html')}>La Bonne Méthode</a>
        <a href="retraites.html"${active('retraites.html')}>Retraites</a>
        <a href="evenements.html"${active('evenements.html')}>Événements &amp; conférences</a>
      </div>
      <button class="burger" aria-label="Menu" aria-expanded="false"><span></span><span></span><span></span></button>
    </div>
  </nav>`;

  const FOOTER = `
  <footer id="contact">
    <div class="foot-top">
      <div class="foot-brand">
        <div class="serif">Jade <em>Maa</em></div>
        <p>Revenir à soi, en profondeur. Accompagnement, retraites et événements pour des relations plus saines.</p>
      </div>
      <div class="foot-col">
        <h4>Explorer</h4>
        <a href="qui-suis-je.html">Qui suis-je</a>
        <a href="la-bonne-methode.html">La Bonne Méthode</a>
        <a href="retraites.html">Retraites</a>
        <a href="evenements.html">Événements &amp; conférences</a>
      </div>
      <div class="foot-col">
        <h4>Ressources</h4>
        <a href="https://www.amazon.fr/mots-sur-nos-maux/dp/238589064X" target="_blank" rel="noopener">Le livre — Des mots sur nos maux</a>
        <a href="https://open.spotify.com/show/26oaeCXsMFOzNKTQeoOZuI" target="_blank" rel="noopener">Le podcast</a>
        <a href="https://fr.trustpilot.com/review/jade-maa.com" target="_blank" rel="noopener">Avis Trustpilot</a>
        <a href="mailto:contact@jade-maa.com">Nous contacter</a>
      </div>
    </div>
    <div class="foot-bottom">
      <div class="socials">
        <a href="https://www.youtube.com/@Jade_maa" target="_blank" rel="noopener" aria-label="YouTube"><svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg></a>
        <a href="https://open.spotify.com/show/26oaeCXsMFOzNKTQeoOZuI" target="_blank" rel="noopener" aria-label="Spotify"><svg viewBox="0 0 24 24"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.84-.179-.96-.6-.12-.421.18-.84.6-.96 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/></svg></a>
        <a href="https://fr.trustpilot.com/review/jade-maa.com" target="_blank" rel="noopener" class="trust" aria-label="Trustpilot">
          <svg class="tstar" viewBox="0 0 24 24"><path d="M12 .587l3.668 7.568 8.332 1.151-6.064 5.828 1.48 8.279L12 18.896l-7.416 4.517 1.48-8.279L0 9.306l8.332-1.151z"/></svg>
          <span class="tword">Trustpilot</span>
        </a>
        <a href="https://www.instagram.com/jade_maa_/" target="_blank" rel="noopener" aria-label="Instagram"><svg viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"/></svg></a>
      </div>
      <div class="foot-legal">© 2026 Jade Maa · <a href="#">Mentions légales</a> · <a href="#">CGV</a> · <a href="#">Confidentialité</a></div>
    </div>
  </footer>`;

  const nm = document.getElementById('nav-mount');
  const fm = document.getElementById('footer-mount');
  if (nm) nm.outerHTML = NAV;
  if (fm) fm.outerHTML = FOOTER;
})();
