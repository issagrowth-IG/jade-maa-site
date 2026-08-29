/* Moteur de stock des séjours. Une place vendue en trop est un échec grave, une
   vente perdue par prudence est acceptable : tout ce fichier est écrit dans ce sens.

   Le compteur ne se déduit PAS d'un balayage Stripe en direct. La liste des
   sessions Stripe est éventuellement cohérente, une place remboursée y reste
   « paid » à vie, et un balayage borné finit un jour par mentir : trois façons
   de vendre la même place deux fois. Le compteur est tenu par un Durable Object,
   un objet par séjour, dont Cloudflare garantit l'exécution mono-thread : la
   prise de place est donc atomique sans verrou applicatif. Stripe reste l'arbitre
   final, mais par la réconciliation, jamais dans le chemin de vente.

   Ce fichier ne contient QUE de la configuration et de la logique pure. Il est
   importé à la fois par les Pages Functions et par le worker qui héberge le
   Durable Object, et il tourne tel quel sous Node pour les tests : le code testé
   est exactement le code servi.

   Paiement : comptant uniquement (mode `payment`). Le paiement en plusieurs fois
   a été abandonné le 29/08/2026. Les prix récurrents créés ce jour-là ont été
   désactivés dans Stripe, pas supprimés. */

/* Durée de la tenue de place. C'est NOTRE minuteur, pas celui de Stripe : la
   session Stripe expire à 30 min (le plancher imposé par Stripe) mais la place
   revient au stock à 15 min. La fenêtre entre les deux est une marge où le stock
   est plus prudent que Stripe, jamais l'inverse. */
export const TENUE_MS = 15 * 60 * 1000;

/* Expiration posée sur la session Stripe. Stripe n'accepte qu'entre 30 min et
   24 h : 30 min est le minimum autorisé. */
export const EXPIRATION_STRIPE_S = 30 * 60;

/* Une place = un billet = une personne. Deux inconnues peuvent partager une
   chambre duo : on ne vend jamais « la chambre », donc la quantité est forcée à 1. */
export const QUANTITE = 1;

/* Borne du balayage de réconciliation. Le compte Stripe sert aussi à la
   conférence et à LBM : sans borne le balayage grossit avec des ventes qui ne
   nous regardent pas. Aucune vente de séjour n'existe avant cette date. */
export const DEPUIS = Math.floor(Date.parse('2026-08-01T00:00:00Z') / 1000);

export const SEJOURS = {
  manoir: {
    id: 'manoir',
    nom: "Revenir à l'essentiel",
    lieu: 'Manoir Ducey',
    dates: '21-25 octobre 2026',
    capaciteGlobale: 12,
    /* Garde-fou : on ne vend plus une place une fois le séjour commencé.
       Heure de Paris, pas UTC : une date française lue en UTC ferme deux heures trop tard. */
    fermetureParis: '2026-10-21T00:00:00',
    chambres: [
      { id: 'partagee-5', libelle: 'Chambre partagée à 5', detail: 'lit simple · sdb partagée', prix: 119000, quota: 5, price: 'price_1U9mzhBzUtKi0psWW7T4wfWh' },
      { id: 'duo-simple', libelle: 'Chambre duo', detail: 'lit simple · sdb partagée', prix: 119000, quota: 2, price: 'price_1U9mzjBzUtKi0psWnIccytyO' },
      { id: 'duo-double', libelle: 'Chambre duo', detail: 'lit double · sdb partagée', prix: 123000, quota: 2, price: 'price_1U9mzlBzUtKi0psWIR2bPhdp' },
      { id: 'solo', libelle: 'Chambre solo', detail: 'lit double · sdb partagée', prix: 128900, quota: 3, price: 'price_1U9mzmBzUtKi0psW4BzBdxgF' },
    ],
  },

  plessis: {
    id: 'plessis',
    nom: "Le jour d'après",
    lieu: 'Le Plessis-Placy',
    dates: '18-22 novembre 2026',
    /* Double plafond volontaire : la somme des quotas fait 16, la maison n'en
       accueille que 14. Les DEUX plafonds sont testés à chaque prise de place. */
    capaciteGlobale: 14,
    fermetureParis: '2026-11-18T00:00:00',
    chambres: [
      { id: 'partagee-3-6', libelle: 'Chambre partagée de 3 à 6', detail: 'lit simple · sdb partagée', prix: 119000, quota: 12, price: 'price_1U9mzoBzUtKi0psWhZosMDFc' },
      { id: 'duo-simple', libelle: 'Chambre duo', detail: 'lit simple · sdb partagée', prix: 123000, quota: 2, price: 'price_1U9mzpBzUtKi0psWeBwkjACg' },
      { id: 'solo', libelle: 'Chambre solo', detail: 'lit double · sdb privée', prix: 128900, quota: 2, price: 'price_1U9mzrBzUtKi0psWIPyUsxTU' },
    ],
  },
};

