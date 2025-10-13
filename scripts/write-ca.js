const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'certs');
const outPath = process.env.DB_CA_PATH || path.join(outDir, 'ca.pem');
const base64 = process.env.DB_CA_BASE64 || '';

if (!base64) {
  console.log('DB_CA_BASE64 not set — skipping writing CA file.');
  process.exit(0);
}

try {
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const buf = Buffer.from(base64, 'base64');
  fs.writeFileSync(outPath, buf, { mode: 0o600 }); // owner read/write only
  console.log(`Wrote DB CA to ${outPath}`);
  process.exit(0);
} catch (err) {
  console.error('Failed to write DB CA file:', err);
  process.exit(1);
}