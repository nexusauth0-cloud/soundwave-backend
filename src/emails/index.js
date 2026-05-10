const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // High timeouts for cloud latency
  connectionTimeout: 60000, 
  greetingTimeout: 60000,
});

const sendVerificationEmail = async (email, token) => {
  const url = `${process.env.BACKEND_URL}/api/auth/verify-email?token=${token}`;
  return transporter.sendMail({
    from: `"SoundWave" <${process.env.SMTP_USER}>`,
    to: email,
    subject: "Verify your SoundWave Account",
    html: `<h1>Welcome!</h1><p>Click <a href="${url}">here</a> to verify.</p>`,
  });
};

// Add your other email functions here (Welcome, Magic Link, Reset)
// ensuring they use the transporter.sendMail() method.

module.exports = { 
  sendVerificationEmail, 
  // Add other exports here...
};

