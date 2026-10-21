// Varredura das telas: o ACCOUNT com um AudiHoras de mentira; um navegador por perfil passa por todas as telas e ações,
// no celular e no PDF, e anota erro de JavaScript, texto quebrado ("undefined", "NaN"...), tela estourando e aviso de erro.
//   PUPPETEER=<pasta do puppeteer> CHROME=<chrome.exe> node varredura.js        servidor local (server.js)
//   ... VERCEL=1 node varredura.js                                               função da Vercel (api/index.js) + Redis falso
// Não é dependência do projeto: usa um puppeteer já instalado em outro lugar.
const { spawn } = require('node:child_process');
const http = require('node:http'), fs = require('node:fs'), os = require('node:os'), path = require('node:path');
if (!process.env.PUPPETEER || !process.env.CHROME) { console.error('Defina PUPPETEER (pasta do puppeteer) e CHROME (executável).'); process.exit(1); }
const puppeteer = require(process.env.PUPPETEER);
const mock = require('./audihoras-mock.js');

// Dados com a cara dos reais: códigos grandes, nomes longos de projeto e de pessoa.
const FIC = require('./dados-ficticios.js');
FIC.PROJETOS.forEach((p, i) => { p.Id = 649202401 + i * 1000; });
FIC.PROJETOS[0].Nome = 'Odonto AL Auditoria como Serviço - Odonto System';
FIC.PROJETOS[1].Nome = 'Viz Delivery PC1659-03 2026 - Governança de QA';
FIC.PROJETOS[4].Nome = 'Governança Técnica e Estratégica';
FIC.EQUIPE.forEach(e => { e.id += 8400; });
FIC.EQUIPE[0].nome = 'Maria Aparecida dos Santos Oliveira Cavalcanti';

const PORTA = 3005, PORTA_AH = 3006, BASE = `http://127.0.0.1:${PORTA}`, VERCEL = process.env.VERCEL === '1';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'varre-'));
const agora = new Date().toISOString();
const u = (id, nome, email, perfil) => ({ id: `00000000-0000-4000-8000-00000000000${id}`, nome, email, perfil, audihoras: '', status: 'ativo', criadoEm: agora });
const banco = JSON.stringify({ usuarios: [
  u(1, 'Gestor Teste', 'gestor@auditeste.com.br', 'gerente'), u(2, 'Rita RH', 'rh@auditeste.com.br', 'rh'),
  u(3, 'Admin Teste', 'admin@auditeste.com.br', 'admin'), u(4, 'Fernanda Fin', 'financeiro@auditeste.com.br', 'financeiro'),
  u(5, 'Pedro Total', 'pedro@auditeste.com.br', 'total'),
], registros: [{ // ausência de alguém de fora da equipe do gestor, registrada por outro gerente
  id: '00000000-0000-4000-8000-0000000000aa', colabId: 999, colab: 'Pessoa de Outra Equipe', tipo: 'falta', inicio: '2026-09-15', fim: '2026-09-15',
  obs: '', status: 'registrada', por: 'Outro Gerente', em: agora, historico: [{ status: 'registrada', obs: '', por: 'Outro Gerente', em: agora }],
}] });
fs.writeFileSync(path.join(dir, 'db.json'), banco);
const ah = http.createServer((req, res) => {
  let b = ''; req.on('data', c => { b += c; });
  req.on('end', () => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(mock.responder(req.url.slice(1), JSON.parse(b || '{}')))); });
}).listen(PORTA_AH, '127.0.0.1');

