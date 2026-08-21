/* JADE MAA — interactions v2 (vanilla, léger) */
document.documentElement.classList.add('js');

document.addEventListener('DOMContentLoaded', () => {
  // --- Nav : fond au scroll ---
  const nav = document.querySelector('.nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 40);
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // --- Burger mobile ---
  const burger = document.querySelector('.burger');
  if (burger && nav) burger.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  // --- Barre CTA séjour : elle masquait le bas du widget Calendly ---
  const bar = document.querySelector('.r-sticky-bar');
  const resa = document.getElementById('reserver');
  if (bar && resa && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      bar.classList.toggle('is-off', e.isIntersecting);
    }).observe(resa);
  }

  // --- Reveals au scroll ---
  // rootMargin en px : l'intention est une distance constante, pas une
  // fraction de la hauteur du viewport.
  const els = document.querySelectorAll('.reveal, .img-reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -60px 0px' });
    els.forEach(el => io.observe(el));
  } else {
    els.forEach(el => el.classList.add('in'));
  }

  // --- Form : feedback factice (placeholder, à brancher GHL) ---
  document.querySelectorAll('form[data-mock]').forEach(f => {
    f.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const btn = f.querySelector('button');
      if (btn) { const t = btn.textContent; btn.textContent = 'Merci ✦'; btn.disabled = true; setTimeout(() => { btn.textContent = t; btn.disabled = false; f.reset(); }, 2600); }
    });
  });
});

/* --- Carrousels d'avis (bandeau brun + widget Amazon) ------------------
   Le défilement automatique a besoin de la liste en double pour boucler.
   Cette copie n'existe donc que là où le marquee tourne réellement : elle
   est fabriquée ici, jamais écrite dans le HTML — le nombre d'avis peut
   changer d'une page à l'autre sans qu'aucune règle ne le sache. Elle est
   posée aria-hidden pour qu'un lecteur d'écran n'annonce pas chaque
   témoignage deux fois.                                                 */
document.addEventListener('DOMContentLoaded', () => {
  const tracks = document.querySelectorAll('.band-track, .amz-track');
  if (!tracks.length) return;
  const mq = window.matchMedia('(min-width:821px) and (prefers-reduced-motion:no-preference)');

  const dupliquer = () => {
    if (!mq.matches) return;
    tracks.forEach(track => {
      if (track.dataset.dup === '1') return;
      track.dataset.dup = '1';
      Array.from(track.children).forEach(el => {
        const copie = el.cloneNode(true);
        copie.classList.add('is-dup');
        copie.setAttribute('aria-hidden', 'true');
        track.appendChild(copie);
      });
    });
  };

  dupliquer();
  mq.addEventListener('change', dupliquer);
});
