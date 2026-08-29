/* Tests du moteur de stock. Ils tournent sous Node, sans Cloudflare, sans réseau :
   node --test test/   (depuis worker-stock/)

   La suite entière est jouée DEUX fois : sur l'adaptateur mémoire et sur du
   vrai SQLite, parce que c'est SQLite qui tourne en production dans le Durable
   Object. Un test qui ne passerait que sur la maquette ne prouverait rien. */

import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';

import {
  ETATS, MoteurStock, PRIX, SCHEMA, SEJOURS, TENUE_MS,
  instantParis, tableMemoire, tableSql, venteOuverte,
} from '../../functions/api/_stock.js';

/* Imite `ctx.storage.sql` du Durable Object : exec(requete, ...valeurs).toArray(),
   synchrone. C'est cette signature-là que le code de production utilise. */
function sqlSynchrone() {
  const db = new DatabaseSync(':memory:');
  return {
    exec(requete, ...valeurs) {
      if (!valeurs.length && !/^\s*SELECT/i.test(requete)) { db.exec(requete); return { toArray: () => [] }; }
      const st = db.prepare(requete);
      if (/^\s*SELECT/i.test(requete)) { const r = st.all(...valeurs); return { toArray: () => r }; }
      st.run(...valeurs);
      return { toArray: () => [] };
    },
  };
}

const ADAPTATEURS = {
  memoire: () => tableMemoire(),
  sqlite: () => {
    const sql = sqlSynchrone();
    for (const r of SCHEMA) sql.exec(r);
    let n = 0;
    return tableSql(sql, () => `res_test_${++n}`);
  },
};

/* Une date où les deux séjours sont ouverts à la vente. */
const T0 = Date.UTC(2026, 8, 1, 10, 0, 0);

function neuf(sejour, adaptateur) {
  const horloge = { t: T0 };
  const m = new MoteurStock(sejour, ADAPTATEURS[adaptateur](), () => horloge.t);
  return { m, horloge };
}

const prendreN = (m, chambre, n) => {
  const r = [];
  for (let i = 0; i < n; i++) r.push(m.prendre({ chambre }));
  return r;
};
const payer = (m, prise, i) => m.confirmer({ reservationId: prise.reservationId, sessionId: `cs_test_${i}` });

