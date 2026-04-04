const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  if (process.env.NODE_ENV === 'development' && !process.env.SMTP_HOST) {
    // In dev without SMTP config, log emails to console
    transporter = {
      sendMail: async (options) => {
        console.log('=== DEV EMAIL ===');
        console.log(`To: ${options.to}`);
        console.log(`Subject: ${options.subject}`);
        console.log(`Body: ${options.text || options.html}`);
        console.log('=================');
        return { messageId: 'dev-' + Date.now() };
      },
    };
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: parseInt(process.env.SMTP_PORT, 10) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  return transporter;
}

async function sendInviteEmail(toEmail, inviterName, projectName, role, acceptUrl) {
  const transport = getTransporter();
  await transport.sendMail({
    from: process.env.FROM_EMAIL || 'noreply@scriptsyncpro.com',
    to: toEmail,
    subject: `You've been invited to "${projectName}" on ScriptSync Pro`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">ScriptSync Pro</h2>
        <p>${inviterName} has invited you to join the project <strong>"${projectName}"</strong> as a <strong>${role.toLowerCase()}</strong>.</p>
        <a href="${acceptUrl}" style="display: inline-block; background: #4361ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Accept Invitation</a>
        <p style="color: #666; font-size: 14px;">This invitation expires in 7 days. If you didn't expect this email, you can safely ignore it.</p>
      </div>
    `,
    text: `${inviterName} invited you to "${projectName}" on ScriptSync Pro as a ${role.toLowerCase()}. Accept here: ${acceptUrl}`,
  });
}

async function sendResetEmail(toEmail, userName, resetUrl) {
  const transport = getTransporter();
  await transport.sendMail({
    from: process.env.FROM_EMAIL || 'noreply@scriptsyncpro.com',
    to: toEmail,
    subject: 'Reset your ScriptSync Pro password',
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #1a1a2e;">ScriptSync Pro</h2>
        <p>Hi ${userName},</p>
        <p>We received a request to reset your password. Click the link below to set a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; background: #4361ee; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 16px 0;">Reset Password</a>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour. If you didn't request this, you can safely ignore it.</p>
      </div>
    `,
    text: `Hi ${userName}, reset your ScriptSync Pro password here: ${resetUrl}. This link expires in 1 hour.`,
  });
}

module.exports = { sendInviteEmail, sendResetEmail };
