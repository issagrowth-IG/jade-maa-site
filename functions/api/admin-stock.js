/* Back-office des places des séjours : l'API que consomme admin.html.

   GET  /api/admin-stock?sejour=manoir
        → même structure que /api/sejour-places, plus la liste des inscrites :
          { sejour, titre, lieu, dates, capaciteGlobale, vendues, tenues,
            restantesGlobal, complet,
            chambres:[{ id, libelle, detail, prix, quota, vendues, tenues, restantes, complet }],
            reservations:[{ id, chambre, etat, email, nom, telephone,
                            montant, paiement, cree, note, motif }] }

   POST /api/admin-stock  { action, sejour, ... }
        action "bloquer" : { chambre, quantite, motif }   retire des places de la vente
        action "liberer" : { reservationId } ou { chambre, quantite }
        action "note"    : { reservationId, note }
        → 200 { ok:true, etat:{...} }   409 { error:"quota" }   400 { error:"requete" }

   Accès réservé à une session ouverte par /api/admin-login (cookie signé).
   La page expose des données personnelles de clientes : rien ici ne sort sans
   session valide, et rien de nominatif ne part dans les journaux. */

import { verifieSession, origineEtrangere } from './admin-login.js';
import { SEJOURS, ETATS, stock } from './_stock.js';

/* ════════════════════════════════════════════════════════════════════════════
   ADAPTATEUR DE STOCKAGE

   Tout accès au stock passe par lisEtat() et ecrisMouvement(), et par RIEN
   D'AUTRE dans ce fichier.

   Deux chemins :
     - le moteur réel (_stock.js) dès que le binding Durable Object
       STOCK_SEJOURS est présent, c'est-à-dire en production ;
     - un jeu de démonstration en mémoire sinon, pour pouvoir ouvrir et tester
       la page sans binding. Il n'écrit rien de durable et se remet à zéro à
       chaque redémarrage de l'isolate.

   Rien à brancher : la bascule est automatique. Pour supprimer la
   démonstration le jour où elle n'a plus d'utilité, il suffit d'effacer le bloc
   « JEU DE DÉMONSTRATION » et les deux appels demoLis / demoEcris.

   Ce que ce fichier attend de _stock.js, et donc ce qu'il faut prévenir avant
   de le changer :
     SEJOURS, ETATS                    le catalogue et les trois états
     stock(env, id).etat()             les compteurs
     stock(env, id).liste()            les lignes brutes
     stock(env, id).confirmer(infos)   pose une place définitive (voir plus bas)
     stock(env, id).liberer(id, motif) rend une place au stock
     stock(env, id).marquer(id, note)  écrit une note sans toucher à la place
   ═══════════════════════════════════════════════════════════════════════════ */

const moteurDisponible = (env) => !!(env && env.STOCK_SEJOURS);

/* Une place retirée de la vente est une ligne PAYÉE d'origine « blocage » :
   le moteur n'a pas d'état « bloquée », et il ne doit pas en avoir un pour si
   peu. Montant nul, aucune coordonnée, elle occupe une place et rien d'autre.
   C'est ce marqueur qui la distingue d'une vraie vente partout ailleurs. */
const ORIGINE_BLOCAGE = 'blocage';
const MOTIF_LIBERATION = 'annule-main'; // le seul motif qui rend une place payée

async function lisEtat(env, sejourId) {
  if (!moteurDisponible(env)) return demoLis(sejourId);
  const s = stock(env, sejourId);
  const [etat, lignes] = await Promise.all([s.etat(), s.liste()]);
  return habille(sejourId, etat, lignes || []);
}

