/* Back-office des places des séjours — l'API que consomme admin.html.

   GET  /api/admin-stock?sejour=manoir
        → même structure que /api/sejour-places, plus la liste des inscrites :
          { sejour, capaciteGlobale, vendues, tenues, restantesGlobal, complet,
            chambres:[{ id, libelle, detail, prix, quota, vendues, tenues, restantes, complet }],
            reservations:[{ id, chambre, etat, email, nom, telephone,
                            montant, paiement, cree, note, motif }] }

   POST /api/admin-stock  { action, sejour, ... }
        action "bloquer" : { chambre, quantite, motif }   retire des places de la vente
        action "liberer" : { reservationId } ou { chambre, quantite }
        action "note"    : { reservationId, note }
        → 200 { ok:true, etat:{...} }   409 { error:"quota" }   400 { error:"requete" }

   Accès réservé à une session ouverte par /api/admin-login (cookie signé).
   La page expose des données personnelles de clientes : rien ici ne doit
   sortir sans session valide, et rien de nominatif ne part dans les journaux. */

import { verifieSession, origineEtrangere } from './admin-login.js';

/* ════════════════════════════════════════════════════════════════════════════
   BRANCHEMENT AU MOTEUR DE STOCK

   Tout accès au stockage réel passe par lisEtat() et ecrisMouvement(), et par
   RIEN D'AUTRE dans ce fichier. Tant que functions/api/_stock.js n'est pas
   livré, on sert un jeu de démonstration en mémoire (remis à zéro à chaque
   redémarrage de l'isolate) : la page est utilisable et testable tout de suite.

   POUR BRANCHER LE MOTEUR, quand _stock.js sera là :
     1. ajouter en tête de fichier, sous l'import existant :
            import { lireEtat, appliqueMouvement } from './_stock.js';
     2. dans lisEtat()       : remplacer   return demoLis(sejour);
                               par         return await lireEtat(env, sejour);
     3. dans ecrisMouvement(): remplacer   return demoEcris(sejour, mouvement);
                               par         return await appliqueMouvement(env, sejour, mouvement);
     4. supprimer le bloc « JEU DE DÉMONSTRATION » plus bas (et lui seul).

   Contrat attendu du moteur :
     lireEtat(env, sejour)  → l'objet complet décrit en tête de fichier.
     appliqueMouvement(env, sejour, mouvement) → { ok:true, etat } ou
       { erreur:'quota'|'introuvable'|'requete', detail } ; c'est au moteur de
       refaire la vérification de quota (celle d'ici est une garde, pas un
       verrou : deux requêtes simultanées ne sont arbitrées que côté stockage).
   ════════════════════════════════════════════════════════════════════════════ */

async function lisEtat(env, sejour) {
  return demoLis(sejour);              // ← ligne à remplacer (étape 2)
}

async function ecrisMouvement(env, sejour, mouvement) {
  return demoEcris(sejour, mouvement); // ← ligne à remplacer (étape 3)
}

/* ---- Catalogue ---------------------------------------------------------
   Libellés et prix repris mot pour mot des pages retraite-le-manoir.html et
   retraite-le-plessis.html. Sert à valider les entrées et à alimenter la
   démonstration. Quand le moteur sera branché, c'est LUI qui fera autorité
   sur les quotas ; ce catalogue ne servira plus qu'à valider les identifiants.

   Le Plessis : 14 places pour 16 lits. Ce n'est pas une erreur de saisie,
   c'est la capacité réelle de la maison. Les deux plafonds coexistent. */
