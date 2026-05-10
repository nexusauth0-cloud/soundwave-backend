const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: 587, // Standard port for cloud hosting
  secure: false, // Must be false for port 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false // Prevents the connection from dropping
  }
});

const BRAND_COLOR = "#00e5a0";

function baseTemplate(content) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 0;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background:#111;border-radius:16px;border:1px solid #2a2a2a;">
        <tr>
          <td style="padding:32px 40px;background:linear-gradient(135deg,#001a0e,#0a0a0a);border-bottom:1px solid #2a2a2a;">
            <span style="font-size:22px;font-weight:800;color:${BRAND_COLOR};">◈ SoundWave</span>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;color:#f0f0f0;font-size:15px;line-height:1.7;">
            ${content}
          </td>
        </tr>
        <tr>
          <td style="padding:24px 40px;border-top:1px solid #2a2a2a;color:#555;font-size:12px;">
            SoundWave · Powered by NexusAuth · If you didn't request this, ignore it.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function btn(text, url) {
  return `<div style="margin:28px 0;">
    <a href="${url}" style="display:inline-block;padding:14px 32px;background:${BRAND_COLOR};color:#000;font-weight:700;font-size:15px;border-radius:30px;text-decoration:none;">${text}</a>
  </div>`;
}

async function sendVerificationEmail(email, token) {
  const url = `${process.env.FRONTEND_URL}/auth/verify-email?token=${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Verify your SoundWave email",
    html: baseTemplate(`
      <h2 style="font-size:24px;font-weight:800;margin:0 0 12px;color:#fff;">Verify your email 📬</h2>
      <p style="color:#aaa;">Click below to verify your email and access SoundWave.</p>
      ${btn("Verify Email", url)}
      <p style="color:#555;font-size:13px;">Link expires in 24 hours.</p>
    `),
  });
}

async function sendMagicLink(email, token) {
  const url = `${process.env.FRONTEND_URL}/auth/magic?token=${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Your SoundWave sign-in link",
    html: baseTemplate(`
      <h2 style="font-size:24px;font-weight:800;margin:0 0 12px;color:#fff;">Your magic link  ✨</h2>
      <p style="color:#aaa;">Click below to sign in. Expires in ${process.env.MAGIC_LINK_EXPIRES_MINUTES || 15} minutes.</p>
      ${btn("Sign in to SoundWave", url)}
    `),
  });
}

async function sendPasswordReset(email, token) {
  const url = `${process.env.FRONTEND_URL}/auth/reset-password?token=${token}`;
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Reset your SoundWave password",
    html: baseTemplate(`
      <h2 style="font-size:24px;font-weight:800;margin:0 0 12px;color:#fff;">Reset your password 🔐</h2>
      <p style="color:#aaa;">Click below to reset your password. Expires in 15 minutes.</p>
      ${btn("Reset Password", url)}
    `),
  });
}

async function sendWelcomeEmail(email, displayName) {
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Welcome to SoundWave 🎵",
    html: baseTemplate(`
      <h2 style="font-size:24px;font-weight:800;margin:0 0 12px;color:#fff;">Welcome, ${displayName || "friend"} 🎵</h2>
      <p style="color:#aaa;">Your account is verified and ready. Start listening!</p>
      ${btn("Start Listening", process.env.FRONTEND_URL)}
    `),
  });
}

module.exports = { sendVerificationEmail, sendMagicLink, sendPasswordReset, sendWelcomeEmail };

