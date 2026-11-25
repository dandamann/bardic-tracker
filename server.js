// Local / Docker server. Vercel does not use this file.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const handler = require('./lib/handler');

const files = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
  '/embed': ['embed.html', 'text/html; charset=utf-8'],
  '/embed.js': ['embed.js', 'text/javascript; charset=utf-8'],
  '/embed.css': ['embed.css', 'text/css; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
  '/apple-touch-icon.png': ['apple-touch-icon.png', 'image/png'],
};

const server = http.createServer(async (req, res) => {
  const pathname = req.url.split('?')[0];
  if (pathname === '/api/state') return handler(req, res);
  const file = Object.hasOwn(files, pathname) && files[pathname];
  if (!file) return res.writeHead(404).end('Not found');
  try {
    const body = await fs.readFile(path.join(__dirname, 'public', file[0]));
    res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' }).end(body);
  } catch (err) {
    console.error(err);
    res.writeHead(500).end('Server error');
  }
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Bardic tracker on http://localhost:${port}`));
process.on('SIGTERM', () => process.exit(0));
