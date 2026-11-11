// Documento e e-mail das validações do fechamento, sem biblioteca: um PDF só de texto e um SMTP mínimo.
const net = require('node:net');
const tls = require('node:tls');
const crypto = require('node:crypto');

// ponytail: PDF só de texto (Helvetica, A4) e quebra de linha por contagem de letras. Trocar por uma biblioteca
// se o documento precisar de tabela, logo ou gráfico.
const TROCAS = { '–': '-', '—': '-', '−': '-', '“': '"', '”': '"', '‘': "'", '’': "'", '…': '...', '•': '·', '✓': 'OK' };
// linhas: texto, ou { t, tam, forte } para título. Devolve o PDF num Buffer.
exports.pdf = linhas => {
  const latin = s => Buffer.from(String(s).replace(/[^\x00-\xff]/g, c => TROCAS[c] ?? '?').replace(/[\\()]/g, '\\$&'), 'latin1');
  const paginas = [[]];
  let y = 792;
  for (const l of linhas) {
    const { t = '', tam = 10, forte = false } = typeof l === 'string' ? { t: l } : l;
    const max = Math.floor(495 / (tam * 0.52)), partes = [];
    let atual = '';
    for (const palavra of String(t).split(' ')) {
      if (atual && (atual + ' ' + palavra).length > max) { partes.push(atual); atual = palavra; } else atual = atual ? atual + ' ' + palavra : palavra;
    }
    partes.push(atual);
    for (const parte of partes) {
      if (y < 60) { paginas.push([]); y = 792; }
      if (parte) paginas.at(-1).push(Buffer.concat([Buffer.from(`BT /F${forte ? 2 : 1} ${tam} Tf 50 ${y} Td (`), latin(parte), Buffer.from(') Tj ET\n')]));
      y -= Math.round(tam * 1.45);
    }
  }
  const fonte = nome => `<< /Type /Font /Subtype /Type1 /BaseFont /${nome} /Encoding /WinAnsiEncoding >>`;
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${paginas.map((_, i) => `${5 + 2 * i} 0 R`).join(' ')}] /Count ${paginas.length} >>`, fonte('Helvetica'), fonte('Helvetica-Bold')];
  paginas.forEach((p, i) => {
    const conteudo = Buffer.concat(p);
    objs.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + 2 * i} 0 R >>`);
    objs.push(Buffer.concat([Buffer.from(`<< /Length ${conteudo.length} >>\nstream\n`), conteudo, Buffer.from('endstream')]));
  });
  const blocos = [Buffer.from('%PDF-1.4\n')], pos = [];
  let tamanho = blocos[0].length;
  const junta = b => { blocos.push(b); tamanho += b.length; };
  objs.forEach((o, i) => {
    pos.push(tamanho);
    junta(Buffer.from(`${i + 1} 0 obj\n`)); junta(Buffer.isBuffer(o) ? o : Buffer.from(o)); junta(Buffer.from('\nendobj\n'));
  });
  junta(Buffer.from(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${pos.map(p => String(p).padStart(10, '0') + ' 00000 n \n').join('')}`
    + `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${tamanho}\n%%EOF\n`));
  return Buffer.concat(blocos);
};

// ---------- e-mail ----------
const b64 = s => Buffer.from(s).toString('base64');
const em76 = s => s.replace(/.{76}/g, '$&\r\n');
const limpo = s => String(s).replace(/[\r\n]+/g, ' ').trim(); // nada de quebra de linha em cabeçalho
const endereco = s => (/<([^<>\s]+)>/.exec(s)?.[1] || String(s)).trim();

function mensagem(de, { para, assunto, texto, anexo }) {
  const limite = 'account-' + crypto.randomUUID();
  const partes = [`--${limite}`, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', em76(b64(texto))];
  if (anexo) {
    const nome = limpo(anexo.nome).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w.]+/g, '-'); // sem acento nem espaço
    partes.push(`--${limite}`, `Content-Type: ${anexo.mime}; name="${nome}"`, 'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${nome}"`, '', em76(anexo.dados.toString('base64')));
  }
  const nome = (/</.test(de) ? limpo(de.split('<')[0]) : 'ACCOUNT').replace(/"/g, ''); // nome com acento vai codificado
  return [`From: ${/^[\x20-\x7e]*$/.test(nome) ? `"${nome}"` : `=?UTF-8?B?${b64(nome)}?=`} <${endereco(de)}>`, `To: ${para.map(limpo).join(', ')}`, `Subject: =?UTF-8?B?${b64(limpo(assunto))}?=`,
    `Date: ${new Date().toUTCString().replace('GMT', '+0000')}`, `Message-ID: <${crypto.randomUUID()}@account>`, 'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${limite}"`, '', ...partes, `--${limite}--`].join('\r\n');
}

// Respostas do servidor, uma por vez: "250-..." continua e "250 ..." fecha a resposta.
function leitor(sock) {
  let buf = '';
  const prontas = [], espera = [];
  const acabou = e => { for (const w of espera.splice(0)) w.erro(e instanceof Error ? e : new Error('O servidor de e-mail fechou a conexão.')); };
  sock.on('data', c => {
    buf += c;
    for (let m; (m = /^(?:\d{3}-[^\n]*\n)*(\d{3})(?!-)[^\n]*\n/.exec(buf));) {
      buf = buf.slice(m[0].length);
      const r = { cod: Number(m[1]), txt: m[0].trim() }, w = espera.shift();
      if (w) w.ok(r); else prontas.push(r);
    }
  });
  sock.on('error', acabou);
  sock.on('close', acabou);
  return () => new Promise((ok, erro) => { const r = prontas.shift(); if (r) ok(r); else espera.push({ ok, erro }); });
}

// SMTP: TLS direto na porta 465, ou STARTTLS nas outras quando o servidor oferece. Senha só vai por conexão cifrada.
async function smtp(cfg, msg) {
  const para = msg.para.map(endereco);
  let sock = cfg.porta === 465 ? tls.connect({ host: cfg.host, port: cfg.porta, servername: cfg.host }) : net.connect({ host: cfg.host, port: cfg.porta });
  let seguro = cfg.porta === 465, ler = leitor(sock);
  sock.setTimeout(20000, () => sock.destroy(new Error('O servidor de e-mail não respondeu a tempo.')));
  const cmd = async (linha, ...aceitos) => {
    if (linha != null) sock.write(linha + '\r\n');
    const r = await ler();
    if (!aceitos.includes(r.cod)) throw new Error('O servidor de e-mail recusou: ' + r.txt.split('\n').pop());
    return r;
  };
  try {
    await cmd(null, 220);
    const ola = await cmd('EHLO account', 250);
    if (!seguro && /STARTTLS/i.test(ola.txt)) {
      await cmd('STARTTLS', 220);
      sock.removeAllListeners('data');
      sock = tls.connect({ socket: sock, servername: cfg.host });
      ler = leitor(sock);
      await new Promise((ok, erro) => { sock.once('secureConnect', ok); sock.once('error', erro); });
      seguro = true;
      await cmd('EHLO account', 250);
    }
    if (cfg.usuario) {
      // A senha só vai por conexão cifrada. Exceção: 127.0.0.1, que não sai do computador (é o servidor de teste).
      if (!seguro && cfg.host !== '127.0.0.1') throw new Error('O servidor de e-mail não oferece conexão segura; a senha não foi enviada.');
      await cmd('AUTH LOGIN', 334);
      await cmd(b64(cfg.usuario), 334);
      await cmd(b64(cfg.senha), 235).catch(e => { throw Object.assign(new Error('O servidor de e-mail não aceitou o seu e-mail ou a senha. ' + e.message), { auth: true }); });
    }
    await cmd(`MAIL FROM:<${endereco(cfg.de)}>`, 250);
    for (const p of para) await cmd(`RCPT TO:<${p}>`, 250, 251);
    await cmd('DATA', 354);
    await cmd(mensagem(cfg.de, msg) + '\r\n.', 250);
    await cmd('QUIT', 221).catch(() => {});
  } finally {
    sock.destroy();
  }
}

// Envio por uma conta: { host, porta, usuario, senha, de }. Cada pessoa envia do próprio e-mail.
exports.conta = cfg => msg => smtp(cfg, msg);
// Servidor das variáveis (SMTP_HOST e SMTP_PORT), para quando o administrador não gravou um na tela E-mails.
exports.servidor = env => (env.SMTP_HOST ? { host: env.SMTP_HOST, porta: Number(env.SMTP_PORT) || 587 } : null);
