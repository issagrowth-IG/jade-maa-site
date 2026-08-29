/* Compteur de places des séjours, hébergé dans un Durable Object.
   Un objet par séjour (nommé `manoir` / `plessis`) : Cloudflare n'exécute qu'une
   requête à la fois par objet, ce qui rend la prise de place atomique sans verrou
   applicatif. C'est toute la raison d'être de ce worker.

   Pourquoi un worker séparé du site : un projet Pages peut se LIER à un Durable
   Object mais ne peut pas en définir un, la classe doit vivre dans un Worker.
   Le site s'y branche par `script_name = "jade-stock-sejours"`.

   Env : STRIPE_KEY (clé restreinte), STOCK_SECRET (déclenchement manuel de la
   réconciliation), SLACK_WEBHOOK_SEJOURS ou SLACK_WEBHOOK (alertes). */

import { DurableObject } from 'cloudflare:workers';
import {
  ETATS, MoteurStock, SCHEMA, SEJOURS, tableSql,
  ventesStripe, verdictStripe,
} from '../../functions/api/_stock.js';
import { alerteStock } from '../../functions/api/_slack.js';

const json = (b, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

export class StockSejour extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    for (const requete of SCHEMA) this.sql.exec(requete);
    this.table = tableSql(this.sql);
  }

  #moteur(sejourId) { return new MoteurStock(sejourId, this.table); }

  /* Toutes les méthodes reçoivent l'id du séjour : l'objet est nommé d'après lui
     mais un Durable Object ne connaît pas son propre nom. */
  async etat(sejourId) { return this.#moteur(sejourId).etat(); }
  async prendre(sejourId, args) { return this.#moteur(sejourId).prendre(args); }
  async attacherSession(sejourId, id, sessionId) { return this.#moteur(sejourId).attacherSession(id, sessionId); }
  async liberer(sejourId, id, motif) { return this.#moteur(sejourId).liberer(id, motif); }
  async libererParSession(sejourId, s, motif) { return this.#moteur(sejourId).libererParSession(s, motif); }
  async libererParPaiement(sejourId, p, motif) { return this.#moteur(sejourId).libererParPaiement(p, motif); }
  async marquer(sejourId, cle, note) { return this.#moteur(sejourId).marquer(cle, note); }
  async liste(sejourId) { return this.#moteur(sejourId).liste(); }

  async confirmer(sejourId, infos) {
    const m = this.#moteur(sejourId);
    const r = m.confirmer(infos);
    /* Le dépassement est signalé, jamais corrigé tout seul : on ne rembourse
       personne automatiquement, un humain tranche. */
    return { ...r, surbooking: m.surbooking() };
  }

  /* Idempotence des webhooks : renvoie true la PREMIÈRE fois seulement.
     Lecture puis écriture sans await entre les deux, donc indivisible. */
  async evenementNouveau(sejourId, eventId) {
    if (!eventId) return true;
    const vu = this.sql.exec('SELECT id FROM evenements WHERE id = ?', eventId).toArray();
    if (vu.length) return false;
    this.sql.exec('INSERT INTO evenements (id, vu_a) VALUES (?, ?)', eventId, Date.now());
    return true;
  }

  /* Réconciliation : Stripe est l'arbitre final. Deux passes.
     A) les ventes que Stripe connaît et que nous ignorons (webhook manqué, lien
        de paiement envoyé à la main) : on les inscrit, elles consomment une place.
     B) les places que nous comptons vendues : Stripe confirme, ou dit remboursé
        et on rend la place.
     Aucune place n'est jamais libérée sur une simple ABSENCE dans l'inventaire :
     un inventaire partiel ne doit pas pouvoir rouvrir une place déjà vendue. */
  async reconcilier(sejourId) {
    const rapport = { sejour: sejourId, ajoutees: 0, liberees: 0, marquees: 0, verifiees: 0, erreurs: [] };
    const key = this.env.STRIPE_KEY;
    if (!key) { rapport.erreurs.push('STRIPE_KEY absente'); return rapport; }

    let ventes = null;
    try {
      ventes = await ventesStripe(key);
    } catch (e) {
      /* Inventaire incomplet : on le dit et on n'ajoute rien, mais la passe B
         reste valable puisqu'elle interroge chaque place une par une. */
      rapport.erreurs.push(`inventaire: ${e.message}`);
    }

    if (ventes) {
      for (const v of ventes) {
        if (v.sejour !== sejourId) continue;
        const connue = this.table.parSession(v.sessionId);
        if (connue && connue.etat === ETATS.PAYEE) continue;
        const m = this.#moteur(sejourId);
        const r = m.confirmer({ ...v, origine: connue ? 'site' : 'reconciliation' });
        if (r.ok) rapport.ajoutees++;
      }
    }

    for (const r of this.#moteur(sejourId).liste()) {
      if (r.etat !== ETATS.PAYEE || !r.sessionId) continue;
      rapport.verifiees++;
      const v = await verdictStripe(key, r.sessionId);
      if (v.verdict === 'liberer') {
        const res = this.#moteur(sejourId).liberer(r.id, v.motif);
        if (res.ok && !res.deja) rapport.liberees++;
      } else if (v.verdict === 'marquer') {
        this.#moteur(sejourId).marquer(r.id, v.note);
        rapport.marquees++;
      }
    }

    const alertes = this.#moteur(sejourId).surbooking();
    if (alertes.length) {
      rapport.surbooking = alertes;
      await alerteStock(this.env, `Surbooking détecté sur ${sejourId}`, alertes);
    }
    return rapport;
  }

  /* Inscription d'une place à la main (vente encaissée hors Stripe, virement,
     place bloquée pour l'organisation). Consomme une place même si elle fait
     dépasser le quota : compter en trop coûte une vente, compter en moins en
     vend une qui n'existe pas. */
  async inscrire(sejourId, infos) {
    const m = this.#moteur(sejourId);
    const r = m.confirmer({ ...infos, origine: infos.origine || 'manuelle' });
    return { ...r, surbooking: m.surbooking(), etat: m.etat() };
  }
}

export default {
  /* Déclenchement manuel de la réconciliation et lecture de l'état, protégés par
     un secret partagé. Ce worker n'est pas une API publique : le site parle au
     Durable Object par binding, pas par HTTP. */
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!env.STOCK_SECRET || request.headers.get('x-stock-secret') !== env.STOCK_SECRET) {
      return json({ error: 'refuse' }, 403);
    }
    const sejour = url.searchParams.get('sejour');
    if (!SEJOURS[sejour]) return json({ error: 'sejour' }, 400);
    const stub = env.STOCK_SEJOURS.getByName(sejour);

    if (url.pathname === '/reconcilier') return json(await stub.reconcilier(sejour));
    if (url.pathname === '/etat') return json(await stub.etat(sejour));
    if (url.pathname === '/liste') return json({ reservations: await stub.liste(sejour) });
    if (url.pathname === '/inscrire' && request.method === 'POST') {
      const corps = await request.json().catch(() => null);
      if (!corps || !corps.chambre) return json({ error: 'chambre' }, 400);
      return json(await stub.inscrire(sejour, corps));
    }
    /* Prise de place sèche, sans paiement. Sert à vérifier le compteur sur un
       environnement déployé sans encaisser quoi que ce soit : la tenue expire
       toute seule au bout de 15 minutes. */
    if (url.pathname === '/prendre' && request.method === 'POST') {
      const corps = await request.json().catch(() => null);
      if (!corps || !corps.chambre) return json({ error: 'chambre' }, 400);
      return json(await stub.prendre(sejour, { chambre: corps.chambre }));
    }
    if (url.pathname === '/liberer' && request.method === 'POST') {
      const corps = await request.json().catch(() => null);
      if (!corps || !corps.reservationId) return json({ error: 'reservationId' }, 400);
      return json(await stub.liberer(sejour, corps.reservationId, corps.motif || 'annule-main'));
    }
    return json({ error: 'route' }, 404);
  },

  /* Filet de sécurité contre le webhook manqué : Stripe repasse derrière nous
     toutes les 15 minutes. Les Cron Triggers n'existent pas sur Pages, c'est une
     raison de plus pour que ce worker soit séparé. */
  async scheduled(evenement, env, ctx) {
    ctx.waitUntil((async () => {
      for (const sejour of Object.keys(SEJOURS)) {
        try {
          const stub = env.STOCK_SEJOURS.getByName(sejour);
          const r = await stub.reconcilier(sejour);
          if (r.ajoutees || r.liberees || r.marquees || r.erreurs.length) {
            console.error('reconciliation', JSON.stringify(r));
          }
        } catch (e) {
          console.error(`reconciliation ${sejour} impossible`, e && e.message);
        }
      }
    })());
  },
};
