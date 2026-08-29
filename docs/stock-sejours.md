# Stock des séjours : comment on ne vend jamais une place de trop

Objectif posé par le client : **ne jamais vendre plus de places qu'il n'y en a**.
Une place vendue en trop est un échec grave, une vente perdue par prudence est
acceptable. Tout ce qui suit découle de cette asymétrie : à chaque point de doute,
le code refuse la vente.

Périmètre : les deux séjours 2026 (`manoir`, `plessis`). Paiement **comptant
uniquement** (le fractionné a été abandonné le 29/08/2026).

---

## 1. Ce que le système garantit, et ce qu'il ne garantit pas

**Garanti**
- Deux acheteuses qui cliquent sur la même dernière place à la même milliseconde : une seule est servie.
- Le quota par type de chambre ET la capacité globale de la maison sont testés à chaque prise.
- Une place remboursée retourne au stock.
- Un webhook Stripe rejoué ne consomme pas une deuxième place.
- Une vente faite hors du site (lien de paiement envoyé à la main) consomme une place.
- Si le compteur ou Stripe ne répond pas, la vente est refusée.

**Non garanti, assumé** : voir la section 10, limites résiduelles.

---

## 2. Architecture retenue et pourquoi

### Un compteur transactionnel, pas un comptage de Stripe

Le premier réflexe serait de compter les ventes directement dans Stripe, comme le
fait la jauge de la conférence (`_places.js`). C'est ce qu'il ne faut pas faire ici,
pour trois raisons :

1. **La liste des sessions Stripe est éventuellement cohérente.** Une vente
   peut ne pas apparaître tout de suite. Deux acheteuses simultanées voient
   alors le même stock.
2. **Une place remboursée reste `paid` à vie.** `payment_status` ne redescend
   jamais : la place serait perdue pour toujours.
3. **Le balayage est borné.** Au-delà de 2000 sessions, il faut soit mentir,
   soit refuser. Le compte Stripe sert aussi à la conférence et à LBM.

Le compteur est donc tenu chez nous, et **Stripe redevient l'arbitre par la
réconciliation** (section 8), jamais dans le chemin de vente.

### Durable Object, un objet par séjour

Cloudflare n'exécute **qu'une requête à la fois par Durable Object**. En nommant
l'objet d'après le séjour (`manoir`, `plessis`), la prise de place devient
atomique sans le moindre verrou applicatif : la deuxième acheteuse ne peut pas
lire le stock avant que la première ait écrit.

Deuxième garantie, apportée par le code et non par la plateforme : la section
critique de `MoteurStock.prendre()` est **entièrement synchrone**. Il n'y a pas un
seul `await` entre le comptage et l'écriture, donc même la boucle d'événements JS
ne peut pas s'y glisser. C'est ce que rend possible le backend **SQLite** du
Durable Object, dont l'API `ctx.storage.sql.exec()` est synchrone. Un test dédié
vérifie que `prendre()` ne devient jamais asynchrone : si quelqu'un y ajoute un
`await`, l'atomicité tomberait sans bruit, le test échoue.

### Pourquoi pas D1

D1 est en concurrence optimiste : les conflits sont détectés au commit et il faut
écrire une logique de reprise. Un `INSERT ... SELECT ... WHERE (SELECT COUNT(*)) < quota`
en une instruction serait atomique, mais la reprise après conflit reste du code
fragile sur le chemin critique. Le Durable Object supprime le problème plutôt que
de le gérer.

### Pourquoi un Worker séparé du site

**Un projet Pages peut se LIER à un Durable Object, mais ne peut pas en définir un.**
La classe doit vivre dans un Worker ordinaire, et le binding Pages exige la clé
`script_name` (elle est facultative pour un Worker, obligatoire pour Pages).
D'où le dossier `worker-stock/`, déployé comme un Worker autonome nommé
`jade-stock-sejours`. Bénéfice secondaire : les Cron Triggers n'existent pas sur
Pages, et c'est ce worker qui porte la réconciliation automatique.