/* Index prix Stripe → place. C'est par le PRIX qu'une vente est rattachée, jamais
   par l'id d'un lien de paiement : un lien créé à la main par l'équipe pointe le
   même prix et doit consommer une place comme n'importe quelle vente du site. */
export const PRIX = (() => {
  const m = new Map();
  for (const s of Object.values(SEJOURS)) {
    for (const c of s.chambres) m.set(c.price, { sejour: s.id, chambre: c.id });
  }
  return m;
})();

export const estSejour = (id) => Object.prototype.hasOwnProperty.call(SEJOURS, id);
export const chambreDe = (sejour, id) => (SEJOURS[sejour] ? SEJOURS[sejour].chambres.find((c) => c.id === id) || null : null);

/* Décalage UTC de l'Europe/Paris à un instant donné, en ms. Passe par Intl pour
   ne pas maintenir une table d'heure d'été : l'heure de Paris change pile pendant
   la fenêtre de vente du Manoir (dernier dimanche d'octobre). */
function decalageParis(ms) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Paris', hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const p = {};
  for (const { type, value } of f.formatToParts(ms)) p[type] = value;
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
  return local - ms;
}

/* 'YYYY-MM-DDTHH:mm:ss' lu comme une heure de Paris → instant epoch ms.
   Deux passes suffisent à converger, même à cheval sur un changement d'heure. */
export function instantParis(iso) {
  const [d, t = '00:00:00'] = String(iso).split('T');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, mi, s] = t.split(':').map(Number);
  const naif = Date.UTC(Y, M - 1, D, h || 0, mi || 0, s || 0);
  let x = naif;
  for (let i = 0; i < 2; i++) x = naif - decalageParis(x);
  return x;
}

export function venteOuverte(sejourId, maintenant = Date.now()) {
  const s = SEJOURS[sejourId];
  if (!s) return false;
  return maintenant <= instantParis(s.fermetureParis);
}

export const ETATS = { TENUE: 'tenue', PAYEE: 'payee', LIBEREE: 'liberee' };

/* Motifs qui autorisent à rendre au stock une place DÉJÀ PAYÉE. Une place payée
   ne repart jamais sur un simple minuteur : il faut que l'argent soit reparti. */
const MOTIFS_LIBERATION_PAYEE = ['rembourse', 'litige', 'annule-main'];

/* Le moteur. Toutes ses méthodes sont SYNCHRONES : il n'y a pas un seul await
   entre le comptage du stock et l'écriture de la réservation, donc la section
   critique ne peut être entrecoupée ni par le tourniquet d'événements JS, ni par
   le Durable Object qui n'exécute de toute façon qu'une requête à la fois.
   `table` est un adaptateur de stockage synchrone : SQLite du Durable Object en
   production, objet en mémoire dans les tests, même surface dans les deux cas. */
export class MoteurStock {
  constructor(sejourId, table, horloge = Date.now) {
    if (!SEJOURS[sejourId]) throw new Error(`sejour inconnu: ${sejourId}`);
    this.sejour = SEJOURS[sejourId];
    this.table = table;
    this.horloge = horloge;
  }

