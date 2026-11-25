// Serves the SPA on https://localhost:4200 against the local Vairas stack (Gateway https://localhost:7000).
// The origin must be exactly https://localhost:4200: the Gateway CORS list, the Authentication
// BrowserOrigins list, Chat trusted confirmation origins and e-mail challenge links all use it.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// VAIRAS_LOCAL_STATE points at an isolated stack's state folder; the default is the sibling Backend checkout.
const state = process.env.VAIRAS_LOCAL_STATE ?? resolve(root, '../Backend/local/.state');
const cert = resolve(state, 'tls/localhost.crt');
const key = resolve(state, 'localhost.key');
if (!existsSync(cert))
  console.warn(
    'Local stack certificate not found at ' +
      cert +
      '. Start the backend with Backend/local/Start.ps1 first.',
  );
const args = ['serve', '--host', 'localhost', '--port', process.env.PORT ?? '4200', '--ssl'];
if (existsSync(cert) && existsSync(key)) args.push('--ssl-cert', cert, '--ssl-key', key);
const ng = resolve(root, 'node_modules/@angular/cli/bin/ng.js');
const child = spawn(process.execPath, [ng, ...args], { cwd: root, stdio: 'inherit' });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
