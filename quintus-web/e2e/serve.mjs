// Sert le build (dist/quintus-web/browser) avec renvoi vers index.html pour les routes Angular
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../dist/quintus-web/browser');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};
export function serve(port = 4321) {
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let file = join(root, path);
    if (!file.startsWith(root) || !extname(file)) file = join(root, 'index.html');
    try {
      const body = await readFile(file);
      res
        .writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' })
        .end(body);
    } catch {
      res
        .writeHead(200, { 'content-type': 'text/html' })
        .end(await readFile(join(root, 'index.html')));
    }
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}