let srv, noAr;
if (VERCEL) {
  const redis = new Map([['account:banco', banco]]), expira = new Map();
  const comando = ([op, ...a]) => {
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
      case 'EVAL': { const [, , chave, valor] = a; return redis.get(chave) === valor ? Number(redis.delete(chave)) : 0; }
    }
    throw new Error('comando não suportado: ' + op);
  };
  http.createServer((req, res) => { let b = ''; req.on('data', c => { b += c; }); req.on('end', () => res.end(JSON.stringify({ result: comando(JSON.parse(b)) }))); }).listen(3007, '127.0.0.1');
  Object.assign(process.env, { KV_REST_API_URL: 'http://127.0.0.1:3007/', KV_REST_API_TOKEN: 'x', AUDIHORAS_API: `http://127.0.0.1:${PORTA_AH}/` });
  const funcao = require('./api/index.js');
  const TIPO = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
  const s = http.createServer((req, res) => {
    const p = new URL(req.url, 'http://x').pathname;
    if (p.startsWith('/api/')) return funcao(req, res);
    const arq = path.join(__dirname, 'public', p === '/' ? 'index.html' : p);
    if (!fs.existsSync(arq)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': TIPO[path.extname(arq)] }); fs.createReadStream(arq).pipe(res);
  }).listen(PORTA, '127.0.0.1');
  srv = { kill: () => s.close() };
  noAr = Promise.resolve();
} else {
  srv = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    env: { ...process.env, PORT: PORTA, DATA_DIR: dir, AUDIHORAS_API: `http://127.0.0.1:${PORTA_AH}/` }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  noAr = new Promise(ok => srv.stdout.on('data', c => String(c).includes('ACCOUNT em') && ok()));
}

const problemas = [], feitos = [];
const sleep = ms => new Promise(ok => setTimeout(ok, ms));
const pdf = path.join(dir, 'atestado.pdf');
fs.writeFileSync(pdf, '%PDF-1.4 atestado de teste');

