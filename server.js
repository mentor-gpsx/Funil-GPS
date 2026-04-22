#!/usr/bin/env node

require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = 3000;
const HOST = 'localhost';

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // API endpoints
  if (pathname === '/api/permissions') {
    if (req.method === 'GET') {
      return res.end(JSON.stringify([
        {
          id: 'user-1',
          email: 'maria@example.com',
          seller_key: 'maria-1',
          display_name: 'Maria Eduarda',
          permissions: { view: true, edit: true }
        },
        {
          id: 'user-2',
          email: 'gabriel@example.com',
          seller_key: 'gabriel-1',
          display_name: 'Gabriel',
          permissions: { view: true, edit: true }
        }
      ]));
    }
    if (req.method === 'PATCH') {
      return res.end(JSON.stringify({ ok: true }));
    }
  }

  if (pathname === '/api/profile') {
    return res.end(JSON.stringify({
      id: 'user-1',
      email: 'user@example.com',
      display_name: 'Usuário',
      role: 'admin'
    }));
  }

  if (pathname === '/api/tasks') {
    return res.end(JSON.stringify([
      {
        id: 'task-1',
        title: 'Deal 1',
        value: 50000,
        stage: 'fechado',
        seller: 'Maria'
      }
    ]));
  }

  if (pathname === '/api/roleta/grant' && req.method === 'POST') {
    return res.end(JSON.stringify({ ok: true }));
  }

  if (pathname === '/api/roleta/revoke' && req.method === 'POST') {
    return res.end(JSON.stringify({ ok: true }));
  }

  // NEW: Funil por Usuário (Nova Estrutura)
  if (pathname === '/api/funil-by-user' && req.method === 'GET') {
    const funilByUserHandler = require('./api/funil-by-user');
    return funilByUserHandler(req, res);
  }

  // NEW: Tab Permissions (Gerenciar Permissões)
  if (pathname === '/api/tab-permissions') {
    const tabPermissionsHandler = require('./api/tab-permissions');
    return tabPermissionsHandler(req, res);
  }

  // Serve static files
  let filePath = path.join(__dirname, pathname === '/' ? 'funil.html' : pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(404);
    res.end('Not found');
    return;
  }

  // Check if file exists
  if (fs.existsSync(filePath)) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const ext = path.extname(filePath);

      let contentType = 'text/plain';
      if (ext === '.html') contentType = 'text/html; charset=utf-8';
      else if (ext === '.js') contentType = 'application/javascript';
      else if (ext === '.css') contentType = 'text/css';
      else if (ext === '.json') contentType = 'application/json';

      res.setHeader('Content-Type', contentType);
      res.writeHead(200);
      res.end(content);
      return;
    } catch (err) {
      res.writeHead(500);
      res.end('Internal error');
      return;
    }
  }

  // 404
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, HOST, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ Funil de Vendas Server RESTAURADO');
  console.log('='.repeat(60));
  console.log(`\n🌐 Acesse em: http://${HOST}:${PORT}`);
  console.log(`\n📡 APIs disponíveis:`);
  console.log('  • GET  /api/permissions');
  console.log('  • PATCH /api/permissions');
  console.log('  • GET  /api/profile');
  console.log('  • GET  /api/tasks');
  console.log('  • POST /api/roleta/grant');
  console.log('  • POST /api/roleta/revoke');
  console.log(`\n⏹️  Para parar: Pressione Ctrl+C\n`);
});

process.on('SIGINT', () => {
  console.log('\n\n✅ Servidor parado');
  process.exit(0);
});
