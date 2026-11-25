// Dev proxy for API mode: same-origin /api calls go to the local Vairas Gateway.
// TLS to the Gateway is verified against the local stack CA; certificate checks are never disabled.
const fs = require('node:fs');
const https = require('node:https');
const path = require('node:path');
// VAIRAS_LOCAL_STATE points at an isolated stack's state folder; the default is the sibling Backend checkout.
const stateDir =
  process.env.VAIRAS_LOCAL_STATE ?? path.resolve(__dirname, '../Backend/local/.state');
const caPath = path.resolve(stateDir, 'tls/localhost.crt');
const ca = fs.existsSync(caPath) ? fs.readFileSync(caPath) : undefined;
if (!ca) console.warn('[proxy] ' + caPath + ' is missing; start the local backend stack first.');
module.exports = {
  '/api': {
    target: process.env.VAIRAS_GATEWAY ?? 'https://localhost:7000',
    secure: true,
    changeOrigin: true,
    agent: new https.Agent({ ca, keepAlive: true }),
    timeout: 130000,
    proxyTimeout: 130000,
  },
};