### Fichiers

| Fichier | Rôle |
|---|---|
| `functions/api/_stock.js` | Configuration des séjours, moteur de décompte (pur, testable), adaptateurs de stockage, client du Durable Object, lectures Stripe de réconciliation |
| `functions/api/sejour-places.js` | `GET /api/sejour-places` : état de la jauge |
| `functions/api/sejour-checkout.js` | `POST /api/sejour-checkout` : prend la place puis ouvre le paiement |
| `functions/api/stripe-webhook.js` | Étendu : confirmation, expiration, remboursement, litige, notification Slack (séjours **et** conférence) |
| `functions/api/_slack.js` | Notifications Slack, jamais bloquantes |
| `worker-stock/src/index.js` | La classe Durable Object, la réconciliation, le cron, les routes d'exploitation |
| `worker-stock/wrangler.toml` | Config du worker (binding, migration SQLite, cron) |
| `worker-stock/test/stock.test.mjs` | 41 tests, dont deux tests de concurrence |

---

## 3. Contrat d'API

```
GET /api/sejour-places?sejour=manoir
200 {
  sejour, capaciteGlobale, vendues, tenues, restantesGlobal, complet,
  chambres:[{ id, libelle, detail, prix /*centimes*/, quota, vendues, tenues, restantes, complet }]
}
400 { error:"requete" }   séjour inconnu
502 { error:"stock" }     compteur injoignable : la page garde son affichage normal

POST /api/sejour-checkout   body JSON { sejour, chambre }
200 { clientSecret, reservationId }
409 { soldOut:true, chambre }
400 { error:"requete" }
502 { error:"stripe" }
```

Deux précisions sur le POST :

- Le champ `paiement` est **accepté et ignoré** (héritage du fractionné abandonné) :
  un appel encore en vol ne casse pas.
- Un séjour déjà commencé sort aussi en **409 `soldOut`** et non en 400 : côté page
  le résultat visible est le même, la place n'est pas réservable. Le vrai motif est
  journalisé.

`restantes` d'une chambre est le **plus petit des deux plafonds**. Au Plessis, une
chambre peut être `complet: true` alors que son quota n'est pas atteint, parce que
la maison est pleine : c'est voulu, la page doit afficher cela tel quel.

---

## 4. Le stock tenu

**`manoir`** : « Revenir à l'essentiel », Manoir Ducey, 21-25 octobre 2026. Capacité **12**.

| id | libellé | détail | prix | quota |
|---|---|---|---|---|
| `partagee-5` | Chambre partagée à 5 | lit simple · sdb partagée | 1 190 € | 5 |
| `duo-simple` | Chambre duo | lit simple · sdb partagée | 1 190 € | 2 |
| `duo-double` | Chambre duo | lit double · sdb partagée | 1 230 € | 2 |
| `solo` | Chambre solo | lit double · sdb partagée | 1 289 € | 3 |

**`plessis`** : « Le jour d'après », Le Plessis-Placy, 18-22 novembre 2026. Capacité **14**.

| id | libellé | détail | prix | quota |
|---|---|---|---|---|
| `partagee-3-6` | Chambre partagée de 3 à 6 | lit simple · sdb partagée | 1 190 € | 12 |
| `duo-simple` | Chambre duo | lit simple · sdb partagée | 1 230 € | 2 |
| `solo` | Chambre solo | lit double · sdb privée | 1 289 € | 2 |

La somme des quotas du Plessis fait **16** pour **14** places réelles. Le double
plafond est volontaire et testé à chaque prise.

1 place = 1 billet = 1 personne. Deux inconnues peuvent partager une chambre duo :
on ne vend jamais « la chambre ». La quantité est forcée à 1 côté serveur, elle
n'est jamais lue depuis la requête.

---

## 5. Les trois états d'une réservation