async function ecrisMouvement(env, sejourId, m) {
  if (!moteurDisponible(env)) return demoEcris(sejourId, m);
  const s = stock(env, sejourId);

  if (m.action === 'bloquer') {
    /* Attention : confirmer() inscrit la place MÊME au delà du quota, par choix
       (une vente encaissée est due). C'est donc la garde de quota de
       onRequestPost qui protège ici, et elle seule. Ne pas la retirer. */
    for (let i = 0; i < m.quantite; i++) {
      const r = await s.confirmer({ chambre: m.chambre, montant: 0, origine: ORIGINE_BLOCAGE });
      if (!r || !r.ok) return { erreur: 'quota' };
      await s.marquer(r.reservationId, m.motif);
    }
    return { ok: true, etat: await lisEtat(env, sejourId) };
  }

  if (m.action === 'liberer') {
    if (m.reservationId) {
      const r = await s.liberer(m.reservationId, MOTIF_LIBERATION);
      if (!r || !r.ok) return { erreur: r && r.raison === 'inconnue' ? 'introuvable' : 'quota' };
      return { ok: true, etat: await lisEtat(env, sejourId) };
    }
    // Libération en masse : uniquement des places bloquées, les plus récentes.
    const etat = await lisEtat(env, sejourId);
    const cibles = etat.reservations
      .filter((r) => r.chambre === m.chambre && r.etat === 'bloquee')
      .slice(-m.quantite);
    if (cibles.length < m.quantite) return { erreur: 'quota', detail: 'rien-a-liberer' };
    for (const c of cibles) {
      const r = await s.liberer(c.id, MOTIF_LIBERATION);
      if (!r || !r.ok) return { erreur: 'quota' };
    }
    return { ok: true, etat: await lisEtat(env, sejourId) };
  }

  if (m.action === 'note') {
    const r = await s.marquer(m.reservationId, m.note);
    if (!r || !r.ok) return { erreur: 'introuvable' };
    return { ok: true, etat: await lisEtat(env, sejourId) };
  }

  return { erreur: 'requete' };
}

/* ---- Traduction moteur → écran ------------------------------------------
   Le moteur connaît trois états. L'écran en montre cinq, parce que Sharon a
   besoin de distinguer une inscrite d'une place retirée de la vente, et une
   annulation d'un panier abandonné. */

function etatLisible(r, maintenant) {
  const blocage = r.origine === ORIGINE_BLOCAGE;
  if (r.etat === ETATS.PAYEE) return blocage ? 'bloquee' : 'payee';
  if (r.etat === ETATS.TENUE) return r.expireA > maintenant ? 'en-cours' : 'liberee';
  // ETATS.LIBEREE : une tenue expirée n'est pas une annulation.
  if (blocage || r.motif === 'tenue-expiree') return 'liberee';
  return 'annulee';
}

function versReservation(r, maintenant) {
  var etat = etatLisible(r, maintenant);
  var blocage = r.origine === ORIGINE_BLOCAGE;
  return {
    id: r.id,
    chambre: r.chambre,
    etat: etat,
    nom: r.nom || '',
    email: r.email || '',
    telephone: r.telephone || '',
    montant: r.montant || 0,
    /* Le moteur ne vend qu'au comptant : le champ paiement n'existe pas encore
       côté stock. S'il apparaît un jour (2x, 3x), il est repris tel quel. */
    paiement: r.paiement || (blocage || !r.montant ? 'hors-ligne' : 'integral'),
    cree: new Date(r.creeA || Date.now()).toISOString(),
    note: blocage ? '' : (r.note || ''),
    // Le moteur n'écrit pas de motif à l'insertion : celui d'un blocage est rangé
    // dans la note, et remonte ici comme motif pour ne pas être écrasé par l'écran.
    motif: blocage ? (r.note || r.motif || '') : '',
  };
}

function habille(sejourId, etat, lignes) {
  const cfg = SEJOURS[sejourId];
  const maintenant = Date.now();
  return Object.assign({}, etat, {
    sejour: sejourId,
    titre: cfg.nom,
    lieu: cfg.lieu,
    dates: cfg.dates,
    reservations: lignes.map((r) => versReservation(r, maintenant)),
  });
}

/* ════════════════════ JEU DE DÉMONSTRATION ════════════════════════════════
   Actif uniquement sans binding STOCK_SEJOURS. Les lignes ont exactement la
   forme de celles du moteur, et passent par la même traduction : ce qui est
   testé ici est ce qui tournera en production. */

const ligneDemo = (o) => Object.assign({
  etat: ETATS.PAYEE, expireA: null, sessionId: null, paiementIntentId: null,
  nom: null, email: null, telephone: null, montant: null, note: null, motif: null,
  origine: 'site', majA: Date.now(),
}, o);

const NOMS_PLESSIS = ['Camille Ostier', 'Julie Ferrand', 'Marion Lebrun', 'Sarah Nguyen', 'Inès Chevalier',
  'Laura Petit', 'Chloé Barbier', 'Manon Guérin', 'Alice Roy', 'Nour Benali'];

