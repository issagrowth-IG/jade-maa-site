/* Back-office des places des séjours (admin.html).
   Vanilla, sans dépendance. Trois principes :
   1. Le mot de passe n'existe jamais ici : il part au serveur et c'est tout.
   2. Rien n'est injecté en HTML. Toute donnée passe par textContent.
   3. Toute action qui retire ou remet une place demande une confirmation. */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  /* ---- État local ---- */
  var sejourActif = 'manoir';
  var etats = {};            // sejour -> dernier état connu
  var horodatage = null;     // date de la dernière lecture réussie
  var brouillon = {};        // ce que l'utilisatrice est en train de saisir
  var filtre = 'toutes';
  var enCours = false;

  var LIBELLES_PAIEMENT = {
    integral: 'Intégral', '2x': 'En 2 fois', '3x': 'En 3 fois',
    'hors-ligne': 'Hors ligne', virement: 'Virement',
  };
  var LIBELLES_ETAT = {
    payee: 'Inscrite', 'en-cours': 'Paiement en cours', bloquee: 'Place bloquée',
    annulee: 'Annulée', liberee: 'Libérée',
  };

  /* ============================================================
     Petits outils
     ============================================================ */

  function el(tag, cls, texte) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texte != null) n.textContent = String(texte);
    return n;
  }

  function cellule(k, valeur, cls) {
    var n = el('div', 'cell' + (cls ? ' ' + cls : ''));
    n.setAttribute('data-k', k);
    if (valeur != null) n.appendChild(document.createTextNode(String(valeur)));
    return n;
  }

  function euros(centimes) {
    var n = Number(centimes);
    if (!isFinite(n) || n <= 0) return 'Aucun';
    return (n / 100).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + ' €';
  }

  function dateCourte(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return 'Date inconnue';
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
  function heureCourte(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  function pluriel(n, sing, plur) { return n + ' ' + (Math.abs(n) > 1 ? plur : sing); }

  /* ============================================================
     Réseau
     ============================================================ */

  function api(chemin, options) {
    var o = options || {};
    o.credentials = 'same-origin';
    o.cache = 'no-store';
    return fetch(chemin, o).then(function (r) {
      return r.json().catch(function () { return null; }).then(function (d) {
        if (r.status === 401) { var e = new Error('auth'); e.auth = true; throw e; }
        if (!r.ok) { var x = new Error('http'); x.statut = r.status; x.corps = d; throw x; }
        return d;
      });
    });
  }

  function messageErreur(err) {
    if (!err) return "L'action n'a pas pu être enregistrée.";
    if (err.auth) return 'La session a expiré. Reconnecte-toi.';
    var c = err.corps || {};
    if (c.error === 'quota') {
      if (c.detail === 'type') return "Il ne reste pas assez de places libres sur ce type de chambre.";
      if (c.detail === 'global') return "La capacité globale du séjour est atteinte. Impossible de retirer plus de places.";
      if (c.detail === 'rien-a-liberer') return "Il n'y a pas autant de places bloquées à libérer sur ce type de chambre.";
      if (c.detail === 'deja-libre') return "Cette place est déjà libre.";
      return "Il ne reste pas assez de places.";
    }
    if (c.detail === 'introuvable') return "Cette ligne n'existe plus. Rafraîchis la page.";
    if (c.error === 'moteur') return "Le stock n'a pas répondu. Réessaye dans un instant.";
    if (c.error === 'config') return "La page n'est pas configurée côté serveur. Préviens Issa.";
    if (err.statut === 429) return 'Trop de tentatives. Attends quelques minutes.';
    return "L'action n'a pas pu être enregistrée.";
  }

  /* ============================================================
     Notification passagère
     ============================================================ */

  var minuteurNotif = null;
  function notifie(texte, echec) {
    var n = $('notif');
    n.textContent = texte;
    n.className = 'notif' + (echec ? ' echec' : '');
    n.hidden = false;
    clearTimeout(minuteurNotif);
    minuteurNotif = setTimeout(function () { n.hidden = true; }, 5200);
  }

  /* ============================================================
     Modale de confirmation
     ============================================================ */

  var modaleActive = null;

  function demande(opts) {
    var modale = $('modale');
    var champ = $('modale-champ');
    var zoneNote = $('modale-note');
    var erreur = $('modale-erreur');
    var ok = $('modale-ok');
    var annuler = $('modale-annuler');

    $('modale-titre').textContent = opts.titre;
    $('modale-txt').textContent = opts.texte;
    ok.textContent = opts.ok || 'Confirmer';
    ok.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-plein');
    erreur.hidden = true;
    erreur.textContent = '';
    champ.hidden = !opts.note;
    if (opts.note) zoneNote.value = opts.valeurNote || '';
    ok.disabled = false;
    annuler.disabled = false;
    modale.hidden = false;
    modaleActive = opts;
    (opts.note ? zoneNote : ok).focus();

    function ferme() {
      modale.hidden = true;
      modaleActive = null;
      ok.onclick = null;
      annuler.onclick = null;
      $('modale-fond').onclick = null;
    }

    function valide() {
      ok.disabled = true;
      annuler.disabled = true;
      erreur.hidden = true;
      Promise.resolve(opts.action(opts.note ? zoneNote.value : null))
        .then(function (msg) {
          ferme();
          notifie(msg || 'C’est enregistré.');
        })
        .catch(function (err) {
          if (err && err.auth) { ferme(); montreLogin('La session a expiré. Reconnecte-toi.'); return; }
          erreur.textContent = messageErreur(err);
          erreur.hidden = false;
          ok.disabled = false;
          annuler.disabled = false;
        });
    }

    ok.onclick = valide;
    annuler.onclick = ferme;
    $('modale-fond').onclick = ferme;
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && modaleActive && !$('modale-ok').disabled) $('modale-annuler').click();
  });

  /* ============================================================
     Rendu
     ============================================================ */

  function sommeQuotas(e) {
    return e.chambres.reduce(function (n, c) { return n + c.quota; }, 0);
  }
  function litsLibresParType(e) {
    return e.chambres.reduce(function (n, c) { return n + c.restantes; }, 0);
  }
  function bloqueesPar(e, chambreId) {
    return (e.reservations || []).filter(function (r) {
      return r.etat === 'bloquee' && (!chambreId || r.chambre === chambreId);
    }).length;
  }
  function chambreDe(e, id) {
    for (var i = 0; i < e.chambres.length; i++) if (e.chambres[i].id === id) return e.chambres[i];
    return null;
  }
  function nomChambre(e, id) {
    var c = chambreDe(e, id);
    return c ? c.libelle : id;
  }

  /* ---- Bandeau + chiffres globaux ---- */
  function blocEtat(e) {
    var b = el('section', 'bloc');
    b.appendChild(el('h2', 'bandeau-t', e.titre || nomSejour(e.sejour)));
    b.appendChild(el('p', 'bandeau-s', [e.dates, e.lieu].filter(Boolean).join(' · ')));

    var bloquees = bloqueesPar(e);
    var stats = el('div', 'stats');

    stats.appendChild(tuile('Places vendues', e.vendues,
      bloquees ? 'dont ' + pluriel(bloquees, 'bloquée', 'bloquées') + ' hors vente en ligne' : 'inscriptions confirmées'));
    stats.appendChild(tuile('Paiement en cours', e.tenues, 'places tenues, pas encore payées'));
    stats.appendChild(tuile('Places restantes', e.restantesGlobal,
      e.complet ? 'le séjour est complet' : 'vendables en ligne', e.complet));
    stats.appendChild(tuile('Capacité globale', e.capaciteGlobale, 'places dans la maison'));
    b.appendChild(stats);

    var quotas = sommeQuotas(e);
    var libres = litsLibresParType(e);

    if (quotas > e.capaciteGlobale) {
      var enc = el('div', 'encadre');
      enc.appendChild(el('p', 'encadre-t', 'Deux plafonds sur ce séjour'));
      enc.appendChild(el('p', null,
        'Les types de chambre totalisent ' + pluriel(quotas, 'lit', 'lits') + ' pour une capacité de '
        + pluriel(e.capaciteGlobale, 'place', 'places') + '. C’est voulu. C’est la capacité globale qui commande : '
        + 'quand elle est atteinte, plus rien ne peut être vendu, même s’il reste des lits libres sur un type de chambre.'));
      b.appendChild(enc);
    }

    if (e.complet) {
      var al = el('div', 'encadre encadre-alerte');
      al.appendChild(el('p', 'encadre-t', 'Séjour complet'));
      al.appendChild(el('p', null, libres > 0
        ? 'La capacité globale de ' + pluriel(e.capaciteGlobale, 'place', 'places') + ' est atteinte. Il reste '
          + pluriel(libres, 'lit libre', 'lits libres') + ' sur certains types de chambre, mais ils ne sont plus vendables : '
          + 'la maison est pleine. Pour en remettre un en vente, libère d’abord une place.'
        : 'La capacité globale de ' + pluriel(e.capaciteGlobale, 'place', 'places') + ' est atteinte et aucun lit n’est libre.'));
      b.appendChild(al);
    }
    return b;
  }

  function tuile(k, v, note, alerte) {
    var t = el('div', 'tuile' + (alerte ? ' tuile-alerte' : ''));
    t.appendChild(el('p', 'tuile-k', k));
    t.appendChild(el('p', 'tuile-v', v));
    if (note) t.appendChild(el('p', 'tuile-n', note));
    return t;
  }

  function nomSejour(id) {
    return id === 'plessis' ? 'Le jour d’après' : 'Revenir à l’essentiel';
  }

  /* ---- Détail par chambre ---- */
  function blocChambres(e) {
    var b = el('section', 'bloc');
    b.appendChild(el('h2', 'bloc-titre', 'Le détail par type de chambre'));

    e.chambres.forEach(function (c) {
      var carte = el('div', 'chambre');

      var tete = el('div', 'chambre-tete');
      var g = el('div');
      g.appendChild(el('span', 'chambre-nom', c.libelle));
      if (c.detail) g.appendChild(el('p', 'chambre-det', c.detail));
      tete.appendChild(g);
      tete.appendChild(el('span', 'chambre-prix', euros(c.prix) + ' par personne'));
      carte.appendChild(tete);

      var jauge = el('div', 'jauge');
      var jv = el('span', 'j-v');
      var jt = el('span', 'j-t');
      jv.style.setProperty('--v', pourcent(c.vendues, c.quota));
      jt.style.setProperty('--t', pourcent(c.tenues, c.quota));
      jauge.appendChild(jv); jauge.appendChild(jt);
      carte.appendChild(jauge);

      var bloquees = bloqueesPar(e, c.id);
      var vendables = Math.min(c.restantes, e.restantesGlobal);

      var ch = el('div', 'chiffres');
      ch.appendChild(chiffre('Quota', c.quota));
      ch.appendChild(chiffre('Vendues', c.vendues));
      if (bloquees) ch.appendChild(chiffre('Dont bloquées', bloquees, 'bloque'));
      ch.appendChild(chiffre('Paiement en cours', c.tenues));
      ch.appendChild(chiffre('Libres sur ce type', c.restantes));
      ch.appendChild(chiffre('Vendables maintenant', vendables, vendables === 0 ? 'plein' : null));
      carte.appendChild(ch);

      if (vendables < c.restantes) {
        carte.appendChild(el('p', 'chambre-note',
          'Plafond global atteint : ' + pluriel(c.restantes, 'lit libre', 'lits libres')
          + ' sur ce type, mais rien n’est vendable tant qu’une place n’est pas libérée.'));
      }
      b.appendChild(carte);
    });
    return b;
  }

  function pourcent(n, total) {
    if (!total) return '0%';
    return Math.max(0, Math.min(100, (n / total) * 100)).toFixed(2) + '%';
  }

  function chiffre(k, v, cls) {
    var n = el('span', 'chiffre' + (cls ? ' ' + cls : ''));
    n.appendChild(document.createTextNode(k + ' '));
    n.appendChild(el('b', null, v));
    return n;
  }

  /* ---- Formulaires : bloquer / libérer ---- */
  function blocActions(e) {
    var b = el('section', 'bloc');
    b.appendChild(el('h2', 'bloc-titre', 'Agir sur les places'));

    var grille = el('div', 'formulaires');
    grille.appendChild(formBloquer(e));
    grille.appendChild(formLiberer(e));
    b.appendChild(grille);
    return b;
  }

  function selectChambre(e, id, valeur, texteOption) {
    var s = document.createElement('select');
    s.className = 'champ';
    s.id = id;
    e.chambres.forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.id;
      o.textContent = c.libelle + ' (' + c.detail + ') · ' + texteOption(c);
      s.appendChild(o);
    });
    if (valeur) s.value = valeur;
    return s;
  }

  function ligneChamp(labelTexte, forId, controle) {
    var l = el('div', 'form-ligne');
    var lab = el('label', 'etiquette', labelTexte);
    lab.setAttribute('for', forId);
    l.appendChild(lab);
    l.appendChild(controle);
    return l;
  }

  function formBloquer(e) {
    var d = brouillon.bloquer || {};
    var carte = el('div', 'form-carte');
    carte.appendChild(el('h3', null, 'Retirer des places de la vente'));
    carte.appendChild(el('p', 'sous', 'Pour une invitée, un virement reçu à côté du site, une place gardée. Le motif est obligatoire.'));

    var sel = selectChambre(e, 'bloq-chambre', d.chambre, function (c) {
      return pluriel(Math.min(c.restantes, e.restantesGlobal), 'place vendable', 'places vendables');
    });
    carte.appendChild(ligneChamp('Type de chambre', 'bloq-chambre', sel));

    var qte = document.createElement('input');
    qte.className = 'champ'; qte.id = 'bloq-quantite'; qte.type = 'number';
    qte.min = '1'; qte.max = String(e.capaciteGlobale); qte.step = '1';
    qte.value = d.quantite || '1';
    carte.appendChild(ligneChamp('Combien de places', 'bloq-quantite', qte));

    var motif = document.createElement('input');
    motif.className = 'champ'; motif.id = 'bloq-motif'; motif.type = 'text';
    motif.maxLength = 200; motif.value = d.motif || '';
    motif.placeholder = 'Invitée de Jade, virement reçu le 12/09...';
    carte.appendChild(ligneChamp('Motif (obligatoire)', 'bloq-motif', motif));

    [sel, qte, motif].forEach(function (n) {
      n.addEventListener('input', function () {
        brouillon.bloquer = { chambre: sel.value, quantite: qte.value, motif: motif.value };
      });
    });

    var bouton = el('button', 'btn btn-plein btn-large', 'Bloquer ces places');
    bouton.type = 'button';
    bouton.id = 'btn-bloquer';
    bouton.addEventListener('click', function () {
      var quantite = parseInt(qte.value, 10);
      var m = motif.value.trim();
      if (!(quantite >= 1)) { notifie('Indique un nombre de places d’au moins 1.', true); qte.focus(); return; }
      if (m.length < 3) { notifie('Le motif est obligatoire.', true); motif.focus(); return; }

      demande({
        titre: 'Retirer ' + pluriel(quantite, 'place', 'places') + ' de la vente ?',
        texte: 'Chambre : ' + nomChambre(e, sel.value) + '. Motif : ' + m
          + '. Ces places ne seront plus proposées sur le site tant qu’elles ne sont pas libérées.',
        ok: 'Oui, bloquer',
        danger: true,
        action: function () {
          return envoie({ action: 'bloquer', sejour: e.sejour, chambre: sel.value, quantite: quantite, motif: m })
            .then(function () {
              brouillon.bloquer = null;
              return pluriel(quantite, 'place retirée', 'places retirées') + ' de la vente.';
            });
        },
      });
    });
    carte.appendChild(bouton);
    return carte;
  }

  function formLiberer(e) {
    var d = brouillon.liberer || {};
    var carte = el('div', 'form-carte');
    carte.appendChild(el('h3', null, 'Remettre des places bloquées en vente'));
    carte.appendChild(el('p', 'sous', 'Uniquement des places bloquées. Pour annuler l’inscription d’une personne, utilise le bouton Libérer sur sa ligne, plus bas.'));

    var sel = selectChambre(e, 'lib-chambre', d.chambre, function (c) {
      return pluriel(bloqueesPar(e, c.id), 'place bloquée', 'places bloquées');
    });
    carte.appendChild(ligneChamp('Type de chambre', 'lib-chambre', sel));

    var qte = document.createElement('input');
    qte.className = 'champ'; qte.id = 'lib-quantite'; qte.type = 'number';
    qte.min = '1'; qte.max = String(e.capaciteGlobale); qte.step = '1';
    qte.value = d.quantite || '1';
    carte.appendChild(ligneChamp('Combien de places', 'lib-quantite', qte));

    [sel, qte].forEach(function (n) {
      n.addEventListener('input', function () {
        brouillon.liberer = { chambre: sel.value, quantite: qte.value };
      });
    });

    var bouton = el('button', 'btn btn-ligne btn-large', 'Remettre en vente');
    bouton.type = 'button';
    bouton.id = 'btn-liberer';
    bouton.addEventListener('click', function () {
      var quantite = parseInt(qte.value, 10);
      if (!(quantite >= 1)) { notifie('Indique un nombre de places d’au moins 1.', true); qte.focus(); return; }
      demande({
        titre: 'Remettre ' + pluriel(quantite, 'place', 'places') + ' en vente ?',
        texte: 'Chambre : ' + nomChambre(e, sel.value) + '. Ces places redeviennent achetables sur le site immédiatement.',
        ok: 'Oui, remettre en vente',
        action: function () {
          return envoie({ action: 'liberer', sejour: e.sejour, chambre: sel.value, quantite: quantite })
            .then(function () {
              brouillon.liberer = null;
              return pluriel(quantite, 'place remise', 'places remises') + ' en vente.';
            });
        },
      });
    });
    carte.appendChild(bouton);
    return carte;
  }

  /* ---- Liste des inscrites ---- */
  var FILTRES = [
    { id: 'toutes', t: 'Tout' },
    { id: 'payee', t: 'Inscrites' },
    { id: 'en-cours', t: 'Paiement en cours' },
    { id: 'bloquee', t: 'Places bloquées' },
    { id: 'sorties', t: 'Annulées et libérées' },
  ];

  function blocResas(e) {
    var b = el('section', 'bloc');
    b.appendChild(el('h2', 'bloc-titre', 'Les inscrites'));

    var barre = el('div', 'filtres');
    FILTRES.forEach(function (f) {
      var bt = el('button', 'filtre', f.t);
      bt.type = 'button';
      bt.setAttribute('aria-pressed', String(filtre === f.id));
      bt.addEventListener('click', function () { filtre = f.id; rendPanneau(); });
      barre.appendChild(bt);
    });
    b.appendChild(barre);

    var lignes = (e.reservations || []).filter(function (r) {
      if (filtre === 'toutes') return true;
      if (filtre === 'sorties') return r.etat === 'annulee' || r.etat === 'liberee';
      return r.etat === filtre;
    }).sort(function (a, z) { return String(z.cree).localeCompare(String(a.cree)); });

    var entete = el('div', 'resa-tete');
    ['Inscrite', 'Téléphone', 'Chambre', 'Montant', 'Paiement', 'Statut', 'Inscrite le', ''].forEach(function (t) {
      entete.appendChild(el('div', null, t));
    });
    b.appendChild(entete);

    if (!lignes.length) {
      b.appendChild(el('p', 'resa-vide', 'Aucune ligne dans cette vue.'));
      return b;
    }
    lignes.forEach(function (r) { b.appendChild(ligneResa(e, r)); });
    return b;
  }

  function ligneResa(e, r) {
    var n = el('article', 'resa');

    var cNom = cellule('Inscrite', null);
    var titre = el('span', 'cell-nom', r.nom || (r.etat === 'bloquee' ? 'Place bloquée' : 'Sans nom'));
    cNom.appendChild(titre);
    if (r.email) titre.appendChild(el('span', 'cell-sous', r.email));
    n.appendChild(cNom);

    n.appendChild(cellule('Téléphone', r.telephone || 'Non renseigné'));

    var cCh = cellule('Chambre', null);
    cCh.appendChild(document.createTextNode(nomChambre(e, r.chambre)));
    var det = chambreDe(e, r.chambre);
    if (det && det.detail) cCh.appendChild(el('span', 'cell-sous', det.detail));
    n.appendChild(cCh);

    n.appendChild(cellule('Montant', euros(r.montant)));
    n.appendChild(cellule('Paiement', LIBELLES_PAIEMENT[r.paiement] || 'Non renseigné'));

    var cEtat = cellule('Statut', null);
    cEtat.appendChild(el('span', 'pastille p-' + String(r.etat).replace(/[^a-z-]/g, ''), LIBELLES_ETAT[r.etat] || r.etat));
    n.appendChild(cEtat);

    var cDate = cellule('Inscrite le', dateCourte(r.cree));
    var h = heureCourte(r.cree);
    if (h) cDate.appendChild(el('span', 'cell-sous', h));
    n.appendChild(cDate);

    var actions = el('div', 'cell cell-actions');
    var bNote = el('button', 'btn btn-ligne btn-mini', r.note ? 'Modifier la note' : 'Ajouter une note');
    bNote.type = 'button';
    bNote.setAttribute('data-note', r.id);
    bNote.addEventListener('click', function () { ouvreNote(e, r); });
    actions.appendChild(bNote);

    var occupe = r.etat === 'payee' || r.etat === 'en-cours' || r.etat === 'bloquee';
    if (occupe) {
      var bLib = el('button', 'btn btn-danger btn-mini', 'Libérer');
      bLib.type = 'button';
      bLib.setAttribute('data-liberer', r.id);
      bLib.addEventListener('click', function () { ouvreLiberation(e, r); });
      actions.appendChild(bLib);
    }
    n.appendChild(actions);

    var texteNote = r.etat === 'bloquee' ? (r.motif || r.note) : r.note;
    if (texteNote) {
      n.appendChild(el('p', 'cell-note', (r.etat === 'bloquee' ? 'Motif : ' : 'Note : ') + texteNote));
    }
    return n;
  }

  function ouvreNote(e, r) {
    demande({
      titre: 'Note sur ' + (r.nom || 'cette place'),
      texte: 'Cette note reste interne. Elle est visible par Sharon et Jade uniquement.',
      ok: 'Enregistrer la note',
      note: true,
      valeurNote: r.note || '',
      action: function (valeur) {
        return envoie({ action: 'note', sejour: e.sejour, reservationId: r.id, note: String(valeur || '').slice(0, 600) })
          .then(function () { return 'Note enregistrée.'; });
      },
    });
  }

  function ouvreLiberation(e, r) {
    var estBloquee = r.etat === 'bloquee';
    demande({
      titre: estBloquee ? 'Remettre cette place en vente ?' : 'Libérer la place de ' + (r.nom || 'cette inscrite') + ' ?',
      texte: estBloquee
        ? 'Chambre : ' + nomChambre(e, r.chambre) + '. La place redevient achetable sur le site immédiatement.'
        : 'Chambre : ' + nomChambre(e, r.chambre) + '. La ligne passera en annulée et la place repartira à la vente. '
          + 'Le remboursement, lui, se fait à la main dans Stripe : cet écran n’y touche pas.',
      ok: estBloquee ? 'Oui, remettre en vente' : 'Oui, libérer la place',
      danger: true,
      action: function () {
        return envoie({ action: 'liberer', sejour: e.sejour, reservationId: r.id })
          .then(function () { return estBloquee ? 'Place remise en vente.' : 'Place libérée.'; });
      },
    });
  }

  /* ============================================================
     Chargement et écriture
     ============================================================ */

  function envoie(corps) {
    return api('/api/admin-stock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(corps),
    }).then(function (d) {
      if (d && d.etat) {
        etats[d.etat.sejour] = d.etat;
        horodatage = new Date();
        rendPanneau();
        rendMaj();
      } else {
        charge(corps.sejour);
      }
      return d;
    });
  }

  function charge(sejour, silencieux) {
    if (enCours) return Promise.resolve();
    enCours = true;
    if (!silencieux) $('erreur-globale').hidden = true;
    return api('/api/admin-stock?sejour=' + encodeURIComponent(sejour))
      .then(function (d) {
        etats[sejour] = d;
        horodatage = new Date();
        montreAdmin();
        rendPanneau();
        rendMaj();
      })
      .catch(function (err) {
        if (err && err.auth) { montreLogin(); return; }
        if (!silencieux) {
          var z = $('erreur-globale');
          z.textContent = messageErreur(err);
          z.hidden = false;
          montreAdmin();
        }
      })
      .then(function () { enCours = false; });
  }

  function rendPanneau() {
    var p = $('panneau');
    p.textContent = '';
    var e = etats[sejourActif];
    if (!e) { p.appendChild(el('p', 'chargement', 'Lecture des places en cours.')); return; }
    p.appendChild(blocEtat(e));
    p.appendChild(blocChambres(e));
    p.appendChild(blocActions(e));
    p.appendChild(blocResas(e));
  }

  function rendMaj() {
    var z = $('maj');
    if (!horodatage) { z.textContent = 'Jamais mis à jour'; return; }
    var minutes = Math.floor((Date.now() - horodatage.getTime()) / 60000);
    var quand = minutes < 1 ? "à l'instant" : minutes === 1 ? 'il y a 1 minute' : 'il y a ' + minutes + ' minutes';
    z.textContent = 'Mis à jour ' + quand + ' · ' + heureCourte(horodatage.toISOString());
    z.className = 'maj' + (minutes >= 10 ? ' vieux' : '');
  }

  /* ============================================================
     Bascule des écrans
     ============================================================ */

  function montreAdmin() {
    $('ecran-attente').hidden = true;
    $('ecran-login').hidden = true;
    $('ecran-admin').hidden = false;
  }

  function montreLogin(message) {
    etats = {};              // on ne laisse pas de données de clientes en mémoire
    brouillon = {};
    horodatage = null;
    $('panneau').textContent = '';
    $('ecran-attente').hidden = true;
    $('ecran-admin').hidden = true;
    $('ecran-login').hidden = false;
    var z = $('login-erreur');
    if (message) { z.textContent = message; z.hidden = false; } else { z.hidden = true; }
    var champ = $('motDePasse');
    champ.value = '';
    champ.focus();
  }

  /* ============================================================
     Démarrage
     ============================================================ */

  $('form-login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var bouton = $('btn-login');
    var zone = $('login-erreur');
    var motDePasse = $('motDePasse').value;
    if (!motDePasse) return;
    bouton.disabled = true;
    zone.hidden = true;

    api('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ motDePasse: motDePasse }),
    }).then(function () {
      $('motDePasse').value = '';
      return charge(sejourActif);
    }).catch(function (err) {
      zone.textContent = (err && err.auth) ? 'Mot de passe incorrect.' : messageErreur(err);
      zone.hidden = false;
      $('motDePasse').value = '';
      $('motDePasse').focus();
    }).then(function () { bouton.disabled = false; });
  });

  $('btn-refresh').addEventListener('click', function () { charge(sejourActif); });

  $('btn-logout').addEventListener('click', function () {
    api('/api/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'deconnexion' }),
    }).catch(function () {}).then(function () { montreLogin('Session fermée.'); });
  });

  Array.prototype.forEach.call($('onglets').querySelectorAll('.onglet'), function (bt) {
    bt.addEventListener('click', function () {
      sejourActif = bt.getAttribute('data-sejour');
      filtre = 'toutes';
      brouillon = {};
      Array.prototype.forEach.call($('onglets').querySelectorAll('.onglet'), function (autre) {
        if (autre === bt) autre.setAttribute('aria-current', 'true');
        else autre.removeAttribute('aria-current');
      });
      rendPanneau();
      charge(sejourActif);
    });
  });

  // Rafraîchissement discret. Jamais pendant une confirmation ni pendant une saisie.
  setInterval(function () {
    if (!$('ecran-admin').hidden && !modaleActive && !estEnSaisie()) charge(sejourActif, true);
  }, 90000);
  setInterval(rendMaj, 20000);

  function estEnSaisie() {
    var a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
  }

  // Le serveur renvoie ici avec ?e=1 quand le formulaire a été posté sans JavaScript.
  if (/[?&]e=1/.test(location.search)) montreLogin('Mot de passe incorrect.');

  charge(sejourActif);
})();
