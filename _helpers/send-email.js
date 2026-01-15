const nodemailer = require('nodemailer');
const config = require('config.json');

module.exports = sendEmail;

async function sendEmail({ to, subject, html, from = (process.env.EMAIL_FROM || config.emailFrom) }) {
  let transporter;

  const smtpOptions = config.smtpOptions || {
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  };

  if (smtpOptions.host && smtpOptions.auth && smtpOptions.auth.user) {
    transporter = nodemailer.createTransport(smtpOptions);
  } else {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: 'smtp.ethereal.email',
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log('Using dynamic Ethereal test account. Preview emails at URL logged below.');
  }

  const info = await transporter.sendMail({ from, to, subject, html });

  // If this is a test transport (Ethereal), log the preview URL
  const previewUrl = nodemailer.getTestMessageUrl(info);
  if (previewUrl) console.log('Preview URL: %s', previewUrl);

  return info;
}