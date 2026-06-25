const nodemailer = require('nodemailer');

function getTransport() {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
  }
  return null; // modo dev
}

async function sendVerificationEmail(to, name, link) {
  const subject = 'Confirme seu cadastro — Beleza Multi Marcas';
  const html =
    `<div style="font-family:Arial,sans-serif;color:#2B2B2B">` +
    `<h2 style="color:#B76E79">Beleza Multi Marcas</h2>` +
    `<p>Olá, ${name}!</p>` +
    `<p>Falta pouco para ativar sua conta. Confirme seu e-mail clicando no botão abaixo:</p>` +
    `<p><a href="${link}" style="display:inline-block;background:#B76E79;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Confirmar meu e-mail</a></p>` +
    `<p style="font-size:13px;color:#6B6B6B">Ou copie e cole no navegador: <br>${link}</p>` +
    `<p style="font-size:13px;color:#6B6B6B">Se você não criou esta conta, ignore este e-mail. O link expira em 24 horas.</p>` +
    `</div>`;
  const transport = getTransport();
  if (!transport) {
    console.log('\n[mailer:dev] Link de verificação para ' + to + ':\n  ' + link + '\n');
    return;
  }
  try {
    await transport.sendMail({ from: process.env.SMTP_USER, to, subject, html });
  } catch (e) {
    console.error('[mailer] falha ao enviar para ' + to + ':', e.message);
    console.log('[mailer] link (fallback): ' + link);
  }
}

module.exports = { sendVerificationEmail };
