require('../config/env');

const { Resend } = require('resend');

const DEFAULT_FROM = 'YiwuHub <support@china2ph.com>';
const DEFAULT_EXPIRE_MINUTES = 5;

function getExpireMinutes() {
  const value = Number(process.env.EMAIL_CODE_EXPIRE_MINUTES || DEFAULT_EXPIRE_MINUTES);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : DEFAULT_EXPIRE_MINUTES;
}

function getEmailFrom() {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

function buildEmailErrorMessage(error) {
  if (!error) {
    return 'Failed to send verification email';
  }

  if (typeof error === 'string') {
    return error;
  }

  return error.message || error.name || JSON.stringify(error);
}

function isDevelopmentWithoutApiKey() {
  return process.env.NODE_ENV === 'development' && !process.env.RESEND_API_KEY;
}

async function sendVerificationCodeEmail(email, code) {
  const provider = process.env.EMAIL_PROVIDER || 'resend';
  const expireMinutes = getExpireMinutes();

  if (provider !== 'resend') {
    throw new Error(`Unsupported email provider: ${provider}`);
  }

  if (!process.env.RESEND_API_KEY) {
    if (isDevelopmentWithoutApiKey()) {
      console.log(`[YiwuHub] Development only, email not sent. Verification code for ${email}: ${code}`);
      return { id: 'development-console-log', delivery: 'console' };
    }

    throw new Error('RESEND_API_KEY is required');
  }

  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject = 'YiwuHub Verification Code';
  const text = [
    `Your YiwuHub verification code is ${code}.`,
    `This code is valid for ${expireMinutes} minutes.`,
    'Do not share or disclose this code to anyone.'
  ].join('\n');
  const html = `
    <div style="font-family: Arial, sans-serif; color: #1f2937; line-height: 1.6;">
      <h2 style="margin: 0 0 16px;">YiwuHub Verification Code</h2>
      <p>Your verification code is:</p>
      <p style="font-size: 28px; font-weight: 700; letter-spacing: 4px; margin: 16px 0;">${code}</p>
      <p>This code is valid for ${expireMinutes} minutes.</p>
      <p>Please do not share or disclose this code to anyone.</p>
    </div>
  `;

  const { data, error } = await resend.emails.send({
    from: getEmailFrom(),
    to: email,
    subject,
    text,
    html
  });

  if (error) {
    console.error('[YiwuHub] Resend email error:', {
      name: error.name,
      message: error.message,
      statusCode: error.statusCode,
      error
    });

    throw new Error(buildEmailErrorMessage(error));
  }

  console.log(`[YiwuHub] Verification email accepted by Resend. id=${data?.id || 'unknown'} to=${email}`);

  return { ...data, delivery: 'resend' };
}

module.exports = {
  getExpireMinutes,
  sendVerificationCodeEmail
};
