/* Inscription / notification conférence « Dans ma valise, il y a… »
   POST /api/conference  { prenom, nom, email, tel, ville, website(honeypot) }
   → upsert du contact dans GHL (sous-compte LBM) + tags.
   Env : GHL_PIT (secret), GHL_LOCATION_ID. */

const GHL = 'https://services.leadconnectorhq.com';
const VILLES = new Set(['lyon-07-nov', 'marseille-05-dec', 'bruxelles-16-jan', 'lille-30-jan', 'toutes-dates']);

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ request, env }) {
  if (!env.GHL_PIT || !env.GHL_LOCATION_ID) {
    console.error('conference: env GHL manquante');
    return json({ ok: false, error: 'config' }, 500);
  }

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: 'corps' }, 400); }
  if (typeof d !== 'object' || d === null) return json({ ok: false, error: 'corps' }, 400);

  // Honeypot : un bot qui remplit « website » reçoit un faux succès.
  // Loggé pour rendre visibles d'éventuels faux positifs (autofill agressif).
  if (String(d.website ?? '').trim() !== '') {
    console.log('conference: honeypot déclenché');
    return json({ ok: true });
  }

  const s = v => (v == null ? '' : String(v)).trim().slice(0, 120);
  const prenom = s(d.prenom), nom = s(d.nom), tel = s(d.tel);
  const email = s(d.email).toLowerCase();
  const ville = VILLES.has(d.ville) ? d.ville : 'toutes-dates';

  if (!prenom || !nom || !email || !tel) return json({ ok: false, error: 'champs' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return json({ ok: false, error: 'email' }, 400);
  if (tel.replace(/\D/g, '').length < 8) return json({ ok: false, error: 'tel' }, 400);

  const headers = {
    'Authorization': `Bearer ${env.GHL_PIT}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json',
  };

  const body = {
    locationId: env.GHL_LOCATION_ID,
    firstName: prenom,
    lastName: nom,
    email,
    phone: tel,
    source: 'Site jade-maa.com · Conférence « Dans ma valise, il y a… »',
  };

  let up;
  try {
    up = await fetch(`${GHL}/contacts/upsert`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!up.ok) {
      // Si GHL refuse le numéro tel quel, on sauve quand même le lead sans téléphone.
      const { phone, ...sansTel } = body;
      up = await fetch(`${GHL}/contacts/upsert`, { method: 'POST', headers, body: JSON.stringify(sansTel) });
    }
  } catch (e) {
    console.error('conference: GHL injoignable', e && e.message);
    return json({ ok: false, error: 'crm' }, 502);
  }
  if (!up.ok) {
    console.error('conference: upsert refusé', up.status, await up.text().catch(() => ''));
    return json({ ok: false, error: 'crm' }, 502);
  }

  const data = await up.json().catch(() => null);
  const id = data && data.contact && data.contact.id;
  if (id) {
    const tag = ville === 'lyon-07-nov' ? 'conf-lyon-07-nov-inscrit' : `conf-${ville}-a-prevenir`;
    const tr = await fetch(`${GHL}/contacts/${id}/tags`, {
      method: 'POST', headers, body: JSON.stringify({ tags: ['conference-valise', tag] }),
    }).catch(() => null);
    // Le contact est sauvé même si le tag échoue : on trace pour pouvoir le voir.
    if (!tr || !tr.ok) console.error('conference: tags non posés', tr && tr.status);
  } else {
    console.error('conference: upsert sans id de contact');
  }

  return json({ ok: true });
}
