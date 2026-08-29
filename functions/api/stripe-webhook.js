/* Webhook Stripe. POST /api/stripe-webhook (appelé par Stripe, pas par le navigateur).
   Vérifie la signature, puis route selon le produit.

   Conférence : upsert du contact payeur dans GHL (sous-compte LBM) + tag « payé ».
   Le tag déclenche le workflow GHL qui envoie le mail de confirmation.

   Séjours : c'est ici que la place passe de « tenue » à « payée » dans le
   compteur, et que le stock est rendu quand l'argent repart. Événements à
   abonner côté Stripe, en plus de checkout.session.completed :
     checkout.session.expired  : filet de sécurité si notre tenue de 15 min a raté
     charge.refunded           : la place remboursée RETOURNE au stock
     charge.dispute.created    : litige, la place retourne au stock
   Sans ces trois-là, une place remboursée resterait vendue à vie.

   Toutes les opérations de stock sont idempotentes : Stripe rejoue ses webhooks,
   et un rejeu ne doit jamais consommer une deuxième place.

   Env : STRIPE_WEBHOOK_SECRET (whsec_…), GHL_PIT, GHL_LOCATION_ID, STRIPE_KEY,
   binding STOCK_SEJOURS, SLACK_WEBHOOK_SEJOURS ou SLACK_WEBHOOK. */

import { SUBJECT, HTML } from './_conf-email.js';
import { CAP_LYON, EVENT_LYON, comptePlacesVendues } from './_places.js';
import { SEJOURS, chambreDe, estSejour, placeDeSession, stock } from './_stock.js';
import { alerteStock, notifierVente } from './_slack.js';

const GHL = 'https://services.leadconnectorhq.com';

