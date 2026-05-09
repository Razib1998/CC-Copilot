const http = require('http');
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '../../FUSA_CLEAN - Code/DEV');
const port = process.env.PORT || 3032;
http.createServer((req, res) => {
  let filePath = path.join(root, req.url === '/' ? 'index.html' : req.url);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    const ext = path.extname(filePath);
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' }[ext] || 'text/plain';
    res.writeHead(200, { 'Content-Type': mime });
    res.end(data);
  });
}).listen(port, () => console.log('FUSA server on ' + port));