const demoBase = {
  manoir: [
    ligneDemo({ id: 'r-m-01', chambre: 'partagee-5', nom: 'Claire Fontaine', email: 'claire.fontaine@example.com', telephone: '+33 6 12 34 56 78', montant: 119000, creeA: Date.parse('2026-08-11T09:24:00Z') }),
    ligneDemo({ id: 'r-m-02', chambre: 'partagee-5', nom: 'Naïma Berger', email: 'naima.berger@example.com', telephone: '+33 6 22 41 08 90', montant: 119000, creeA: Date.parse('2026-08-13T16:02:00Z'), note: 'Végétarienne, prévenue la cuisine.' }),
    ligneDemo({ id: 'r-m-03', chambre: 'partagee-5', nom: 'Sophie Marchand', email: 'sophie.marchand@example.com', telephone: '+33 7 55 12 33 41', montant: 119000, creeA: Date.parse('2026-08-18T11:47:00Z') }),
    ligneDemo({ id: 'r-m-04', chambre: 'partagee-5', etat: ETATS.TENUE, expireA: Date.now() + 9e5, nom: 'Élodie Rousseau', email: 'elodie.rousseau@example.com', telephone: '+33 6 71 90 22 15', montant: 119000, creeA: Date.now() - 3e5 }),
    ligneDemo({ id: 'r-m-05', chambre: 'duo-simple', nom: 'Léa Vidal', email: 'lea.vidal@example.com', telephone: '+33 6 08 77 45 20', montant: 119000, creeA: Date.parse('2026-08-15T08:12:00Z'), note: 'Vient avec sa sœur, à mettre dans la même chambre.' }),
    ligneDemo({ id: 'r-m-06', chambre: 'solo', nom: 'Anne Deschamps', email: 'anne.deschamps@example.com', telephone: '+33 6 44 19 63 87', montant: 128900, creeA: Date.parse('2026-08-20T14:05:00Z') }),
  ],
  /* Le Plessis part volontairement plein au global (14/14) alors qu'il reste
     2 lits en chambre partagée : c'est la situation que l'écran doit rendre
     lisible d'un coup d'œil. */
  plessis: [].concat(
    NOMS_PLESSIS.map((nom, i) => ligneDemo({
      id: 'r-p-' + String(i + 1).padStart(2, '0'),
      chambre: 'partagee-3-6', nom: nom,
      email: nom.toLowerCase().normalize('NFD').replace(/[^a-z ]/g, '').replace(/ /g, '.') + '@example.com',
      telephone: '+33 6 ' + (10 + i) + ' ' + (20 + i) + ' ' + (30 + i) + ' ' + (40 + i),
      montant: 119000, creeA: Date.parse('2026-08-0' + ((i % 9) + 1) + 'T10:00:00Z'),
    })),
    [
      ligneDemo({ id: 'r-p-11', chambre: 'duo-simple', nom: 'Hélène Caron', email: 'helene.caron@example.com', telephone: '+33 6 90 12 34 56', montant: 123000, creeA: Date.parse('2026-08-17T09:00:00Z') }),
      ligneDemo({ id: 'r-p-12', chambre: 'duo-simple', nom: 'Fanny Millet', email: 'fanny.millet@example.com', telephone: '+33 6 91 22 34 57', montant: 123000, creeA: Date.parse('2026-08-17T09:40:00Z') }),
      ligneDemo({ id: 'r-p-13', chambre: 'solo', nom: 'Béatrice Aumont', email: 'beatrice.aumont@example.com', telephone: '+33 6 92 32 34 58', montant: 128900, creeA: Date.parse('2026-08-19T15:20:00Z') }),
      ligneDemo({ id: 'r-p-14', chambre: 'solo', montant: 0, origine: ORIGINE_BLOCAGE, note: 'Invitée de Jade, place offerte', creeA: Date.parse('2026-08-21T07:10:00Z') }),
    ]
  ),
};

const demoMemoire = new Map();
let demoCompteur = 0;

function demoLignes(sejourId) {
  if (!demoMemoire.has(sejourId)) demoMemoire.set(sejourId, demoBase[sejourId].map((r) => Object.assign({}, r)));
  return demoMemoire.get(sejourId);
}

/* Reproduit à l'identique le calcul du moteur, y compris le fait que le
   « restantes » d'une chambre est déjà borné par la capacité globale. */
