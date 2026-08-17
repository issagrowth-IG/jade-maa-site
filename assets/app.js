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

  // --- Reveals au scroll ---
  const els = document.querySelectorAll('.reveal, .img-reveal');
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
  } else {
    els.forEach(el => el.classList.add('in'));
  }

  // --- Parallaxe douce sur le hero (aurora suit légèrement la souris) ---
  const aurora = document.querySelector('.aurora');
  if (aurora && window.matchMedia('(pointer:fine)').matches) {
    window.addEventListener('mousemove', (e) => {
      const x = (e.clientX / window.innerWidth - .5);
      const y = (e.clientY / window.innerHeight - .5);
      aurora.style.transform = `translate(${x * 18}px, ${y * 18}px)`;
    });
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

// --- Widget avis Amazon (page livre) : duplication du track pour boucle infinie ---
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.amz-track').forEach(track => {
    track.innerHTML += track.innerHTML;
  });
});
