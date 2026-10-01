// ACCOUNT · Gestão de Contas e Projetos (Auditeste). Servidor local sem dependências (npm start).
// Aqui fica o que é desta máquina: rede, disco e sessões na memória. Regras e rotas estão em nucleo.js;
// a versão da Vercel é api/index.js.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AH = require('./audihoras.js');
const Nucleo = require('./nucleo.js');
const C = require('./http-comum.js');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const API = process.env.AUDIHORAS_API || 'http://152.249.241.111:72/api/';
const DADOS = process.env.DATA_DIR || path.join(__dirname, 'data');
const COFRE = path.join(DADOS, 'cofre');
const DB_ARQ = path.join(DADOS, 'db.json');
const PUBLICO = path.join(__dirname, 'public');
fs.mkdirSync(COFRE, { recursive: true });

// A chave do cofre vem de COFRE_KEY ou de data/cofre.key.
const CHAVE_ARQ = path.join(DADOS, 'cofre.key');
if (!process.env.COFRE_KEY && !fs.existsSync(CHAVE_ARQ)) fs.writeFileSync(CHAVE_ARQ, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const cofre = C.cofre(process.env.COFRE_KEY || fs.readFileSync(CHAVE_ARQ, 'utf8').trim());

let db = fs.existsSync(DB_ARQ) ? JSON.parse(fs.readFileSync(DB_ARQ, 'utf8')) : {};
db = { usuarios: [], projetos: {}, registros: [], fechamentos: {}, comentarios: {}, auditoria: [], ...db };
const sessoes = new Map();

const nucleo = Nucleo.criar({
  db,
  salvar() {
    fs.writeFileSync(DB_ARQ + '.tmp', JSON.stringify(db, null, 1));
    fs.renameSync(DB_ARQ + '.tmp', DB_ARQ);
  },
  uuid: () => crypto.randomUUID(),
  sessoes: { ler: sid => sessoes.get(sid), gravar: (sid, s) => { sessoes.set(sid, s); }, apagar: sid => { sessoes.delete(sid); } },
  gravarDoc: (id, base64) => fs.writeFileSync(path.join(COFRE, id), cofre.cifrar(Buffer.from(base64, 'base64'))),
  lerDoc: id => cofre.decifrar(fs.readFileSync(path.join(COFRE, id))),
  apagarDoc: id => fs.rmSync(path.join(COFRE, id), { force: true }),
  conectarAH: (usuario, senha) => AH.conectar(API, usuario, senha),
  dadosAH: AH.dados,
  fotoAH: AH.foto,
});

const primeiro = nucleo.garantirAdmin(process.env.ADMIN_EMAIL);
if (primeiro?.email) console.log(`Primeiro acesso: o administrador (${primeiro.email}) entra com o usuário "${primeiro.usuario}" e a senha dele no AudiHoras. Para ser outra pessoa, rode com ADMIN_EMAIL=email.dela@auditeste.com.br.`);
else if (primeiro) console.log('Nenhum administrador cadastrado: rode com ADMIN_EMAIL=seu.email@auditeste.com.br.');

const TIPO_ARQ = { '.html': 'text/html; charset=utf-8', '.png': 'image/png', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
function estatico(res, pathname) {
  const arq = path.join(PUBLICO, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
  if (!arq.startsWith(PUBLICO + path.sep) || !fs.existsSync(arq) || !TIPO_ARQ[path.extname(arq)]) {
    res.writeHead(404); return res.end('Não encontrado');
  }
  res.writeHead(200, { 'Content-Type': TIPO_ARQ[path.extname(arq)], 'X-Frame-Options': 'DENY', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' });
  fs.createReadStream(arq).pipe(res);
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (!url.pathname.startsWith('/api/')) return estatico(res, url.pathname);
    C.responder(res, await nucleo.tratar(req.method, url.pathname, {
      sid: C.sid(req),
      corpo: req.method === 'GET' ? {} : await C.lerCorpo(req, 12e6),
      busca: url.searchParams,
    }));
  } catch (e) {
    if (!e.status) console.error(e);
    C.responder(res, { status: e.status || 500, json: { erro: e.status ? e.message : 'Erro interno: ' + e.message } });
  }
}).listen(PORT, HOST, () => console.log(`ACCOUNT em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