const CATALOGUE = {
  manoir: {
    titre: "Revenir à l'essentiel",
    lieu: 'Le Manoir Ducey · Normandie',
    dates: 'Du 21 au 25 octobre 2026',
    capaciteGlobale: 12,
    chambres: [
      { id: 'partagee-5', libelle: 'Chambre partagée à 5', detail: 'lit simple · sdb partagée', prix: 119000, quota: 5 },
      { id: 'duo-simple', libelle: 'Chambre duo', detail: 'lit simple · sdb partagée', prix: 119000, quota: 2 },
      { id: 'duo-double', libelle: 'Chambre duo', detail: 'lit double · sdb partagée', prix: 123000, quota: 2 },
      { id: 'solo', libelle: 'Chambre solo', detail: 'lit double · sdb partagée', prix: 128900, quota: 3 },
    ],
  },
  plessis: {
    titre: "Le jour d'après",
    lieu: 'Le Plessis-Placy · à 50 minutes de Paris',
    dates: 'Du 18 au 22 novembre 2026',
    capaciteGlobale: 14,
    chambres: [
      { id: 'partagee-3-6', libelle: 'Chambre partagée de 3 à 6', detail: 'lit simple · sdb partagée', prix: 119000, quota: 12 },
      { id: 'duo-simple', libelle: 'Chambre duo', detail: 'lit simple · sdb partagée', prix: 123000, quota: 2 },
      { id: 'solo', libelle: 'Chambre solo', detail: 'lit double · sdb privée', prix: 128900, quota: 2 },
    ],
  },
};

/* États d'une ligne. Ceux qui occupent une place : payee, bloquee (vendues) et
   en-cours (tenues). Ceux qui n'occupent plus rien : annulee, liberee. */
const PREND_UNE_PLACE = new Set(['payee', 'bloquee']);
const TIENT_UNE_PLACE = new Set(['en-cours']);

/* ════════════════════ JEU DE DÉMONSTRATION (à supprimer) ══════════════════ */

const demoBase = {
  manoir: [
    { id: 'r-m-01', chambre: 'partagee-5', etat: 'payee', nom: 'Claire Fontaine', email: 'claire.fontaine@example.com', telephone: '+33 6 12 34 56 78', montant: 119000, paiement: 'integral', cree: '2026-08-11T09:24:00.000Z', note: '', motif: '' },
    { id: 'r-m-02', chambre: 'partagee-5', etat: 'payee', nom: 'Naïma Berger', email: 'naima.berger@example.com', telephone: '+33 6 22 41 08 90', montant: 119000, paiement: '3x', cree: '2026-08-13T16:02:00.000Z', note: 'Végétarienne, prévenue la cuisine.', motif: '' },
    { id: 'r-m-03', chambre: 'partagee-5', etat: 'payee', nom: 'Sophie Marchand', email: 'sophie.marchand@example.com', telephone: '+33 7 55 12 33 41', montant: 119000, paiement: '2x', cree: '2026-08-18T11:47:00.000Z', note: '', motif: '' },
    { id: 'r-m-04', chambre: 'partagee-5', etat: 'en-cours', nom: 'Élodie Rousseau', email: 'elodie.rousseau@example.com', telephone: '+33 6 71 90 22 15', montant: 119000, paiement: '3x', cree: '2026-08-28T18:31:00.000Z', note: '', motif: '' },
    { id: 'r-m-05', chambre: 'duo-simple', etat: 'payee', nom: 'Léa Vidal', email: 'lea.vidal@example.com', telephone: '+33 6 08 77 45 20', montant: 119000, paiement: 'integral', cree: '2026-08-15T08:12:00.000Z', note: 'Vient avec sa sœur, à mettre dans la même chambre.', motif: '' },
    { id: 'r-m-06', chambre: 'solo', etat: 'payee', nom: 'Anne Deschamps', email: 'anne.deschamps@example.com', telephone: '+33 6 44 19 63 87', montant: 128900, paiement: 'integral', cree: '2026-08-20T14:05:00.000Z', note: '', motif: '' },
  ],
  /* Le Plessis part volontairement plein au global (14/14) alors qu'il reste
     2 lits en chambre partagée : c'est la situation que l'écran doit rendre
     lisible d'un coup d'œil. */
  plessis: [
    ...Array.from({ length: 10 }, (_, i) => ({
      id: `r-p-${String(i + 1).padStart(2, '0')}`,
      chambre: 'partagee-3-6',
      etat: 'payee',
      nom: ['Camille Ostier', 'Julie Ferrand', 'Marion Lebrun', 'Sarah Nguyen', 'Inès Chevalier', 'Laura Petit', 'Chloé Barbier', 'Manon Guérin', 'Alice Roy', 'Nour Benali'][i],
      email: ['camille.ostier', 'julie.ferrand', 'marion.lebrun', 'sarah.nguyen', 'ines.chevalier', 'laura.petit', 'chloe.barbier', 'manon.guerin', 'alice.roy', 'nour.benali'][i] + '@example.com',
      telephone: `+33 6 ${10 + i} ${20 + i} ${30 + i} ${40 + i}`,
      montant: 119000,
      paiement: ['integral', '2x', '3x'][i % 3],
      cree: `2026-08-${String(4 + i).padStart(2, '0')}T10:0${i % 10}:00.000Z`,
      note: '',
      motif: '',
    })),
    { id: 'r-p-11', chambre: 'duo-simple', etat: 'payee', nom: 'Hélène Caron', email: 'helene.caron@example.com', telephone: '+33 6 90 12 34 56', montant: 123000, paiement: 'integral', cree: '2026-08-17T09:00:00.000Z', note: '', motif: '' },
    { id: 'r-p-12', chambre: 'duo-simple', etat: 'payee', nom: 'Fanny Millet', email: 'fanny.millet@example.com', telephone: '+33 6 91 22 34 57', montant: 123000, paiement: '2x', cree: '2026-08-17T09:40:00.000Z', note: '', motif: '' },
    { id: 'r-p-13', chambre: 'solo', etat: 'payee', nom: 'Béatrice Aumont', email: 'beatrice.aumont@example.com', telephone: '+33 6 92 32 34 58', montant: 128900, paiement: 'integral', cree: '2026-08-19T15:20:00.000Z', note: '', motif: '' },
    { id: 'r-p-14', chambre: 'solo', etat: 'bloquee', nom: '', email: '', telephone: '', montant: 0, paiement: 'hors-ligne', cree: '2026-08-21T07:10:00.000Z', note: '', motif: 'Invitée de Jade, place offerte' },
  ],
};