for (const adaptateur of Object.keys(ADAPTATEURS)) {
  test(`[${adaptateur}] état initial conforme aux capacités annoncées`, () => {
    const { m } = neuf('manoir', adaptateur);
    const e = m.etat();
    assert.equal(e.capaciteGlobale, 12);
    assert.equal(e.restantesGlobal, 12);
    assert.equal(e.chambres.length, 4);
    assert.deepEqual(e.chambres.map((c) => c.quota), [5, 2, 2, 3]);
    assert.equal(e.chambres.reduce((s, c) => s + c.quota, 0), 12);
    assert.equal(e.complet, false);
  });

  test(`[${adaptateur}] quota par type : la place de trop est refusée`, () => {
    const { m } = neuf('manoir', adaptateur);
    const r = prendreN(m, 'solo', 3);
    assert.equal(r.filter((x) => x.ok).length, 3);
    const trop = m.prendre({ chambre: 'solo' });
    assert.equal(trop.ok, false);
    assert.equal(trop.plafond, 'chambre');
    // les autres chambres restent vendables
    assert.equal(m.prendre({ chambre: 'duo-double' }).ok, true);
  });

  test(`[${adaptateur}] capacité globale : jamais plus de 12 places au Manoir`, () => {
    const { m } = neuf('manoir', adaptateur);
    let ok = 0;
    for (const c of ['partagee-5', 'duo-simple', 'duo-double', 'solo']) {
      for (let i = 0; i < 10; i++) if (m.prendre({ chambre: c }).ok) ok++;
    }
    assert.equal(ok, 12);
    assert.equal(m.etat().restantesGlobal, 0);
    assert.equal(m.etat().complet, true);
  });

  test(`[${adaptateur}] DOUBLE PLAFOND du Plessis : 16 de quotas, 14 places réelles`, () => {
    const { m } = neuf('plessis', adaptateur);
    assert.equal(SEJOURS.plessis.chambres.reduce((s, c) => s + c.quota, 0), 16);
    assert.equal(m.etat().capaciteGlobale, 14);

    // 12 en chambre partagée : le quota du type est atteint, pas la maison
    assert.equal(prendreN(m, 'partagee-3-6', 12).filter((x) => x.ok).length, 12);
    assert.equal(m.prendre({ chambre: 'partagee-3-6' }).plafond, 'chambre');
    assert.equal(m.etat().restantesGlobal, 2);

    // 2 duos : la maison est pleine
    assert.equal(prendreN(m, 'duo-simple', 2).filter((x) => x.ok).length, 2);
    const e = m.etat();
    assert.equal(e.restantesGlobal, 0);

    // la chambre solo n'a rien vendu, son quota est libre, et pourtant : complète
    const solo = e.chambres.find((c) => c.id === 'solo');
    assert.equal(solo.vendues + solo.tenues, 0);
    assert.equal(solo.quota, 2);
    assert.equal(solo.restantes, 0);
    assert.equal(solo.complet, true);
    const refus = m.prendre({ chambre: 'solo' });
    assert.equal(refus.ok, false);
    assert.equal(refus.plafond, 'global');
  });

  test(`[${adaptateur}] CONCURRENCE : 500 acheteuses sur la dernière place, une seule sert`, async () => {
    const { m } = neuf('manoir', adaptateur);
    prendreN(m, 'solo', 2); // il reste exactement 1 place solo
    assert.equal(m.etat().chambres.find((c) => c.id === 'solo').restantes, 1);

    const tirs = [];
    for (let i = 0; i < 500; i++) {
      tirs.push((async () => {
        // ordonnancement volontairement entrelacé : chaque appel repart après
        // plusieurs tours de boucle d'événements
        await Promise.resolve(); await null; await Promise.resolve();
        return m.prendre({ chambre: 'solo' });
      })());
    }
    const r = await Promise.all(tirs);
    assert.equal(r.filter((x) => x.ok).length, 1);
    assert.equal(m.etat().chambres.find((c) => c.id === 'solo').restantes, 0);
  });

  test(`[${adaptateur}] CONCURRENCE : 800 tentatives sur le Plessis, jamais plus de 14`, async () => {
    const { m } = neuf('plessis', adaptateur);
    const chambres = ['partagee-3-6', 'duo-simple', 'solo'];
    const tirs = [];
    for (let i = 0; i < 800; i++) {
      tirs.push((async () => {
        await Promise.resolve(); await null;
        return m.prendre({ chambre: chambres[i % chambres.length] });
      })());
    }
    const r = await Promise.all(tirs);
    assert.equal(r.filter((x) => x.ok).length, 14);
    const e = m.etat();
    assert.equal(e.vendues + e.tenues, 14);
    for (const c of e.chambres) assert.ok(c.vendues + c.tenues <= c.quota, `quota dépassé sur ${c.id}`);
    assert.equal(m.surbooking().length, 0);
  });

  test(`[${adaptateur}] la section critique est synchrone (aucun await ne peut s'y glisser)`, () => {
    const { m } = neuf('manoir', adaptateur);
    const r = m.prendre({ chambre: 'solo' });
    // si prendre() devenait asynchrone, deux appels concurrents pourraient lire
    // le même stock avant d'écrire : l'atomicité tomberait sans bruit.
    assert.ok(!(r instanceof Promise), 'prendre() doit rester synchrone');
    assert.ok(!(m.etat() instanceof Promise), 'etat() doit rester synchrone');
  });

  test(`[${adaptateur}] la tenue expire à 15 min et rend la place`, () => {
    const { m, horloge } = neuf('manoir', adaptateur);
    const p = m.prendre({ chambre: 'duo-double' });
    assert.equal(p.expireA, T0 + TENUE_MS);
    assert.equal(m.etat().chambres.find((c) => c.id === 'duo-double').tenues, 1);

    horloge.t = T0 + TENUE_MS - 1;
    assert.equal(m.etat().chambres.find((c) => c.id === 'duo-double').restantes, 1);

    horloge.t = T0 + TENUE_MS + 1;
    const c = m.etat().chambres.find((x) => x.id === 'duo-double');
    assert.equal(c.tenues, 0);
    assert.equal(c.restantes, 2);
    assert.equal(m.liste().find((r) => r.id === p.reservationId).motif, 'tenue-expiree');
  });

  test(`[${adaptateur}] paiement arrivé après l'expiration : la place est due, pas perdue`, () => {
    const { m, horloge } = neuf('manoir', adaptateur);
    const p = m.prendre({ chambre: 'solo' });
    horloge.t = T0 + TENUE_MS + 60000;
    m.etat(); // la tenue est périmée
    const r = m.confirmer({ reservationId: p.reservationId, sessionId: 'cs_tardif' });
    assert.equal(r.ok, true);
    assert.equal(r.reprise, true);
    assert.equal(m.etat().vendues, 1);
  });

  test(`[${adaptateur}] IDEMPOTENCE : un webhook rejoué ne consomme pas deux places`, () => {
    const { m } = neuf('manoir', adaptateur);
    const p = m.prendre({ chambre: 'solo' });
    const infos = { reservationId: p.reservationId, sessionId: 'cs_rejeu', montant: 128900, email: 'a@b.fr' };
    m.confirmer(infos);
    const deuxieme = m.confirmer(infos);
    const troisieme = m.confirmer({ sessionId: 'cs_rejeu' }); // rejeu sans reservationId
    assert.equal(deuxieme.deja, true);
    assert.equal(troisieme.deja, true);
    assert.equal(m.etat().vendues, 1);
    assert.equal(m.liste().length, 1);
  });

  test(`[${adaptateur}] vente hors site : elle consomme une place sans passer par le site`, () => {
    const { m } = neuf('manoir', adaptateur);
    const r = m.confirmer({ sessionId: 'cs_lien_manuel', chambre: 'partagee-5', montant: 119000, origine: 'reconciliation' });
    assert.equal(r.ok, true);
    assert.equal(r.horsSite, true);
    const c = m.etat().chambres.find((x) => x.id === 'partagee-5');
    assert.equal(c.vendues, 1);
    assert.equal(c.restantes, 4);
  });

  test(`[${adaptateur}] REMBOURSEMENT : la place retourne au stock`, () => {
    const { m } = neuf('manoir', adaptateur);
    const p = m.prendre({ chambre: 'solo' });
    m.confirmer({ reservationId: p.reservationId, sessionId: 'cs_r', paiementIntentId: 'pi_r' });
    assert.equal(m.etat().vendues, 1);

    assert.equal(m.libererParPaiement('pi_r', 'rembourse').ok, true);
    assert.equal(m.etat().vendues, 0);
    assert.equal(m.etat().chambres.find((c) => c.id === 'solo').restantes, 3);
  });

  test(`[${adaptateur}] LITIGE : la place retourne au stock`, () => {
    const { m } = neuf('plessis', adaptateur);
    const p = m.prendre({ chambre: 'solo' });
    m.confirmer({ reservationId: p.reservationId, sessionId: 'cs_l', paiementIntentId: 'pi_l' });
    assert.equal(m.libererParPaiement('pi_l', 'litige').ok, true);
    assert.equal(m.etat().vendues, 0);
  });

  test(`[${adaptateur}] une place PAYÉE ne repart jamais sur un minuteur`, () => {
    const { m, horloge } = neuf('manoir', adaptateur);
    const p = m.prendre({ chambre: 'solo' });
    m.confirmer({ reservationId: p.reservationId, sessionId: 'cs_p' });

    const refus = m.liberer(p.reservationId, 'tenue-expiree');
    assert.equal(refus.ok, false);
    assert.equal(refus.raison, 'payee');

    horloge.t = T0 + 10 * TENUE_MS; // le temps passe, la place reste vendue
    assert.equal(m.etat().vendues, 1);
    assert.equal(m.liberer(p.reservationId, 'session-expiree').ok, false);
  });

  test(`[${adaptateur}] marquage pour traitement humain : la place n'est pas libérée`, () => {
    const { m } = neuf('manoir', adaptateur);
    const p = m.prendre({ chambre: 'solo' });
    m.confirmer({ reservationId: p.reservationId, sessionId: 'cs_m', paiementIntentId: 'pi_m' });
    assert.equal(m.marquer('pi_m', 'remboursement-partiel').ok, true);
    assert.equal(m.etat().vendues, 1);
    assert.equal(m.liste().find((r) => r.id === p.reservationId).note, 'remboursement-partiel');
  });

  test(`[${adaptateur}] surbooking : constaté et signalé, jamais corrigé en douce`, () => {
    const { m } = neuf('manoir', adaptateur);
    // trois ventes hors site de trop sur un quota de 2
    for (let i = 0; i < 4; i++) m.confirmer({ sessionId: `cs_ext_${i}`, chambre: 'duo-double', origine: 'reconciliation' });
    const alertes = m.surbooking();
    assert.ok(alertes.some((a) => a.portee === 'duo-double' && a.occupees === 4 && a.plafond === 2));
    assert.equal(m.etat().vendues, 4); // rien n'est effacé : un humain tranche
    // et plus rien ne se vend sur ce type
    assert.equal(m.prendre({ chambre: 'duo-double' }).ok, false);
  });

  test(`[${adaptateur}] chambre inconnue refusée`, () => {
    const { m } = neuf('manoir', adaptateur);
    assert.equal(m.prendre({ chambre: 'partagee-3-6' }).raison, 'chambre'); // chambre du Plessis
    assert.equal(m.prendre({ chambre: '' }).raison, 'chambre');
  });
}

