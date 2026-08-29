/* Moteur de stock des séjours. Une place vendue en trop est un échec grave, une
   vente perdue par prudence est acceptable : tout ce fichier est écrit dans ce sens.

   Le compteur ne se déduit PAS d'un balayage Stripe en direct (la liste des
   sessions est éventuellement cohérente, une place remboursée y reste « paid »
   à vie, et un balayage borné finit par mentir). Le compteur est tenu par un
   Durable Object, un objet par séjour : Cloudflare garantit une exécution
   mono-thread par objet, donc la prise de place est atomique sans verrou
   applicatif. Stripe reste l'arbitre final via la réconciliation.

   Ce fichier ne contient QUE de la configuration et de la logique pure : il est
   importé à la fois par les Pages Functions et par le worker qui héberge le
   Durable Object, et il tourne tel quel sous Node pour les tests. */

/* Durée de la tenue de place. C'est NOTRE minuteur, pas celui de Stripe : la
   session Stripe expire à 30 min (minimum imposé par Stripe) mais la place est
   rendue au stock à 15 min. La fenêtre entre les deux est une marge où le stock
   est plus prudent que Stripe, jamais l'inverse. */
export const TENUE_MS = 15 * 60 * 1000;

/* Expiration posée sur la session Stripe. Stripe n'accepte qu'entre 30 min et
   24 h : 30 min est le plancher. */
export const EXPIRATION_STRIPE_S = 30 * 60;

/* Quantité toujours forcée à 1 : une place = un billet = une personne. Deux
   inconnues peuvent partager une chambre duo, on ne vend jamais « la chambre ». */
export const QUANTITE = 1;

export const SEJOURS = {
  manoir: {
    id: 'manoir',
    nom: "Revenir à l'essentiel",
    lieu: 'Manoir Ducey',
    dates: '21-25 octobre 2026',
    capaciteGlobale: 12,
    chambres: [
      { id: 'partagee-5', libelle: 'Chambre partagée à 5', detail: 'lit simple · sdb partagée', prix: 119000, quota: 5,
        tarifs: { integral: 'price_1U9mzhBzUtKi0psWW7T4wfWh', '2x': 'price_1U9mziBzUtKi0psWr5pcrBt9' } },
      { id: 'duo-simple', libelle: 'Chambre duo', detail: 'lit simple · sdb partagée', prix: 119000, quota: 2,
        tarifs: { integral: 'price_1U9mzjBzUtKi0psWnIccytyO', '2x': 'price_1U9mzjBzUtKi0psWXtZuqEeX' } },
      { id: 'duo-double', libelle: 'Chambre duo', detail: 'lit double · sdb partagée', prix: 123000, quota: 2,
        tarifs: { integral: 'price_1U9mzlBzUtKi0psWIR2bPhdp', '2x': 'price_1U9mzlBzUtKi0psWkityXoOA' } },
      { id: 'solo', libelle: 'Chambre solo', detail: 'lit double · sdb partagée', prix: 128900, quota: 3,
        tarifs: { integral: 'price_1U9mzmBzUtKi0psW4BzBdxgF', '2x': 'price_1U9mzmBzUtKi0psW89eY08zg' } },
    ],
    /* fermeture = dernier instant d'ouverture à la vente, en heure de Paris.
       Le 2x ferme le 17/10 : après cette date la deuxième échéance tomberait
       après le séjour. L'intégral ferme au premier jour du séjour. */
    plans: {
      integral: { echeances: 1, fermetureParis: '2026-10-21T00:00:00' },
      '2x': { echeances: 2, fermetureParis: '2026-10-17T23:59:59' },
    },
  },

  plessis: {
    id: 'plessis',
    nom: "Le jour d'après",
    lieu: 'Le Plessis-Placy',
    dates: '18-22 novembre 2026',
    /* Double plafond volontaire : la somme des quotas fait 16, la maison n'en
       accueille que 14. Les deux plafonds sont testés à chaque prise de place. */
    capaciteGlobale: 14,
    chambres: [
      { id: 'partagee-3-6', libelle: 'Chambre partagée de 3 à 6', detail: 'lit simple · sdb partagée', prix: 119000, quota: 12,
        tarifs: { integral: 'price_1U9mzoBzUtKi0psWhZosMDFc', '3x': 'price_1U9mzoBzUtKi0psW3q3AyNlH' } },
      { id: 'duo-simple', libelle: 'Chambre duo', detail: 'lit simple · sdb partagée', prix: 123000, quota: 2,
        tarifs: { integral: 'price_1U9mzpBzUtKi0psWeBwkjACg', '3x': 'price_1U9mzqBzUtKi0psWp1VBJevv' } },
      { id: 'solo', libelle: 'Chambre solo', detail: 'lit double · sdb privée', prix: 128900, quota: 2,
        tarifs: { integral: 'price_1U9mzrBzUtKi0psWIPyUsxTU', '3x': 'price_1U9mzrBzUtKi0psWUhcuV6Mi' } },
    ],
    /* Le 3x ferme le 10/09 pour que la troisième échéance tombe début novembre,
       avant le séjour. Valeur à rouvrir ou à décaler ici, nulle part ailleurs. */
    plans: {
      integral: { echeances: 1, fermetureParis: '2026-11-18T00:00:00' },
      '3x': { echeances: 3, fermetureParis: '2026-09-10T23:59:59' },
    },
  },
};