// Clé (payment_link OU metadata.event du checkout intégré) → tag GHL. Une ligne par événement payant.
const EVENT_TAGS = {
  'plink_1U8QhlBzUtKi0psWF9H9CMzd': 'conf-lyon-07-nov-paye', // Payment Link 79 € (fallback)
  'plink_1U80kwBzUtKi0psW96QQPCyB': 'conf-lyon-07-nov-paye', // Payment Link 69 € (désactivé le 25/08)
  'conf-lyon-07-nov': 'conf-lyon-07-nov-paye',               // checkout intégré (metadata.event)
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

/* ---------------------------------------------------------------------------
   Séjours : passage de la place en « payée », et retour au stock quand l'argent
   repart. Rien ici ne fait de balayage Stripe pour décider d'une vente.
   --------------------------------------------------------------------------- */

/* À quel séjour et quelle chambre correspond cette session ?
   D'abord les métadonnées posées par notre checkout. Sinon le PRIX Stripe :
   un lien de paiement envoyé à la main par l'équipe ne porte aucune métadonnée
   mais pointe le même prix, et doit consommer une place comme les autres. */
async function placeDeLaSession(s, env) {
  const m = s.metadata || {};
  if (m.event) return null; // conférence : traitée plus bas
  if (estSejour(m.sejour) && chambreDe(m.sejour, m.chambre)) {
    return { sejour: m.sejour, chambre: m.chambre, reservationId: m.reservationId || null };
  }
  if (!env.STRIPE_KEY) return null;
  try {
    const place = await placeDeSession(env.STRIPE_KEY, s.id);
    return place ? { ...place, reservationId: null } : null;
  } catch (e) {
    console.error('stripe-webhook: prix de la session illisible', s.id, e && e.message);
    return null;
  }
}

async function confirmerPlace(s, place, eventId, env) {
  let compteur;
  try { compteur = stock(env, place.sejour); } catch (e) {
    console.error('stripe-webhook: compteur indisponible', place.sejour, e && e.message);
    return { retry: true };
  }

  /* Idempotence sur l'id d'événement : garde-fou contre un rejeu qui enverrait
     une deuxième notification Slack. Le décompte, lui, est déjà idempotent sur
     l'id de session. */
  let premiereFois = true;
  try { premiereFois = await compteur.evenementNouveau(eventId); } catch (e) {
    console.error('stripe-webhook: journal des événements illisible', eventId, e && e.message);
  }

  const cd = s.customer_details || {};
  let r;
  try {
    r = await compteur.confirmer({
      sessionId: s.id,
      reservationId: place.reservationId,
      chambre: place.chambre,
      paiementIntentId: typeof s.payment_intent === 'string' ? s.payment_intent : null,
      nom: (cd.name || '').trim() || null,
      email: (cd.email || '').trim().toLowerCase() || null,
      telephone: (cd.phone || '').trim() || null,
      montant: s.amount_total != null ? s.amount_total : null,
      origine: place.reservationId ? 'site' : 'hors-site',
    });
  } catch (e) {
    /* Une confirmation perdue laisserait la place en « tenue », donc revendable
       dans 15 minutes alors qu'elle est payée : on demande à Stripe de réessayer. */
    console.error('stripe-webhook: confirmation de place impossible', s.id, e && e.message);
    return { retry: true };
  }

  if (r && r.surbooking && r.surbooking.length) {
    await alerteStock(env, `Surbooking sur le séjour ${place.sejour}`, { session: s.id, alertes: r.surbooking });
  }

  if (premiereFois && !(r && r.deja)) {
    const chambre = chambreDe(place.sejour, place.chambre);
    let restantes = null;
    try { restantes = (await compteur.etat()).restantesGlobal; } catch { /* confort d'affichage seulement */ }
    await notifierVente(env, {
      produit: `Séjour « ${SEJOURS[place.sejour].nom} » (${SEJOURS[place.sejour].lieu})`,
      chambre: chambre ? `${chambre.libelle} (${chambre.detail})` : place.chambre,
      nom: (cd.name || '').trim(), email: (cd.email || '').trim(), telephone: (cd.phone || '').trim(),
      montant: s.amount_total, paiement: 'comptant', restantes,
    });
  }

  console.log(`stripe-webhook: place payée ${place.sejour}/${place.chambre}`, JSON.stringify({ session: s.id, ...r, surbooking: undefined }));
  return { sejour: place.sejour, action: 'payee' };
}

/* Rend la place au stock quand l'argent repart. On ne sait pas toujours de quel
   séjour il s'agit (un litige ne cite ni session ni séjour) : les deux compteurs
   sont interrogés, celui qui connaît la place agit. */
async function rendreLaPlace(env, metadata, paiementIntentId, motif, note) {
  const m = metadata || {};
  /* Un litige ne cite ni session ni séjour : sans indice, les deux compteurs sont
     interrogés et celui qui connaît la place agit. */
  const identifie = estSejour(m.sejour);
  const candidats = identifie ? [m.sejour] : Object.keys(SEJOURS);
  for (const sejour of candidats) {
    let compteur;
    try { compteur = stock(env, sejour); } catch (e) {
      console.error('stripe-webhook: compteur indisponible', sejour, e && e.message);
      /* Compteur absent et rien ne dit que c'est une place de séjour (un
         remboursement de billet de conférence, par exemple) : on laisse passer
         plutôt que de faire réessayer Stripe indéfiniment. */
      return identifie ? { retry: true } : null;
    }
    try {
      let r = { ok: false };
      if (note) {
        /* Remboursement partiel : la place reste prise, un humain tranche. */
        if (m.reservationId) r = await compteur.marquer(m.reservationId, note);
        if (!r.ok && paiementIntentId) r = await compteur.marquer(paiementIntentId, note);
      } else {
        if (m.reservationId) r = await compteur.liberer(m.reservationId, motif);
        if (!r.ok && paiementIntentId) r = await compteur.libererParPaiement(paiementIntentId, motif);
      }
      if (r.ok) {
        await alerteStock(env, `Place ${note ? 'à vérifier' : 'rendue au stock'} sur ${sejour}`, { motif: note || motif, paiementIntentId, reservation: r.reservationId });
        return { sejour, action: note || motif };
      }
    } catch (e) {
      console.error('stripe-webhook: retour au stock impossible', sejour, e && e.message);
      return identifie ? { retry: true } : null;
    }
  }
  return null; // pas une place de séjour (billet de conférence, autre produit)
}

async function traiterSejour(event, env) {
  const o = (event.data && event.data.object) || {};

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (o.payment_status && o.payment_status !== 'paid' && o.payment_status !== 'no_payment_required') return null;
    const place = await placeDeLaSession(o, env);
    if (!place) return null;
    return confirmerPlace(o, place, event.id, env);
  }

  if (event.type === 'checkout.session.expired') {
    const m = o.metadata || {};
    if (!estSejour(m.sejour)) return null;
    try {
      const compteur = stock(env, m.sejour);
      const r = m.reservationId
        ? await compteur.liberer(m.reservationId, 'session-expiree')
        : await compteur.libererParSession(o.id, 'session-expiree');
      console.log('stripe-webhook: session expirée', m.sejour, JSON.stringify(r));
    } catch (e) {
      /* Sans gravité : notre tenue de 15 min a déjà rendu la place, cet
         événement n'est qu'un filet. On ne fait pas réessayer Stripe. */
      console.error('stripe-webhook: libération sur expiration ratée', o.id, e && e.message);
    }
    return { sejour: m.sejour, action: 'expiree' };
  }

  if (event.type === 'charge.refunded') {
    const complet = o.refunded === true || (o.amount != null && o.amount_refunded != null && o.amount_refunded >= o.amount);
    return rendreLaPlace(env, o.metadata, o.payment_intent, 'rembourse', complet ? null : 'remboursement-partiel');
  }

  if (event.type === 'charge.dispute.created') {
    return rendreLaPlace(env, o.metadata, o.payment_intent, 'litige', null);
  }

  return null;
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

  /* Séjours d'abord. `traiterSejour` renvoie null si l'événement ne concerne
     aucune place de séjour, et le billet de conférence suit son chemin habituel. */
  const sejour = await traiterSejour(event, env);
  if (sejour && sejour.retry) return json({ error: 'stock' }, 502); // Stripe réessaiera
  if (sejour) return json({ received: true, ...sejour });

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

  const eventKey = s.payment_link || (s.metadata && s.metadata.event) || '';
  const tag = EVENT_TAGS[eventKey] || 'conference-valise-paye';

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
    return json({ error: 'tag' }, 502); // pas encore de mail envoyé → Stripe peut réessayer sans doublon
  }

  // Filet de sécurité de la jauge. Le verrou est posé avant paiement, mais deux
  // achats simultanés sur la dernière place passeraient tous les deux : on tague
  // le contact en trop pour qu'il soit traité à la main (jamais de remboursement
  // automatique). Best-effort, un échec ici ne bloque pas la confirmation.
  if (env.STRIPE_KEY && tag === 'conf-lyon-07-nov-paye') {
    try {
      const vendues = await comptePlacesVendues(env.STRIPE_KEY);
      if (vendues > CAP_LYON) {
        console.error(`stripe-webhook: SURBOOKING ${EVENT_LYON} — ${vendues}/${CAP_LYON} places`);
        await fetch(`${GHL}/contacts/${id}/tags`, {
          method: 'POST', headers, body: JSON.stringify({ tags: ['conf-lyon-07-nov-surbooking'] }),
        }).catch(() => null);
      }
    } catch (e) {
      console.error('stripe-webhook: verification de la jauge impossible', e && e.message);
    }
  }

  // Notification Slack de la vente. Best-effort : Slack ne bloque jamais une vente.
  await notifierVente(env, {
    produit: 'Conférence « Dans ma valise, il y a… » · Lyon',
    nom: full, email, telephone: phone,
    montant: s.amount_total, paiement: 'comptant',
  });

  // Mail de confirmation envoyé par GHL. Best-effort : un échec ne fait pas réessayer
  // Stripe (sinon on risquerait un doublon d'email), il est seulement journalisé.
  try {
    const em = await fetch(`${GHL}/conversations/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.GHL_PIT}`, Version: '2021-04-15', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'Email', contactId: id, subject: SUBJECT, html: HTML }),
    });
    if (!em.ok) console.error('stripe-webhook: email GHL refusé', em.status, await em.text().catch(() => ''));
  } catch (e) {
    console.error('stripe-webhook: email GHL injoignable', e && e.message);
  }

  return json({ received: true, tagged: tag });
}