/* ---- Règles indépendantes du stockage ---- */

test('heures de Paris, jamais UTC', () => {
  // 21 octobre 2026 à Paris : heure d'été (UTC+2)
  assert.equal(instantParis('2026-10-21T00:00:00'), Date.UTC(2026, 9, 20, 22, 0, 0));
  // 18 novembre 2026 : heure d'hiver (UTC+1)
  assert.equal(instantParis('2026-11-18T00:00:00'), Date.UTC(2026, 10, 17, 23, 0, 0));
  // à cheval sur le changement d'heure du 25 octobre 2026
  assert.equal(instantParis('2026-10-25T04:00:00'), Date.UTC(2026, 9, 25, 3, 0, 0));
});

test('la vente ferme au début du séjour, en heure de Paris', () => {
  assert.equal(venteOuverte('manoir', instantParis('2026-10-20T23:59:59')), true);
  assert.equal(venteOuverte('manoir', instantParis('2026-10-21T00:00:01')), false);
  assert.equal(venteOuverte('plessis', instantParis('2026-10-21T00:00:01')), true);
  assert.equal(venteOuverte('plessis', instantParis('2026-11-18T00:00:01')), false);
});

test('vente refusée une fois le séjour commencé', () => {
  const m = new MoteurStock('manoir', tableMemoire(), () => instantParis('2026-10-22T09:00:00'));
  const r = m.prendre({ chambre: 'solo' });
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'vente-fermee');
});