| État | Sens | Sortie |
|---|---|---|
| `tenue` | Place bloquée pendant que la cliente paie. Minuteur de **15 minutes**, le nôtre. | devient `payee`, ou `liberee` à l'expiration |
| `payee` | Argent encaissé. | ne repart que sur remboursement, litige ou annulation manuelle |
| `liberee` | Place rendue au stock. | terminal |

Le minuteur est à 15 minutes alors que la session Stripe expire à 30 minutes
(**30 min est le minimum imposé par Stripe**, on ne peut pas descendre plus bas).
La fenêtre entre les deux est une marge où notre stock est plus prudent que Stripe,
jamais l'inverse. Si un paiement arrive quand même après l'expiration de notre tenue,
**la place est due** : elle repasse en `payee` et un éventuel dépassement part en
alerte Slack. On ne rembourse jamais tout seul.

Une place `payee` ne peut PAS être libérée par un minuteur : les seuls motifs
acceptés sont `rembourse`, `litige` et `annule-main`.

---

## 6. Couverture des failles de l'audit

| # | Faille | Traitement | Vérifié par |
|---|---|---|---|
| 1 | Course sur la dernière place | Durable Object mono-thread + section critique synchrone dans `prendre()` | 2 tests de concurrence Node (500 et 800 appels entrelacés) **et** 260 requêtes HTTP simultanées contre le vrai runtime workerd |
| 2 | Latence de l'API Stripe | Le stock ne se déduit jamais d'un balayage Stripe. Le chemin de vente ne touche que le Durable Object | conception ; aucun appel `list` dans `sejour-checkout.js` |
| 3 | Place remboursée comptée à vie | Webhooks `charge.refunded` et `charge.dispute.created` → la place retourne au stock. Remboursement **partiel** : la place reste prise et la réservation est marquée pour traitement humain | tests « REMBOURSEMENT », « LITIGE », « marquage » |
| 4 | Sessions expirées | `expires_at` à 30 min côté Stripe (le plancher), tenue à 15 min côté nous, plus `checkout.session.expired` en filet | test « la tenue expire à 15 min » |
| 5 | Ventes hors site | Rattachement par **prix Stripe** (`price_id`), jamais par id de lien de paiement. Un lien créé à la main par l'équipe pointe le même prix et consomme une place. Plus une prise de place manuelle (`/inscrire`) | test « vente hors site » ; `PRIX` indexe les 7 prix |
| 6 | Balayage borné à 2000 sessions | Aucun balayage dans le chemin de vente. Le balayage n'existe que dans la réconciliation, et il **lève** s'il n'atteint pas la fin de la liste plutôt que de rendre un inventaire partiel | `ventesStripe()` lève `inventaire incomplet` |
| 7 | Webhook manquant | Réconciliation avec Stripe toutes les 15 min (cron) + déclenchement manuel. Stripe est l'arbitre final | section 8 |
| 8 | Rejeu du webhook | Idempotence sur l'id de session Checkout (`confirmer` retrouve la réservation par `sessionId`), plus un journal des ids d'événement Stripe pour ne pas doubler la notification Slack | test « IDEMPOTENCE », vérifié aussi en SQLite réel |
| 9 | Double plafond du Plessis | Les deux plafonds testés à chaque prise, et `restantes` = min des deux | test « DOUBLE PLAFOND » |
| 10 | Quantité forcée à 1 | `QUANTITE = 1`, jamais lue depuis la requête | `sejour-checkout.js` |
| 11 | Doute = refus | Compteur injoignable, Stripe injoignable, Stripe qui refuse : **502 et pas de vente**. Si Stripe rate après la prise, la place est immédiatement rendue | vérifications d'intégration 6 et 7 (section 9) |

Les points 11 et 12 de l'audit d'origine (date limite du fractionné en Europe/Paris,
échéance impayée) **disparaissent** avec l'abandon du paiement en plusieurs fois.
La gestion de l'heure de Paris est conservée pour un seul usage : la vente d'un
séjour ferme à sa date de début, en heure française et non en UTC.

