/**
 * Email service using Resend HTTP API (or console fallback in dev).
 * Set RESEND_API_KEY env var to enable real emails.
 * Falls back to SMTP via nodemailer if SMTP_HOST is set instead.
 */

const nodemailer = require('nodemailer');

async function sendEmail({ to, subject, html, text }) {
  const resendKey = process.env.RESEND_API_KEY || process.env.SMTP_PASS;
  const from = process.env.FROM_EMAIL || 'onboarding@resend.dev';

  // Try Resend HTTP API first (most reliable on cloud)
  if (resendKey && resendKey.startsWith('re_')) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from, to, subject, html, text }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[Email] Resend API error:', res.status, body);
      throw new Error(`Resend API error: ${res.status} ${body}`);
    }

    const data = await res.json();
    console.log('[Email] Sent via Resend:', data.id, 'to:', to);
    return data;
  }

  // Fallback: SMTP via nodemailer
  if (process.env.SMTP_HOST) {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT, 10) || 587,
      secure: parseInt(process.env.SMTP_PORT, 10) === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });

    const result = await transporter.sendMail({ from, to, subject, html, text });
    console.log('[Email] Sent via SMTP:', result.messageId, 'to:', to);
    return result;
  }

  // Dev fallback: log to console
  console.log('=== DEV EMAIL ===');
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`Body: ${text || html}`);
  console.log('=================');
  return { id: 'dev-' + Date.now() };
}

async function sendInviteEmail(toEmail, inviterName, projectName, role, acceptUrl) {
  await sendEmail({
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
  await sendEmail({
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