const demoMemoire = new Map(); // séjour → tableau de réservations
let demoCompteur = 0;

function demoLignes(sejour) {
  if (!demoMemoire.has(sejour)) demoMemoire.set(sejour, demoBase[sejour].map((r) => ({ ...r })));
  return demoMemoire.get(sejour);
}

function demoLis(sejour) {
  return composeEtat(sejour, demoLignes(sejour));
}

function demoEcris(sejour, m) {
  const lignes = demoLignes(sejour);

  if (m.action === 'bloquer') {
    for (let i = 0; i < m.quantite; i++) {
      demoCompteur++;
      lignes.push({
        id: `b-${Date.now().toString(36)}-${demoCompteur}`,
        chambre: m.chambre,
        etat: 'bloquee',
        nom: '', email: '', telephone: '',
        montant: 0, paiement: 'hors-ligne',
        cree: new Date().toISOString(),
        note: '', motif: m.motif,
      });
    }
    return { ok: true, etat: composeEtat(sejour, lignes) };
  }

  if (m.action === 'liberer') {
    if (m.reservationId) {
      const r = lignes.find((x) => x.id === m.reservationId);
      if (!r) return { erreur: 'introuvable' };
      if (!PREND_UNE_PLACE.has(r.etat) && !TIENT_UNE_PLACE.has(r.etat)) return { erreur: 'quota', detail: 'deja-libre' };
      r.etat = r.etat === 'bloquee' ? 'liberee' : 'annulee';
      return { ok: true, etat: composeEtat(sejour, lignes) };
    }
    // Libération en masse : uniquement des places bloquées, les plus récentes.
    const bloquees = lignes.filter((x) => x.chambre === m.chambre && x.etat === 'bloquee');
    if (bloquees.length < m.quantite) return { erreur: 'quota', detail: 'rien-a-liberer' };
    bloquees.slice(-m.quantite).forEach((x) => { x.etat = 'liberee'; });
    return { ok: true, etat: composeEtat(sejour, lignes) };
  }

  if (m.action === 'note') {
    const r = lignes.find((x) => x.id === m.reservationId);
    if (!r) return { erreur: 'introuvable' };
    r.note = m.note;
    return { ok: true, etat: composeEtat(sejour, lignes) };
  }

  return { erreur: 'requete' };
}

/* Reconstruit l'état complet à partir des lignes. Sera repris par le moteur ;
   gardé ici tant que la démonstration tourne. */