---

## 7. Stripe

### Produits et prix créés le 29/08/2026

Un produit par type de chambre, un prix comptant en **EUR** (le compte
« Jade Maa LLC » `acct_1SoctOBzUtKi0psW` est américain et par défaut en USD :
`currency=eur` est forcé sur chaque prix).

| Séjour | Chambre | Produit | Prix (actif) | Montant |
|---|---|---|---|---|
| manoir | partagee-5 | `prod_VA7E26aP1CiosP` | `price_1U9mzhBzUtKi0psWW7T4wfWh` | 119000 |
| manoir | duo-simple | `prod_VA7E59FNItTlRP` | `price_1U9mzjBzUtKi0psWnIccytyO` | 119000 |
| manoir | duo-double | `prod_VA7E5B9FXUUC4L` | `price_1U9mzlBzUtKi0psWIR2bPhdp` | 123000 |
| manoir | solo | `prod_VA7Eqnd9OXns10` | `price_1U9mzmBzUtKi0psW4BzBdxgF` | 128900 |
| plessis | partagee-3-6 | `prod_VA7EWoprWWyOry` | `price_1U9mzoBzUtKi0psWhZosMDFc` | 119000 |
| plessis | duo-simple | `prod_VA7EfCSef4hxIF` | `price_1U9mzpBzUtKi0psWeBwkjACg` | 123000 |
| plessis | solo | `prod_VA7ESPZmsK5SyO` | `price_1U9mzrBzUtKi0psWIPyUsxTU` | 128900 |

Chaque prix porte `metadata.origine = stock-sejours`, `metadata.sejour`,
`metadata.chambre`. C'est ce qui permet de retrouver une vente hors site.

**Un prix Stripe est immuable** : changer un tarif = créer un nouveau prix, mettre
son id dans `SEJOURS` (`_stock.js`) et désactiver l'ancien. Ne jamais éditer un prix
existant.

### Prix récurrents désactivés

7 prix mensuels avaient été créés le 29/08 pour le paiement en 2x/3x, avant
l'abandon de la fonctionnalité. Ils ont été **désactivés** (`active=false`,
`metadata.statut = abandonne-fractionne-29-08-2026`), pas supprimés :
`price_1U9mziBzUtKi0psWr5pcrBt9`, `price_1U9mzjBzUtKi0psWXtZuqEeX`,
`price_1U9mzlBzUtKi0psWkityXoOA`, `price_1U9mzmBzUtKi0psW89eY08zg`,
`price_1U9mzoBzUtKi0psW3q3AyNlH`, `price_1U9mzqBzUtKi0psWp1VBJevv`,
`price_1U9mzrBzUtKi0psWUhcuV6Mi`.

### Prix hérités, à ne PAS utiliser

Trois prix « Les retraites de Jade » créés avant ce chantier existent encore et ne
sont rattachés à rien : `price_1U9Ne3BzUtKi0psWu5COwfbp` (595 €/mois, créé par GHL),
`price_1U92XCBzUtKi0psWGZF5Xn2q` (1 289 €), `price_1U92WMBzUtKi0psWHhPUPwXa` (1 190 €).
Une vente passée par l'un d'eux **ne sera pas comptée automatiquement** : le
rattachement se fait par prix, et ces prix ne sont pas dans `PRIX`. Voir section 9.

### Webhook : événements à ajouter

L'endpoint `we_1U80pQBzUtKi0psWpSJyvV8u` (→ `https://jade-maa.com/api/stripe-webhook`)
n'écoute aujourd'hui que `checkout.session.completed`. **Il faut y ajouter trois
événements au moment du déploiement**, sinon une place remboursée restera vendue à vie :

