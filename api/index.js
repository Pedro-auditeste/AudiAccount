// ACCOUNT na Vercel. Cada requisição pode cair num servidor novo, que esquece tudo depois: banco, sessões,
// cache do AudiHoras e documentos do cofre ficam no Redis (Upstash, pela API REST; nada para instalar).
// As telas (public/) a Vercel entrega sozinha; o vercel.json manda todo /api/* para cá.
const crypto = require('node:crypto');
const AH = require('../audihoras.js');
const Nucleo = require('../nucleo.js');
const C = require('../http-comum.js');

const API = process.env.AUDIHORAS_API || 'http://152.249.241.111:72/api/';
const P = 'account:';
const MAX_DOC = 3e6; // a Vercel recusa corpo acima de 4,5 MB, e o documento vai em base64 (+33%)

async function redis(...cmd) {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  if (!url) throw Nucleo.falha(500, 'O banco (Redis da Upstash) ainda não está ligado a este projeto na Vercel.');
  const r = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN}` },
    body: JSON.stringify(cmd),
  });
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}

// Uma requisição por vez com o mesmo nome: por sessão (o token do AudiHoras muda a cada chamada) e no banco
// (quem altera lê e grava o banco inteiro). A trava some sozinha em 70 s se a função morrer no meio (o limite dela é 60 s).
async function travar(nome, fn) {
  if (!nome) return fn();
  const k = P + 'trava:' + nome, eu = crypto.randomUUID();
  for (let i = 0; !(await redis('SET', k, eu, 'NX', 'PX', 70000)); i++) {
    if (i > 500) throw Nucleo.falha(503, 'O ACCOUNT está ocupado. Tente de novo em instantes.');
    await new Promise(ok => setTimeout(ok, 100));
  }
  try {
    return await fn();
  } finally {
    await redis('EVAL', "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) end return 0", 1, k, eu);
  }
}

// Cache do AudiHoras por usuário de lá, num hash do Redis com a mesma cara do Map que audihoras.js usa.
const cacheDe = usuario => {
  const k = P + 'cache:' + usuario;
  return {
    get: async c => JSON.parse((await redis('HGET', k, c)) || 'null'),
    set: async (c, v) => { await redis('HSET', k, c, JSON.stringify(v)); await redis('EXPIRE', k, 12 * 3600); },
    clear: () => redis('DEL', k),
  };
};

// Na sessão vai o estado da conexão com o AudiHoras (token, liderado, carteira e equipe), não a fila nem o cache.
// O pmd vale como a senha do AudiHoras: vai cifrado com uma chave que sai do sid, e o sid só existe no cookie
// (no Redis a sessão fica sob o hash dele). Quem ler o Redis não consegue usar.
const hash = x => crypto.createHash('sha256').update(x).digest('hex');
const nomeSessao = sid => P + 'sessao:' + hash(sid);
const cifraSessao = sid => C.cofre(hash('account-pmd:' + sid));
const sessoes = {
  async ler(sid) {
    const s = JSON.parse((await redis('GET', nomeSessao(sid))) || 'null');
    if (s?.ah) {
      const pmd = cifraSessao(sid).decifrar(Buffer.from(s.ah.pmd, 'base64')).toString();
      Object.assign(s.ah, { api: API, pmd, fila: Promise.resolve(), cache: cacheDe(s.ah.usuario) });
      for (const k of ['meus', 'equipe']) if (s.ah[k]) s.ah[k] = new Map(s.ah[k]);
    }
    return s;
  },
  gravar(sid, { u, fim, ...s }) {
    if (s.ah) {
      const { api, fila, cache, meus, equipe, pmd, ...ah } = s.ah;
      s.ah = { ...ah, pmd: cifraSessao(sid).cifrar(Buffer.from(pmd)).toString('base64'), meus: meus && [...meus], equipe: equipe && [...equipe] };
    }
    return redis('SET', nomeSessao(sid), JSON.stringify(s), 'EX', 8 * 3600);
  },
  apagar: sid => redis('DEL', nomeSessao(sid)),
};

// A chave do cofre vem de COFRE_KEY; sem ela, é criada uma vez e guardada no próprio Redis.
let cofre;
async function cifra() {
  if (!cofre) {
    let chave = process.env.COFRE_KEY;
    if (!chave) {
      await redis('SET', P + 'cofre-chave', crypto.randomBytes(32).toString('hex'), 'NX');
      chave = await redis('GET', P + 'cofre-chave');
    }
    cofre = C.cofre(chave);
  }
  return cofre;
}

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    const sid = C.sid(req);
    const corpo = req.method === 'GET' ? {} : await C.lerCorpo(req, 4.4e6);
    const mudaBanco = req.method !== 'GET' || url.pathname.startsWith('/api/arquivo/'); // abrir documento vai para a auditoria
    const r = await travar(sid && 'sessao:' + hash(sid), () => travar(mudaBanco && 'banco', async () => {
      const db = { usuarios: [], projetos: {}, registros: [], fechamentos: {}, comentarios: {}, auditoria: [], ...JSON.parse((await redis('GET', P + 'banco')) || '{}') };
      let mudou = false;
      const nucleo = Nucleo.criar({
        db, salvar: () => { mudou = true; }, uuid: () => crypto.randomUUID(), sessoes, maxDoc: MAX_DOC,
        gravarDoc: async (id, base64) => redis('SET', P + 'doc:' + id, (await cifra()).cifrar(Buffer.from(base64, 'base64')).toString('base64')),
        lerDoc: async id => (await cifra()).decifrar(Buffer.from(await redis('GET', P + 'doc:' + id), 'base64')),
        apagarDoc: id => redis('DEL', P + 'doc:' + id),
        conectarAH: (usuario, senha) => AH.conectar(API, usuario, senha),
        dadosAH: AH.dados,
        fotoAH: AH.foto,
      });
      // Banco vazio: o primeiro administrador é o do ADMIN_EMAIL (configurado no projeto da Vercel).
      if (!db.usuarios.length && process.env.ADMIN_EMAIL) nucleo.garantirAdmin(process.env.ADMIN_EMAIL);
      const r = await nucleo.tratar(req.method, url.pathname, { sid, corpo, busca: url.searchParams });
      // ponytail: o banco inteiro (auditoria junto) vai num valor só; separar a auditoria se passar de alguns MB.
      if (mudou) await redis('SET', P + 'banco', JSON.stringify(db));
      return r;
    }));
    C.responder(res, r, true);
  } catch (e) {
    if (!e.status) console.error(e);
    C.responder(res, { status: e.status || 500, json: { erro: e.status ? e.message : 'Erro interno: ' + e.message } }, true);
  }
};
