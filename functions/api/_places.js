/* Compteur de places pour la conférence de Lyon — la jauge des 95 billets.
   Source de vérité : Stripe. Une place vendue = une Checkout Session terminée
   et payée rattachée à l'événement, qu'elle vienne du paiement intégré du site
   (metadata.event) ou d'un lien de paiement envoyé à la main.
   Volontairement sans compteur maison : un compteur qui dérive de Stripe vendrait
   une place de trop ou en garderait une pour rien. */

export const EVENT_LYON = 'conf-lyon-07-nov';
export const CAP_LYON = 95;

// Ouverture de la billetterie (24/08/2026). Le compte Stripe sert aussi aux
// séjours et à l'accompagnement : on ne remonte pas plus loin que cette date,
// sinon le balayage grossit avec les ventes des autres produits.
const DEPUIS = Math.floor(Date.parse('2026-08-24T00:00:00Z') / 1000);

// Liens de paiement rattachés au même événement. Leurs sessions ne portent pas
// forcément metadata.event : on les reconnaît par l'id du lien.
const LIENS_LYON = [
  'plink_1U8QhlBzUtKi0psWF9H9CMzd', // lien de secours 79 €
  'plink_1U80kwBzUtKi0psW96QQPCyB', // ancien lien 69 € (désactivé le 25/08)
];

const estPlaceLyon = (s) =>
  (s.payment_status === 'paid' || s.payment_status === 'no_payment_required') &&
  ((s.metadata && s.metadata.event === EVENT_LYON) || LIENS_LYON.includes(s.payment_link));

/* Nombre de places payées. Lève une exception si Stripe ne répond pas ou si le
   comptage est incomplet : l'appelant doit refuser la vente plutôt que deviner. */
export async function comptePlacesVendues(key) {
  let vendues = 0;
  let apres = null;

  for (let page = 0; page < 20; page++) {
    const q = new URLSearchParams({ limit: '100', status: 'complete', 'created[gte]': String(DEPUIS) });
    if (apres) q.set('starting_after', apres);

    const r = await fetch(`https://api.stripe.com/v1/checkout/sessions?${q}`, {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (!r.ok) throw new Error(`stripe ${r.status}`);

    const d = await r.json();
    const lot = d.data || [];
    for (const s of lot) if (estPlaceLyon(s)) vendues++;

    if (!d.has_more || !lot.length) return vendues;
    apres = lot[lot.length - 1].id;
  }
  throw new Error('comptage incomplet'); // 2000 sessions parcourues sans fin de liste
}
