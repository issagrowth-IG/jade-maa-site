/* Contenu du mail de confirmation de l'atelier caritatif (envoyé par GHL après paiement).
   Source éditable : portfolio/jade/evenements/atelier-solidaire/mail-confirmation.html
   Le lien d'accès est celui de la salle WebinarJam. */

export const SUBJECT = 'Votre place est réservée · rendez-vous jeudi 3 septembre à 21h';

export const LIEN = 'https://event.webinarjam.com/wql1x1/go/live/pkz5x5umigs6sq';

export const HTML = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<title>Votre place est réservée</title>
</head>
<body style="margin:0;padding:0;background:#FAF7F4;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#FAF7F4;">
<tr><td align="center" style="padding:40px 16px;">

  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;">

    <tr><td align="center" style="padding:0 0 22px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:3px;text-transform:uppercase;color:#8A6553;font-weight:bold;">Paiement confirmé</div>
    </td></tr>

    <tr><td align="center" style="padding:0 0 20px;">
      <div style="font-family:Georgia,'Cormorant Garamond',serif;font-size:34px;line-height:1.2;color:#2E2A29;font-weight:normal;">Merci, votre place <i style="color:#8A6553;">est réservée</i>.</div>
    </td></tr>

    <tr><td align="center" style="padding:0 0 34px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.7;color:#3D3532;max-width:460px;">Votre participation a bien été reçue, et elle sera intégralement reversée. Voici votre lien d'accès à l'atelier.</div>
    </td></tr>

    <tr><td style="padding:0 0 26px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1ED;border:1px solid #E7DDD6;">
        <tr><td align="center" style="padding:24px 20px;">
          <div style="font-family:Georgia,'Cormorant Garamond',serif;font-size:26px;line-height:1.25;color:#2E2A29;">Jeudi 3 septembre</div>
          <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2.6px;text-transform:uppercase;color:#8A6553;font-weight:bold;padding-top:10px;">21h &middot; en ligne</div>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:0 0 34px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;border:1px solid #E7DDD6;">
        <tr><td align="center" style="padding:32px 26px;">

          <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;letter-spacing:2.6px;text-transform:uppercase;color:#8A6553;font-weight:bold;padding-bottom:18px;">Votre lien d'accès</div>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#F5F1ED;border:1px solid #E7DDD6;">
            <tr><td align="center" style="padding:16px 14px;">
              <a href="${'REPLACE_LIEN'}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#5B4137;text-decoration:none;word-break:break-all;">REPLACE_LIEN</a>
            </td></tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 0;">
            <tr><td align="center" style="background:#8A5A44;">
              <a href="REPLACE_LIEN" style="display:inline-block;padding:16px 34px;font-family:Arial,Helvetica,sans-serif;font-size:13px;letter-spacing:1.6px;text-transform:uppercase;color:#ffffff;text-decoration:none;">Ouvrir l'atelier</a>
            </td></tr>
          </table>

        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:0 6px 10px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.75;color:#3D3532;">
        <p style="margin:0 0 18px;"><b style="color:#2E2A29;">Gardez ce lien près de vous.</b> C'est lui qui ouvrira l'atelier jeudi soir. Le plus simple est de garder cet email sous la main.</p>
        <p style="margin:0 0 18px;"><b style="color:#2E2A29;">Jeudi soir, il n'y a rien d'autre à faire.</b> Vous cliquez sur ce lien à 21h et vous entrez directement. Rien à installer, rien à créer.</p>
        <p style="margin:0;"><b style="color:#2E2A29;">Connectez-vous quelques minutes en avance.</b> Cela vous laisse le temps de vous installer au calme avant 21h.</p>
      </div>
    </td></tr>

    <tr><td align="center" style="padding:40px 0 0;border-top:1px solid #E7DDD6;margin-top:30px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#3D3532;padding-top:34px;">À très vite,</div>
      <div style="font-family:Georgia,serif;font-style:italic;font-size:26px;color:#8A6553;padding-top:6px;">Jade</div>
    </td></tr>

  </table>

</td></tr>
</table>
</body>
</html>`.replace(/REPLACE_LIEN/g, LIEN);
