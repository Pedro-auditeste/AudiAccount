// ACCOUNT · Gestão de Contas e Projetos (Auditeste). Servidor sem dependências.
// Aqui fica só o que é de Node: rede, disco e criptografia. Regras e rotas estão em nucleo.js.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const AH = require('./audihoras.js');
const Nucleo = require('./nucleo.js');

const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const API = process.env.AUDIHORAS_API || 'http://152.249.241.111:72/api/';
const DADOS = process.env.DATA_DIR || path.join(__dirname, 'data');
const COFRE = path.join(DADOS, 'cofre');
const DB_ARQ = path.join(DADOS, 'db.json');
const PUBLICO = path.join(__dirname, 'public');
fs.mkdirSync(COFRE, { recursive: true });

// ---------- Cofre ----------
// Documentos do cofre ficam cifrados (AES-256-GCM); a chave vem de COFRE_KEY ou de data/cofre.key.
const CHAVE_ARQ = path.join(DADOS, 'cofre.key');
if (!process.env.COFRE_KEY && !fs.existsSync(CHAVE_ARQ)) fs.writeFileSync(CHAVE_ARQ, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const CHAVE = Buffer.from(process.env.COFRE_KEY || fs.readFileSync(CHAVE_ARQ, 'utf8').trim(), 'hex');
function cifrar(buf) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', CHAVE, iv);
  const corpo = Buffer.concat([c.update(buf), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), corpo]);
}
function decifrar(buf) {
  const d = crypto.createDecipheriv('aes-256-gcm', CHAVE, buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
}

// ---------- Banco local ----------
let db = fs.existsSync(DB_ARQ) ? JSON.parse(fs.readFileSync(DB_ARQ, 'utf8')) : {};
db = { usuarios: [], projetos: {}, registros: [], fechamentos: {}, comentarios: {}, auditoria: [], ...db };

const nucleo = Nucleo.criar({
  db,
  salvar() {
    fs.writeFileSync(DB_ARQ + '.tmp', JSON.stringify(db, null, 1));
    fs.renameSync(DB_ARQ + '.tmp', DB_ARQ);
  },
  uuid: () => crypto.randomUUID(),
  gravarDoc: (id, base64) => fs.writeFileSync(path.join(COFRE, id), cifrar(Buffer.from(base64, 'base64'))),
  lerDoc: id => decifrar(fs.readFileSync(path.join(COFRE, id))),
  apagarDoc: id => fs.rmSync(path.join(COFRE, id), { force: true }),
  conectarAH: (usuario, senha) => AH.conectar(API, usuario, senha),
  dadosAH: AH.dados,
  fotoAH: AH.foto,
});

const primeiro = nucleo.garantirAdmin(process.env.ADMIN_EMAIL);
if (primeiro?.email) console.log(`Primeiro acesso: o administrador (${primeiro.email}) entra com o usuário "${primeiro.usuario}" e a senha dele no AudiHoras. Para ser outra pessoa, rode com ADMIN_EMAIL=email.dela@auditeste.com.br.`);
else if (primeiro) console.log('Nenhum administrador cadastrado: rode com ADMIN_EMAIL=seu.email@auditeste.com.br.');

// ---------- HTTP ----------
const falha = (status, msg) => Object.assign(new Error(msg), { status });
function corpo(req, limite = 12e6) {
  return new Promise((ok, erro) => {
    let total = 0;
    const partes = [];
    req.on('data', c => {
      total += c.length;
      if (total > limite) { erro(falha(413, 'Documento grande demais (máx. 8 MB)')); req.destroy(); } else partes.push(c);
    });
    req.on('end', () => {
      try { ok(JSON.parse(Buffer.concat(partes).toString() || '{}')); } catch { erro(falha(400, 'JSON inválido')); }
    });
  });
}

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
  const json = (st, obj) => {
    res.writeHead(st, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(JSON.stringify(obj));
  };
  try {
    if (!url.pathname.startsWith('/api/')) return estatico(res, url.pathname);
    const r = await nucleo.tratar(req.method, url.pathname, {
      sid: /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || '')?.[1],
      corpo: req.method === 'GET' ? {} : await corpo(req),
      busca: url.searchParams,
    });
    if (r.cookie !== undefined) res.setHeader('Set-Cookie', r.cookie ? `sid=${r.cookie}; HttpOnly; SameSite=Strict; Path=/` : 'sid=; Max-Age=0; Path=/');
    if (!r.arquivo) return json(r.status, r.json);
    const imagem = r.arquivo.mime.startsWith('image/');
    res.writeHead(200, {
      'Content-Type': r.arquivo.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': r.arquivo.cache || 'no-store',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(r.arquivo.nome)}`,
      ...(imagem ? { 'Content-Security-Policy': "default-src 'none'" } : {}),
    });
    res.end(typeof r.arquivo.dados === 'string' ? Buffer.from(r.arquivo.dados, 'base64') : r.arquivo.dados);
  } catch (e) {
    if (!e.status) console.error(e);
    json(e.status || 500, { erro: e.status ? e.message : 'Erro interno: ' + e.message });
  }
}).listen(PORT, HOST, () => console.log(`ACCOUNT em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`));