/* Index prix Stripe → place. C'est par le PRIX qu'on rattache une vente, jamais
   par l'id d'un lien de paiement : un lien créé à la main par l'équipe pointe le
   même prix et doit être compté comme une place vendue. */
export const PRIX = (() => {
  const m = new Map();
  for (const s of Object.values(SEJOURS)) {
    for (const c of s.chambres) {
      for (const [plan, price] of Object.entries(c.tarifs)) {
        m.set(price, { sejour: s.id, chambre: c.id, plan, echeances: s.plans[plan].echeances });
      }
    }
  }
  return m;
})();

export const estSejour = (id) => Object.prototype.hasOwnProperty.call(SEJOURS, id);
export const chambreDe = (sejour, id) => SEJOURS[sejour].chambres.find((c) => c.id === id) || null;

/* Décalage UTC de l'Europe/Paris à un instant donné, en ms. Passe par Intl :
   pas de table d'heure d'été à maintenir, et l'heure de Paris change deux fois
   par an pile pendant la fenêtre de vente. */
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
   Deux passes suffisent à converger, même à cheval sur un changement d'heure.
   Les dates limites du paiement fractionné sont des dates françaises : les lire
   en UTC ferait fermer le 2x deux heures trop tard. */
export function instantParis(iso) {
  const [d, t = '00:00:00'] = String(iso).split('T');
  const [Y, M, D] = d.split('-').map(Number);
  const [h, mi, s] = t.split(':').map(Number);
  const naif = Date.UTC(Y, M - 1, D, h || 0, mi || 0, s || 0);
  let x = naif;
  for (let i = 0; i < 2; i++) x = naif - decalageParis(x);
  return x;
}

/* Un plan de paiement est ouvert tant qu'on est avant sa fermeture (heure de Paris). */
export function planOuvert(sejourId, plan, maintenant = Date.now()) {
  const s = SEJOURS[sejourId];
  if (!s) return false;
  const p = s.plans[plan];
  if (!p) return false;
  return maintenant <= instantParis(p.fermetureParis);
}

export function plansOuverts(sejourId, maintenant = Date.now()) {
  return Object.keys(SEJOURS[sejourId].plans).filter((p) => planOuvert(sejourId, p, maintenant));
}

const ETATS = { TENUE: 'tenue', PAYEE: 'payee', LIBEREE: 'liberee' };
export { ETATS };

/* Le moteur. Toutes ses méthodes sont SYNCHRONES, sans le moindre await entre la
   lecture du stock et l'écriture de la réservation : la section critique ne peut
   donc pas être entrecoupée, ni par le tourniquet d'événements JS, ni par le
   Durable Object qui n'exécute de toute façon qu'une requête à la fois.
   `table` est un adaptateur de stockage synchrone (SQLite du Durable Object en
   production, objet en mémoire dans les tests) : le code testé est le code servi. */
