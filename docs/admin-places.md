# Gérer les places des séjours

Mode d'emploi de la page qui sert à suivre et à ajuster les places des deux séjours.
Écrit pour Sharon et Jade. Aucune compétence technique nécessaire.

---

## 1. À quoi sert cette page

Elle répond à quatre questions, en direct :

- Combien de places sont vendues, et combien il en reste.
- Qui est inscrite, avec ses coordonnées et son mode de paiement.
- Comment retirer des places de la vente en ligne (une invitée, un virement reçu à côté du site).
- Comment remettre une place en vente (une annulation, une place bloquée par erreur).

Ce que la page affiche est ce que le site propose. Si vous retirez deux places ici,
le site cesse immédiatement de les vendre.

---

## 2. Se connecter

Adresse : **jade-maa.com/admin.html**

Un seul mot de passe, partagé entre Sharon et Jade. Il est demandé à chaque nouvelle
session et reste valable **12 heures**. Passé ce délai, il faut le retaper.

Trois règles, sans exception :

1. **Ne transmettez ce lien et ce mot de passe à personne.** La page affiche les noms,
   les emails et les téléphones des clientes.
2. **Sur un ordinateur ou un téléphone partagé, cliquez sur « Fermer la session »**
   avant de quitter. Fermer l'onglet ne suffit pas.
3. Si vous vous êtes trompée plusieurs fois de mot de passe, la page vous fait patienter
   quelques minutes. C'est normal, c'est une protection.

---

## 3. Lire l'écran

En haut, deux onglets : **Le Manoir Ducey** (21 au 25 octobre) et **Le Plessis-Placy**
(18 au 22 novembre). Chaque onglet est un séjour indépendant.

### Les quatre chiffres

| Chiffre | Ce qu'il veut dire |
|---|---|
| **Places vendues** | Les inscriptions confirmées, plus les places que vous avez retirées de la vente. |
| **Paiement en cours** | Quelqu'un est en train de payer. La place est tenue, pas encore payée. Elle se libère toute seule si le paiement n'aboutit pas. |
| **Places restantes** | Ce qui est encore achetable sur le site, tout de suite. |
| **Capacité globale** | Le nombre total de personnes que la maison peut accueillir. |

### Le détail par type de chambre

Sous les chiffres, une carte par type de chambre. Deux lignes méritent une attention
particulière :

- **Libres sur ce type** : le nombre de lits encore inoccupés dans ce type de chambre.
- **Vendables maintenant** : ce qui peut réellement être vendu.

Ces deux nombres sont presque toujours identiques. Quand ils diffèrent, lisez le
paragraphe suivant.

### Le cas particulier du Plessis : deux plafonds

Au Plessis, les types de chambre totalisent **16 lits**, mais la maison ne peut accueillir
que **14 personnes**. Ce n'est pas une erreur, c'est voulu.

Conséquence : il peut rester des lits libres en chambre partagée alors que le séjour est
complet. C'est la **capacité globale qui commande**. Quand elle est atteinte, plus rien
n'est vendable, même s'il reste de la place dans une chambre.

La page le dit explicitement : un encadré « Deux plafonds sur ce séjour » est toujours
affiché, et un encadré rouge « Séjour complet » apparaît dès que les 14 places sont prises.
Sur la carte de la chambre concernée, vous lirez « Libres sur ce type 2 » et
« Vendables maintenant 0 ».

**Pour remettre un de ces lits en vente, il faut d'abord libérer une place ailleurs.**

---

## 4. Retirer des places de la vente

À utiliser quand une place est prise en dehors du site : une invitée de Jade, un virement
reçu par ailleurs, une place gardée pour quelqu'un.

1. Section **« Agir sur les places »**, carte de gauche.
2. Choisissez le type de chambre. Le menu indique combien de places sont vendables.
3. Indiquez combien de places.
4. Écrivez un **motif**. Il est obligatoire, et c'est ce qui vous permettra de comprendre
   dans trois semaines pourquoi cette place est bloquée. Soyez précise :
   « Invitée de Jade, place offerte » ou « Virement de Marie D. reçu le 12/09 ».
5. Cliquez sur **Bloquer ces places**, puis confirmez dans la fenêtre qui s'ouvre.

La place disparaît immédiatement de la vente. Elle apparaît dans la liste du bas, avec la
mention « Place bloquée » et votre motif.

