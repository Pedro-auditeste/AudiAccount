// Checagem ponta a ponta: sobe o servidor de verdade apontado para um AudiHoras de mentira. node test.js
const { spawn } = require('node:child_process');
const http = require('node:http');
const assert = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const R = require('./public/regras.js');
const AH = require('./audihoras.js');
const Nucleo = require('./nucleo.js');
const mock = require('./audihoras-mock.js');

const PORT = 3999, BASE = `http://127.0.0.1:${PORT}`, PORTA_AH = 3998;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'account-'));
// AudiHoras de mentira (audihoras-mock.js): qualquer usuário entra com a senha demo; só "gestor" é gestor.
const ahFalso = http.createServer((req, res) => {
  let b = '';
  req.on('data', c => { b += c; });
  req.on('end', () => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(mock.responder(req.url.slice(1), JSON.parse(b || '{}'))));
  });
}).listen(PORTA_AH, '127.0.0.1');
const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, PORT, DATA_DIR: dir, AUDIHORAS_API: `http://127.0.0.1:${PORTA_AH}/`, ADMIN_EMAIL: 'admin@auditeste.com.br' },
  stdio: ['ignore', 'pipe', 'inherit'],
});

// Um "navegador" por pessoa, cada um com o seu cookie.
function cliente() {
  let cookie = '';
  return async (metodo, url, body) => {
    const r = await fetch(BASE + url, { method: metodo, headers: { 'Content-Type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    cookie = r.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    const json = r.headers.get('content-type')?.includes('json');
    return { st: r.status, j: json ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
}

(async () => {
  // Regras puras
  assert.equal(R.diasUteis('2026-09-01', '2026-09-30', { feriados: { '2026-09-07': 'Independência' } }).length, 21);
  await assert.rejects(AH.chamar({ api: 'http://x/' }, 'SetAtivo'), /somente leitura/, 'serviço de escrita bloqueado');

  // Banco antigo (com senha e convite) e primeiro acesso real: o administrador que nunca entrou dá lugar ao do ADMIN_EMAIL.
  const velho = { usuarios: [{ id: 'a', nome: 'Admin', email: 'admin@auditeste.com.br', perfil: 'admin', status: 'convite', senha: 'scrypt$x' }],
    pedidos: [], projetos: {}, registros: [], fechamentos: {}, comentarios: {}, auditoria: [] };
  const n0 = Nucleo.criar({ db: velho, salvar() {}, uuid: () => 'b' });
  assert.equal(velho.usuarios[0].senha, undefined, 'senha antiga apagada');
  assert.deepEqual(n0.garantirAdmin('Pedro.Ramos@auditeste.com.br'), { email: 'pedro.ramos@auditeste.com.br', usuario: 'pedro.ramos' });
  assert.deepEqual(velho.usuarios.map(u => [u.email, u.status]), [['pedro.ramos@auditeste.com.br', 'ativo']]);
  assert.deepEqual(n0.garantirAdmin(), { email: 'pedro.ramos@auditeste.com.br', usuario: 'pedro.ramos' }, 'sem ADMIN_EMAIL, fica quem já estava');


  await new Promise(ok => srv.stdout.on('data', c => String(c).includes('ACCOUNT em') && ok()));
  const ger = cliente(), rh = cliente(), adm = cliente(), anon = cliente();

  // Primeiro acesso: o administrador do ADMIN_EMAIL entra e cadastra a equipe do teste.
  assert.equal((await adm('POST', '/api/login', { usuario: 'admin', senha: 'demo' })).st, 200);
  assert.equal((await adm('POST', '/api/usuarios', { nome: 'Gestor', email: 'gerente@auditeste.com.br', perfil: 'gerente', audihoras: 'gestor' })).st, 200);
  assert.equal((await adm('POST', '/api/usuarios', { nome: 'Rita', email: 'rh@auditeste.com.br', perfil: 'rh' })).st, 200);
  assert.equal((await adm('POST', '/api/usuarios', { nome: 'X', email: 'x@auditeste.com.br', perfil: 'rh', audihoras: 'Senha@123' })).st, 400, 'senha no campo do usuário do AudiHoras');

  // Acesso
  assert.equal((await anon('GET', '/api/dados?ano=2026&mes=9')).st, 401);
  // Login pelo AudiHoras (o de mentira aceita qualquer usuário com a senha demo; só "gestor" é gestor)
  assert.equal((await ger('POST', '/api/login', { usuario: 'gestor', senha: 'errada' })).j.erro, 'Usuário ou senha do AudiHoras inválidos.');
  assert.equal((await anon('POST', '/api/login', { usuario: 'ninguem', senha: 'demo' })).st, 403, 'AudiHoras confere, mas sem cadastro no ACCOUNT');
  assert.equal((await ger('POST', '/api/login', { usuario: 'Gestor', senha: 'demo' })).st, 200);
  assert.equal((await ger('GET', '/api/rh')).st, 403, 'gerente não entra no RH');

  // Dados do AudiHoras
  const { j: d } = await ger('GET', '/api/dados?ano=2026&mes=9');
  assert.equal(d.equipe.length, 11, 'inativo fica de fora');
  assert.deepEqual(d.projetos.filter(p => p.natureza === 1).map(p => p.id).sort(), [101, 102, 103, 104]);
  assert.equal(d.meses.at(-1).uteis, 21, 'set/2026: 22 dias de semana menos o 7 de setembro');
  assert.equal(d.feriados['2026-09-07'], 'Independência');
  assert.ok(d.lancamentos.every(l => l.d >= 1 && l.min <= 540), 'horas por dia');
  assert.ok(d.lancamentos.some(l => l.c === 11 && l.p === 301 && l.m === 8), 'Férias (com acento) casou pelo nome');

  // Fotos do AudiHoras
  const foto = await ger('GET', '/api/foto/11');
  assert.equal(foto.st, 200);
  assert.equal(foto.j.subarray(0, 4).toString('hex'), '89504e47', 'foto chega como PNG');
  assert.equal((await ger('GET', '/api/foto/12')).j.semFoto, true, 'quem não tem foto fica com as iniciais');
  assert.equal((await ger('GET', '/api/foto/999')).st, 404, 'foto só de quem é da equipe');

  // Ausências
  const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 atestado').toString('base64');
  const base = { colabId: 11, tipo: 'atestado', inicio: '2026-09-21', fim: '2026-09-22', obs: 'teste' };
  assert.equal((await ger('POST', '/api/registros', { ...base, colabId: 999 })).st, 403, 'fora da equipe');
  assert.equal((await ger('POST', '/api/registros', { ...base, fim: '2026-09-01' })).st, 400, 'período invertido');
  assert.equal((await ger('POST', '/api/registros', { ...base, arquivo: { nome: 'x.html', dataUrl: 'data:text/html;base64,PGI+' } })).st, 400, 'tipo de arquivo');
  const { j: reg } = await ger('POST', '/api/registros', { ...base, arquivo: { nome: 'atestado.pdf', dataUrl: pdf } });
  assert.equal(reg.documento, true);
  assert.equal(reg.arquivo, undefined, 'gerente não recebe dados do documento');
  const sob = await ger('POST', '/api/registros', { ...base, tipo: 'falta', fim: '2026-09-21' });
  assert.equal(sob.st, 409);
  assert.equal(sob.j.sobreposto, true);
  const { j: falta } = await ger('POST', '/api/registros', { ...base, tipo: 'falta', inicio: '2026-09-28', fim: '2026-09-28', arquivo: undefined });
  assert.equal((await ger('POST', `/api/registros/${falta.id}/status`, { status: 'validada' })).st, 403, 'gerente não valida');
  assert.equal((await ger('POST', `/api/registros/${falta.id}/status`, { status: 'cancelada' })).st, 400, 'cancelar exige motivo');

  // RH e cofre
  assert.equal((await rh('POST', '/api/login', { usuario: 'rh@auditeste.com.br', senha: 'demo' })).st, 200, 'o e-mail também serve: vale o começo');
  const { j: todos } = await rh('GET', '/api/rh');
  const doc = todos.registros.find(r => r.id === reg.id).arquivo;
  assert.equal((await rh('GET', '/api/foto/11')).st, 403, 'RH não lê fotos do AudiHoras');
  assert.equal((await ger('GET', '/api/arquivo/' + doc.id)).st, 403, 'gerente não abre documento médico');
  assert.equal((await rh('GET', '/api/arquivo/' + doc.id)).j.toString(), '%PDF-1.4 atestado');
  assert.ok(!fs.readFileSync(path.join(dir, 'cofre', doc.id)).includes('%PDF'), 'arquivo cifrado em disco');
  assert.equal((await rh('POST', `/api/registros/${reg.id}/status`, { status: 'validada' })).j.status, 'validada');

  // Fechamento de set/2026. Os dados de exemplo acompanham a data de hoje, então o teste leva o
  // fechamento até "em conferência" antes de começar, qualquer que seja a situação inicial.
  const f = (acao, obs) => ger('POST', '/api/fechamentos', { ano: 2026, mes: 9, projetoId: 101, acao, obs });
  assert.equal((await ger('POST', '/api/fechamentos', { ano: 2026, mes: 9, projetoId: 999, acao: 'conferir' })).st, 403);
  const inicial = (await ger('GET', '/api/dados?ano=2026&mes=9')).j.fechamentos['2026-09|101']?.status || 'preparacao';
  if (inicial === 'aprovado') assert.equal((await f('reabrir', 'Preparar o teste')).j.status, 'reaberto');
  if (inicial !== 'conferencia') assert.equal((await f('conferir')).j.status, 'conferencia');
  assert.equal((await f('aprovar')).st, 409, 'precisa decidir as ausências antes de aprovar');
  const { j: d2 } = await ger('GET', '/api/dados?ano=2026&mes=9');
  const calc = R.fechamento(d2, d2.registros, 101, 2026, 9, d2.fechamentos['2026-09|101']);
  assert.ok(calc.pendentes > 0);
  for (const l of calc.linhas) for (const x of l.ausencias) {
    if (x.dias) await ger('POST', '/api/fechamentos/decisao', { ano: 2026, mes: 9, projetoId: 101, registroId: x.r.id, decisao: 'deduzir' });
  }
  const semJust = await f('aprovar');
  assert.ok(semJust.st === 409 && /divergências/.test(semJust.j.erro), 'divergência exige justificativa');
  const { j: ok } = await f('aprovar', 'Conferido com o cliente');
  assert.equal(ok.status, 'aprovado');
  const esperado = {};
  for (const l of d.lancamentos) if (l.p === 101 && l.a === 2026 && l.m === 9) esperado[l.c] = (esperado[l.c] || 0) + l.min;
  assert.deepEqual(Object.fromEntries(ok.foto.linhas.map(l => [l.c, l.projeto])), esperado, 'fotografia das horas');
  assert.equal((await ger('POST', '/api/fechamentos/decisao', { ano: 2026, mes: 9, projetoId: 101, registroId: reg.id, decisao: null })).st, 409, 'aprovado não muda');
  assert.equal((await f('reabrir')).st, 400, 'reabrir exige motivo');
  assert.equal((await f('reabrir', 'Cliente contestou')).j.status, 'reaberto');

  // Administração
  assert.equal((await ger('GET', '/api/usuarios')).st, 403);
  // Acesso total: tudo o que os outros perfis têm; as horas continuam exigindo gestor no AudiHoras.
  assert.equal((await adm('GET', '/api/rh')).st, 403);
  const eu = (await adm('GET', '/api/usuarios')).j.usuarios.find(u => u.email === 'admin@auditeste.com.br');
  assert.equal((await adm('POST', `/api/usuarios/${eu.id}`, { perfil: 'total' })).st, 200, 'administrador passa a si mesmo para acesso total');
  assert.equal((await adm('GET', '/api/rh')).st, 200);
  const semHoras = await adm('GET', '/api/dados?ano=2026&mes=9');
  assert.ok(semHoras.st === 200 && semHoras.j.semHoras && !semHoras.j.lancamentos, 'sem gestor no AudiHoras, sem horas');
  assert.equal((await adm('POST', '/api/registros', { colabId: 11, tipo: 'falta', inicio: '2026-09-29', fim: '2026-09-29' })).st, 403, 'nem registra ausência');
  assert.equal((await adm('GET', '/api/me')).j.usuario.perfil, 'total', 'e a sessão continua');
  const { j: novo } = await adm('POST', '/api/usuarios', { nome: 'Nova Pessoa', email: 'nova@auditeste.com.br', perfil: 'financeiro' });
  assert.equal(novo.vinculo, 'nova', 'vínculo pelo começo do e-mail');
  assert.equal((await adm('POST', '/api/usuarios', { nome: 'X', email: 'nova@auditeste.com.br', perfil: 'rh' })).st, 409, 'e-mail único');
  assert.equal((await adm('POST', '/api/usuarios', { nome: 'X', email: 'x@outro.demo', perfil: 'rh', audihoras: 'Nova' })).st, 409, 'um usuário do AudiHoras, uma conta');
  const nova = cliente();
  assert.equal((await nova('POST', '/api/login', { usuario: 'nova', senha: 'demo' })).st, 200, 'entra direto, sem convite');
  await adm('POST', `/api/usuarios/${novo.id}/status`, { status: 'bloqueado' });
  assert.equal((await nova('GET', '/api/me')).j.usuario, undefined, 'bloqueio derruba a sessão');
  assert.equal((await nova('POST', '/api/login', { usuario: 'nova', senha: 'demo' })).j.erro, 'Seu acesso está indisponível. Contate o administrador.');
  await adm('POST', `/api/usuarios/${novo.id}/status`, { status: 'ativo' });
  await adm('POST', `/api/usuarios/${novo.id}`, { perfil: 'gerente', audihoras: '' });
  assert.equal((await nova('POST', '/api/login', { usuario: 'nova', senha: 'demo' })).st, 403, 'gerente precisa ser gestor no AudiHoras');
  const acoes = (await adm('GET', '/api/auditoria')).j.map(a => a.acao);
  for (const a of ['documento_aberto', 'fechamento_aprovar', 'usuario_bloqueado', 'ausencia_registrada']) assert.ok(acoes.includes(a), 'auditoria: ' + a);

  for (let i = 0; i < 5; i++) await anon('POST', '/api/login', { usuario: 'rh', senha: 'x' });
  assert.equal((await anon('POST', '/api/login', { usuario: 'rh', senha: 'demo' })).st, 429, 'bloqueio por tentativas');

  assert.equal((await ger('POST', '/api/logout')).st, 200);
  assert.equal((await ger('GET', '/api/dados?ano=2026&mes=9')).st, 401);
  console.log('ok: ACCOUNT passou em todas as checagens');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
  srv.kill();
  ahFalso.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
