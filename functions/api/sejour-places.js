/* GET /api/sejour-places?sejour=manoir : état de la jauge d'un séjour.
   Sert à afficher les places restantes et les chambres complètes sur la page.
   Purement informatif : le vrai verrou est dans sejour-checkout.js.

   L'état vient du Durable Object, jamais d'un balayage Stripe : compter les
   sessions Stripe en direct afficherait à vie une place remboursée comme vendue,
   et raterait une vente que Stripe n'a pas encore répliquée. */

import { estSejour, stock } from './_stock.js';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export async function onRequestGet({ request, env }) {
  const sejour = new URL(request.url).searchParams.get('sejour');
  if (!estSejour(sejour)) return json({ error: 'requete' }, 400);

  try {
    return json(await stock(env, sejour).etat());
  } catch (e) {
    /* La page garde son affichage normal plutôt que d'annoncer un faux « complet »
       ou un faux « disponible ». La décision de vendre se prend au checkout. */
    console.error('sejour-places: état indisponible', sejour, e && e.message);
    return json({ error: 'stock' }, 502);
  }
}
