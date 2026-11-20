import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import worker from './worker.mjs';

const port = Number(process.env.PORT ?? '10000');
const origin = new URL(process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:' + port).origin;
const credentials = process.env.SELLERGUARD_REVIEW_CREDENTIAL_SHA256;
if (process.env.RENDER && !/^https:\/\//.test(origin)) throw new Error('A public HTTPS origin is required on Render.');
if (!/^[a-f\d]{64}$/.test(credentials ?? '')) throw new Error('Set SELLERGUARD_REVIEW_CREDENTIAL_SHA256.');

const server = createServer(async (req, res) => {
  try {
    // Force the configured public origin and carry the request path only.
    const path = new URL(req.url, origin);
    if (!req.url.startsWith('/') || path.origin !== origin) {
      res.writeHead(400).end();
      return;
    }
    const method = req.method ?? 'GET';
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const request = new Request(path, {
      method,
      headers: req.headers,
      ...(hasBody ? { body: Readable.toWeb(req), duplex: 'half' } : {}),
    });
    const result = await worker.fetch(request, { SELLERGUARD_REVIEW_CREDENTIAL_SHA256: credentials });
    res.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.body) await pipeline(Readable.fromWeb(result.body), res);
    else res.end();
  } catch {
    if (!res.headersSent) res.writeHead(500).end();
    else res.destroy();
  }
});
server.listen(port, '0.0.0.0');