Si le message « Il ne reste pas assez de places libres » s'affiche, c'est qu'il n'y a plus
assez de place dans ce type de chambre. Si c'est « La capacité globale est atteinte »,
c'est que la maison est pleine.

---

## 5. Remettre une place en vente

Deux chemins, selon le cas.

**Une place que vous aviez bloquée** : section « Agir sur les places », carte de droite.
Choisissez le type de chambre, le nombre, cliquez sur **Remettre en vente**, confirmez.

**L'inscription de quelqu'un qui annule** : descendez jusqu'à sa ligne dans la liste des
inscrites, cliquez sur **Libérer**, confirmez.

Dans les deux cas la place repart à la vente tout de suite.

> **Important** : libérer une place **ne rembourse personne**. Le remboursement se fait à la
> main dans Stripe. Cette page ne touche pas à l'argent et n'envoie aucun email.

---

## 6. Voir les inscrites et ajouter une note

La liste du bas donne, pour chaque personne : le nom, l'email, le téléphone, la chambre,
le montant, le mode de paiement et le statut, ainsi que la date d'inscription. Aujourd'hui les
séjours se paient en une fois : la colonne affiche « Intégral », ou « Hors ligne » pour une place
que vous avez retirée de la vente.

Les boutons ronds au-dessus de la liste filtrent l'affichage. Par défaut vous voyez
**« Places occupées »**, c'est-à-dire tout ce qui prend une place aujourd'hui. Le filtre
« Tout » ajoute les annulations et les places libérées.

Pour ajouter une note (une allergie, une demande particulière, un rappel), cliquez sur
**Ajouter une note** sur sa ligne, écrivez, enregistrez. La note s'affiche sous la ligne.
Elle est interne : la cliente ne la voit jamais.

---

## 7. Rafraîchir

En haut à droite, la page indique quand elle a été mise à jour pour la dernière fois.
Elle se rafraîchit toute seule environ toutes les 90 secondes, et jamais pendant que vous
êtes en train de taper.

Si la mention passe au rouge, l'information a plus de 10 minutes. Cliquez sur
**Rafraîchir**.

Sur téléphone, tout fonctionne à l'identique. Les colonnes deviennent des fiches empilées.

---

## 8. Ce que cette page ne fait pas

- Elle ne rembourse pas et ne prend pas de paiement.
- Elle n'envoie aucun email aux clientes.
- Elle ne change pas les prix ni les textes du site.
- Elle ne modifie pas le nom ou l'email d'une inscrite.
- Elle ne supprime jamais une ligne : une annulation reste visible dans le filtre
  « Annulées et libérées ».

---

## 9. Si quelque chose ne va pas

| Ce que vous voyez | Ce que ça veut dire |
|---|---|
| « Mot de passe incorrect » | Vérifiez la casse et les espaces. |
| « Trop de tentatives » | Attendez cinq minutes, puis réessayez. |
| « La session a expiré » | Les 12 heures sont passées. Retapez le mot de passe. |
| « Le stock n'a pas répondu » | Problème passager. Cliquez sur Rafraîchir. Si ça persiste, prévenez Issa. |
| « Cette ligne n'existe plus » | Quelqu'un a modifié la même chose en même temps. Rafraîchissez. |
| « La page n'est pas configurée » | Prévenez Issa, c'est un réglage serveur. |
| Un bandeau rouge « données de démonstration » | **Ne touchez à rien.** Les noms et les chiffres affichés sont inventés. Prévenez Issa tout de suite. |

En cas de doute sur un chiffre, **ne bloquez rien et ne libérez rien**. Prévenez Issa.
Un chiffre faux se corrige, une place vendue deux fois se règle beaucoup moins bien.

---

---

# Partie technique (Issa)

## Fichiers

| Fichier | Rôle |
|---|---|
| `admin.html` | La page. Aucune donnée, aucun script en ligne. |
| `assets/admin.css` | Styles, jetons repris de `assets/app.css`. |
| `assets/admin.js` | Toute la logique d'affichage. Ne connaît jamais le mot de passe. |
| `functions/api/admin-login.js` | Vérification du mot de passe, cookie de session, `verifieSession()`. |
| `functions/api/admin-stock.js` | Lecture et écriture des places. |

## Variables d'environnement Cloudflare Pages

| Variable | Obligatoire | Rôle |
|---|---|---|
| `ADMIN_PASSWORD` | oui | Le mot de passe partagé. À générer long et aléatoire, jamais réutilisé d'un autre service. |
| `ADMIN_SESSION_SECRET` | recommandé | Clé de signature des cookies de session. Si elle est absente, le mot de passe sert de clé : ça marche, mais changer le mot de passe déconnecte tout le monde. |