test('chaque chambre a un prix Stripe distinct et rattachable', () => {
  const prix = [];
  for (const s of Object.values(SEJOURS)) for (const c of s.chambres) prix.push(c.price);
  assert.equal(prix.length, 7);
  assert.equal(new Set(prix).size, 7, 'deux chambres partagent le même prix Stripe');
  assert.equal(PRIX.size, 7);
  assert.deepEqual(PRIX.get(SEJOURS.plessis.chambres[2].price), { sejour: 'plessis', chambre: 'solo' });
  for (const p of prix) assert.match(p, /^price_/);
});

test('les tarifs du code correspondent aux tarifs annoncés sur les pages', () => {
  assert.deepEqual(SEJOURS.manoir.chambres.map((c) => c.prix), [119000, 119000, 123000, 128900]);
  assert.deepEqual(SEJOURS.plessis.chambres.map((c) => c.prix), [119000, 123000, 128900]);
});

test('séjour inconnu : le moteur refuse de démarrer plutôt que de compter faux', () => {
  assert.throws(() => new MoteurStock('inconnu', tableMemoire()), /sejour inconnu/);
});

test('états possibles d\'une réservation', () => {
  assert.deepEqual(Object.values(ETATS).sort(), ['liberee', 'payee', 'tenue']);
});
