/* Crée une session Stripe Checkout en mode « intégré » (embedded) pour le billet
   de conférence Lyon. Appelée par la page conférence ; renvoie le client_secret
   que Stripe.js monte dans la page (le client ne quitte pas jade-maa.com).
   Env : STRIPE_KEY (clé restreinte rk_live, droits Checkout write). */

const PRICE_LYON = 'price_1U80kwBzUtKi0psWrK7qkj21'; // 69 € · conf « Dans ma valise » Lyon 07/11
const RETURN_URL = 'https://jade-maa.com/conference-merci?session_id={CHECKOUT_SESSION_ID}';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json' } });

export async function onRequestPost({ env }) {
  if (!env.STRIPE_KEY) { console.error('create-checkout: STRIPE_KEY manquante'); return json({ error: 'config' }, 500); }

  const p = new URLSearchParams();
  p.set('ui_mode', 'embedded');
  p.set('mode', 'payment');
  p.set('line_items[0][price]', PRICE_LYON);
  p.set('line_items[0][quantity]', '1');
  p.set('return_url', RETURN_URL);
  p.set('phone_number_collection[enabled]', 'true');
  p.set('metadata[event]', 'conf-lyon-07-nov');
  p.set('payment_intent_data[metadata][event]', 'conf-lyon-07-nov');

  let r;
  try {
    r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p,
    });
  } catch (e) {
    console.error('create-checkout: Stripe injoignable', e && e.message);
    return json({ error: 'stripe' }, 502);
  }
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.client_secret) {
    console.error('create-checkout: échec', r.status, d && d.error && d.error.message);
    return json({ error: (d && d.error && d.error.message) || 'stripe' }, 502);
  }
  return json({ clientSecret: d.client_secret });
}