Les deux sont à créer en **secret** (chiffré), pas en variable en clair, et à définir sur
l'environnement de production comme sur les prévisualisations.

## Le branchement au moteur de stock

C'est fait. `functions/api/admin-stock.js` importe `SEJOURS`, `ETATS` et `stock()` depuis
`functions/api/_stock.js`, et bascule tout seul :

- **binding `STOCK_SEJOURS` présent** (production) : le moteur réel. Une seule fonction lit
  (`lisEtat`), une seule écrit (`ecrisMouvement`). Rien d'autre dans le fichier ne touche au stock.
- **binding absent** : un jeu de démonstration en mémoire, fait de lignes ayant exactement la
  forme de celles du moteur et passant par la même traduction. Il sert à ouvrir la page sans
  infrastructure. L'état renvoyé porte alors `demo: true` et la page affiche un bandeau rouge
  sans ambiguïté, pour qu'un binding mal configuré en production ne puisse jamais passer pour de
  vraies inscrites. Pour le supprimer, effacer le bloc « JEU DE DÉMONSTRATION » et les deux
  appels `demoLis` / `demoEcris`.

Le catalogue des séjours n'est pas dupliqué : il vient de `SEJOURS`. Une chambre ajoutée dans
`_stock.js` apparaît toute seule dans le back-office.

### Trois points de couture à connaître

**1. Une place bloquée est une ligne payée d'origine `blocage`.** Le moteur n'a que trois états
(`tenue`, `payee`, `liberee`) et n'a pas besoin d'un quatrième. Une place retirée de la vente est
donc posée par `confirmer({ chambre, montant: 0, origine: 'blocage' })`, puis son motif est écrit
par `marquer()`. Elle occupe une place, ne porte ni nom ni email, et se reconnaît partout à son
`origine`. `admin-stock.js` la retraduit en état `bloquee` pour l'écran.

**2. La garde de quota du blocage est indispensable.** `confirmer()` inscrit volontairement une
place même au delà du quota (une vente encaissée est due). Pour une vente c'est le bon choix ;
pour un blocage, ce serait un moyen de dépasser la capacité en silence. La vérification faite
dans `onRequestPost` avant l'écriture est donc la seule barrière. **Ne pas la retirer.** Les
demandes vraiment simultanées restent arbitrées par le Durable Object, qui n'exécute qu'une
requête à la fois.

**3. Le `restantes` du moteur est déjà borné par la capacité globale.** Au Plessis, la chambre
partagée peut afficher `restantes: 0` alors que son quota n'est pas atteint. L'écran a besoin des
deux nombres pour rendre le double plafond lisible, donc `assets/admin.js` recalcule le nombre de
lits libres du type (`quota - vendues - tenues`) et n'utilise `restantes` que pour ce qui est
réellement vendable. Si la sémantique de `restantes` change côté moteur, l'écran reste juste.

Un dernier détail : le moteur ne vend qu'au comptant, il n'a pas de champ `paiement`. La colonne
affiche « Intégral » pour une vente et « Hors ligne » pour un blocage. Si le paiement en plusieurs
fois revient un jour, il suffit que les lignes portent un champ `paiement` valant `2x` ou `3x` :
l'écran sait déjà les afficher.

## Points de sécurité

- Mot de passe comparé en temps constant, côté serveur uniquement.
- Cookie de session signé HMAC-SHA-256, `HttpOnly` + `Secure` + `SameSite=Strict`, 12 h.
- Origine vérifiée sur toutes les écritures, en plus du `SameSite=Strict`.
- `noindex,nofollow` sur la page, en-tête `Content-Security-Policy` restrictif.
- Aucune donnée nominative dans les journaux : seulement l'action, le séjour, la chambre.
- Tout ce qui vient du serveur est inséré via `textContent`, jamais en HTML.

Deux limites connues, à traiter le jour où ça compte :

1. Le freinage des tentatives de connexion est en mémoire d'isolate. Il ralentit, il ne
   verrouille pas. Un vrai plafond demanderait un KV Cloudflare.
2. `frame-ancestors` ne peut pas être posé depuis une balise `meta`. Pour interdire
   l'affichage de la page dans une iframe tierce, ajouter un fichier `_headers` à la
   racine du site avec `X-Frame-Options: DENY` sur `/admin.html`.
