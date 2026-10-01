// O que o servidor local (server.js) e a Vercel (api/index.js) fazem igual: cofre cifrado, corpo JSON e resposta.
const crypto = require('node:crypto');
const falha = (status, msg) => Object.assign(new Error(msg), { status });

// Documentos do cofre ficam cifrados (AES-256-GCM): iv (12) + tag (16) + conteúdo.
exports.cofre = chaveHex => {
  const CHAVE = Buffer.from(chaveHex, 'hex');
  return {
    cifrar(buf) {
      const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', CHAVE, iv);
      const corpo = Buffer.concat([c.update(buf), c.final()]);
      return Buffer.concat([iv, c.getAuthTag(), corpo]);
    },
    decifrar(buf) {
      const d = crypto.createDecipheriv('aes-256-gcm', CHAVE, buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]);
    },
  };
};

exports.sid = req => /(?:^|;\s*)sid=([\w-]+)/.exec(req.headers.cookie || '')?.[1];

exports.lerCorpo = (req, limite) => new Promise((ok, erro) => {
  let total = 0;
  const partes = [];
  req.on('data', c => {
    total += c.length;
    if (total > limite) { erro(falha(413, 'Documento grande demais.')); req.destroy(); } else partes.push(c);
  });
  req.on('end', () => {
    try { ok(JSON.parse(Buffer.concat(partes).toString() || '{}')); } catch { erro(falha(400, 'JSON inválido')); }
  });
});

// r = resposta do núcleo: { status, json, cookie?, arquivo? }. https: cookie só vai por conexão segura.
exports.responder = (res, r, https) => {
  if (r.cookie !== undefined) {
    res.setHeader('Set-Cookie', r.cookie ? `sid=${r.cookie}; HttpOnly; SameSite=Strict; Path=/${https ? '; Secure' : ''}` : 'sid=; Max-Age=0; Path=/');
  }
  if (!r.arquivo) {
    res.writeHead(r.status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    return res.end(JSON.stringify(r.json));
  }
  res.writeHead(200, {
    'Content-Type': r.arquivo.mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': r.arquivo.cache || 'no-store',
    'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(r.arquivo.nome)}`,
    ...(r.arquivo.mime.startsWith('image/') ? { 'Content-Security-Policy': "default-src 'none'" } : {}),
  });
  res.end(typeof r.arquivo.dados === 'string' ? Buffer.from(r.arquivo.dados, 'base64') : r.arquivo.dados);
};
