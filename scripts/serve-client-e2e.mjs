import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.cwd(), 'dist');
const port = Number(process.env.PORT ?? 4173);
let serviceWorkerRevision = 0;

const contentTypes = {
  '.css': 'text/css',
  '.html': 'text/html',
  '.ico': 'image/x-icon',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.mjs': 'application/javascript',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

createServer((request, response) => {
  const requestPath = new URL(request.url ?? '/', `http://${request.headers.host}`).pathname;
  const relativePath = normalize(requestPath).replace(/^[/\\]+/, '');
  const requestedFile = join(root, relativePath);
  const file =
    existsSync(requestedFile) && statSync(requestedFile).isFile()
      ? requestedFile
      : join(root, 'index.html');

  if (file === join(root, 'sw.js')) {
    response.writeHead(200, {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    });
    const workerStream = createReadStream(file);
    workerStream.on('error', () => response.destroy());
    workerStream.on('end', () =>
      response.end(`\n// e2e-service-worker-revision:${++serviceWorkerRevision}\n`),
    );
    workerStream.pipe(response, { end: false });
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes[extname(file)] ?? 'application/octet-stream',
  });
  createReadStream(file)
    .on('error', () => response.destroy())
    .pipe(response);
}).listen(port, '127.0.0.1');
