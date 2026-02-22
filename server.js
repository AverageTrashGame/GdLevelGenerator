const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT) || 8000;
const root = __dirname;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

function sendFile(res, filePath) {
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error while reading file.');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
  const requestPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = path.normalize(requestPath).replace(/^([.][.][/\\])+/, '');
  const fullPath = path.join(root, safePath === '/' ? '/index.html' : safePath);

  fs.stat(fullPath, (err, stats) => {
    if (!err && stats.isFile()) {
      sendFile(res, fullPath);
      return;
    }

    // SPA fallback so refreshing deep links won't show "Not Found".
    sendFile(res, path.join(root, 'index.html'));
  });
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Geometry Dash Level Maker running at http://localhost:${port}`);
});
