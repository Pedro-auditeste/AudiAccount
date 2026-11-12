// ACCOUNT na Railway (workspace Governança). O processo fica no ar: serve as telas de public/ e passa /api/* para a
// mesma função da Vercel (api/index.js), ligada ao mesmo Redis da Upstash, então os dois endereços enxergam os
// mesmos dados. Variáveis: KV_REST_API_URL e KV_REST_API_TOKEN (as mesmas da Vercel); a Railway define PORT.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
process.env.CACHE_NA_MEMORIA ??= '1'; // o Redis fica em São Paulo e a Railway não: o cache do AudiHoras fica aqui
const api = require('./api/index.js');

const PUBLICO = path.join(__dirname, 'public');
const TIPO = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const SEGURANCA = { 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  if (pathname.startsWith('/api/')) return api(req, res);
  let arq = '';
  try { arq = path.join(PUBLICO, pathname === '/' ? 'index.html' : decodeURIComponent(pathname)); } catch { /* endereço malformado: 404 */ }
  if (!arq.startsWith(PUBLICO + path.sep) || !TIPO[path.extname(arq)] || !fs.existsSync(arq)) {
    res.writeHead(404, SEGURANCA);
    return res.end('Não encontrado');
  }
  // no-cache: depois de cada publicação a tela nova aparece sem precisar limpar o navegador
  res.writeHead(200, { 'Content-Type': TIPO[path.extname(arq)], 'Cache-Control': 'no-cache', ...SEGURANCA });
  fs.createReadStream(arq).pipe(res);
}).listen(Number(process.env.PORT) || 3000, '0.0.0.0', () => console.log(`ACCOUNT no ar na porta ${process.env.PORT || 3000}`));
