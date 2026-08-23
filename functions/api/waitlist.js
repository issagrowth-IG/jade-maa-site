/* Liste d'attente « La Bonne Méthode » — endpoint serveur.
   Appelé en cross-origin par la page du funnel GHL go.jade-maa.com/optin.
   POST /api/waitlist { prenom, email, site(honeypot), page }
   → upsert du contact GHL (sous-compte LBM) + tag + enrôlement API dans le
   workflow « optin sept to mail ». Remplace le webhook entrant GHL, qui est
   une Premium Action facturée au wallet (2026-08-23 : wallet vide → 422
   « Billing failure » sur chaque inscription). L'enrôlement par l'API n'est
   pas facturé.
   Env : GHL_PIT (secret), GHL_LOCATION_ID, GHL_WORKFLOW_ID. */

const GHL = 'https://services.leadconnectorhq.com';
const TAG = 'liste-attente-septembre';
const SOURCE = "Liste d'attente septembre";

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

export function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost({ request, env }) {
  if (!env.GHL_PIT || !env.GHL_LOCATION_ID) {
    console.error('waitlist: env GHL manquante');
    return json({ ok: false, error: 'config' }, 500);
  }

  let d;
  try { d = await request.json(); } catch { return json({ ok: false, error: 'corps' }, 400); }
  if (typeof d !== 'object' || d === null) return json({ ok: false, error: 'corps' }, 400);

  // Honeypot (le champ s'appelle « site » sur la page, « website » sur l'ancien brouillon).
  if (String(d.site ?? d.website ?? '').trim() !== '') {
    console.log('waitlist: honeypot déclenché');
    return json({ ok: true });
  }

  const s = v => (v == null ? '' : String(v)).trim().slice(0, 120);
  // Tolère les trois formes de payload qui ont existé sur cette page.
  const prenom = s(d.prenom || d.firstName || d.first_name);
  const email = s(d.email).toLowerCase();

  if (!prenom) return json({ ok: false, error: 'prenom' }, 400);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return json({ ok: false, error: 'email' }, 400);

  const headers = {
    'Authorization': `Bearer ${env.GHL_PIT}`,
    'Version': '2021-07-28',
    'Content-Type': 'application/json',
  };

  let up;
  try {
    up = await fetch(`${GHL}/contacts/upsert`, {
      method: 'POST', headers,
      body: JSON.stringify({ locationId: env.GHL_LOCATION_ID, firstName: prenom, email, source: SOURCE }),
    });
  } catch (e) {
    console.error('waitlist: GHL injoignable', e && e.message);
    return json({ ok: false, error: 'crm' }, 502);
  }
  if (!up.ok) {
    console.error('waitlist: upsert refusé', up.status, await up.text().catch(() => ''));
    return json({ ok: false, error: 'crm' }, 502);
  }

  const data = await up.json().catch(() => null);
  const id = data && data.contact && data.contact.id;
  if (!id) {
    console.error('waitlist: upsert sans id de contact');
    return json({ ok: true });
  }

  // Le contact est sauvé : tag et workflow sont en best-effort, tracés s'ils échouent.
  const tr = await fetch(`${GHL}/contacts/${id}/tags`, {
    method: 'POST', headers, body: JSON.stringify({ tags: [TAG] }),
  }).catch(() => null);
  if (!tr || !tr.ok) console.error('waitlist: tag non posé', tr && tr.status);

  if (env.GHL_WORKFLOW_ID) {
    const wf = await fetch(`${GHL}/contacts/${id}/workflow/${env.GHL_WORKFLOW_ID}`, {
      method: 'POST', headers, body: JSON.stringify({ eventStartTime: '' }),
    }).catch(() => null);
    if (!wf || !wf.ok) console.error('waitlist: enrôlement workflow raté', wf && wf.status, wf ? await wf.text().catch(() => '') : '');
  }

  return json({ ok: true });
}
