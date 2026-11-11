// Checagem ponta a ponta, duas vezes: no servidor local (server.js) e do jeito da Vercel (api/index.js com um
// Redis de mentira), os dois apontados para um AudiHoras de mentira. node test.js
const { spawn } = require('node:child_process');
const http = require('node:http');
const assert = require('node:assert');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const R = require('./public/regras.js');
const AH = require('./audihoras.js');
const Nucleo = require('./nucleo.js');
const mock = require('./audihoras-mock.js');

const PORTA_LOCAL = 3999, PORTA_AH = 3998, PORTA_REDIS = 3997, PORTA_VERCEL = 3996, PORTA_SMTP = 3995;
const SMTP = { SMTP_HOST: '127.0.0.1', SMTP_PORT: PORTA_SMTP, EMAIL_FROM: 'account@auditeste.com.br' };
const AH_URL = `http://127.0.0.1:${PORTA_AH}/`, ADMIN_EMAIL = 'admin@auditeste.com.br';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'account-'));
const servidor = (porta, fn) => http.createServer(fn).listen(porta, '127.0.0.1');
const corpoJson = req => new Promise(ok => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => ok(JSON.parse(b || '{}'))); });

// AudiHoras de mentira (audihoras-mock.js): qualquer usuário entra com a senha demo; só "gestor" é gestor.
const ahFalso = servidor(PORTA_AH, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(mock.responder(req.url.slice(1), await corpoJson(req))));
});

// Servidor de e-mail de mentira (smtp-falso.js): guarda cada mensagem que chega para o teste olhar.
const smtpFalso = require('./smtp-falso.js')(PORTA_SMTP), { emails } = smtpFalso;

// Redis de mentira com a API REST da Upstash: só os comandos que o api/index.js usa.
const redis = new Map(), expira = new Map();
function comando([op, ...a]) {
  const k = a[0];
  if (expira.get(k) < Date.now()) { redis.delete(k); expira.delete(k); }
  switch (op) {
    case 'GET': return redis.get(k) ?? null;
    case 'SET': {
      if (a.includes('NX') && redis.has(k)) return null;
      redis.set(k, String(a[1]));
      const px = a.indexOf('PX'), ex = a.indexOf('EX');
      if (px > 0) expira.set(k, Date.now() + Number(a[px + 1])); else if (ex > 0) expira.set(k, Date.now() + 1000 * a[ex + 1]); else expira.delete(k);
      return 'OK';
    }
    case 'DEL': return Number(redis.delete(k));
    case 'HGET': return redis.get(k)?.[a[1]] ?? null;
    case 'HSET': redis.set(k, { ...redis.get(k), [a[1]]: a[2] }); return 1;
    case 'EXPIRE': expira.set(k, Date.now() + 1000 * a[1]); return 1;
    case 'EVAL': { const [, , chave, valor] = a; return redis.get(chave) === valor ? Number(redis.delete(chave)) : 0; } // só a liberação da trava
  }
  throw new Error('comando não suportado: ' + op);
}
const redisFalso = servidor(PORTA_REDIS, async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ result: comando(await corpoJson(req)) }));
});

// Servidor local, como no npm start.
const srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
  env: { ...process.env, ...SMTP, PORT: PORTA_LOCAL, DATA_DIR: dir, AUDIHORAS_API: AH_URL, ADMIN_EMAIL },
  stdio: ['ignore', 'pipe', 'inherit'],
});
const localNoAr = new Promise(ok => srv.stdout.on('data', c => String(c).includes('ACCOUNT em') && ok()));

// Jeito Vercel: a mesma função que a Vercel chama, atrás de um servidor http qualquer.
Object.assign(process.env, { ...SMTP, KV_REST_API_URL: `http://127.0.0.1:${PORTA_REDIS}/`, KV_REST_API_TOKEN: 'teste', AUDIHORAS_API: AH_URL, ADMIN_EMAIL });
const vercel = servidor(PORTA_VERCEL, require('./api/index.js'));

