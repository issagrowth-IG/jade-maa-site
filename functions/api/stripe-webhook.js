/* Webhook Stripe → GHL. Déclenché à chaque paiement réussi d'un billet de conférence.
   POST /api/stripe-webhook  (appelé par Stripe, pas par le navigateur)
   Vérifie la signature Stripe, puis dans GHL (sous-compte LBM) : upsert du contact
   payeur + tag « payé ». Le tag déclenche le workflow GHL qui envoie le mail de
   confirmation (mail éditable dans GHL).
   Env : STRIPE_WEBHOOK_SECRET (whsec_…), GHL_PIT, GHL_LOCATION_ID. */

const GHL = 'https://services.leadconnectorhq.com';

// payment_link Stripe → tag GHL de l'événement. Ajouter une ligne par nouvel événement payant.
const EVENT_TAGS = {
  'plink_1U80kwBzUtKi0psW96QQPCyB': 'conf-lyon-07-nov-paye',
};

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

// Vérifie l'entête Stripe-Signature (schéma t=…,v1=…) via HMAC-SHA256 du "timestamp.payload".
async function signatureValide(payload, header, secret) {
  if (!header) return false;
  const parts = {};
  for (const kv of header.split(',')) { const i = kv.indexOf('='); if (i > 0) parts[kv.slice(0, i)] = kv.slice(i + 1); }
  const t = parts.t, v1 = parts.v1;
  if (!t || !v1) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false; // anti-rejeu : 5 min
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (hex.length !== v1.length) return false;
  let diff = 0;
  for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ v1.charCodeAt(i);
  return diff === 0;
}

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.GHL_PIT || !env.GHL_LOCATION_ID) {
    console.error('stripe-webhook: env manquante');
    return json({ error: 'config' }, 500);
  }

  const raw = await request.text();
  const sig = request.headers.get('Stripe-Signature');
  if (!(await signatureValide(raw, sig, env.STRIPE_WEBHOOK_SECRET))) {
    console.error('stripe-webhook: signature invalide');
    return json({ error: 'signature' }, 400);
  }

  let event;
  try { event = JSON.parse(raw); } catch { return json({ error: 'corps' }, 400); }

  // On ne traite que la fin de paiement d'un Checkout (Payment Link inclus).
  if (event.type !== 'checkout.session.completed') return json({ received: true });

  const s = event.data && event.data.object ? event.data.object : {};
  if (s.payment_status && s.payment_status !== 'paid') return json({ received: true });

  const cd = s.customer_details || {};
  const email = (cd.email || '').trim().toLowerCase();
  const phone = (cd.phone || '').trim();
  const full = (cd.name || '').trim();
  const sp = full.indexOf(' ');
  const firstName = sp === -1 ? full : full.slice(0, sp);
  const lastName = sp === -1 ? '' : full.slice(sp + 1);
  if (!email) { console.error('stripe-webhook: session sans email'); return json({ received: true }); }

  const tag = EVENT_TAGS[s.payment_link] || 'conference-valise-paye';

  const headers = { Authorization: `Bearer ${env.GHL_PIT}`, Version: '2021-07-28', 'Content-Type': 'application/json' };
  const body = {
    locationId: env.GHL_LOCATION_ID,
    firstName, lastName, email,
    ...(phone ? { phone } : {}),
    source: 'Stripe · Conférence « Dans ma valise, il y a… » (payé)',
  };

  let up;
  try {
    up = await fetch(`${GHL}/contacts/upsert`, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!up.ok && phone) {
      const { phone: _p, ...sansTel } = body; // GHL refuse parfois un tel mal formaté
      up = await fetch(`${GHL}/contacts/upsert`, { method: 'POST', headers, body: JSON.stringify(sansTel) });
    }
  } catch (e) {
    console.error('stripe-webhook: GHL injoignable', e && e.message);
    return json({ error: 'crm' }, 502); // 5xx → Stripe réessaiera
  }
  if (!up.ok) {
    console.error('stripe-webhook: upsert refusé', up.status, await up.text().catch(() => ''));
    return json({ error: 'crm' }, 502);
  }

  const data = await up.json().catch(() => null);
  const id = data && data.contact && data.contact.id;
  if (!id) { console.error('stripe-webhook: upsert sans id'); return json({ error: 'crm' }, 502); }

  const tr = await fetch(`${GHL}/contacts/${id}/tags`, {
    method: 'POST', headers, body: JSON.stringify({ tags: ['conference-valise', tag] }),
  }).catch(() => null);
  if (!tr || !tr.ok) {
    console.error('stripe-webhook: tag non posé', tr && tr.status);
    return json({ error: 'tag' }, 502); // le tag déclenche le mail → on veut qu'il passe
  }

  return json({ received: true, tagged: tag });
}
