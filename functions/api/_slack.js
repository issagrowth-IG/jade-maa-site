/* Notifications Slack. Une vente doit se voir tout de suite dans le canal, sans
   attendre que quelqu'un ouvre Stripe.

   Règle absolue : Slack ne bloque JAMAIS une vente. Un webhook mort, un canal
   supprimé, une coupure réseau : c'est journalisé et on continue. Le client a
   payé, la place est prise, le reste est du confort.

   Env : SLACK_WEBHOOK_SEJOURS en priorité (le client aura peut-être un canal
   dédié aux séjours), repli sur SLACK_WEBHOOK (le canal d'alertes existant).
   L'URL n'est jamais écrite en dur ici : un webhook Slack est un secret, il se
   pose en variable d'environnement comme les clés Stripe. */

const url = (env) => env.SLACK_WEBHOOK_SEJOURS || env.SLACK_WEBHOOK || null;

export const euros = (centimes) =>
  centimes == null ? '?' : `${(centimes / 100).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/, ' ')} €`;

async function poster(env, texte) {
  const cible = url(env);
  if (!cible) { console.error('slack: aucun webhook configuré'); return false; }
  try {
    const r = await fetch(cible, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: texte }),
    });
    if (!r.ok) { console.error('slack: refus', r.status, await r.text().catch(() => '')); return false; }
    return true;
  } catch (e) {
    console.error('slack: injoignable', e && e.message);
    return false;
  }
}

/* Une vente : séjour ou conférence, même format pour que le canal reste lisible. */
export function notifierVente(env, v) {
  const l = [
    `:tada: *Nouvelle vente* : ${v.produit}`,
    `*Nom* : ${v.nom || '(non renseigné)'}`,
    `*Email* : ${v.email || '(non renseigné)'}`,
    `*Téléphone* : ${v.telephone || '(non renseigné)'}`,
  ];
  if (v.chambre) l.push(`*Chambre* : ${v.chambre}`);
  l.push(`*Montant* : ${euros(v.montant)}`);
  l.push(`*Paiement* : ${v.paiement || 'comptant'}`);
  if (v.restantes != null) l.push(`*Places restantes* : ${v.restantes}`);
  return poster(env, l.join('\n'));
}

/* Alerte d'exploitation : surbooking, remboursement, incohérence de stock.
   Volontairement bruyante, c'est le genre de chose qu'on veut voir tout de suite. */
export function alerteStock(env, titre, details) {
  const corps = details == null ? '' : `\n\`\`\`${JSON.stringify(details, null, 1)}\`\`\``;
  console.error('alerte stock:', titre, JSON.stringify(details || {}));
  return poster(env, `:rotating_light: *${titre}*${corps}`);
}
