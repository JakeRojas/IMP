const nodemailer    = require('nodemailer');
const config        = require('config.json');

module.exports = sendEmail;

async function sendEmail({ to, subject, html, from = config.emailFrom }) {
    let transporter;
    if (config.smtpOptions && config.smtpOptions.auth && config.smtpOptions.auth.user && config.smtpOptions.auth.pass) {
      transporter = nodemailer.createTransport(config.smtpOptions);
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