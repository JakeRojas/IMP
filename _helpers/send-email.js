const nodemailer    = require('nodemailer');
const config        = require('config.json');

module.exports = sendEmail;

// async function sendEmail({ to, subject, html, from = config.emailFrom }) {
//     const transporter = nodemailer.createTransport(config.smtpOptions);
//     await transporter.sendMail({ from, to, subject, html});
// }

async function sendEmail({ to, subject, html, from = config.emailFrom }) {
    let transporter;
    // If config.smtpOptions looks usable, use it
    if (config.smtpOptions && config.smtpOptions.auth && config.smtpOptions.auth.user && config.smtpOptions.auth.pass) {
      transporter = nodemailer.createTransport(config.smtpOptions);
    } else {
      // Fallback: create a test account on the fly (Ethereal)
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

// async function sendEmail({ to, subject, html, from }) {
//     console.log('DEV EMAIL (not sent):', { from, to, subject });
//     // optionally also log the html for debugging
//     // console.log('html:', html);
//     return Promise.resolve();
//   };