function demoCompte(sejourId, lignes) {
  const cfg = SEJOURS[sejourId];
  const maintenant = Date.now();
  const occupe = (r) => r.etat === ETATS.PAYEE || (r.etat === ETATS.TENUE && r.expireA > maintenant);
  const chambresBrutes = cfg.chambres.map((c) => {
    const miennes = lignes.filter((r) => r.chambre === c.id && occupe(r));
    return {
      c: c,
      vendues: miennes.filter((r) => r.etat === ETATS.PAYEE).length,
      tenues: miennes.filter((r) => r.etat === ETATS.TENUE).length,
    };
  });
  const vendues = chambresBrutes.reduce((n, x) => n + x.vendues, 0);
  const tenues = chambresBrutes.reduce((n, x) => n + x.tenues, 0);
  const restantesGlobal = Math.max(0, cfg.capaciteGlobale - vendues - tenues);
  const chambres = chambresBrutes.map((x) => {
    const surType = Math.max(0, x.c.quota - x.vendues - x.tenues);
    const restantes = Math.min(surType, restantesGlobal);
    return {
      id: x.c.id, libelle: x.c.libelle, detail: x.c.detail, prix: x.c.prix, quota: x.c.quota,
      vendues: x.vendues, tenues: x.tenues, restantes: restantes, complet: restantes <= 0,
    };
  });
  return {
    sejour: sejourId, capaciteGlobale: cfg.capaciteGlobale,
    vendues: vendues, tenues: tenues, restantesGlobal: restantesGlobal,
    complet: restantesGlobal <= 0, chambres: chambres,
  };
}

function demoLis(sejourId) {
  const lignes = demoLignes(sejourId);
  /* Le drapeau « demo » n'est pas cosmétique : sans lui, un binding
     STOCK_SEJOURS mal configuré en production afficherait des inscrites
     inventées avec l'air d'être vraies. L'écran doit pouvoir le crier. */
  return Object.assign(habille(sejourId, demoCompte(sejourId, lignes), lignes), { demo: true });
}

function demoEcris(sejourId, m) {
  const lignes = demoLignes(sejourId);

  if (m.action === 'bloquer') {
    for (let i = 0; i < m.quantite; i++) {
      demoCompteur++;
      lignes.push(ligneDemo({
        id: 'b-' + Date.now().toString(36) + '-' + demoCompteur,
        chambre: m.chambre, montant: 0, origine: ORIGINE_BLOCAGE,
        note: m.motif, creeA: Date.now(),
      }));
    }
    return { ok: true, etat: demoLis(sejourId) };
  }

  if (m.action === 'liberer') {
    if (m.reservationId) {
      const r = lignes.find((x) => x.id === m.reservationId);
      if (!r) return { erreur: 'introuvable' };
      if (r.etat === ETATS.LIBEREE) return { erreur: 'quota', detail: 'deja-libre' };
      r.etat = ETATS.LIBEREE;
      r.motif = MOTIF_LIBERATION;
      return { ok: true, etat: demoLis(sejourId) };
    }
    const bloquees = lignes.filter((x) => x.chambre === m.chambre && x.origine === ORIGINE_BLOCAGE && x.etat === ETATS.PAYEE);
    if (bloquees.length < m.quantite) return { erreur: 'quota', detail: 'rien-a-liberer' };
    bloquees.slice(-m.quantite).forEach((x) => { x.etat = ETATS.LIBEREE; x.motif = MOTIF_LIBERATION; });
    return { ok: true, etat: demoLis(sejourId) };
  }

  if (m.action === 'note') {
    const r = lignes.find((x) => x.id === m.reservationId);
    if (!r) return { erreur: 'introuvable' };
    r.note = m.note;
    return { ok: true, etat: demoLis(sejourId) };
  }

  return { erreur: 'requete' };
}

/* ═════════════════ FIN DU JEU DE DÉMONSTRATION ════════════════════════════ */

/* ---- Entrées : tout est considéré comme hostile -------------------------- */