function composeEtat(sejour, lignes) {
  const cfg = CATALOGUE[sejour];
  const chambres = cfg.chambres.map((c) => {
    const miennes = lignes.filter((r) => r.chambre === c.id);
    const vendues = miennes.filter((r) => PREND_UNE_PLACE.has(r.etat)).length;
    const tenues = miennes.filter((r) => TIENT_UNE_PLACE.has(r.etat)).length;
    const restantes = Math.max(0, c.quota - vendues - tenues);
    return { ...c, vendues, tenues, restantes, complet: restantes === 0 };
  });
  const vendues = chambres.reduce((n, c) => n + c.vendues, 0);
  const tenues = chambres.reduce((n, c) => n + c.tenues, 0);
  const restantesGlobal = Math.max(0, cfg.capaciteGlobale - vendues - tenues);
  return {
    sejour,
    titre: cfg.titre,
    lieu: cfg.lieu,
    dates: cfg.dates,
    capaciteGlobale: cfg.capaciteGlobale,
    vendues,
    tenues,
    restantesGlobal,
    complet: restantesGlobal === 0,
    chambres,
    reservations: lignes.map((r) => ({ ...r })),
  };
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
  return Object.prototype.hasOwnProperty.call(CATALOGUE, s) ? s : null;
}

function chambreValide(sejour, v) {
  const c = texte(v, 40);
  return CATALOGUE[sejour].chambres.some((x) => x.id === c) ? c : null;
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

  const sejour = sejourValide(new URL(request.url).searchParams.get('sejour') || 'manoir');
  if (!sejour) return json({ error: 'requete' }, 400);

  try {
    return json(await lisEtat(env, sejour));
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

  const sejour = sejourValide(d.sejour);
  if (!sejour) return json({ error: 'requete' }, 400);

  const action = texte(d.action, 20);
  let mouvement;

  if (action === 'bloquer') {
    const chambre = chambreValide(sejour, d.chambre);
    const quantite = quantiteValide(d.quantite, CATALOGUE[sejour].capaciteGlobale);
    const motif = texte(d.motif, 200);
    if (!chambre || !quantite || motif.length < 3) return json({ error: 'requete' }, 400);

    // Garde de quota avant écriture. Ce n'est pas le verrou : l'arbitrage de
    // deux demandes simultanées appartient au moteur de stock.
    let etat;
    try { etat = await lisEtat(env, sejour); } catch (e) {
      console.error('admin-stock: lecture impossible', e && e.message);
      return json({ error: 'moteur' }, 502);
    }
    const c = etat.chambres.find((x) => x.id === chambre);
    const placeType = c ? c.restantes : 0;
    if (quantite > placeType) return json({ error: 'quota', detail: 'type', disponible: placeType }, 409);
    if (quantite > etat.restantesGlobal) return json({ error: 'quota', detail: 'global', disponible: etat.restantesGlobal }, 409);

    mouvement = { action, chambre, quantite, motif };

  } else if (action === 'liberer') {
    const reservationId = identifiantValide(d.reservationId);
    if (reservationId) {
      mouvement = { action, reservationId };
    } else {
      const chambre = chambreValide(sejour, d.chambre);
      const quantite = quantiteValide(d.quantite, CATALOGUE[sejour].capaciteGlobale);
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
    r = await ecrisMouvement(env, sejour, mouvement);
  } catch (e) {
    console.error('admin-stock: écriture impossible', e && e.message);
    return json({ error: 'moteur' }, 502);
  }

  if (!r || !r.ok) {
    const erreur = (r && r.erreur) || 'requete';
    // Journal volontairement sec : action, séjour, chambre. Jamais de nom,
    // d'email ni de téléphone.
    console.log(`admin-stock: ${action} refusé (${erreur}) sur ${sejour}/${mouvement.chambre || 'reservation'}`);
    if (erreur === 'quota') return json({ error: 'quota', detail: r.detail || null }, 409);
    if (erreur === 'introuvable') return json({ error: 'requete', detail: 'introuvable' }, 400);
    return json({ error: 'requete' }, 400);
  }

  console.log(`admin-stock: ${action} appliqué sur ${sejour}/${mouvement.chambre || 'reservation'}`);
  return json({ ok: true, etat: r.etat });
}