  #occupe(r, maintenant) {
    if (r.etat === ETATS.PAYEE) return true;
    return r.etat === ETATS.TENUE && r.expireA > maintenant;
  }

  /* Une tenue périmée cesse de compter à la seconde près, et on en profite pour
     l'écrire. Le compteur reste juste même si plus personne n'appelle pendant
     des heures : il ne dépend d'aucun minuteur qui tourne. */
  #perimer(maintenant) {
    for (const r of this.table.toutes()) {
      if (r.etat === ETATS.TENUE && r.expireA <= maintenant) {
        this.table.maj(r.id, { etat: ETATS.LIBEREE, motif: 'tenue-expiree', majA: maintenant });
      }
    }
  }

  compte(maintenant = this.horloge()) {
    this.#perimer(maintenant);
    const parChambre = new Map();
    for (const c of this.sejour.chambres) parChambre.set(c.id, { vendues: 0, tenues: 0 });
    let vendues = 0;
    let tenues = 0;
    for (const r of this.table.toutes()) {
      if (!this.#occupe(r, maintenant)) continue;
      const cible = parChambre.get(r.chambre);
      if (r.etat === ETATS.PAYEE) { vendues++; if (cible) cible.vendues++; }
      else { tenues++; if (cible) cible.tenues++; }
    }
    return { vendues, tenues, parChambre };
  }

  etat(maintenant = this.horloge()) {
    const { vendues, tenues, parChambre } = this.compte(maintenant);
    const capa = this.sejour.capaciteGlobale;
    const restantesGlobal = Math.max(0, capa - vendues - tenues);
    const chambres = this.sejour.chambres.map((c) => {
      const n = parChambre.get(c.id);
      const surType = Math.max(0, c.quota - n.vendues - n.tenues);
      /* Le restant annoncé est le plus petit des deux plafonds : au Plessis une
         chambre peut être complète alors que son quota n'est pas atteint, parce
         que la maison est pleine. */
      const restantes = Math.min(surType, restantesGlobal);
      return {
        id: c.id, libelle: c.libelle, detail: c.detail, prix: c.prix, quota: c.quota,
        vendues: n.vendues, tenues: n.tenues, restantes, complet: restantes <= 0,
      };
    });
    return {
      sejour: this.sejour.id,
      capaciteGlobale: capa,
      vendues, tenues, restantesGlobal,
      complet: restantesGlobal <= 0,
      chambres,
    };
  }

  /* Prise de place. Renvoie un refus, ne lève pas : l'appelant doit répondre 409
     et non 500. La place est prise AVANT d'ouvrir le paiement. */
  prendre({ chambre }, maintenant = this.horloge()) {
    const c = chambreDe(this.sejour.id, chambre);
    if (!c) return { ok: false, raison: 'chambre' };
    if (!venteOuverte(this.sejour.id, maintenant)) return { ok: false, raison: 'vente-fermee' };

    const { vendues, tenues, parChambre } = this.compte(maintenant);
    if (vendues + tenues >= this.sejour.capaciteGlobale) return { ok: false, raison: 'complet', plafond: 'global' };
    const n = parChambre.get(chambre);
    if (n.vendues + n.tenues >= c.quota) return { ok: false, raison: 'complet', plafond: 'chambre' };

    const id = this.table.identifiant();
    const ligne = {
      id, chambre,
      etat: ETATS.TENUE,
      expireA: maintenant + TENUE_MS,
      sessionId: null, paiementIntentId: null,
      nom: null, email: null, telephone: null,
      montant: null, note: null, motif: null,
      origine: 'site',
      creeA: maintenant, majA: maintenant,
    };
    this.table.inserer(ligne);
    return { ok: true, reservationId: id, expireA: ligne.expireA };
  }

  /* La session Stripe est rattachée après coup : la place existe avant même
     l'appel à Stripe, pour qu'une lenteur de Stripe ne puisse jamais vendre deux fois. */
  attacherSession(reservationId, sessionId, maintenant = this.horloge()) {
    const r = this.table.parId(reservationId);
    if (!r) return { ok: false, raison: 'inconnue' };
    this.table.maj(r.id, { sessionId, majA: maintenant });
    return { ok: true };
  }

  liberer(reservationId, motif, maintenant = this.horloge()) {
    const r = this.table.parId(reservationId);
    if (!r) return { ok: false, raison: 'inconnue' };
    if (r.etat === ETATS.PAYEE && !MOTIFS_LIBERATION_PAYEE.includes(motif)) return { ok: false, raison: 'payee' };
    if (r.etat === ETATS.LIBEREE) return { ok: true, deja: true };
    this.table.maj(r.id, { etat: ETATS.LIBEREE, motif, majA: maintenant });
    return { ok: true };
  }

  libererParSession(sessionId, motif, maintenant = this.horloge()) {
    const r = this.table.parSession(sessionId);
    if (!r) return { ok: false, raison: 'inconnue' };
    return this.liberer(r.id, motif, maintenant);
  }

  libererParPaiement(paiementIntentId, motif, maintenant = this.horloge()) {
    const r = this.table.parPaiement(paiementIntentId);
    if (!r) return { ok: false, raison: 'inconnue' };
    return this.liberer(r.id, motif, maintenant);
  }

  /* Confirmation d'un paiement. Idempotent sur l'id de session Stripe : Stripe
     rejoue ses webhooks, et un rejeu ne doit jamais consommer une deuxième place. */
  confirmer(infos, maintenant = this.horloge()) {
    const { sessionId } = infos;
    let r = sessionId ? this.table.parSession(sessionId) : null;
    if (!r && infos.reservationId) r = this.table.parId(infos.reservationId);

    const garde = (v, prec) => (v != null && v !== '' ? v : (r ? r[prec] : null));
    const champs = {
      etat: ETATS.PAYEE,
      sessionId: garde(sessionId, 'sessionId'),
      paiementIntentId: garde(infos.paiementIntentId, 'paiementIntentId'),
      nom: garde(infos.nom, 'nom'),
      email: garde(infos.email, 'email'),
      telephone: garde(infos.telephone, 'telephone'),
      montant: garde(infos.montant, 'montant'),
      expireA: null,
      majA: maintenant,
    };

    if (r) {
      if (r.etat === ETATS.PAYEE) return { ok: true, deja: true, reservationId: r.id, chambre: r.chambre };
      /* Tenue expirée dont le paiement arrive quand même : l'argent est encaissé,
         la place est due. On la repasse en payée et on laisse le surbooking
         éventuel remonter en alerte. On ne rembourse jamais tout seul. */
      const reprise = r.etat === ETATS.LIBEREE;
      this.table.maj(r.id, champs);
      return { ok: true, reservationId: r.id, chambre: r.chambre, reprise };
    }

    /* Aucune réservation connue : vente hors site (lien de paiement fait à la
       main) ou webhook plus rapide que notre écriture. La place est due, on
       l'inscrit même si elle fait dépasser le quota : compter en trop fait perdre
       une vente, compter en moins en vend une qui n'existe pas. */
    if (!chambreDe(this.sejour.id, infos.chambre)) return { ok: false, raison: 'chambre' };
    const id = this.table.identifiant();
    this.table.inserer({
      id, chambre: infos.chambre, ...champs,
      note: null, motif: null,
      origine: infos.origine || 'hors-site',
      creeA: maintenant,
    });
    return { ok: true, reservationId: id, chambre: infos.chambre, horsSite: true };
  }

  /* Marque une réservation pour traitement humain SANS jamais la libérer. */
  marquer(cle, note, maintenant = this.horloge()) {
    const r = this.table.parId(cle) || this.table.parSession(cle) || this.table.parPaiement(cle);
    if (!r) return { ok: false, raison: 'inconnue' };
    this.table.maj(r.id, { note, majA: maintenant });
    return { ok: true, reservationId: r.id };
  }

  /* Dépassement constaté : sert d'alarme, jamais de règle de vente. */
  surbooking(maintenant = this.horloge()) {
    const e = this.etat(maintenant);
    const alertes = [];
    if (e.vendues + e.tenues > e.capaciteGlobale) {
      alertes.push({ portee: 'global', occupees: e.vendues + e.tenues, plafond: e.capaciteGlobale });
    }
    for (const c of e.chambres) {
      if (c.vendues + c.tenues > c.quota) alertes.push({ portee: c.id, occupees: c.vendues + c.tenues, plafond: c.quota });
    }
    return alertes;
  }

  liste() { return this.table.toutes(); }
}