```bash
curl -X POST https://api.stripe.com/v1/webhook_endpoints/we_1U80pQBzUtKi0psWpSJyvV8u \
  -u "$STRIPE_SECRET:" \
  -d "enabled_events[]=checkout.session.completed" \
  -d "enabled_events[]=checkout.session.expired" \
  -d "enabled_events[]=charge.refunded" \
  -d "enabled_events[]=charge.dispute.created"
```

### Version d'API

Le compte est encore sur une version antérieure à `2026-03-25.dahlia` : `ui_mode=embedded`
est la bonne valeur (vérifié en direct, `embedded_page` est refusé). **Si le compte est
un jour migré vers dahlia**, il faudra remplacer `embedded` par `embedded_page` dans
`sejour-checkout.js` **et** dans `create-checkout-session.js` (conférence), ainsi que
`stripe.initEmbeddedCheckout()` par `stripe.createEmbeddedCheckoutPage()` côté page.

---

## 8. Réconciliation

Stripe est l'arbitre final. Deux passes, dans `StockSejour.reconcilier()` :

**Passe A, les ventes que Stripe connaît et que nous ignorons.** Balayage borné des
Checkout Sessions `complete` depuis le 01/08/2026, avec `line_items` étendus. Toute
session portant l'un de nos 7 prix et payée est inscrite si elle nous manque. Couvre
le webhook perdu et le lien de paiement envoyé à la main.

**Passe B, les places que nous comptons vendues.** Chaque réservation `payee` est
soumise à Stripe une par une : session expirée → la place repart ; charge remboursée
en totalité → la place repart ; remboursement partiel → la réservation est marquée
pour traitement humain sans être libérée.

Règle : **aucune place n'est jamais libérée sur une simple absence dans l'inventaire.**
Si le balayage de la passe A n'atteint pas la fin de la liste, il lève, l'erreur est
reportée, et rien n'est ajouté. Un inventaire partiel ne doit pas pouvoir rouvrir une
place déjà vendue.

Tout dépassement constaté part en alerte Slack. Rien n'est jamais corrigé en douce.

### Déclenchement

Automatique : cron toutes les 15 minutes sur le worker (`[triggers] crons`).

Manuel :
```bash
curl -H "x-stock-secret: $STOCK_SECRET" \
  "https://jade-stock-sejours.<sous-domaine>.workers.dev/reconcilier?sejour=manoir"
```

### Autres routes d'exploitation (même en-tête `x-stock-secret`)

| Route | Effet |
|---|---|
| `GET /etat?sejour=manoir` | jauge complète |
| `GET /liste?sejour=manoir` | toutes les réservations, tous états |
| `POST /inscrire?sejour=manoir` `{chambre, sessionId?, nom?, email?, montant?}` | inscrit une place payée à la main (virement, place bloquée pour l'organisation, vente sur un prix hérité). Consomme une place **même si elle fait dépasser le quota** : compter en trop coûte une vente, compter en moins en vend une qui n'existe pas |
| `POST /liberer?sejour=manoir` `{reservationId, motif}` | rend une place (annulation traitée à la main) |
| `POST /prendre?sejour=manoir` `{chambre}` | prise de place sèche, sans paiement, pour vérifier le compteur sur un environnement déployé. La tenue expire seule au bout de 15 min |

Ce worker n'est pas une API publique : le site lui parle par binding, pas par HTTP.
Sans `STOCK_SECRET` correct, toutes ces routes répondent 403.

---

## 9. Déploiement

### 9.1 Déployer le worker du compteur

```bash
cd worker-stock
npx wrangler deploy
npx wrangler secret put STRIPE_KEY     # clé restreinte rk_live (vault Jade)
npx wrangler secret put STOCK_SECRET   # à générer, ex. openssl rand -hex 24
npx wrangler secret put SLACK_WEBHOOK_SEJOURS   # ou SLACK_WEBHOOK
```

### 9.2 Lier le Durable Object au projet Pages

**Par le dashboard, c'est le chemin recommandé ici** :
Workers & Pages → `jade-maa-site` → Settings → Bindings → Add → Durable Object
→ nom de variable `STOCK_SEJOURS`, namespace `StockSejour` du worker `jade-stock-sejours`.
Puis **redéployer** : un changement de binding ne prend effet qu'au déploiement suivant.

> **Ne pas créer de `wrangler.toml` à la racine du dépôt sans préparation.**
> Dès qu'un projet Pages a un fichier de configuration, ce fichier devient la source
> de vérité et les mêmes champs ne sont plus éditables dans le dashboard. Le projet
> a aujourd'hui toutes ses variables dans le dashboard (`GHL_PIT`, `STRIPE_KEY`,
> `STRIPE_WEBHOOK_SECRET`…). Si vous voulez quand même passer au fichier, faites-le
> proprement avec `npx wrangler pages download config`, puis ajoutez :
> ```toml
> [[durable_objects.bindings]]
> name = "STOCK_SEJOURS"
> class_name = "StockSejour"
> script_name = "jade-stock-sejours"   # obligatoire pour Pages, facultatif pour un Worker
> ```