async function abrir(browser, quem, largura = 1366) {
  const ctx = await (browser.createBrowserContext ? browser.createBrowserContext() : browser.createIncognitoBrowserContext());
  const page = await ctx.newPage(); // cada pessoa com os próprios cookies
  await page.setViewport({ width: largura, height: 900 });
  page.on('console', m => m.type() === 'error' && !/status of 4(01|03|04|09)/.test(m.text()) && problemas.push(`${quem}: console ${m.text()}`));
  page.on('pageerror', e => problemas.push(`${quem}: ERRO JS ${e.message}`));
  page.on('response', r => { if (r.status() >= 500) problemas.push(`${quem}: HTTP ${r.status()} ${r.url()}`); });
  return page;
}
const pronto = page => page.waitForFunction(() => !document.querySelector('#conteudo .esq') && !document.querySelector('#conteudo.carregando'), { timeout: 20000 });
async function entrar(page, usuario) {
  await page.goto(BASE);
  await page.waitForSelector('#form-login');
  await page.type('input[name=usuario]', usuario);
  await page.type('input[name=senha]', 'demo');
  await page.click('#form-login .btn');
  await page.waitForFunction(() => !document.querySelector('#app').hidden, { timeout: 20000 });
  await pronto(page);
}
async function checar(page, quem, onde) {
  feitos.push(quem + ' | ' + onde);
  await sleep(250);
  const r = await page.evaluate(() => ({
    t: document.querySelector('#conteudo').innerText + ' ' + (document.querySelector('#contexto')?.innerText || ''),
    larg: document.scrollingElement.scrollWidth - innerWidth,
    quem: [...document.querySelectorAll('body *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(e).display !== 'none')
      .map(e => { let n = 0, x = e; while ((x = x.parentElement)) n++; return [n, e]; }).sort((a, b) => a[0] - b[0]).slice(0, 3)
      .map(([, e]) => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 25)} "${(e.innerText || '').trim().slice(0, 30).split(String.fromCharCode(10)).join(' ')}"`),
    toast: !document.querySelector('#toast').hidden && document.querySelector('#toast').className === 'erro' ? document.querySelector('#toast').textContent : '',
  }));
  for (const ruim of ['undefined', 'NaN', '[object Object]', 'Erro interno', 'Invalid Date', 'null']) if (r.t.includes(ruim)) problemas.push(`${quem} ${onde}: aparece "${ruim}" na tela`);
  if (r.larg > 2) problemas.push(`${quem} ${onde}: página ${r.larg}px mais larga que a tela: ${r.quem.join(' | ')}`);
  if (r.toast) problemas.push(`${quem} ${onde}: aviso de erro "${r.toast}"`);
}
async function ir(page, quem, hash) {
  await page.evaluate(h => { location.hash = h; }, hash);
  await pronto(page);
  await checar(page, quem, hash);
}
// Diálogo: preenche (nome -> valor) e confirma; erro dentro do diálogo vira problema.
async function dialogo(page, quem, onde, valores = {}) {
  await page.waitForFunction(() => document.querySelector('#dialogo').open, { timeout: 5000 }).catch(() => problemas.push(`${quem} ${onde}: diálogo não abriu`));
  await page.evaluate(v => { const f = document.querySelector('#dialogo form'); for (const [k, x] of Object.entries(v)) { const el = f.elements[k]; if (el) el.value = x; } }, valores);
  await page.evaluate(() => document.querySelector('#dialogo .dlg-acoes button:last-child').click());
  await sleep(900);
  const r = await page.evaluate(() => ({ aberto: document.querySelector('#dialogo').open, erro: document.querySelector('#dialogo .dlg-erro')?.textContent || '' }));
  if (r.aberto) { problemas.push(`${quem} ${onde}: diálogo não fechou${r.erro ? ` (${r.erro})` : ''}`); await page.evaluate(() => document.querySelector('#dialogo').close()); }
  await pronto(page);
  await checar(page, quem, onde);
}
const toast = page => page.evaluate(() => [document.querySelector('#toast').textContent, document.querySelector('#toast').className]);
async function menu(page, quem) {
  for (const h of await page.$$eval('#menu a', l => l.map(a => a.getAttribute('href')))) await ir(page, quem, h);
}

async function gerente(browser, quem, usuario) {
  const page = await abrir(browser, quem);
  await entrar(page, usuario);
  await menu(page, quem);
  const ids = await page.evaluate(() => meus(true).map(p => p.id));
  if (!ids.length) problemas.push(`${quem}: nenhum projeto na carteira`);
  for (const n of [1, 2, 6, 12]) {
    await page.evaluate(n => { const d = new Date(HOJE.getFullYear(), HOJE.getMonth() - n, 1); trocarMes(`${d.getFullYear()}-${d.getMonth() + 1}`); }, n);
    await pronto(page); await sleep(400);
    await checar(page, quem, `#visao (${n} meses atrás)`);
  }
  await page.evaluate(() => { const d = new Date(HOJE.getFullYear(), HOJE.getMonth() - 1, 1); trocarMes(`${d.getFullYear()}-${d.getMonth() + 1}`); });
  await pronto(page); await sleep(400);
  // Contas: cartões da Visão, filtro por conta, exportação
  const contas = await page.evaluate(() => [...porConta(meus(true)).keys()]);
  if (!contas.length) problemas.push(`${quem}: nenhuma conta`);
  await ir(page, quem, '#visao');
  if (await page.$$eval('#conteudo .tile', l => l.length) === 0) problemas.push(`${quem}: Visão sem cartões de conta`);
  await page.evaluate(() => document.querySelector('#conteudo .tile')?.click()); await pronto(page);
  if (!(await page.evaluate(() => F.conta))) problemas.push(`${quem}: tocar no cartão da conta não filtrou a conta`);
  await checar(page, quem, '#projetos (conta do cartão)');
  for (const c of contas) { await page.evaluate(c => filtro('conta', c), c); await checar(page, quem, `#projetos conta ${c}`); }
  await page.evaluate(() => filtro('conta', ''));
  // Conta criada à mão (cliente ainda sem projeto), com descrição, tecnologias e contato; depois editar uma conta de verdade.
  await page.evaluate(() => editarContaDlg('', true));
  await page.waitForFunction(() => document.querySelector('#dialogo').open);
  await page.evaluate(() => { const i = document.querySelectorAll('#contatos-edit input'); i[0].value = 'Maria Souza'; i[1].value = 'PO'; i[2].value = 'maria@ailos.coop.br'; i[3].value = '47 3333-0000'; });
  await dialogo(page, quem, 'nova conta', { nome: 'Ailos', descricao: 'Cooperativa de crédito; testes de regressão.', tecnologias: 'Java, Selenium' });
  const ailos = await page.evaluate(() => [F.conta, D.fichasContas?.Ailos?.contatos?.length, document.querySelector('details.conta[open] .chips')?.innerText]);
  if (ailos[0] !== 'Ailos' || ailos[1] !== 1 || !String(ailos[2]).includes('Selenium')) problemas.push(`${quem}: conta nova não ficou certa (${JSON.stringify(ailos)})`);
  await page.evaluate(c => { F.conta = c; render(false); editarContaDlg(c); }, contas[0]);
  await dialogo(page, quem, 'editar conta', { descricao: 'Conta principal do gerente.', tecnologias: 'Cypress' });
  if (!(await page.evaluate(c => D.fichasContas[c]?.descricao, contas[0]))) problemas.push(`${quem}: editar conta não salvou`);
  await page.evaluate(() => { F.conta = ''; render(false); });
  await page.evaluate(() => document.querySelectorAll('details.conta').forEach(d => { d.open = true; }));
  await checar(page, quem, '#projetos todas as contas abertas');
  await page.evaluate(() => excluirConta('Ailos'));
  await dialogo(page, quem, 'excluir conta');
  if (await page.evaluate(() => !!D.fichasContas.Ailos)) problemas.push(`${quem}: excluir conta não funcionou`);
  const csv = await page.evaluate(() => new Promise(ok => {
    const orig = URL.createObjectURL; URL.createObjectURL = b => { b.text().then(ok); URL.createObjectURL = orig; return orig.call(URL, b); };
    exportarRecursos('');
  }));
  const linhasCsv = csv.trim().split(/\r\n/);
  if (linhasCsv.length < 2 || !linhasCsv[0].includes('Profissional')) problemas.push(`${quem}: exportação de recursos vazia ou sem cabeçalho`);
  // Projetos: abrir todos, filtros, ficha
  await ir(page, quem, '#projetos');
  await page.evaluate(() => document.querySelectorAll('details.projeto').forEach(d => { d.open = true; }));
  await checar(page, quem, '#projetos (todos abertos)');
  await page.evaluate(() => filtro('prjStatus', 'aguardando')); await checar(page, quem, '#projetos filtro status');
  await page.evaluate(() => filtro('prjStatus', '')); await page.evaluate(() => filtro('prjArq', true)); await checar(page, quem, '#projetos arquivados');
  await page.evaluate(id => editarFicha(id), ids[0]);
  await dialogo(page, quem, 'editar ficha', { cliente: '', status: 'ativo', inicio: '2026-01-01', fim: '2026-12-31', referencia: 'Contrato 1', obs: 'ok' });
  for (const id of ids) { await ir(page, quem, `#fechamento/${id}`); await ir(page, quem, `#relatorios/${id}`); }
  await ir(page, quem, '#relatorios/consolidado');
  // Equipe: filtros, ausência com documento, sobreposição, cancelar
  await ir(page, quem, '#equipe');
  await page.evaluate(id => filtro('eqProj', String(id)), ids[0]); await checar(page, quem, '#equipe filtro projeto');
  await page.evaluate(() => filtro('eqProj', ''));
  // Nome da pessoa abre as horas por projeto e as ausências
  await page.evaluate(() => document.querySelector('#conteudo .abrir').click());
  if (await page.evaluate(() => document.querySelector('#conteudo tr.linha-extra').hidden)) problemas.push(`${quem}: nome em Equipes não abriu o detalhe`);
  await checar(page, quem, '#equipe pessoa aberta');
  await page.evaluate(() => document.querySelector('#conteudo tr.linha-extra button[data-colab]').click()); await sleep(400);
  if (!(await page.evaluate(() => document.querySelector('#form-registro').colabId.value))) problemas.push(`${quem}: o botão de registrar da pessoa não preencheu o formulário`);
  const colab = await page.evaluate(i => D.equipe[i].id, quem.startsWith('Total') ? 1 : 0);
  const ini = await page.evaluate(() => { const [i] = R.limites(comp.ano, comp.mes); return i.slice(0, 8) + '10'; });
  await page.evaluate((c, ini) => { const f = document.querySelector('form.form'); f.colabId.value = c; f.tipo.value = 'atestado'; f.inicio.value = ini; f.fim.value = ini.slice(0, 8) + '12'; }, colab, ini);
  await (await page.$('form.form input[type=file]')).uploadFile(pdf);
  await page.evaluate(() => document.querySelector('form.form .btn').click()); await sleep(1500);
  const [t1, c1] = await toast(page); if (c1 === 'erro' || !/registrada/.test(t1)) problemas.push(`${quem} registrar ausência: "${t1}"`);
  await page.evaluate((c, ini) => { const f = document.querySelector('form.form'); f.colabId.value = c; f.tipo.value = 'falta'; f.inicio.value = ini; f.fim.value = ini; }, colab, ini);
  await page.evaluate(() => document.querySelector('form.form .btn').click()); await sleep(1200);
  await dialogo(page, quem, 'registrar sobreposto');
  // Outro motivo sem contar o que aconteceu: o navegador não deixa enviar; contando, registra. Licença e férias programadas.
  const outroMes = await page.evaluate(() => R.limites(comp.ano, comp.mes)[0].slice(0, 8));
  const lanca = async (tipo, ini, fim, obs, doc) => {
    await page.evaluate((c, tipo, ini, fim, obs) => { const f = document.querySelector('#form-registro'); f.colabId.value = c; f.tipo.value = tipo; f.tipo.dispatchEvent(new Event('change')); f.inicio.value = ini; f.fim.value = fim; f.obs.value = obs; }, colab, tipo, ini, fim, obs);
    if (doc) await (await page.$('#form-registro input[type=file]')).uploadFile(pdf);
    await page.evaluate(() => { document.querySelector('#toast').textContent = ''; document.querySelector('#form-registro .btn').click(); }); await sleep(1300);
    return toast(page);
  };
  if (/registrada/.test((await lanca('outro', outroMes + '20', outroMes + '20', '', false))[0])) problemas.push(`${quem}: "Outro motivo" registrou sem contar o que aconteceu`);
  const [t3] = await lanca('outro', outroMes + '20', outroMes + '20', 'Problema no transporte', false); if (!/registrada/.test(t3)) problemas.push(`${quem} registrar outro motivo: "${t3}"`);
  const [t4] = await lanca('licenca', outroMes + '24', outroMes + '26', 'Licença médica', true); if (!/registrada/.test(t4)) problemas.push(`${quem} registrar licença: "${t4}"`);
  const fut = await page.evaluate(() => { const d = new Date(); d.setDate(d.getDate() + 40); return R.iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); });
  const [t5] = await lanca('ferias', fut, fut, 'Férias programadas', false); if (!/registrada/.test(t5)) problemas.push(`${quem} programar férias: "${t5}"`);
  if (!(await page.evaluate(() => [...document.querySelectorAll('#conteudo h2')].some(h => h.textContent.includes('Programação de férias') && h.parentElement.querySelector('tbody tr:not(.vazia)')))))
    problemas.push(`${quem}: férias programadas não apareceram na programação`);
  await page.evaluate(() => filtro('hStatus', '')); await checar(page, quem, '#equipe histórico todas');
  const regId = await page.evaluate(() => D.registros.find(r => r.tipo === 'falta' && r.status !== 'cancelada')?.id);
  if (regId) { await page.evaluate(id => cancelarRegistro(id), regId); await dialogo(page, quem, 'cancelar ausência', { obs: 'Lançada por engano' }); }
  // Fechamento completo do primeiro projeto
  await ir(page, quem, `#fechamento/${ids[0]}`);
  if (await page.evaluate(id => fechDe(id).status, ids[0]) === 'aprovado') { await page.evaluate(id => acaoFech(id, 'reabrir'), ids[0]); await dialogo(page, quem, 'reabrir', { obs: 'Teste' }); }
  if (await page.evaluate(id => fechDe(id).status !== 'conferencia', ids[0])) { await page.evaluate(id => acaoFech(id, 'conferir'), ids[0]); await sleep(1000); await pronto(page); }
  // Nome abre as horas da pessoa por projeto; OK marca e a linha continua aberta
  await page.evaluate(() => document.querySelector('#conteudo .abrir').click());
  if (await page.evaluate(() => document.querySelector('#conteudo tr.linha-extra').hidden)) problemas.push(`${quem}: nome no Fechamento não abriu as horas`);
  await page.evaluate(() => document.querySelector('#conteudo button.btn-ok:not(.feito)').click()); await sleep(900); await pronto(page);
  if (!(await page.evaluate(() => document.querySelector('#conteudo button.btn-ok.feito')))) problemas.push(`${quem}: OK do profissional não marcou`);
  if (await page.evaluate(() => document.querySelector('#conteudo tr.linha-extra').hidden)) problemas.push(`${quem}: a linha aberta fechou depois do OK`);
  await checar(page, quem, 'fechamento com OK');
  const nDec = await page.$$eval('#conteudo select[aria-label="Decisão"]', l => l.length);
  for (let i = 0; i < nDec; i++) {
    await page.evaluate(i => { const s = document.querySelectorAll('#conteudo select[aria-label="Decisão"]')[i]; s.value = 'deduzir'; s.dispatchEvent(new Event('change')); }, i);
    await sleep(700);
  }
  await page.evaluate(id => acaoFech(id, 'aprovar'), ids[0]);
  await dialogo(page, quem, 'aprovar fechamento', { obs: 'Conferido' });
  if (await page.evaluate(id => fechDe(id).status, ids[0]) !== 'aprovado') problemas.push(`${quem}: fechamento não ficou aprovado`);
  // Relatório: comentário
  await ir(page, quem, '#relatorios/consolidado');
  await page.evaluate(() => { document.querySelector('#comentario').value = 'Comentário de teste'; });
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Salvar comentário')).click()); await sleep(900);
  const [t2, c2] = await toast(page); if (c2 === 'erro') problemas.push(`${quem} salvar comentário: "${t2}"`);
  await page.evaluate(() => carregar(true)); await pronto(page); await sleep(500); await checar(page, quem, 'atualizar');
  // Relatório por conta, com uma parte tirada do PDF
  await ir(page, quem, '#relatorios/' + encodeURIComponent('conta:' + contas[0]));
  if (!(await page.evaluate(c => document.querySelector('#conteudo h1').textContent.includes(c), contas[0]))) problemas.push(`${quem}: relatório por conta não abriu`);
  await page.evaluate(() => alternarParte('financeiro', false));
  if (!(await page.evaluate(() => document.querySelector('[data-parte="financeiro"].fora-do-pdf')))) problemas.push(`${quem}: tirar parte do PDF não marcou`);
  await page.emulateMediaType('print');
  if (await page.evaluate(() => getComputedStyle(document.querySelector('[data-parte="financeiro"]')).display !== 'none')) problemas.push(`${quem}: parte tirada ainda sai no PDF`);
  if (!(await page.evaluate(() => document.querySelector('[data-parte="detalhe"] svg.grafico')))) problemas.push(`${quem}: detalhamento sem gráfico`);
  await page.emulateMediaType(null);
  await page.evaluate(() => alternarParte('financeiro', true));
  // PDF do relatório em A4
  await page.emulateMediaType('print'); await page.setViewport({ width: 794, height: 1123 });
  for (const h of ['#relatorios/consolidado', `#relatorios/${ids[0]}`]) {
    await ir(page, quem + ' (PDF)', h);
    const vis = await page.evaluate(() => ['.barra', '.contexto', '.abas-movel', '#toast'].filter(s => { const e = document.querySelector(s); return e && getComputedStyle(e).display !== 'none'; }));
    if (vis.length) problemas.push(`${quem} (PDF) ${h}: aparece na impressão: ${vis.join(', ')}`);
  }
  await page.emulateMediaType(null);
  // Celular
  await page.setViewport({ width: 375, height: 800 });
  for (const h of ['#visao', '#projetos', '#equipe', `#fechamento/${ids[0]}`, '#relatorios/consolidado']) await ir(page, quem + ' (celular)', h);
  if (await page.evaluate(() => getComputedStyle(document.querySelector('#menu-movel')).display) === 'none') problemas.push(`${quem} (celular): menu de baixo não aparece`);
  await page.setViewport({ width: 1366, height: 900 });
}

async function rh(browser, quem, usuario) {
  const page = await abrir(browser, quem);
  await entrar(page, usuario);
  await menu(page, quem);
  await ir(page, quem, '#validacao');
  await page.evaluate(() => filtro('rhStatus', '')); await checar(page, quem, '#validacao todas');
  const reg = await page.evaluate(() => RHD.registros.find(r => r.status === 'registrada' && r.tipo === 'atestado'));
  if (!reg) problemas.push(`${quem}: nenhum atestado registrado para validar`);
  else {
    await page.evaluate(id => statusRH(id, 'em_validacao'), reg.id); await sleep(900);
    await page.evaluate(id => statusRH(id, 'validada'), reg.id); await sleep(900);
    if (await page.evaluate(id => RHD.registros.find(r => r.id === id).status, reg.id) !== 'validada') problemas.push(`${quem}: validar não funcionou`);
    await page.evaluate(id => historicoRegistro(id), reg.id);
    await page.waitForFunction(() => document.querySelector('#dialogo').open, { timeout: 3000 }).catch(() => problemas.push(`${quem}: histórico não abriu`));
    await page.evaluate(() => document.querySelector('#dialogo').close());
    const doc = await page.evaluate(id => RHD.registros.find(r => r.id === id).arquivo?.id, reg.id);
    if (!doc) problemas.push(`${quem}: atestado com documento chegou sem documento`);
    else if (await page.evaluate(d => fetch('/api/arquivo/' + d).then(r => r.status), doc) !== 200) problemas.push(`${quem}: abrir documento falhou`);
    await ir(page, quem, '#validacao');
    await page.evaluate(() => filtro('rhStatus', ''));
    const input = await page.$('#conteudo input[type=file]');
    if (input) { await input.uploadFile(pdf); await sleep(1500); const [t, c] = await toast(page); if (c === 'erro') problemas.push(`${quem} anexar documento: "${t}"`); }
    else problemas.push(`${quem}: não há onde anexar documento`);
  }
  // Acesso total cancela a ausência de fora da equipe (não está na lista do gerente); o RH cancela outra.
  const outro = await page.evaluate(fora => RHD.registros.find(r => r.status !== 'cancelada' && (r.colabId === 999) === fora)?.id, quem.startsWith('Total'));
  if (outro) { await page.evaluate(id => cancelarRegistro(id), outro); await dialogo(page, quem, 'RH cancelar ausência', { obs: 'Cancelado pelo RH' }); }
  await ir(page, quem, '#cofre');
}

async function admin(browser, quem, usuario) {
  const page = await abrir(browser, quem);
  await entrar(page, usuario);
  await menu(page, quem);
  await ir(page, quem, '#usuarios');
  await page.evaluate(() => novoUsuarioDlg());
  await dialogo(page, quem, 'novo usuário', { nome: 'Nova Pessoa', email: 'nova.pessoa@auditeste.com.br', perfil: 'rh', audihoras: '' });
  const nova = await page.evaluate(() => ADM.usuarios.find(u => u.email === 'nova.pessoa@auditeste.com.br')?.id);
  if (!nova) problemas.push(`${quem}: usuário novo não apareceu`);
  else {
    await page.evaluate(id => editarUsuarioDlg(id), nova);
    await dialogo(page, quem, 'editar usuário', { nome: 'Nova Pessoa Editada', perfil: 'financeiro', audihoras: 'nova.pessoa' });
    await page.evaluate(id => statusUsuario(id, 'bloqueado'), nova); await dialogo(page, quem, 'bloquear usuário');
    await page.evaluate(id => statusUsuario(id, 'ativo'), nova); await dialogo(page, quem, 'reativar usuário');
  }
  await ir(page, quem, '#auditoria');
  return page;
}

(async () => {
  await noAr;
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME, headless: 'new' });
  try {
    await gerente(browser, 'Gerente', 'gestor');
    await rh(browser, 'RH', 'rh');
    const adm = await admin(browser, 'Admin', 'admin');
    const fin = await abrir(browser, 'Financeiro'); await entrar(fin, 'financeiro'); await menu(fin, 'Financeiro');
    const pedro = await abrir(browser, 'Total sem horas'); await entrar(pedro, 'pedro'); await menu(pedro, 'Total sem horas');
    // O gestor passa a Acesso total (como o Frade) e tudo roda de novo, inclusive as telas do RH.
    await adm.evaluate(() => api('/api/usuarios/00000000-0000-4000-8000-000000000001', { method: 'POST', body: { perfil: 'total', audihoras: 'gestor' } }));
    await gerente(browser, 'Total com horas', 'gestor');
    await rh(browser, 'Total com horas (RH)', 'gestor');
    const saiu = await abrir(browser, 'Sair'); await entrar(saiu, 'gestor'); await saiu.evaluate(() => sair()); await sleep(800);
    if (!(await saiu.$('#form-login'))) problemas.push('Sair: não voltou para o login');
  } catch (e) {
    problemas.push('VARREDURA PAROU: ' + e.message + ' | ' + String(e.stack).split(/\n/).slice(1, 4).join(' / '));
  } finally {
    await browser.close();
    srv.kill(); ah.close();
    fs.rmSync(dir, { recursive: true, force: true });
    const porQuem = {};
    for (const f of feitos) { const [q] = f.split(' | '); porQuem[q] = (porQuem[q] || 0) + 1; }
    console.log('verificações:', feitos.length, JSON.stringify(porQuem));
    console.log(problemas.length ? [...new Set(problemas)].join('\n') : 'nenhum problema encontrado');
    process.exit(problemas.length ? 1 : 0);
  }
})();