export class MoteurStock {
  constructor(sejourId, table, horloge = Date.now) {
    const s = SEJOURS[sejourId];
    if (!s) throw new Error(`sejour inconnu: ${sejourId}`);
    this.sejour = s;
    this.table = table;
    this.horloge = horloge;
  }

  /* Une tenue périmée ne compte plus. On ne « purge » pas en base : on ignore
     les tenues expirées au comptage et on les bascule en `liberee` au passage,
     de sorte qu'un compteur juste ne dépende jamais d'un minuteur qui tourne. */
  #occupe(r, maintenant) {
    if (r.etat === ETATS.PAYEE) return true;
    return r.etat === ETATS.TENUE && r.expireA > maintenant;
  }

  #perimer(maintenant) {
    for (const r of this.table.toutes()) {
      if (r.etat === ETATS.TENUE && r.expireA <= maintenant) {
        this.table.maj(r.id, { etat: ETATS.LIBEREE, motif: 'tenue-expiree', majA: maintenant });
      }
    }
  }

  compte(maintenant = this.horloge()) {
    this.#perimer(maintenant);
    const lignes = this.table.toutes();
    const parChambre = new Map();
    let vendues = 0;
    let tenues = 0;
    for (const c of this.sejour.chambres) parChambre.set(c.id, { vendues: 0, tenues: 0 });
    for (const r of lignes) {
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
      /* Le restant affiché est le plus petit des deux plafonds : au Plessis la
         somme des quotas dépasse la capacité de la maison, une chambre peut donc
         être « complète » alors que son quota n'est pas atteint. */
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

  /* Prise de place. Renvoie { ok:false, raison:'complet' } plutôt que de lever :
     l'appelant doit répondre 409, pas 500. */
  prendre({ chambre, paiement }, maintenant = this.horloge()) {
    const c = chambreDe(this.sejour.id, chambre);
    if (!c) return { ok: false, raison: 'chambre' };
    if (!this.sejour.plans[paiement]) return { ok: false, raison: 'paiement' };
    if (!planOuvert(this.sejour.id, paiement, maintenant)) return { ok: false, raison: 'plan-ferme' };

    const { vendues, tenues, parChambre } = this.compte(maintenant);
    if (vendues + tenues >= this.sejour.capaciteGlobale) return { ok: false, raison: 'complet', plafond: 'global' };
    const n = parChambre.get(chambre);
    if (n.vendues + n.tenues >= c.quota) return { ok: false, raison: 'complet', plafond: 'chambre' };

    const id = this.table.identifiant();
    const ligne = {
      id, chambre, paiement,
      etat: ETATS.TENUE,
      expireA: maintenant + TENUE_MS,
      sessionId: null, abonnementId: null,
      nom: null, email: null, telephone: null,
      montant: null, note: null, motif: null,
      origine: 'site',
      creeA: maintenant, majA: maintenant,
    };
    this.table.inserer(ligne);
    return { ok: true, reservationId: id, expireA: ligne.expireA };
  }

  /* La session Stripe est rattachée APRÈS coup : la place est prise avant même
     d'appeler Stripe, pour qu'une lenteur de Stripe ne puisse pas vendre deux fois. */
  attacherSession(reservationId, sessionId, maintenant = this.horloge()) {
    const r = this.table.parId(reservationId);
    if (!r) return { ok: false, raison: 'inconnue' };
    this.table.maj(r.id, { sessionId, majA: maintenant });
    return { ok: true };
  }

  liberer(reservationId, motif, maintenant = this.horloge()) {
    const r = this.table.parId(reservationId);
    if (!r) return { ok: false, raison: 'inconnue' };
    /* Une place payée ne se libère que sur remboursement ou litige, jamais sur
       expiration : on ne veut pas qu'un minuteur rende une place déjà encaissée. */
    if (r.etat === ETATS.PAYEE && !['rembourse', 'litige', 'annule-main'].includes(motif)) {
      return { ok: false, raison: 'payee' };
    }
    if (r.etat === ETATS.LIBEREE) return { ok: true, deja: true };
    this.table.maj(r.id, { etat: ETATS.LIBEREE, motif, majA: maintenant });
    return { ok: true };
  }

  libererParSession(sessionId, motif, maintenant = this.horloge()) {
    const r = this.table.parSession(sessionId);
    if (!r) return { ok: false, raison: 'inconnue' };
    return this.liberer(r.id, motif, maintenant);
  }

  /* Confirmation d'un paiement. Idempotent sur l'id de session Stripe : Stripe
     rejoue ses webhooks, et un rejeu ne doit pas créer une deuxième place. */
  confirmer(infos, maintenant = this.horloge()) {
    const { sessionId } = infos;
    let r = sessionId ? this.table.parSession(sessionId) : null;
    if (!r && infos.reservationId) r = this.table.parId(infos.reservationId);

    const champs = {
      etat: ETATS.PAYEE,
      sessionId: sessionId || (r && r.sessionId) || null,
      abonnementId: infos.abonnementId || (r && r.abonnementId) || null,
      nom: infos.nom || (r && r.nom) || null,
      email: infos.email || (r && r.email) || null,
      telephone: infos.telephone || (r && r.telephone) || null,
      montant: infos.montant != null ? infos.montant : (r && r.montant) || null,
      expireA: null,
      majA: maintenant,
    };

    if (r) {
      if (r.etat === ETATS.PAYEE) return { ok: true, deja: true, reservationId: r.id };
      /* Une tenue expirée dont le paiement arrive quand même : l'argent est
         encaissé, la place est due. On la repasse en payée et on signale le
         surbooking éventuel plus bas, on ne rembourse jamais tout seul. */
      this.table.maj(r.id, champs);
      return { ok: true, reservationId: r.id, reprise: r.etat === ETATS.LIBEREE };
    }

    /* Aucune réservation : vente hors site (lien de paiement fait à la main) ou
       webhook arrivé avant l'écriture. La place est due, on l'inscrit. */
    const id = this.table.identifiant();
    this.table.inserer({
      id, chambre: infos.chambre, paiement: infos.paiement || 'integral',
      ...champs,
      note: null, motif: null,
      origine: infos.origine || 'hors-site',
      creeA: maintenant,
    });
    return { ok: true, reservationId: id, horsSite: true };
  }

  /* Marque une réservation pour traitement manuel sans jamais la libérer :
     une échéance impayée n'ouvre pas la place à quelqu'un d'autre, elle appelle
     un humain. */
  marquer(cle, note, maintenant = this.horloge()) {
    const r = this.table.parId(cle) || this.table.parSession(cle);
    if (!r) return { ok: false, raison: 'inconnue' };
    this.table.maj(r.id, { note, majA: maintenant });
    return { ok: true, reservationId: r.id };
  }

  /* Vrai si le stock a été dépassé : sert d'alarme, jamais de règle de vente. */
  surbooking(maintenant = this.horloge()) {
    const e = this.etat(maintenant);
    const alertes = [];
    if (e.vendues + e.tenues > e.capaciteGlobale) {
      alertes.push({ portee: 'global', occupees: e.vendues + e.tenues, plafond: e.capaciteGlobale });
    }
    for (const c of e.chambres) {
      if (c.vendues + c.tenues > c.quota) {
        alertes.push({ portee: c.id, occupees: c.vendues + c.tenues, plafond: c.quota });
      }
    }
    return alertes;
  }

  liste() { return this.table.toutes(); }
}

/* Adaptateur de stockage en mémoire. Sert aux tests et à rien d'autre : il a
   exactement la même surface que l'adaptateur SQLite du Durable Object. */
export function tableMemoire() {
  const lignes = new Map();
  let n = 0;
  return {
    identifiant: () => `res_test_${++n}`,
    toutes: () => [...lignes.values()].map((r) => ({ ...r })),
    parId: (id) => (lignes.has(id) ? { ...lignes.get(id) } : null),
    parSession: (s) => {
      if (!s) return null;
      for (const r of lignes.values()) if (r.sessionId === s) return { ...r };
      return null;
    },
    inserer: (r) => { lignes.set(r.id, { ...r }); },
    maj: (id, patch) => { const r = lignes.get(id); if (r) lignes.set(id, { ...r, ...patch }); },
  };
}