/* Adaptateur de stockage en mémoire. Sert aux tests et à rien d'autre : même
   surface exactement que l'adaptateur SQLite du Durable Object. */
export function tableMemoire() {
  const lignes = new Map();
  let n = 0;
  const trouve = (champ, v) => {
    if (!v) return null;
    for (const r of lignes.values()) if (r[champ] === v) return { ...r };
    return null;
  };
  return {
    identifiant: () => `res_test_${++n}`,
    toutes: () => [...lignes.values()].map((r) => ({ ...r })),
    parId: (id) => (id && lignes.has(id) ? { ...lignes.get(id) } : null),
    parSession: (s) => trouve('sessionId', s),
    parPaiement: (p) => trouve('paiementIntentId', p),
    inserer: (r) => { lignes.set(r.id, { ...r }); },
    maj: (id, patch) => { const r = lignes.get(id); if (r) lignes.set(id, { ...r, ...patch }); },
  };
}

/* ---------- Client du Durable Object, côté Pages Functions ---------- */

/* Un objet par séjour : c'est l'exécution mono-thread par objet qui rend le
   décompte atomique. Lève si le binding manque, pour qu'une mauvaise config se
   voie tout de suite au lieu de vendre à l'aveugle. */
export function stock(env, sejourId) {
  const ns = env.STOCK_SEJOURS;
  if (!ns) throw new Error('binding STOCK_SEJOURS absent');
  const stub = ns.getByName ? ns.getByName(sejourId) : ns.get(ns.idFromName(sejourId));
  return {
    etat: () => stub.etat(sejourId),
    prendre: (a) => stub.prendre(sejourId, a),
    attacherSession: (id, s) => stub.attacherSession(sejourId, id, s),
    liberer: (id, motif) => stub.liberer(sejourId, id, motif),
    libererParSession: (s, motif) => stub.libererParSession(sejourId, s, motif),
    libererParPaiement: (p, motif) => stub.libererParPaiement(sejourId, p, motif),
    confirmer: (i) => stub.confirmer(sejourId, i),
    marquer: (cle, note) => stub.marquer(sejourId, cle, note),
    evenementNouveau: (eventId) => stub.evenementNouveau(sejourId, eventId),
    liste: () => stub.liste(sejourId),
    reconcilier: () => stub.reconcilier(sejourId),
  };
}

