const nodemailer = require("nodemailer");

/**
 * NEXUSAUTH EMAIL SERVICE
 * Optimized for Render + Gmail
 */
const transporter = nodemailer.createTransport({
  service: 'gmail', // Uses Gmail's internal settings automatically
  host: 'smtp.gmail.com',
  port: 587,
  secure: false, // Must be false for port 587
  pool: true,    // Keeps connection open to prevent handshake timeouts
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Your 16-character App Password
  },
  // Higher timeouts to survive slow network handshakes on Render
  connectionTimeout: 15000, 
  greetingTimeout: 10000,
  socketTimeout: 20000,
  tls: {
    rejectUnauthorized: false, // Bypasses local certificate issues
    minVersion: 'TLSv1.2'
  }
});

const BRAND_COLOR = "#00e5a0";

// Helper to keep the look consistent
function baseTemplate(content) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:Arial,sans-serif;color:#f0f0f0;">
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
            SoundWave · Powered by NexusAuth · Nigeria
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
  return await transporter.sendMail({
    from: `"SoundWave" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Verify your SoundWave email",
    html: baseTemplate(`
      <h2 style="font-size:24px;font-weight:800;margin:0 0 12px;color:#fff;">Verify your email 📬</h2>
      <p style="color:#aaa;">You're almost there! Click the button below to verify your email and start listening.</p>
      ${btn("Verify Email", url)}
      <p style="color:#555;font-size:13px;">This link will expire in 24 hours.</p>
    `),
  });
}

async function sendMagicLink(email, token) {
  const url = `${process.env.FRONTEND_URL}/auth/magic?token=${token}`;
  return await transporter.sendMail({
    from: `"SoundWave" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Your SoundWave sign-in link",
    html: baseTemplate(`
      <h2 style="font-size:24px;font-weight:800;margin:0 0 12px;color:#fff;">Your magic link ✨</h2>
      <p style="color:#aaa;">Click below to sign in instantly. No password required.</p>
      ${btn("Sign in to SoundWave", url)}
      <p style="color:#555;font-size:13px;">Expires in 15 minutes.</p>
    `),
  });
}

async function sendPasswordReset(email, token) {
  const url = `${process.env.FRONTEND_URL}/auth/reset-password?token=${token}`;
  return await transporter.sendMail({
    from: `"SoundWave" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Reset your SoundWave password",
    html: baseTemplate(`
      <h2 style="font-size:24px;font-weight:800;margin:0 0 12px;color:#fff;">Reset your password 🔐</h2>
      <p style="color:#aaa;">We received a request to reset your password. If this wasn't you, ignore this email.</p>
      ${btn("Reset Password", url)}
    `),
  });
}

async function sendWelcomeEmail(email, displayName) {
  return await transporter.sendMail({
    from: `"SoundWave" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Welcome to SoundWave 🎵",
    html: baseTemplate(`
      <h2 style="font-size:24px;font-weight:800;margin:0 0 12px;color:#fff;">Welcome, ${displayName || "Music Lover"}!</h2>
      <p style="color:#aaa;">Your account is verified. You can now explore the full SoundWave library.</p>
      ${btn("Explore Music", process.env.FRONTEND_URL)}
    `),
  });
}

module.exports = { 
  sendVerificationEmail, 
  sendMagicLink, 
  sendPasswordReset, 
  sendWelcomeEmail 
};

