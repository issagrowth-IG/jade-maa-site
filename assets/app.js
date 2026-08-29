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

/* --- Conférence de Lyon : bascule « Complet » ---------------------------
   Quand les 95 places sont vendues, les boutons qui pointent vers la
   billetterie deviennent une mention « Complet ». C'est de l'affichage :
   le verrou réel est côté serveur, dans create-checkout-session.
   Si l'API ne répond pas, on ne touche à rien — un bouton qui mène à une
   page complète est moins grave qu'un « Complet » affiché à tort.        */
document.addEventListener('DOMContentLoaded', () => {
  const ctas = document.querySelectorAll('[data-conf-cta]');
  if (!ctas.length) return;

  fetch('/api/conference-places')
    .then(r => (r.ok ? r.json() : null))
    .then(d => {
      if (!d || !d.soldOut) return;
      ctas.forEach(a => {
        const mention = document.createElement('span');
        mention.className = a.className + ' is-complet';
        mention.setAttribute('aria-disabled', 'true');
        mention.textContent = 'Complet';
        a.replaceWith(mention);
      });
      document.querySelectorAll('[data-conf-statut]').forEach(el => { el.textContent = 'Complet'; });
      // Phrases qui annoncent des inscriptions ouvertes : chacune porte sa version « complet ».
      document.querySelectorAll('[data-conf-texte-complet]').forEach(el => { el.textContent = el.getAttribute('data-conf-texte-complet'); });
    })
    .catch(() => {});
});

/* --- Séjours : choix de la chambre, conditions de vente, disponibilités ---
   Le bouton d'inscription reste inerte tant qu'une chambre n'est pas choisie
   ET que les conditions ne sont pas acceptées : au clic il dit ce qui manque
   plutot que de ne rien faire. Les disponibilites viennent de l'API des places ;
   si elle ne repond pas on ne touche a rien (un bouton vers une page qui refusera
   vaut mieux qu'un « complet » affiche a tort). */
document.addEventListener('DOMContentLoaded', () => {
  const bloc = document.querySelector('.rooms[data-sejour]');
  if (!bloc) return;

  const sejour   = bloc.dataset.sejour;
  const cases    = [...bloc.querySelectorAll('.room')];
  const tete     = document.querySelector('[data-prix-tete]');
  const sticky   = document.querySelector('[data-prix-sticky]');
  const cgv      = document.querySelector('[data-cgv]');
  const rappel   = document.querySelector('[data-cgv-rappel]');
  const cta      = document.querySelector('[data-reserver]');
  const baseHref = cta ? cta.getAttribute('href') : '';

  const choisie = () => cases.find(l => l.querySelector('input').checked && !l.classList.contains('is-complet'));

  function maj() {
    const l = choisie();
    cases.forEach(c => c.classList.toggle('is-choisie', c === l));
    if (l) {
      const p = l.querySelector('input').dataset.prix;
      if (tete)   tete.textContent = p;
      if (sticky) sticky.textContent = p;
    }
    const pret = !!l && cgv && cgv.checked;
    if (cta) {
      cta.classList.toggle('is-bloque', !pret);
      cta.setAttribute('aria-disabled', pret ? 'false' : 'true');
      cta.setAttribute('href', pret ? `${baseHref}&chambre=${encodeURIComponent(l.querySelector('input').value)}` : baseHref);
    }
    if (pret && rappel) rappel.hidden = true;
  }

  bloc.addEventListener('change', maj);
  bloc.addEventListener('click', e => {
    const l = e.target.closest('.room');
    if (l && l.classList.contains('is-complet')) e.preventDefault();
  });
  if (cgv) cgv.addEventListener('change', maj);

  if (cta) cta.addEventListener('click', e => {
    if (cta.getAttribute('aria-disabled') !== 'true') return;
    e.preventDefault();
    if (rappel) {
      rappel.hidden = false;
      rappel.textContent = !choisie()
        ? "Choisis d'abord ta chambre ci-dessus."
        : "Merci d'accepter les conditions générales de vente pour continuer.";
      rappel.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  // Disponibilités réelles. Silencieux en cas d'échec, volontairement.
  fetch(`/api/sejour-places?sejour=${encodeURIComponent(sejour)}`, { cache: 'no-store' })
    // Une API absente est servie par Cloudflare comme la page d'accueil, en HTML
    // et en 200 : sans ce controle du type, on parse du HTML et l'echec passe
    // pour une reponse vide au lieu d'une panne.
    .then(r => (r.ok && (r.headers.get('content-type') || '').includes('json') ? r.json() : null))
    .then(d => {
      if (!d || !Array.isArray(d.chambres)) return;
      const par = Object.fromEntries(d.chambres.map(c => [c.id, c]));
      cases.forEach(l => {
        const input = l.querySelector('input');
        const c = par[input.value];
        const etat = l.querySelector('.room__s');
        if (!c) return;
        const restantes = d.complet ? 0 : Math.min(c.restantes, d.restantesGlobal);
        if (restantes <= 0) {
          l.classList.add('is-complet');
          input.checked = false;
          input.disabled = true;
          etat.textContent = 'Complet';
        } else if (restantes === 1) {
          etat.textContent = 'Dernière place';
        } else if (restantes <= 3) {
          etat.textContent = `Plus que ${restantes} places`;
        }
      });
      maj();
    })
    .catch(() => {});

  maj();
});
