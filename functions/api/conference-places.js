/* GET /api/conference-places — état de la jauge de la conférence de Lyon.
   Sert à afficher « Complet » sur les pages qui pointent vers la billetterie.
   Purement informatif : le vrai verrou est dans create-checkout-session.js. */

import { CAP_LYON, comptePlacesVendues } from './_places.js';

export async function onRequestGet({ env }) {
  const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

  if (!env.STRIPE_KEY) return json({ error: 'config' }, 500);

  let vendues;
  try {
    vendues = await comptePlacesVendues(env.STRIPE_KEY);
  } catch (e) {
    console.error('conference-places: comptage impossible', e && e.message);
    return json({ error: 'stripe' }, 502); // la page garde son affichage normal
  }

  return json({
    cap: CAP_LYON,
    vendues,
    restantes: Math.max(0, CAP_LYON - vendues),
    soldOut: vendues >= CAP_LYON,
  });
}