### 9.3 Variables d'environnement du projet Pages

| Variable | Statut | Rôle |
|---|---|---|
| `STOCK_SEJOURS` | **nouveau (binding)** | le Durable Object du compteur |
| `STRIPE_KEY` | existant | clé restreinte `rk_live` |
| `STRIPE_WEBHOOK_SECRET` | existant | signature du webhook |
| `SLACK_WEBHOOK_SEJOURS` | **nouveau, facultatif** | canal dédié aux séjours |
| `SLACK_WEBHOOK` | **nouveau** | repli : le webhook « IG Agency Alertes » existant (valeur dans `connexions-interne.md`, section Slack) |
| `SEJOUR_RETURN_URL` | **nouveau, facultatif** | par défaut `https://jade-maa.com/sejour-merci?session_id={CHECKOUT_SESSION_ID}` |
| `GHL_PIT`, `GHL_LOCATION_ID`, `GHL_WORKFLOW_ID` | existants | inchangés |

L'URL du webhook Slack n'est **pas** écrite en dur dans le dépôt : un webhook Slack
est un secret, il se pose en variable comme une clé Stripe. Sans variable, la
notification est journalisée en erreur et la vente continue normalement.

### 9.4 Ajouter les événements Stripe

Voir section 7.

### 9.5 Amorcer le stock avant l'ouverture

**Point important, constaté le 29/08/2026 :** une place du Manoir est **déjà vendue
hors du site**. Un abonnement `sub_1U9P6yBzUtKi0psW6oINPTpK` (2 x 595 €, créé le
28/08 via GHL, `cancel_at` au 28/10) est actif au nom de `maevoutte_35@hotmail.fr`.
Il passe par le prix hérité `price_1U9Ne3BzUtKi0psWu5COwfbp`, donc **la
réconciliation ne le verra pas**.

Le compteur démarre à zéro. Si le site ouvre sans amorçage, le Manoir sera vendu
à **13 places pour 12**. Il faut inscrire cette place à la main avant l'ouverture,
après avoir demandé à Jade de quelle chambre il s'agit (1 190 € = `partagee-5`
ou `duo-simple`, Stripe ne le dit pas) :

```bash
curl -X POST -H "x-stock-secret: $STOCK_SECRET" -H 'Content-Type: application/json' \
  -d '{"chambre":"partagee-5","email":"maevoutte_35@hotmail.fr","nom":"maeva poirier","montant":119000,"origine":"hors-site-ghl"}' \
  "https://jade-stock-sejours.<sous-domaine>.workers.dev/inscrire?sejour=manoir"
```

Vérifier ensuite `/etat?sejour=manoir` : `vendues` doit valoir 1.

---

## 10. Limites résiduelles assumées

