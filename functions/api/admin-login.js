/* Ouverture / fermeture de session du back-office des places.

   POST /api/admin-login  { motDePasse }            → pose le cookie de session
   POST /api/admin-login  { action:"deconnexion" }  → efface le cookie

   Le mot de passe partagé (Sharon + Jade) vit UNIQUEMENT dans la variable
   d'environnement ADMIN_PASSWORD, côté Cloudflare. Il n'est jamais envoyé au
   navigateur, jamais écrit dans le JavaScript de la page, jamais journalisé.

   La session est un cookie signé (HMAC-SHA-256), HttpOnly + Secure +
   SameSite=Strict, valable 12 h. Le cookie ne contient aucune donnée : juste
   une date d'expiration, un aléa, et la signature. Impossible à fabriquer sans
   la clé, impossible à lire par le JavaScript de la page.

   Variables d'environnement :
     ADMIN_PASSWORD        (obligatoire) le mot de passe partagé
     ADMIN_SESSION_SECRET  (recommandé)  clé de signature des cookies.
                           Si absente, on signe avec ADMIN_PASSWORD : ça marche,
                           mais changer le mot de passe déconnecte tout le monde.

   Ce fichier exporte aussi verifieSession() : admin-stock.js s'en sert pour
   garder une seule implémentation de la session dans le projet. */

const COOKIE = 'jm_admin';
const DUREE = 12 * 60 * 60; // 12 h, en secondes
const enc = new TextEncoder();

const json = (b, s = 200) => new Response(JSON.stringify(b), {
  status: s,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

/* ---- Outils cryptographiques ------------------------------------------- */

const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function cleSignature(env) {
  const secret = env.ADMIN_SESSION_SECRET || env.ADMIN_PASSWORD;
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
}

async function signe(env, message) {
  return b64u(await crypto.subtle.sign('HMAC', await cleSignature(env), enc.encode(message)));
}

/* Comparaison à temps constant. On hache les deux chaînes d'abord : les
   condensats font toujours 32 octets, la boucle ne dépend donc ni du contenu
   ni de la longueur de ce que l'appelant a envoyé. */
async function egalTempsConstant(a, b) {
  const [x, y] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b))),
  ]);
  const u = new Uint8Array(x), v = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < 32; i++) diff |= u[i] ^ v[i];
  return diff === 0;
}

/* ---- Session ------------------------------------------------------------ */

async function creeJeton(env) {
  const exp = Math.floor(Date.now() / 1000) + DUREE;
  const alea = b64u(crypto.getRandomValues(new Uint8Array(12)));
  const corps = `${exp}.${alea}`;
  return `${corps}.${await signe(env, corps)}`;
}

function litCookie(request) {
  const brut = request.headers.get('Cookie') || '';
  for (const morceau of brut.split(';')) {
    const s = morceau.trim();
    if (s.startsWith(`${COOKIE}=`)) return s.slice(COOKIE.length + 1);
  }
  return null;
}

/* true seulement si le cookie est présent, correctement signé et non expiré. */
export async function verifieSession(request, env) {
  if (!env || !env.ADMIN_PASSWORD) return false;
  const jeton = litCookie(request);
  if (!jeton) return false;

  const p = jeton.split('.');
  if (p.length !== 3) return false;

  const attendu = await signe(env, `${p[0]}.${p[1]}`);
  if (!(await egalTempsConstant(attendu, p[2]))) return false;

  const exp = Number(p[0]);
  return Number.isFinite(exp) && exp > Math.floor(Date.now() / 1000);
}

/* Refuse les POST venus d'un autre site (le cookie est déjà en SameSite=Strict,
   ceci est la deuxième serrure). Une requête sans en-tête Origin est acceptée :
   certains clients n'en envoient pas. */
export function origineEtrangere(request) {
  const origine = request.headers.get('Origin');
  if (!origine) return false;
  try {
    return new URL(origine).host !== new URL(request.url).host;
  } catch {
    return true;
  }
}

const poseCookie = (jeton) =>
  `${COOKIE}=${jeton}; Path=/; Max-Age=${DUREE}; HttpOnly; Secure; SameSite=Strict`;
const effaceCookie = () =>
  `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

/* ---- Freinage des essais répétés ---------------------------------------
   Compteur en mémoire de l'isolate : c'est un ralentisseur, pas un verrou.
   Cloudflare peut créer plusieurs isolates en parallèle, donc un attaquant
   déterminé passera à travers. Le vrai rempart reste un mot de passe long.
   (Un verrou global demanderait un KV, hors périmètre de ce fichier.) */
const essais = new Map();
const FENETRE = 10 * 60 * 1000;
const MAX_ESSAIS = 10;

function tropDEssais(cle) {
  const maintenant = Date.now();
  const e = essais.get(cle);
  if (!e || maintenant - e.debut > FENETRE) return false;
  return e.n >= MAX_ESSAIS;
}
function noteEchec(cle) {
  const maintenant = Date.now();
  const e = essais.get(cle);
  if (!e || maintenant - e.debut > FENETRE) essais.set(cle, { debut: maintenant, n: 1 });
  else e.n++;
  if (essais.size > 500) essais.clear(); // garde-fou mémoire
}

const attends = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---- Point d'entrée ----------------------------------------------------- */

export async function onRequestPost({ request, env }) {
  if (origineEtrangere(request)) return json({ error: 'requete' }, 400);

  if (!env.ADMIN_PASSWORD) {
    console.error('admin-login: ADMIN_PASSWORD absente de la configuration');
    return json({ error: 'config' }, 500);
  }

  // Le corps arrive en JSON (page normale) ou en formulaire (page sans JS).
  const type = request.headers.get('Content-Type') || '';
  const formulaire = type.includes('application/x-www-form-urlencoded');
  let d = {};
  try {
    if (formulaire) {
      const f = await request.formData();
      d = { motDePasse: f.get('motDePasse'), action: f.get('action') };
    } else {
      d = await request.json();
    }
  } catch {
    return json({ error: 'requete' }, 400);
  }
  if (typeof d !== 'object' || d === null) return json({ error: 'requete' }, 400);

  if (d.action === 'deconnexion') {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': effaceCookie() },
    });
  }

  const motDePasse = typeof d.motDePasse === 'string' ? d.motDePasse : '';
  const cle = request.headers.get('CF-Connecting-IP') || 'inconnu'; // jamais journalisée

  if (tropDEssais(cle)) {
    console.log('admin-login: trop de tentatives, essai refusé');
    await attends(600);
    return json({ error: 'trop' }, 429);
  }

  if (!motDePasse || motDePasse.length > 200 || !(await egalTempsConstant(motDePasse, env.ADMIN_PASSWORD))) {
    noteEchec(cle);
    console.log('admin-login: mot de passe refusé');
    await attends(400); // ralentit l'essai en rafale
    if (formulaire) return new Response(null, { status: 303, headers: { Location: '/admin.html?e=1', 'Cache-Control': 'no-store' } });
    return json({ error: 'refus' }, 401);
  }

  console.log('admin-login: session ouverte');
  const jeton = await creeJeton(env);
  if (formulaire) {
    return new Response(null, {
      status: 303,
      headers: { Location: '/admin.html', 'Cache-Control': 'no-store', 'Set-Cookie': poseCookie(jeton) },
    });
  }
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Set-Cookie': poseCookie(jeton) },
  });
}
