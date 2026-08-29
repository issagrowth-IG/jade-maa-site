/* POST /api/sejour-checkout { sejour, chambre } : ouvre un paiement pour UNE place.
   Renvoie { clientSecret, reservationId } : le client paie sans quitter jade-maa.com.

   L'ordre des opérations est le cœur du dispositif :
     1. la place est PRISE dans le Durable Object (tenue 15 minutes)
     2. seulement ensuite on demande une session à Stripe
     3. si Stripe rate, la place est immédiatement rendue
   Prendre la place avant d'appeler Stripe est ce qui empêche deux acheteuses
   simultanées d'obtenir la même dernière place : le compteur est mono-thread,
   la deuxième voit le stock déjà décrémenté.

   Le champ `paiement` est accepté mais ignoré (le fractionné a été abandonné le
   29/08/2026) : un appel encore en vol ne doit pas casser.

   Env : STRIPE_KEY (clé restreinte rk_live), binding STOCK_SEJOURS,
   SEJOUR_RETURN_URL (facultatif). */

import { EXPIRATION_STRIPE_S, QUANTITE, chambreDe, estSejour, stock } from './_stock.js';

const RETOUR = 'https://jade-maa.com/sejour-merci?session_id={CHECKOUT_SESSION_ID}';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_KEY) { console.error('sejour-checkout: STRIPE_KEY manquante'); return json({ error: 'config' }, 500); }

  let d;
  try { d = await request.json(); } catch { return json({ error: 'requete' }, 400); }
  if (typeof d !== 'object' || d === null) return json({ error: 'requete' }, 400);

  const sejour = String(d.sejour || '');
  const chambreId = String(d.chambre || '');
  if (!estSejour(sejour)) return json({ error: 'requete' }, 400);
  const chambre = chambreDe(sejour, chambreId);
  if (!chambre) return json({ error: 'requete' }, 400);

  let compteur;
  try { compteur = stock(env, sejour); } catch (e) {
    console.error('sejour-checkout: compteur indisponible', e && e.message);
    return json({ error: 'stripe' }, 502); // en cas de doute sur le stock, on refuse
  }

  /* Prise de place. En cas de doute (compteur injoignable) on REFUSE la vente :
     une vente perdue se rattrape, une place vendue deux fois non. */
  let prise;
  try {
    prise = await compteur.prendre({ chambre: chambreId });
  } catch (e) {
    console.error('sejour-checkout: prise de place impossible', sejour, chambreId, e && e.message);
    return json({ error: 'stripe' }, 502);
  }
  if (!prise.ok) {
    /* `vente-fermee` (séjour commencé) sort aussi en 409 : côté page le résultat
       visible est le même, la place n'est pas réservable. */
    console.log(`sejour-checkout: refus ${sejour}/${chambreId} (${prise.raison}${prise.plafond ? ' ' + prise.plafond : ''})`);
    return json({ soldOut: true, chambre: chambreId }, 409);
  }

  const p = new URLSearchParams();
  p.set('ui_mode', 'embedded');
  p.set('mode', 'payment');
  p.set('line_items[0][price]', chambre.price);
  p.set('line_items[0][quantity]', String(QUANTITE)); // 1 place = 1 billet = 1 personne
  p.set('return_url', env.SEJOUR_RETURN_URL || RETOUR);
  p.set('phone_number_collection[enabled]', 'true');
  /* 30 min est le minimum accepté par Stripe. Notre tenue expire à 15 min : le
     stock reprend la place avant Stripe, jamais après. */
  p.set('expires_at', String(Math.floor(Date.now() / 1000) + EXPIRATION_STRIPE_S));
  p.set('metadata[sejour]', sejour);
  p.set('metadata[chambre]', chambreId);
  p.set('metadata[reservationId]', prise.reservationId);
  /* Le PaymentIntent porte les mêmes repères : un remboursement arrive par le
     PaymentIntent, sans jamais citer la session. */
  p.set('payment_intent_data[metadata][sejour]', sejour);
  p.set('payment_intent_data[metadata][chambre]', chambreId);
  p.set('payment_intent_data[metadata][reservationId]', prise.reservationId);

  const rendre = async (motif) => {
    try { await compteur.liberer(prise.reservationId, motif); } catch (e) {
      console.error('sejour-checkout: place non rendue', prise.reservationId, e && e.message);
    }
  };

  let r;
  try {
    r = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.STRIPE_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p,
    });
  } catch (e) {
    console.error('sejour-checkout: Stripe injoignable', e && e.message);
    await rendre('stripe-injoignable');
    return json({ error: 'stripe' }, 502);
  }

  const s = await r.json().catch(() => null);
  if (!r.ok || !s || !s.client_secret) {
    console.error('sejour-checkout: session refusée', r.status, s && s.error && s.error.message);
    await rendre('stripe-refus');
    return json({ error: 'stripe' }, 502);
  }

  /* Rattachement de la session à la place. S'il échoue, la place reste tenue et
     expirera d'elle-même : le webhook saura quand même la retrouver par
     metadata.reservationId, et la réconciliation par le prix Stripe. */
  try { await compteur.attacherSession(prise.reservationId, s.id); } catch (e) {
    console.error('sejour-checkout: session non rattachée', prise.reservationId, s.id, e && e.message);
  }

  return json({ clientSecret: s.client_secret, reservationId: prise.reservationId });
}