1. **Amorçage manuel.** Le compteur démarre vide. Toute vente antérieure passée par
   un prix hérité doit être inscrite à la main (section 9.5). Rien ne le fait tout seul.
2. **Ventes hors Stripe.** Un virement, un paiement en espèces, une place offerte :
   invisibles pour le système. Ils doivent passer par `/inscrire`.
3. **Prix hérités.** Une vente faite sur `price_1U9Ne3BzUtKi0psWu5COwfbp`,
   `price_1U92XCBzUtKi0psWGZF5Xn2q` ou `price_1U92WMBzUtKi0psWHhPUPwXa` ne sera pas
   comptée. Ces prix devraient être désactivés dans Stripe une fois le site en ligne.
   Ce n'est pas fait ici : ils peuvent être utilisés par un lien GHL encore en circulation.
4. **Fenêtre de 15 minutes.** Une cliente qui met plus de 15 minutes à payer voit sa
   place rendue au stock ; si elle paie quand même, la place lui est due et un
   dépassement peut apparaître. C'est le sens de l'alerte de surbooking : elle est
   signalée, un humain tranche, rien n'est remboursé automatiquement.
5. **Remboursement partiel.** La place reste prise et la réservation est marquée.
   Décision humaine, volontairement.
6. **Litige (`charge.dispute.created`).** La place est rendue tout de suite. Si le
   litige est gagné plus tard, la place a déjà pu être revendue. Choix assumé dans le
   sens de la prudence commerciale ; à revoir si le client préfère l'inverse.
7. **Jauge de la conférence inchangée.** `_places.js` compte toujours en balayant
   Stripe et souffre donc encore de la faille « place remboursée comptée à vie ».
   Hors périmètre de ce chantier, mais la faille est réelle.
8. **Pas d'email ni de contact GHL pour les séjours.** Le webhook ne fait, pour un
   séjour, que le décompte et la notification Slack. Aucun contact n'est créé dans
   GHL, aucun mail de confirmation n'est envoyé. À brancher si le client le veut.
9. **La page de retour n'existe pas.** `sejour-merci.html` doit être créée (ou
   `SEJOUR_RETURN_URL` pointé ailleurs), sinon la cliente atterrit sur un 404 après
   avoir payé.
10. **Un seul Durable Object par séjour, donc un seul point d'écriture.** Si la
    région de l'objet est indisponible, la vente est refusée plutôt que dégradée.
    C'est le comportement voulu, mais cela veut dire : pas de vente pendant une
    panne de l'objet.

---

## 11. Tests

```bash
cd worker-stock
npm test          # node --test test/*.test.mjs
```

41 tests, sans réseau et sans Cloudflare. La suite entière est jouée **deux fois** :
sur l'adaptateur mémoire et sur du **vrai SQLite** (`node:sqlite`), parce que c'est
SQLite qui tourne en production dans le Durable Object. Un test qui ne passerait que
sur la maquette ne prouverait rien.

Couvrent notamment : quotas par type, capacité globale, double plafond du Plessis,
expiration de la tenue, paiement tardif, idempotence du rejeu, vente hors site,
remboursement, litige, refus de libérer une place payée, marquage sans libération,
détection de surbooking, heures de Paris, fermeture de la vente, cohérence des prix
Stripe et des tarifs affichés.

**Les deux tests de concurrence** lancent 500 puis 800 prises de place entrelacées
dans la boucle d'événements et vérifient qu'on ne dépasse jamais ni le quota ni la
capacité. Ils échouent si quelqu'un rend la section critique asynchrone.

Vérification complémentaire faite à la main contre le vrai runtime Cloudflare
(`wrangler dev --local`, donc workerd et le vrai Durable Object) : 60 requêtes HTTP
simultanées sur une chambre à quota 2 → 2 acceptées, 58 refusées ; puis 200 requêtes
simultanées sur le Plessis → exactement 14 places prises, aucun plafond dépassé.