// Um "navegador" por pessoa, cada um com o seu cookie.
const cliente = base => {
  let cookie = '';
  return async (metodo, url, body) => {
    const r = await fetch(base + url, { method: metodo, headers: { 'Content-Type': 'application/json', cookie }, body: body && JSON.stringify(body) });
    cookie = r.headers.get('set-cookie')?.split(';')[0] ?? cookie;
    const json = r.headers.get('content-type')?.includes('json');
    return { st: r.status, j: json ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
};

// O sistema inteiro pela API. docCru(id) devolve o documento do cofre como ficou guardado.
async function ponta(base, docCru) {
  const ger = cliente(base), rh = cliente(base), adm = cliente(base), anon = cliente(base);

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
  assert.equal(d.equipe.length, 12, 'inativo fica de fora; o gestor entra');
  const eu = d.equipe[0];
  assert.ok(eu.gestor && eu.id < 0 && eu.nome === 'Gestor Demonstração', 'o gestor também é uma pessoa da carteira');
  assert.ok(d.lancamentos.some(l => l.c === eu.id && l.p === 203), 'horas do gestor na gestão de contas do cliente');
  assert.deepEqual(d.projetos.filter(p => p.natureza === 1).map(p => p.id).sort(), [101, 102, 103, 104, 105]);
  assert.ok(d.projetos.some(p => p.id === 201), 'projeto interno com horas da equipe vem junto');
  assert.ok(!d.projetos.some(p => p.id === 202), 'projeto sem horas na janela fica de fora');
  assert.deepEqual(d.contas.sort(), ['Banco Aurora', 'Saúde Mais'], 'contas do gerente pelos projetos "Gestão de contas"');
  assert.ok(d.semProjeto.some(x => x.c === 13 && x.exemplos.includes('Projeto que saiu da lista') && x.min === 60), 'hora sem projeto é avisada');
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

  // Apontamentos um a um (o que antes pedia abrir o AudiHoras)
  const { j: ap } = await ger('GET', '/api/apontamentos?colab=11&ano=2026&mes=9');
  assert.deepEqual(Object.keys(ap.lancamentos[0]).sort(), ['atividade', 'd', 'final', 'inicio', 'min', 'obs', 'p', 'projeto']);
  assert.equal(ap.lancamentos.reduce((t, l) => t + l.min, 0), d.lancamentos.filter(l => l.c === 11 && l.a === 2026 && l.m === 9).reduce((t, l) => t + l.min, 0), 'mesmas horas da coleta');
  assert.ok(ap.lancamentos.some(l => l.projeto === 'Banco Aurora' && l.atividade === 'Execução de testes' && l.obs === 'Ciclo da sprint' && l.inicio === '13:00'));
  assert.ok((await ger('GET', `/api/apontamentos?colab=${eu.id}&ano=2026&mes=9`)).j.lancamentos.some(l => l.p === 204), 'apontamentos do próprio gestor');
  const solto = d.semProjeto.find(x => x.c === 13);
  assert.ok((await ger('GET', `/api/apontamentos?colab=13&ano=${solto.a}&mes=${solto.m}`)).j.lancamentos.some(l => l.p === null && l.projeto === 'Projeto que saiu da lista'), 'o que não casou com projeto aparece com o nome que veio');
  assert.equal((await ger('GET', '/api/apontamentos?colab=999&ano=2026&mes=9')).st, 404, 'apontamentos só de quem é da equipe');

  // Ausências
  const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4 atestado').toString('base64');
  const base_ = { colabId: 11, tipo: 'atestado', inicio: '2026-09-21', fim: '2026-09-22', obs: 'teste' };
  assert.equal((await ger('POST', '/api/registros', { ...base_, colabId: 999 })).st, 403, 'fora da equipe');
  assert.equal((await ger('POST', '/api/registros', { ...base_, fim: '2026-09-01' })).st, 400, 'período invertido');
  assert.equal((await ger('POST', '/api/registros', { ...base_, arquivo: { nome: 'x.html', dataUrl: 'data:text/html;base64,PGI+' } })).st, 400, 'tipo de arquivo');
  const { j: reg } = await ger('POST', '/api/registros', { ...base_, arquivo: { nome: 'atestado.pdf', dataUrl: pdf } });
  assert.equal(reg.documento, true);
  assert.equal(reg.arquivo.nome, 'atestado.pdf', 'gerente com a permissão do cofre vê o documento da própria equipe');
  assert.equal((await ger('POST', '/api/registros', { ...base_, tipo: 'outro', inicio: '2026-09-29', fim: '2026-09-29', obs: '' })).st, 400, '"outro motivo" exige contar o que aconteceu');
  const sob = await ger('POST', '/api/registros', { ...base_, tipo: 'falta', fim: '2026-09-21' });
  assert.equal(sob.st, 409);
  assert.equal(sob.j.sobreposto, true);
  const { j: falta } = await ger('POST', '/api/registros', { ...base_, tipo: 'falta', inicio: '2026-09-28', fim: '2026-09-28', arquivo: undefined });
  assert.equal((await ger('POST', `/api/registros/${falta.id}/status`, { status: 'validada' })).st, 403, 'gerente não valida');
  assert.equal((await ger('POST', `/api/registros/${falta.id}/status`, { status: 'cancelada' })).st, 400, 'cancelar exige motivo');

  // RH e cofre
  assert.equal((await rh('POST', '/api/login', { usuario: 'rh@auditeste.com.br', senha: 'demo' })).st, 200, 'o e-mail também serve: vale o começo');
  const { j: todos } = await rh('GET', '/api/rh');
  const doc = todos.registros.find(r => r.id === reg.id).arquivo;
  assert.equal((await rh('GET', '/api/foto/11')).st, 403, 'RH não lê fotos do AudiHoras');
  assert.equal((await rh('GET', '/api/arquivo/' + doc.id)).j.toString(), '%PDF-1.4 atestado');
  // Cofre para o gerente: baixa os documentos da própria equipe, até o administrador tirar a permissão.
  assert.equal((await ger('GET', '/api/arquivo/' + doc.id)).j.toString(), '%PDF-1.4 atestado', 'gerente baixa documento da equipe dele');
  assert.equal((await adm('GET', '/api/arquivo/' + doc.id)).st, 403, 'administrador não abre o cofre');
  const gerente = (await adm('GET', '/api/usuarios')).j.usuarios.find(u => u.email === 'gerente@auditeste.com.br');
  assert.equal(gerente.cofre, true);
  await adm('POST', `/api/usuarios/${gerente.id}`, { perfil: 'gerente', audihoras: 'gestor', cofre: 'nao' });
  assert.equal((await ger('GET', '/api/arquivo/' + doc.id)).st, 403, 'sem a permissão, o gerente não abre');
  assert.equal((await ger('GET', '/api/me')).j.usuario.cofre, false);
  const semCofre = (await ger('GET', '/api/dados?ano=2026&mes=9')).j.registros.find(r => r.id === reg.id);
  assert.ok(semCofre.documento && semCofre.arquivo === undefined, 'e volta a ver só que o documento existe');
  await adm('POST', `/api/usuarios/${gerente.id}`, { perfil: 'gerente', audihoras: 'gestor', cofre: 'sim' });
  assert.equal((await ger('GET', '/api/me')).j.usuario.cofre, true, 'a sessão continua e a permissão volta');
  assert.ok(!docCru(doc.id).includes('%PDF'), 'documento guardado cifrado');
  assert.equal((await rh('POST', `/api/registros/${reg.id}/status`, { status: 'validada' })).j.status, 'validada');

  // Fechamento de set/2026: leva até "em conferência" antes de começar, qualquer que seja a situação inicial.
  const f = (acao, obs) => ger('POST', '/api/fechamentos', { ano: 2026, mes: 9, projetoId: 101, acao, obs });
  assert.equal((await ger('POST', '/api/fechamentos', { ano: 2026, mes: 9, projetoId: 999, acao: 'conferir' })).st, 403);
  const inicial = (await ger('GET', '/api/dados?ano=2026&mes=9')).j.fechamentos['2026-09|101']?.status || 'preparacao';
  if (inicial === 'aprovado') assert.equal((await f('reabrir', 'Preparar o teste')).j.status, 'reaberto');
  if (inicial !== 'conferencia') assert.equal((await f('conferir')).j.status, 'conferencia');
  assert.equal((await f('aprovar')).st, 409, 'precisa decidir as ausências antes de aprovar');
  const okPessoa = await ger('POST', '/api/fechamentos/conferido', { ano: 2026, mes: 9, projetoId: 101, colabId: 11, ok: true });
  assert.equal(okPessoa.j.conferidos?.[11]?.por, 'Gestor', 'OK do gerente no profissional');
  assert.equal((await ger('POST', '/api/fechamentos/conferido', { ano: 2026, mes: 9, projetoId: 101, colabId: 999, ok: true })).st, 403, 'OK só para a equipe');
  // Validação do recurso: depois do OK, finalizar gera o PDF e manda o e-mail, sem repetir sozinho.
  const validar = corpo => ger('POST', '/api/fechamentos/validar', { ano: 2026, mes: 9, projetoId: 101, ...corpo });
  const antes = emails.length;
  assert.equal((await validar({ colabIds: [12] })).st, 409, 'sem OK não finaliza');
  assert.equal((await validar({ colabIds: [] })).st, 400);
  const { j: semDestino } = await validar({ colabIds: [11] });
  assert.deepEqual([semDestino.validacoes[11].envio.status, emails.length], ['pendente', antes], 'sem destino configurado, o registro fica e o e-mail espera');
  const pdf1 = await ger('GET', '/api/validacao/' + semDestino.validacoes[11].docId);
  assert.equal(pdf1.j.subarray(0, 5).toString(), '%PDF-', 'documento da validação');
  assert.equal((await rh('GET', '/api/validacao/' + semDestino.validacoes[11].docId)).st, 403);
  assert.equal((await ger('GET', '/api/config')).st, 403, 'só o administrador configura o destino');
  assert.equal((await adm('POST', '/api/config', { emailValidacao: 'financeiro@auditeste.com.br; torto' })).st, 400);
  const { j: cfg } = await adm('POST', '/api/config', { emailValidacao: 'Financeiro@auditeste.com.br; rh@auditeste.com.br' });
  assert.deepEqual([cfg.emailValidacao, cfg.envioLigado, cfg.remetente], [['financeiro@auditeste.com.br', 'rh@auditeste.com.br'], true, 'account@auditeste.com.br']);
  assert.equal((await adm('POST', '/api/config/teste')).st, 200);
  assert.ok(emails.at(-1).includes('To: financeiro@auditeste.com.br, rh@auditeste.com.br') && emails.length === antes + 1, 'e-mail de teste');
  const { j: enviado } = await validar({ colabIds: [11] });
  assert.equal(enviado.validacoes[11].envio.status, 'enviado', 'o que estava esperando vai sem pedir "reenviar"');
  assert.ok(emails.length === antes + 2 && emails.at(-1).includes('filename="Validacao-2026-09-Banco-Aurora.pdf"') && emails.at(-1).includes('JVBERi0xLjQ'), 'e-mail com o PDF anexo');
  assert.ok(Buffer.from(/base64\r\n\r\n([\s\S]+?)\r\n--/.exec(emails.at(-1))[1], 'base64').toString().includes('o recurso foi devidamente validado e está tudo OK'));
  assert.equal((await ger('GET', '/api/validacao/' + semDestino.validacoes[11].docId)).st, 404, 'o documento antigo deu lugar ao novo');
  const repetido = await validar({ colabIds: [11] });
  assert.ok(repetido.st === 409 && repetido.j.jaEnviado && emails.length === antes + 2, 'não manda duas vezes sem querer');
  assert.equal((await validar({ colabIds: [11], reenviar: true })).st, 200);
  assert.equal(emails.length, antes + 3, 'reenvio só quando pedido');
  assert.equal((await ger('POST', '/api/fechamentos/conferido', { ano: 2026, mes: 9, projetoId: 101, colabId: 11, ok: false })).st, 409, 'OK de recurso já validado não sai');
  assert.equal((await adm('GET', '/api/config')).j.envios[0].status, 'enviado');

  // Projetos: criar no ACCOUNT, equipe escolhida à mão (com papel), checklist e ligação com o projeto do AudiHoras.
  assert.equal((await ger('POST', '/api/projetos', { nome: 'Banco aurora' })).st, 409, 'nome que já existe na carteira');
  assert.equal((await ger('POST', '/api/projetos', { nome: 'Ailos Fase 2', membros: [{ colabId: 999 }] })).st, 403, 'pessoa fora da equipe');
  const { j: novoP } = await ger('POST', '/api/projetos', { nome: 'Ailos Fase 2', cliente: 'Ailos', descricao: 'Regressão', membros: [{ colabId: 11, papel: 'QA' }, { colabId: 11, papel: 'repetida' }, { colabId: eu.id, papel: 'Gestor de contas' }] });
  assert.deepEqual([novoP.id > 9e12, novoP.ficha.membros], [true, [{ c: 11, papel: 'QA' }, { c: eu.id, papel: 'Gestor de contas' }]]);
  const comNovo = (await ger('GET', '/api/dados?ano=2026&mes=9')).j;
  assert.ok(comNovo.projetos.some(p => p.id === novoP.id && p.manual && p.nome === 'Ailos Fase 2') && comNovo.fichas[novoP.id].cliente === 'Ailos');
  const item = (await ger('POST', `/api/projetos/${novoP.id}/checklist`, { acao: 'criar', texto: 'Kickoff com o cliente' })).j.checklist[0];
  assert.equal((await ger('POST', `/api/projetos/${novoP.id}/checklist`, { acao: 'marcar', id: item.id, feito: true })).j.checklist[0].feitoPor, 'Gestor');
  assert.equal((await ger('POST', `/api/projetos/${novoP.id}/checklist`, { acao: 'criar', texto: ' ' })).st, 400);
  assert.equal((await ger('POST', `/api/projetos/${novoP.id}/checklist`, { acao: 'apagar', id: 'x' })).st, 404);
  assert.deepEqual((await ger('POST', '/api/projetos/102/membros', { colabId: 12, papel: 'Líder técnico' })).j.membros, [{ c: 12, papel: 'Líder técnico' }], 'a mesma pessoa em outro projeto, com outro papel');
  assert.deepEqual((await ger('POST', '/api/projetos/102/membros', { colabId: 12, remover: true })).j.membros, []);
  assert.equal((await ger('POST', '/api/projetos/102/membros', { colabId: 999 })).st, 403);
  assert.equal((await ger('DELETE', '/api/projetos/102')).st, 403, 'projeto do AudiHoras não se exclui');
  const { j: ligado } = await ger('POST', `/api/projetos/${novoP.id}/ligar`, { alvo: 104 });
  assert.deepEqual([ligado.id, ligado.ficha.membros.length, ligado.ficha.checklist[0].feito, ligado.ficha.descricao], [104, 2, true, 'Regressão'], 'equipe, checklist e ficha passam para o projeto do AudiHoras');
  assert.ok(!(await ger('GET', '/api/dados?ano=2026&mes=9')).j.projetos.some(p => p.id === novoP.id), 'e o criado à mão some');
  const { j: outroP } = await ger('POST', '/api/projetos', { nome: 'Projeto passageiro' });
  assert.equal((await ger('POST', `/api/projetos/${outroP.id}`, { status: 'ativo', nome: 'Saúde Mais' })).st, 409, 'renomear para um nome que já existe');
  assert.equal((await ger('DELETE', `/api/projetos/${outroP.id}`)).st, 200);

  // Fichas de conta: criar uma conta à mão, completar, ver nos dados e excluir.
  const contaNova = { nome: 'Ailos', nova: true, descricao: 'Cooperativa', tecnologias: 'Java, Selenium, Java', contatos: [{ nome: 'Maria', papel: 'PO', email: 'maria@ailos.coop.br' }, {}] };
  const { j: ailos } = await ger('POST', '/api/contas', contaNova);
  assert.deepEqual([ailos.tecnologias, ailos.contatos.length, ailos.manual], [['Java', 'Selenium'], 1, true]);
  assert.equal((await ger('POST', '/api/contas', contaNova)).st, 409, 'nome de conta único');
  assert.equal((await ger('POST', '/api/contas', { nome: 'Ailos', contatos: [{ email: 'x@' }] })).st, 400, 'e-mail do contato');
  assert.equal((await ger('GET', '/api/dados?ano=2026&mes=9')).j.fichasContas.Ailos.descricao, 'Cooperativa');
  assert.equal((await ger('DELETE', '/api/contas?nome=Ailos')).st, 200);
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
  const admin = (await adm('GET', '/api/usuarios')).j.usuarios.find(u => u.email === ADMIN_EMAIL);
  assert.equal((await adm('POST', `/api/usuarios/${admin.id}`, { perfil: 'total' })).st, 200, 'administrador passa a si mesmo para acesso total');
  assert.equal((await adm('GET', '/api/rh')).st, 200);
  const semHoras = await adm('GET', '/api/dados?ano=2026&mes=9');
  assert.ok(semHoras.st === 200 && semHoras.j.semHoras && !semHoras.j.lancamentos, 'sem gestor no AudiHoras, sem horas');
  assert.equal((await adm('POST', '/api/registros', { colabId: 11, tipo: 'falta', inicio: '2026-09-29', fim: '2026-09-29' })).st, 403, 'nem registra ausência');
  assert.equal((await adm('GET', '/api/me')).j.usuario.perfil, 'total', 'e a sessão continua');
  const { j: novo } = await adm('POST', '/api/usuarios', { nome: 'Nova Pessoa', email: 'nova@auditeste.com.br', perfil: 'financeiro' });
  assert.equal(novo.vinculo, 'nova', 'vínculo pelo começo do e-mail');
  assert.equal((await adm('POST', '/api/usuarios', { nome: 'X', email: 'nova@auditeste.com.br', perfil: 'rh' })).st, 409, 'e-mail único');
  assert.equal((await adm('POST', '/api/usuarios', { nome: 'X', email: 'x@outro.com', perfil: 'rh', audihoras: 'Nova' })).st, 409, 'um usuário do AudiHoras, uma conta');
  const nova = cliente(base);
  assert.equal((await nova('POST', '/api/login', { usuario: 'nova', senha: 'demo' })).st, 200, 'entra direto, sem convite');
  await adm('POST', `/api/usuarios/${novo.id}`, { perfil: 'financeiro', audihoras: 'outra.pessoa' });
  assert.equal((await nova('GET', '/api/me')).j.usuario, undefined, 'trocar o usuário do AudiHoras derruba a sessão');
  await adm('POST', `/api/usuarios/${novo.id}`, { perfil: 'financeiro', audihoras: '' });
  assert.equal((await nova('POST', '/api/login', { usuario: 'nova', senha: 'demo' })).st, 200);
  await adm('POST', `/api/usuarios/${novo.id}/status`, { status: 'bloqueado' });
  assert.equal((await nova('GET', '/api/me')).j.usuario, undefined, 'bloqueio derruba a sessão');
  assert.equal((await nova('POST', '/api/login', { usuario: 'nova', senha: 'demo' })).j.erro, 'Seu acesso está indisponível. Contate o administrador.');
  await adm('POST', `/api/usuarios/${novo.id}/status`, { status: 'ativo' });
  await adm('POST', `/api/usuarios/${novo.id}`, { perfil: 'gerente', audihoras: '' });
  assert.equal((await nova('POST', '/api/login', { usuario: 'nova', senha: 'demo' })).st, 403, 'gerente precisa ser gestor no AudiHoras');
  const acoes = (await adm('GET', '/api/auditoria')).j.map(a => a.acao);
  for (const a of ['documento_aberto', 'fechamento_aprovar', 'usuario_bloqueado', 'ausencia_registrada', 'validacao_enviado', 'validacao_pendente', 'projeto_criado', 'projeto_ligado', 'config_email']) assert.ok(acoes.includes(a), 'auditoria: ' + a);

  for (let i = 0; i < 5; i++) await anon('POST', '/api/login', { usuario: 'rh', senha: 'x' });
  assert.equal((await anon('POST', '/api/login', { usuario: 'rh', senha: 'demo' })).st, 429, 'bloqueio por tentativas');

  assert.equal((await ger('POST', '/api/logout')).st, 200);
  assert.equal((await ger('GET', '/api/dados?ano=2026&mes=9')).st, 401);
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

  // AudiHoras que não entrega as horas do próprio gestor: a carteira abre do mesmo jeito, só com os liderados.
  let foco = 0;
  const ahManco = servidor(3994, async (req, res) => {
    const servico = req.url.slice(1), b = await corpoJson(req), r = mock.responder(servico, b);
    if (servico === 'SetLiderado') foco = b.idLiderado;
    res.end(JSON.stringify(servico === 'PesquisaApontamentos' && !foco ? { ...r, rc: false, detalhe: 'sem apontamentos' } : r));
  });
  const semGestor = await AH.dados(await AH.conectar('http://127.0.0.1:3994/', 'gestor', 'demo'), 2026, 9);
  ahManco.close();
  assert.ok(semGestor.equipe.length === 11 && semGestor.equipe.every(c => c.id > 0) && semGestor.lancamentos.every(l => l.c > 0), 'sem as horas do gestor, segue a equipe');

  await localNoAr;
  await ponta(`http://127.0.0.1:${PORTA_LOCAL}`, id => fs.readFileSync(path.join(dir, 'cofre', id)));
  console.log('ok: servidor local');

  await ponta(`http://127.0.0.1:${PORTA_VERCEL}`, id => Buffer.from(redis.get('account:doc:' + id), 'base64'));
  // No Redis não pode ficar nada que sirva de senha do AudiHoras, nem o sid de alguém.
  const pmdGestor = AH.md5('gestor' + AH.md5('audi' + 'demo'));
  const tudo = JSON.stringify([...redis]);
  assert.ok(!tudo.includes(pmdGestor), 'pmd do AudiHoras cifrado no Redis');
  assert.ok(![...redis.keys()].some(k => k.startsWith('account:trava:')), 'nenhuma trava esquecida');
  console.log('ok: jeito Vercel (Redis)');
  console.log('ok: ACCOUNT passou em todas as checagens');
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => {
  srv.kill();
  for (const s of [ahFalso, redisFalso, vercel, smtpFalso]) s.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
