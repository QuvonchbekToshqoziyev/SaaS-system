#!/usr/bin/env node
import http from 'node:http';

const proxyPort = Number(process.argv[2] || 8080);
const backendPort = Number(process.argv[3] || 5000);
const frontendPort = Number(process.argv[4] || 3000);

function proxyRequest(req, res, targetPort, targetPath) {
  const path = targetPath ?? req.url ?? '/';
  const proxyReq = http.request(
    {
      hostname: '127.0.0.1',
      port: targetPort,
      path,
      method: req.method,
      headers: {
        ...req.headers,
        host: `127.0.0.1:${targetPort}`,
      },
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'text/plain' });
    }
    res.end(`Proxy error: ${err.message}`);
  });

  req.pipe(proxyReq);
}

http
  .createServer((req, res) => {
    const url = req.url ?? '/';
    if (url.startsWith('/api/') || url === '/api') {
      const backendPath = url.replace(/^\/api/, '') || '/';
      proxyRequest(req, res, backendPort, backendPath);
      return;
    }
    proxyRequest(req, res, frontendPort);
  })
  .listen(proxyPort, '0.0.0.0', () => {
    console.log(
      `Dev proxy listening on :${proxyPort} (frontend :${frontendPort}, /api -> :${backendPort})`,
    );
  });