/* ---------- Lectures Stripe, réservées à la réconciliation ---------- */
/* Rien de tout cela n'est appelé dans le chemin de vente : le balayage borné qui
   a fini par mentir sur la conférence ne doit jamais décider d'une vente. */

async function stripe(key, chemin, params) {
  const q = new URLSearchParams(params || {});
  const url = `https://api.stripe.com/v1/${chemin}${q.toString() ? `?${q}` : ''}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
  if (!r.ok) throw new Error(`stripe ${chemin} ${r.status}`);
  return r.json();
}

/* Toutes les sessions payées portant l'un de nos prix, depuis DEPUIS.
   Lève si la liste n'est pas parcourue jusqu'au bout : un inventaire partiel ne
   doit jamais servir de base à une correction. */
export async function ventesStripe(key) {
  const trouvees = [];
  let apres = null;
  for (let page = 0; page < 20; page++) {
    const p = { limit: '100', status: 'complete', 'created[gte]': String(DEPUIS), 'expand[]': 'data.line_items' };
    if (apres) p.starting_after = apres;
    const d = await stripe(key, 'checkout/sessions', p);
    const lot = d.data || [];
    for (const s of lot) {
      if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') continue;
      const items = (s.line_items && s.line_items.data) || [];
      for (const it of items) {
        const place = PRIX.get(it.price && it.price.id);
        if (!place) continue;
        const cd = s.customer_details || {};
        trouvees.push({
          sessionId: s.id, sejour: place.sejour, chambre: place.chambre,
          quantite: it.quantity || 1,
          paiementIntentId: typeof s.payment_intent === 'string' ? s.payment_intent : null,
          nom: cd.name || null, email: (cd.email || '').toLowerCase() || null, telephone: cd.phone || null,
          montant: s.amount_total != null ? s.amount_total : null,
          reservationId: (s.metadata && s.metadata.reservationId) || null,
        });
      }
    }
    if (!d.has_more || !lot.length) return trouvees;
    apres = lot[lot.length - 1].id;
  }
  throw new Error('inventaire incomplet'); // 2000 sessions sans fin de liste
}

/* Verdict de Stripe sur UNE place que nous comptons comme vendue.
   Stripe est l'arbitre : s'il dit remboursé, la place repart au stock ; s'il ne
   dit rien de clair, on ne touche à rien. */
export async function verdictStripe(key, sessionId) {
  let s;
  try {
    s = await stripe(key, `checkout/sessions/${sessionId}`, { 'expand[]': 'payment_intent.latest_charge' });
  } catch (e) {
    return { verdict: 'indetermine', detail: e.message };
  }
  if (s.status === 'expired') return { verdict: 'liberer', motif: 'session-expiree' };
  if (s.payment_status !== 'paid' && s.payment_status !== 'no_payment_required') {
    return { verdict: 'indetermine', detail: `payment_status=${s.payment_status}` };
  }
  const pi = s.payment_intent && typeof s.payment_intent === 'object' ? s.payment_intent : null;
  const ch = pi && pi.latest_charge && typeof pi.latest_charge === 'object' ? pi.latest_charge : null;
  if (ch) {
    if (ch.refunded === true) return { verdict: 'liberer', motif: 'rembourse' };
    if (ch.amount_refunded > 0) return { verdict: 'marquer', note: 'remboursement-partiel' };
    if (ch.disputed === true) return { verdict: 'liberer', motif: 'litige' };
  }
  return { verdict: 'payee' };
}

/* Remonte d'un PaymentIntent à la session Checkout. Sert au webhook de
   remboursement : l'événement `charge.refunded` ne porte pas l'id de session. */
export async function sessionDuPaiement(key, paiementIntentId) {
  const d = await stripe(key, 'checkout/sessions', { payment_intent: paiementIntentId, limit: '1' });
  const s = (d.data || [])[0];
  return s ? { sessionId: s.id, sejour: (s.metadata && s.metadata.sejour) || null, reservationId: (s.metadata && s.metadata.reservationId) || null } : null;
}

/* Retrouve la place vendue par une session dont on ne connaît pas les métadonnées.
   Cas réel : l'équipe envoie à la main un lien de paiement Stripe pointant l'un
   de nos prix. La session ne porte alors ni `sejour` ni `reservationId`, mais
   elle porte le PRIX, et c'est le prix qui fait foi. */
export async function placeDeSession(key, sessionId) {
  const d = await stripe(key, `checkout/sessions/${sessionId}`, { 'expand[]': 'line_items' });
  for (const it of ((d.line_items && d.line_items.data) || [])) {
    const place = PRIX.get(it.price && it.price.id);
    if (place) return place;
  }
  return null;
}

/* Adaptateur de stockage SQLite, SYNCHRONE. C'est le point clé de l'atomicité :
   `sql.exec()` rend la main immédiatement, donc le moteur compte puis écrit sans
   le moindre await entre les deux. La ligne complète est rangée en JSON ; les
   seules colonnes séparées sont celles sur lesquelles on cherche.
   `sql` est `ctx.storage.sql` du Durable Object, ou n'importe quel objet qui
   expose `exec(requete, ...valeurs).toArray()` (les tests lui donnent SQLite). */
export const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS reservations (
     id TEXT PRIMARY KEY,
     session_id TEXT,
     paiement_intent_id TEXT,
     chambre TEXT NOT NULL,
     etat TEXT NOT NULL,
     expire_a INTEGER,
     donnees TEXT NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS idx_session ON reservations (session_id)',
  'CREATE INDEX IF NOT EXISTS idx_paiement ON reservations (paiement_intent_id)',
  /* Journal des événements Stripe déjà traités : Stripe rejoue ses webhooks. */
  'CREATE TABLE IF NOT EXISTS evenements (id TEXT PRIMARY KEY, vu_a INTEGER NOT NULL)',
];

export function tableSql(sql, identifiant = () => crypto.randomUUID()) {
  const lire = (r) => JSON.parse(r.donnees);
  const un = (requete, valeur) => {
    if (!valeur) return null;
    const r = sql.exec(requete, valeur).toArray();
    return r.length ? lire(r[0]) : null;
  };
  return {
    identifiant,
    toutes: () => sql.exec('SELECT donnees FROM reservations').toArray().map(lire),
    parId: (id) => un('SELECT donnees FROM reservations WHERE id = ?', id),
    parSession: (s) => un('SELECT donnees FROM reservations WHERE session_id = ?', s),
    parPaiement: (p) => un('SELECT donnees FROM reservations WHERE paiement_intent_id = ?', p),
    inserer: (r) => {
      sql.exec(
        'INSERT INTO reservations (id, session_id, paiement_intent_id, chambre, etat, expire_a, donnees) VALUES (?, ?, ?, ?, ?, ?, ?)',
        r.id, r.sessionId, r.paiementIntentId, r.chambre, r.etat, r.expireA, JSON.stringify(r),
      );
    },
    maj: (id, patch) => {
      const actuelle = sql.exec('SELECT donnees FROM reservations WHERE id = ?', id).toArray();
      if (!actuelle.length) return;
      const r = { ...lire(actuelle[0]), ...patch };
      sql.exec(
        'UPDATE reservations SET session_id = ?, paiement_intent_id = ?, etat = ?, expire_a = ?, donnees = ? WHERE id = ?',
        r.sessionId, r.paiementIntentId, r.etat, r.expireA, JSON.stringify(r), id,
      );
    },
  };
}
