const nodemailer = require("nodemailer");

// Create a reusable transporter object using the default SMTP transport
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "465"),
  secure: process.env.SMTP_PORT === "465", // true for 465, false for others
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Your new 16-character App Password
  },
  tls: {
    rejectUnauthorized: false // Helps avoid handshake errors in some environments
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
            SoundWave · Powered by NexusAuth
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

async function sendVerificationEmail(email, token) {
  const url = `${process.env.FRONTEND_URL}/auth/verify-email?token=${token}`;
  return await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: email,
    subject: "Verify your SoundWave email",
    html: baseTemplate(`
      <h2 style="font-size:24px;font-weight:800;margin:0 0 12px;color:#fff;">Verify your email 📬</h2>
      <p style="color:#aaa;">Welcome to SoundWave! Please click the button below to verify your email address.</p>
      <div style="margin:28px 0;">
        <a href="${url}" style="display:inline-block;padding:14px 32px;background:${BRAND_COLOR};color:#000;font-weight:700;font-size:15px;border-radius:30px;text-decoration:none;">Verify Email</a>
      </div>
    `),
  });
}

module.exports = { sendVerificationEmail };