const json = (b, s = 200) => new Response(JSON.stringify(b), {
  status: s,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

const texte = (v, max) => (typeof v === 'string' ? v : '').trim().slice(0, max);

function sejourValide(v) {
  const s = texte(v, 40);
  return Object.prototype.hasOwnProperty.call(SEJOURS, s) ? s : null;
}

function chambreValide(sejourId, v) {
  const c = texte(v, 40);
  return SEJOURS[sejourId].chambres.some((x) => x.id === c) ? c : null;
}

function quantiteValide(v, max) {
  const n = typeof v === 'number' ? v : Number(texte(v, 8));
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

/* Un identifiant de réservation ne doit jamais être autre chose que des
   caractères simples : ça évite qu'une valeur exotique aille se promener dans
   le moteur de stockage. */
function identifiantValide(v) {
  const s = texte(v, 64);
  return /^[A-Za-z0-9._-]{1,64}$/.test(s) ? s : null;
}

/* ---- Lecture ------------------------------------------------------------ */

export async function onRequestGet({ request, env }) {
  if (!(await verifieSession(request, env))) return json({ error: 'auth' }, 401);

  const sejourId = sejourValide(new URL(request.url).searchParams.get('sejour') || 'manoir');
  if (!sejourId) return json({ error: 'requete' }, 400);

  try {
    return json(await lisEtat(env, sejourId));
  } catch (e) {
    console.error('admin-stock: lecture impossible', e && e.message);
    return json({ error: 'moteur' }, 502);
  }
}

/* ---- Écriture ----------------------------------------------------------- */

export async function onRequestPost({ request, env }) {
  if (origineEtrangere(request)) return json({ error: 'requete' }, 400);
  if (!(await verifieSession(request, env))) return json({ error: 'auth' }, 401);
  if (!(request.headers.get('Content-Type') || '').includes('application/json')) return json({ error: 'requete' }, 400);

  let d;
  try { d = await request.json(); } catch { return json({ error: 'requete' }, 400); }
  if (typeof d !== 'object' || d === null) return json({ error: 'requete' }, 400);

  const sejourId = sejourValide(d.sejour);
  if (!sejourId) return json({ error: 'requete' }, 400);

  const action = texte(d.action, 20);
  let mouvement;

  if (action === 'bloquer') {
    const chambre = chambreValide(sejourId, d.chambre);
    const quantite = quantiteValide(d.quantite, SEJOURS[sejourId].capaciteGlobale);
    const motif = texte(d.motif, 200);
    if (!chambre || !quantite || motif.length < 3) return json({ error: 'requete' }, 400);

    /* Garde de quota AVANT écriture. Pour un blocage elle est indispensable :
       le moteur pose une place définitive sans revérifier le plafond. Deux
       demandes vraiment simultanées restent arbitrées par le Durable Object,
       qui n'exécute qu'une requête à la fois. */
    let etat;
    try { etat = await lisEtat(env, sejourId); } catch (e) {
      console.error('admin-stock: lecture impossible', e && e.message);
      return json({ error: 'moteur' }, 502);
    }
    const c = etat.chambres.find((x) => x.id === chambre);
    const surType = c ? Math.max(0, c.quota - c.vendues - c.tenues) : 0;
    if (quantite > surType) return json({ error: 'quota', detail: 'type', disponible: surType }, 409);
    if (quantite > etat.restantesGlobal) return json({ error: 'quota', detail: 'global', disponible: etat.restantesGlobal }, 409);

    mouvement = { action, chambre, quantite, motif };

  } else if (action === 'liberer') {
    const reservationId = identifiantValide(d.reservationId);
    if (reservationId) {
      mouvement = { action, reservationId };
    } else {
      const chambre = chambreValide(sejourId, d.chambre);
      const quantite = quantiteValide(d.quantite, SEJOURS[sejourId].capaciteGlobale);
      if (!chambre || !quantite) return json({ error: 'requete' }, 400);
      mouvement = { action, chambre, quantite };
    }

  } else if (action === 'note') {
    const reservationId = identifiantValide(d.reservationId);
    const note = texte(d.note, 600);
    if (!reservationId) return json({ error: 'requete' }, 400);
    mouvement = { action, reservationId, note };

  } else {
    return json({ error: 'requete' }, 400);
  }

  let r;
  try {
    r = await ecrisMouvement(env, sejourId, mouvement);
  } catch (e) {
    console.error('admin-stock: écriture impossible', e && e.message);
    return json({ error: 'moteur' }, 502);
  }

  if (!r || !r.ok) {
    const erreur = (r && r.erreur) || 'requete';
    /* Journal volontairement sec : action, séjour, chambre. Jamais de nom,
       d'email, de téléphone ni d'identifiant de réservation. */
    console.log(`admin-stock: ${action} refusé (${erreur}) sur ${sejourId}/${mouvement.chambre || 'reservation'}`);
    if (erreur === 'quota') return json({ error: 'quota', detail: r.detail || null }, 409);
    if (erreur === 'introuvable') return json({ error: 'requete', detail: 'introuvable' }, 400);
    return json({ error: 'requete' }, 400);
  }

  console.log(`admin-stock: ${action} appliqué sur ${sejourId}/${mouvement.chambre || 'reservation'}`);
  return json({ ok: true, etat: r.etat });
}
