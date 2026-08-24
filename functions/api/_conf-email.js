/* Contenu du mail de confirmation conférence Lyon (envoyé par GHL après paiement).
   Source éditable : portfolio/jade/emails/mail-confirmation-conference-lyon.html */

export const SUBJECT = 'Votre inscription à la conférence est confirmée · « Dans ma valise, il y a… »';

export const HTML = `<!DOCTYPE html>
<html lang="fr" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Votre inscription à la conférence est confirmée</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400..600;1,400..600&family=Lato:wght@400;700&family=Allison&display=swap');
  body{margin:0;padding:0;background:#FAF7F4;-webkit-text-size-adjust:100%}
  table{border-collapse:collapse}
  img{border:0;line-height:100%}
  a{color:#8A6553}
  @media only screen and (max-width:620px){
    .wrap{width:100%!important}
    .card{padding:34px 24px!important}
    .h1{font-size:30px!important}
    .info td{display:block!important;width:100%!important;padding:10px 0!important;text-align:center!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#FAF7F4;">
<!-- Préheader invisible -->
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">C'est confirmé : rendez-vous le samedi 7 novembre, de 13h à 17h, à Chassieu (Lyon Est).&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F4;">
  <tr>
    <td align="center" style="padding:44px 16px 56px;">
      <table role="presentation" class="wrap" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">

        <!-- Logo script -->
        <tr>
          <td align="center" style="padding:0 0 30px;">
            <a href="https://jade-maa.com" style="text-decoration:none;">
              <span style="font-family:'Allison','Snell Roundhand',cursive;font-size:44px;line-height:1;color:#5B4137;">Jade Maa</span>
            </a>
          </td>
        </tr>

        <!-- Carte principale -->
        <tr>
          <td class="card" style="background-color:#FFFEFC;border:1px solid #E7DDD6;border-radius:6px;padding:52px 56px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">

              <!-- Eyebrow -->
              <tr>
                <td align="center" style="font-family:'Lato',Helvetica,Arial,sans-serif;font-size:11px;letter-spacing:4px;text-transform:uppercase;color:#B97E63;padding-bottom:22px;">
                  « Dans ma valise, il y a… »
                </td>
              </tr>

              <!-- Titre -->
              <tr>
                <td align="center" class="h1" style="font-family:'Cormorant Garamond',Georgia,'Times New Roman',serif;font-weight:500;font-size:36px;line-height:1.2;color:#2E2A29;padding-bottom:18px;">
                  Votre inscription est <span style="font-style:italic;color:#8A6553;">confirmée</span>&nbsp;✨
                </td>
              </tr>

              <!-- Petit trait -->
              <tr>
                <td align="center" style="padding-bottom:30px;">
                  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="52" height="1" style="background-color:#B97E63;font-size:0;line-height:0;">&nbsp;</td></tr></table>
                </td>
              </tr>

              <!-- Intro -->
              <tr>
                <td style="font-family:'Lato',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.8;color:#575757;">
                  <p style="margin:0 0 22px;">Bonjour,</p>
                  <p style="margin:0 0 22px;">Votre inscription à la conférence «&nbsp;Dans ma valise, il y a…&nbsp;» est bien confirmée&nbsp;!</p>
                  <p style="margin:0 0 26px;">Merci pour votre confiance. Je suis très heureuse de vous retrouver pour ce temps d'exploration autour de soi, des émotions, des besoins, des limites et de la communication.</p>
                </td>
              </tr>

              <!-- Bloc infos pratiques -->
              <tr>
                <td style="padding:0 0 30px;">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F4;border:1px solid #E7DDD6;border-radius:6px;">
                    <tr class="info">
                      <td width="33%" align="center" style="padding:22px 12px;font-family:'Lato',Helvetica,Arial,sans-serif;border-right:1px solid #E7DDD6;">
                        <div style="font-size:20px;line-height:1;padding-bottom:8px;">📅</div>
                        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#B97E63;padding-bottom:6px;">Date</div>
                        <div style="font-size:14px;color:#3D3532;font-weight:700;">Samedi 7 novembre</div>
                      </td>
                      <td width="33%" align="center" style="padding:22px 12px;font-family:'Lato',Helvetica,Arial,sans-serif;border-right:1px solid #E7DDD6;">
                        <div style="font-size:20px;line-height:1;padding-bottom:8px;">🕐</div>
                        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#B97E63;padding-bottom:6px;">Horaires</div>
                        <div style="font-size:14px;color:#3D3532;font-weight:700;">De 13h à 17h</div>
                      </td>
                      <td width="34%" align="center" style="padding:22px 12px;font-family:'Lato',Helvetica,Arial,sans-serif;">
                        <div style="font-size:20px;line-height:1;padding-bottom:8px;">📍</div>
                        <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#B97E63;padding-bottom:6px;">Lieu</div>
                        <div style="font-size:14px;color:#3D3532;font-weight:700;">Hôtel &amp; Spa de Chassieu<br>Lyon Est</div>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>

              <!-- Section : quelques mots avant de venir -->
              <tr>
                <td style="font-family:'Lato',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.8;color:#575757;">
                  <p style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#2E2A29;">🧳&nbsp; Quelques mots avant de venir</p>
                  <p style="margin:0 0 16px;">Cette conférence est avant tout un temps pour s'arrêter, observer, comprendre et expérimenter.</p>
                  <p style="margin:0 0 16px;">Vous n'avez rien de particulier à préparer. Venez simplement avec votre curiosité, votre expérience et… votre valise&nbsp;! 😉</p>
                  <p style="margin:0 0 30px;">Nous explorerons ensemble plusieurs de ses compartiments&nbsp;: les émotions, les besoins, les limites et la communication, avec des notions, des échanges et des outils concrets à expérimenter dans votre quotidien.</p>
                </td>
              </tr>

              <!-- Section : le livre -->
              <tr>
                <td style="font-family:'Lato',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.8;color:#575757;">
                  <p style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#2E2A29;">📖&nbsp; Le livre de Jade Maa</p>
                  <p style="margin:0 0 16px;">Si vous souhaitez prolonger la réflexion après la conférence, vous aurez également la possibilité de découvrir et d'acheter sur place le livre de Jade Maa, «&nbsp;Des mots sur nos maux&nbsp;».</p>
                  <p style="margin:0 0 30px;">Et si vous possédez déjà le livre, vous pourrez bien sûr l'apporter avec vous pour le faire dédicacer sur place. ✍️</p>
                </td>
              </tr>

              <!-- Section : temps d'échange -->
              <tr>
                <td style="font-family:'Lato',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.8;color:#575757;">
                  <p style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#2E2A29;">💬&nbsp; Un temps d'échange pour terminer</p>
                  <p style="margin:0 0 16px;">La conférence se terminera par un temps d'échange, afin de pouvoir revenir ensemble sur ce qui aura été partagé, poser vos questions, partager vos réflexions ou simplement mettre des mots sur ce que cette après-midi aura pu faire émerger pour vous.</p>
                  <p style="margin:0 0 30px;">Ce sera un temps libre et convivial, dans lequel chacun pourra participer à son rythme.</p>
                </td>
              </tr>

              <!-- Section : et surtout -->
              <tr>
                <td style="font-family:'Lato',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.8;color:#575757;">
                  <p style="margin:0 0 12px;font-family:'Cormorant Garamond',Georgia,serif;font-size:22px;color:#2E2A29;">❤️&nbsp; Et surtout…</p>
                  <p style="margin:0 0 16px;">Ne cherchez pas à arriver avec une «&nbsp;valise parfaite&nbsp;».</p>
                  <p style="margin:0 0 16px;">Nous avons tous nos propres bagages, nos histoires, nos fonctionnements, nos ressources et parfois quelques affaires dont on ne sait plus très bien quoi faire.</p>
                  <p style="margin:0 0 16px;">Cette après-midi est simplement une invitation à regarder ce que nous emportons avec nous…</p>
                  <p style="margin:0 0 30px;">Et peut-être à repartir avec quelques clés pour avancer un peu plus léger.</p>
                </td>
              </tr>

              <!-- Clôture -->
              <tr>
                <td style="font-family:'Lato',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.8;color:#575757;">
                  <p style="margin:0 0 8px;color:#3D3532;"><strong style="font-weight:700;">Alors, rendez-vous le 7 novembre&nbsp;!</strong></p>
                  <p style="margin:0 0 30px;">J'ai hâte de partager ce moment avec vous.</p>
                  <p style="margin:0 0 4px;">À très bientôt,</p>
                </td>
              </tr>

              <!-- Signature -->
              <tr>
                <td style="padding-bottom:34px;">
                  <span style="font-family:'Allison','Snell Roundhand',cursive;font-size:40px;line-height:1;color:#B97E63;">Jade</span>
                </td>
              </tr>

            </table>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td align="center" style="padding:36px 20px 0;">
            <span style="font-family:'Allison','Snell Roundhand',cursive;font-size:26px;line-height:1;color:#8A6553;">À très vite.</span>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:16px 20px 0;font-family:'Lato',Helvetica,Arial,sans-serif;font-size:12px;color:#8A6553;">
            <a href="https://www.instagram.com/jade_maa_/" style="color:#8A6553;text-decoration:underline;">Instagram</a>
            &nbsp;·&nbsp;
            <a href="https://www.youtube.com/@Jade_maa" style="color:#8A6553;text-decoration:underline;">YouTube</a>
            &nbsp;·&nbsp;
            <a href="https://open.spotify.com/show/26oaeCXsMFOzNKTQeoOZuI" style="color:#8A6553;text-decoration:underline;">Le podcast</a>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:14px 20px 0;font-family:'Lato',Helvetica,Arial,sans-serif;font-size:11px;color:#A99C92;">
            © 2026 Jade Maa · <a href="https://jade-maa.com" style="color:#A99C92;text-decoration:underline;">jade-maa.com</a><br>
            Vous recevez cet email car vous êtes inscrit(e) à la conférence «&nbsp;Dans ma valise, il y a…&nbsp;» à Lyon.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;
