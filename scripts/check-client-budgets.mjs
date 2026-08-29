import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative } from 'node:path';

const dist = join(process.cwd(), 'apps/client/dist');
const assets = join(dist, 'assets');
const INITIAL_JS_GZIP_LIMIT = 300 * 1024;
const PRECACHE_LIMIT = 1024 * 1024;

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

const assetFiles = filesUnder(assets);
const entryPath = assetFiles.find((file) => /^index-.*\.js$/.test(file.split('/').at(-1) ?? ''));
const entry = entryPath ? relative(assets, entryPath) : undefined;
if (!entry) throw new Error('Client build entry was not found. Run the client build first.');

const visited = new Set();
function staticGraph(file) {
  if (visited.has(file)) return 0;
  visited.add(file);
  const source = readFileSync(join(assets, file), 'utf8');
  let total = gzipSync(source).length;
  for (const match of source.matchAll(/from"([^"?]+\.js)"/g)) {
    if (!match[1].startsWith('.')) continue;
    total += staticGraph(normalize(join(dirname(file), match[1])));
  }
  return total;
}

const initialGzip = staticGraph(entry);
const deferredInitialChunks = [/^pdf-/, /^pdf\.worker\./, /^DrawingCanvas-/, /^rendererWorker-/];
const eagerDeferredChunk = [...visited].find((file) =>
  deferredInitialChunks.some((pattern) => pattern.test(file.split('/').at(-1) ?? '')),
);
const precache = readFileSync(join(dist, 'sw.js'), 'utf8');
const precacheFiles = new Set(
  [...precache.matchAll(/url:"([^"?]+)(?:\?[^"]*)?"/g)].map((match) => match[1]),
);
const precacheBytes = [...precacheFiles].reduce((total, file) => {
  const path = join(dist, file);
  return total + (statSync(path).isFile() ? statSync(path).size : 0);
}, 0);

if (initialGzip > INITIAL_JS_GZIP_LIMIT) {
  throw new Error(
    `Initial JavaScript is ${initialGzip} bytes gzip; limit is ${INITIAL_JS_GZIP_LIMIT}.`,
  );
}
if (eagerDeferredChunk) {
  throw new Error(`${eagerDeferredChunk} must remain deferred from the initial JavaScript graph.`);
}
if (precacheBytes > PRECACHE_LIMIT) {
  throw new Error(`PWA precache is ${precacheBytes} bytes; limit is ${PRECACHE_LIMIT}.`);
}
console.log(`Initial JavaScript: ${initialGzip} bytes gzip`);
console.log(`PWA precache: ${precacheBytes} bytes`);
