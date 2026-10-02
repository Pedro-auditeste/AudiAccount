'use strict';
// ACCOUNT · tela única. Cada perfil vê só o próprio menu; o servidor valida tudo de novo.
const R = window.Regras;
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const HOJE = new Date(), HOJE_ISO = R.hoje();
const LOGO = document.querySelector('.marca .logo').getAttribute('src'); // o logo entra uma vez só na página
const ICONES = {
  visao: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  projetos: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  equipe: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
  fechamento: '<rect x="3" y="4.5" width="18" height="16" rx="2"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M9 15l2 2 4-4"/>',
  relatorios: '<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 6-6"/>',
  validacao: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  cofre: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.5"/>',
  usuarios: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/>',
  auditoria: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  financeiro: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.5-1-1.6-1.5-3-1.5-1.7 0-3 .8-3 2s1.3 1.7 3 2 3 .8 3 2-1.3 2-3 2c-1.4 0-2.5-.5-3-1.5M12 6.5v11"/>',
  horas: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  alerta: '<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.5M12 17.5v.01"/>',
  sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4L6 18M18 6l1.4-1.4"/>',
  medico: '<rect x="3" y="6.5" width="18" height="13.5" rx="2"/><path d="M9 6.5V4.5h6v2M12 10v6M9 13h6"/>',
  bloqueio: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  chave: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M16 7l3 3"/>',
  disco: '<ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>',
};
const CURTO = { visao: 'Início', projetos: 'Projetos', equipe: 'Equipes', fechamento: 'Fechamento', relatorios: 'Relatórios', validacao: 'Validação', cofre: 'Cofre', usuarios: 'Usuários', auditoria: 'Auditoria', financeiro: 'Financeiro' };
const PAGINAS = {
  visao: ['Visão Geral', visao], projetos: ['Projetos', projetos], equipe: ['Gestão de Equipes', equipe],
  fechamento: ['Fechamento Mensal', fechamento], relatorios: ['Relatórios', relatorios],
  validacao: ['Validação de Ausências', validacao], cofre: ['Cofre de Documentos', cofre],
  usuarios: ['Usuários', usuarios], auditoria: ['Auditoria', auditoria], financeiro: ['Financeiro', financeiro],
};
const MENUS = {
  gerente: ['visao', 'projetos', 'equipe', 'fechamento', 'relatorios'],
  rh: ['validacao', 'cofre'], admin: ['usuarios', 'auditoria'], financeiro: ['financeiro'],
};
MENUS.total = [...MENUS.gerente, ...MENUS.rh, ...MENUS.admin, ...MENUS.financeiro];
const tem = perfil => R.tem(EU, perfil);
// Página em tela (a do endereço, se o perfil tiver) e os dados de que ela precisa.
function paginaAtual() {
  const menu = MENUS[EU.perfil], [pag, arg] = decodeURIComponent(location.hash.slice(1)).split('/');
  return [menu.includes(pag) ? pag : menu.find(dadosDa) || menu[0], arg]; // sem página no endereço: a primeira que tem dados
}
const areaDe = pag => ['gerente', 'rh', 'admin', 'financeiro'].find(k => MENUS[k].includes(pag));
const dadosDa = pag => ({ gerente: D, rh: RHD, admin: ADM, financeiro: true })[areaDe(pag)];
const ICONE_SIT = { futuro: '◷', conflito: '⚠', refletida: '✓', sem_apontamento: '⚠' };

let EU = null, LIMITE_DOC = 8e6; // a Vercel aceita menos (o servidor diz quanto)
let D = null, RHD = null, ADM = null, AUD = null, SEM_HORAS = '';
let comp = { ano: HOJE.getFullYear(), mes: HOJE.getMonth() + 1 };
const F = { prjStatus: '', prjArq: false, eqProj: '', hColab: '', hTipo: '', hStatus: 'ativos', hDe: '', hAte: '', relTipo: 'consolidado', rhStatus: 'abertas', rhTipo: '', fecProj: 0 };
const ABERTOS = new Set();

// ---------- utilidades ----------
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const p2 = n => String(n).padStart(2, '0');
const hh = min => (min / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' h';
const sinal = min => min === 0 ? '0 h' : (min > 0 ? '+' : '−') + hh(Math.abs(min));
const pct = v => Math.round(v * 100) + '%';
const nomeMes = (a = comp.ano, m = comp.mes) => `${MESES[m - 1]} de ${a}`;
const dataBR = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '·';
const dataHora = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '·';
const periodo = r => r.inicio === r.fim ? dataBR(r.inicio) : `${dataBR(r.inicio)} a ${dataBR(r.fim)}`;
const soma = arr => arr.reduce((t, l) => t + l.min, 0);
const iniciais = nome => nome.split(/\s+/).map(p => p.replace(/[^\p{L}]/gu, '')[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
// Fotos do AudiHoras: a tela mostra as iniciais e troca pela foto quando ela chega (uma por vez, sem travar a página).
const FOTOS = new Map(); // id -> endereço da imagem, ou null enquanto busca / quando não tem
let filaFotos = Promise.resolve();
function foto(id, nome) {
  const url = FOTOS.get(id);
  return `<i class="foto c${id % 5}${url ? ' com-foto' : ''}" data-foto="${id}" title="${esc(nome)}"${url ? ` style="background-image:url(${url})"` : ''}>${esc(iniciais(nome))}</i>`;
}
function carregarFotos() {
  if (!EU || !tem('gerente') || !D) return;
  for (const el of document.querySelectorAll('#conteudo [data-foto]')) {
    const id = Number(el.dataset.foto);
    if (FOTOS.has(id)) continue;
    FOTOS.set(id, null);
    filaFotos = filaFotos.then(async () => {
      try {
        const r = await fetch('/api/foto/' + id);
        if (!r.ok || !(r.headers.get('content-type') || '').startsWith('image/')) return;
        const url = await lerArquivo(await r.blob()); // data URL: blob: não abre como imagem no arquivo offline (file://)
        FOTOS.set(id, url);
        for (const x of document.querySelectorAll(`[data-foto="${id}"]`)) { x.style.backgroundImage = `url(${url})`; x.classList.add('com-foto'); }
      } catch { /* sem foto: ficam as iniciais */ }
    });
  }
}
const opcoes = (obj, sel) => Object.entries(obj).map(([k, v]) => `<option value="${k}" ${String(k) === String(sel) ? 'selected' : ''}>${v}</option>`).join('');
const somaDias = (iso, n) => { const d = new Date(iso + 'T12:00'); d.setDate(d.getDate() + n); return R.iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
function agrupar(arr, campo) {
  const m = new Map();
  for (const l of arr) m.set(l[campo], (m.get(l[campo]) || 0) + l.min);
  return m;
}
const lerArquivo = arq => new Promise((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = erro;
  r.readAsDataURL(arq);
});

async function api(url, opt = {}) {
  let r;
  try {
    r = await fetch(url, { method: opt.method || 'GET', headers: { 'Content-Type': 'application/json' }, body: opt.body && JSON.stringify(opt.body) });
  } catch {
    throw new Error('Sem conexão com o servidor do ACCOUNT. Tente novamente.');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && EU) {
    EU = null;
    telaLogin(j.erro);
    throw Object.assign(new Error(j.erro), { silencioso: true });
  }
  if (!r.ok) throw Object.assign(new Error(j.erro || `Erro ${r.status}`), j);
  return j;
}
let toastTimer;
function aviso(msg, erro) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = erro ? 'erro' : '';
  t.hidden = true;
  void t.offsetWidth; // reinicia a animação de entrada
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.hidden = true, 4800);
}
function copiar(sel) {
  const el = $(sel);
  el.select();
  (navigator.clipboard?.writeText(el.value) ?? Promise.reject()).catch(() => document.execCommand('copy'));
  aviso('Copiado.');
}
function menuPerfil(abrir) {
  const m = $('#perfil-menu');
  abrir ??= m.hidden;
  m.hidden = !abrir;
  $('#perfil-btn').setAttribute('aria-expanded', abrir);
}
document.addEventListener('click', e => { if (!e.target.closest?.('.direita')) $('#perfil-menu').hidden = true; });

// Diálogo nativo: "enviar" pode lançar erro, que aparece dentro do diálogo sem fechá-lo.
function dialogo(titulo, corpo, { ok = 'Salvar', enviar, perigo = false, somenteFechar = false } = {}) {
  const d = $('#dialogo');
  const fechar = 'onclick="this.closest(\'dialog\').close()"';
  d.innerHTML = `<form class="dlg">
    <div class="dlg-cab"><h2>${titulo}</h2><button type="button" class="fechar" aria-label="Fechar" ${fechar}>×</button></div>
    <div class="dlg-corpo">${corpo}</div><div class="dlg-erro" role="alert"></div>
    <div class="dlg-acoes">${somenteFechar ? `<button type="button" class="btn" ${fechar}>Fechar</button>`
      : `<button type="button" class="btn-sec" ${fechar}>Cancelar</button><button class="${perigo ? 'btn-perigo' : 'btn'}">${ok}</button>`}</div></form>`;
  d.querySelector('form').onsubmit = async ev => {
    ev.preventDefault();
    if (!enviar) return d.close();
    const b = ev.submitter;
    if (b) b.disabled = true;
    try { await enviar(new FormData(ev.target)); d.close(); } catch (e) { if (!e.silencioso) d.querySelector('.dlg-erro').textContent = e.message; }
    if (b) b.disabled = false;
  };
  d.showModal();
  d.querySelector('.dlg-corpo input:not([readonly]),.dlg-corpo select,.dlg-corpo textarea')?.focus();
}

// ---------- telas públicas ----------
function mostrarPublico(html) {
  $('#app').hidden = true;
  const p = $('#publico');
  p.hidden = false;
  p.innerHTML = `<div class="cartao-publico">${html}</div>`;
  p.querySelector('input:not([value]),input[value=""]')?.focus();
}
function telaLogin(msg = '') {
  mostrarPublico(`<img src="${LOGO}" alt="ACCOUNT, Gestão de Contas e Projetos">
    <h1>Entrar no ACCOUNT</h1><p class="sub">Use o seu usuário e a sua senha do AudiHoras.</p>
    <form id="form-login" onsubmit="entrar(event, this)" style="display:contents">
      <label>Usuário do AudiHoras<input name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
      <label>Senha do AudiHoras<input name="senha" type="password" autocomplete="current-password" required></label>
      <div class="erro-publico" role="alert">${esc(msg)}</div>
      <button class="btn">Entrar</button>
    </form>
    <p class="dica" style="text-align:center">Quem confere a senha é o próprio AudiHoras; o ACCOUNT não guarda. Esqueceu? Recupere pelo AudiHoras.</p>`);
}
async function entrar(ev, f) {
  ev.preventDefault();
  const b = f.querySelector('button');
  b.disabled = true;
  b.textContent = 'Entrando…';
  try {
    await api('/api/login', { method: 'POST', body: { usuario: f.usuario.value, senha: f.senha.value } });
    const me = await api('/api/me');
    EU = me.usuario;
    D = RHD = ADM = AUD = null;
    await abrirApp();
  } catch (e) {
    $('.erro-publico').textContent = e.message;
    b.disabled = false;
    b.textContent = 'Entrar';
  }
}
async function sair() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  EU = D = RHD = ADM = AUD = null;
  SEM_HORAS = '';
  FOTOS.clear();
  history.replaceState(null, '', location.pathname);
  telaLogin();
}

// ---------- estrutura ----------
async function abrirApp() {
  $('#publico').hidden = true;
  $('#app').hidden = false;
  $('#nome-usuario').textContent = EU.nome;
  $('#perfil-usuario').textContent = R.PERFIS[EU.perfil];
  $('#avatar').textContent = iniciais(EU.nome);
  $('#perfil-email').textContent = EU.email;
  await carregar();
}
function atualizarSelos() {
  const s = $('#selo');
  s.hidden = !tem('gerente');
  s.textContent = D ? '● AudiHoras conectado' : '○ AudiHoras desconectado';
  s.className = D ? 'selo' : 'selo off';
}
const esqueleto = () => `<div class="esq" style="height:150px;border-radius:22px;margin-bottom:20px"></div>
  <div class="esq" style="height:96px;margin-bottom:20px"></div>
  <div class="grid2"><div class="esq" style="height:300px"></div><div class="esq" style="height:300px"></div></div>`;

async function carregar(atualizar) {
  const c = $('#conteudo');
  const tinha = dadosDa(paginaAtual()[0]);
  if (!tinha) c.innerHTML = esqueleto(); else c.classList.add('carregando');
  try {
    await Promise.all([
      // Acesso total sem gestor no AudiHoras: as outras telas funcionam e as de horas explicam o porquê.
      tem('gerente') && api(`/api/dados?ano=${comp.ano}&mes=${comp.mes}${atualizar ? '&atualizar=1' : ''}`)
        .then(x => { if (x.semHoras) SEM_HORAS = x.semHoras; else [D, SEM_HORAS] = [x, '']; }),
      tem('rh') && api('/api/rh').then(x => { RHD = x; }),
      tem('admin') && Promise.all([api('/api/usuarios'), api('/api/auditoria')]).then(x => { [ADM, AUD] = x; }),
    ]);
    c.classList.remove('carregando');
    render();
    if (atualizar) aviso('Dados atualizados do AudiHoras.');
  } catch (e) {
    c.classList.remove('carregando');
    if (e.silencioso) return;
    if (!tinha) c.innerHTML = `<div class="card vazio">${esc(e.message)}<br><br><button class="btn" onclick="carregar()">Tentar de novo</button></div>`;
    else aviso(e.message, true);
  }
  atualizarSelos();
}
// Após registrar ou decidir algo: busca de novo só os dados locais (as horas vêm do cache do servidor).
async function recarregar() {
  if (D) D = await api(`/api/dados?ano=${comp.ano}&mes=${comp.mes}`);
  if (tem('rh')) RHD = await api('/api/rh');
  if (tem('admin')) [ADM, AUD] = await Promise.all([api('/api/usuarios'), api('/api/auditoria')]);
  render(false);
}
function trocarMes(v) {
  const [a, m] = v.split('-').map(Number);
  comp = { ano: a, mes: m };
  carregar();
}

function render(animar = true) {
  if (!EU) return;
  const menu = MENUS[EU.perfil], [atual, arg] = paginaAtual();
  const abas = menu.map(k => `<a href="#${k}" class="${k === atual ? 'ativo' : ''}" title="${PAGINAS[k][0]}" ${k === atual ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICONES[k]}</svg><span>${CURTO[k]}</span></a>`).join('');
  $('#menu').innerHTML = abas;
  $('#menu').classList.toggle('muitas', menu.length > 6);
  $('#menu-movel').innerHTML = abas;
  $('#titulo-movel').textContent = PAGINAS[atual][0];
  contexto();
  document.title = `${PAGINAS[atual][0]} · ACCOUNT`;
  const c = $('#conteudo');
  c.classList.remove('animar');
  c.innerHTML = dadosDa(atual) ? PAGINAS[atual][1](arg)
    : SEM_HORAS && areaDe(atual) === 'gerente' ? cab('Horas', PAGINAS[atual][0], esc(SEM_HORAS)) : esqueleto();
  [...c.children].forEach((el, i) => el.style.setProperty('--i', i));
  c.querySelectorAll('.kpi, .tile').forEach(el => el.style.setProperty('--k', [...el.parentNode.children].indexOf(el)));
  c.querySelectorAll('.barra-v').forEach((el, i) => el.style.setProperty('--b', i));
  if (animar) {
    void c.offsetWidth;
    c.classList.add('animar');
    contarNumeros(c);
  }
  carregarFotos();
}
window.addEventListener('hashchange', () => {
  if (!EU) return;
  render();
  scrollTo({ top: 0 });
  menuPerfil(false);
});

function cab(eyebrow, titulo, sub, extra = '') {
  return `<section class="hero"><div class="hero-txt"><div class="eyebrow">${eyebrow}</div><h1>${titulo}</h1><p class="sub">${sub}</p></div>
    ${extra ? `<div class="acoes">${extra}</div>` : ''}</section>`;
}
// Faixa abaixo das abas: competência (com setas) e a origem das horas. Só o gerente usa.
function contexto() {
  const el = $('#contexto');
  el.hidden = !D || areaDe(paginaAtual()[0]) !== 'gerente';
  if (el.hidden) return;
  let ops = '';
  for (let i = 0; i < 13; i++) {
    const d = new Date(HOJE.getFullYear(), HOJE.getMonth() - i, 1), a = d.getFullYear(), m = d.getMonth() + 1;
    ops += `<option value="${a}-${m}" ${a === comp.ano && m === comp.mes ? 'selected' : ''}>${nomeMes(a, m)}</option>`;
  }
  const atras = (HOJE.getFullYear() - comp.ano) * 12 + HOJE.getMonth() + 1 - comp.mes;
  el.innerHTML = `<div class="contexto-in">
    <div class="comp"><span class="rotulo">Competência</span>
      <button class="seta-mes" onclick="passoMes(-1)" aria-label="Mês anterior" ${atras >= 12 ? 'disabled' : ''}>‹</button>
      <select aria-label="Competência" onchange="trocarMes(this.value)">${ops}</select>
      <button class="seta-mes" onclick="passoMes(1)" aria-label="Próximo mês" ${atras <= 0 ? 'disabled' : ''}>›</button></div>
    <div class="fonte"><span class="ponto"></span><span>Horas do AudiHoras, somente leitura · consulta de ${dataHora(D.consultadoEm)}</span>
      <button class="btn-sec mini-btn" onclick="carregar(true)" title="Consultar o AudiHoras de novo">↻ Atualizar</button></div>
  </div>`;
}
function passoMes(n) {
  const d = new Date(comp.ano, comp.mes - 1 + n, 1);
  trocarMes(`${d.getFullYear()}-${d.getMonth() + 1}`);
}
const num = (n, pad) => `<b data-contar="${n}"${pad ? ' data-pad' : ''}>${pad ? p2(n) : n.toLocaleString('pt-BR')}</b>`;
const kpi = (ic, rot, valor, nota) => `<div class="kpi"><span class="kpi-ic" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONES[ic]}</svg></span>
  <div><span class="kpi-rot">${rot}</span><strong>${valor}</strong><em>${nota}</em></div></div>`;
const pill = (txt, cls) => `<span class="pill ${cls}">${txt}</span>`;
const pillFec = st => pill(R.STATUS_FEC[st], 'fec-' + st);
const pillReg = st => pill(R.STATUS_REG[st], 'reg-' + st);
const pillPrj = st => pill(R.STATUS_PRJ[st], 'prj-' + st);
const pillUsr = st => pill(R.STATUS_USUARIO[st], 'usr-' + st);
const tag = t => `<span class="tag t-${t}">${R.TIPOS[t]}</span>`;
const somenteLeitura = () => '<div class="somente-leitura">🔒 As horas vêm do AudiHoras e só podem ser consultadas aqui. Correções são feitas pelo profissional no próprio AudiHoras.</div>';
const SEM_DADOS = 'Não há dados disponíveis para os filtros selecionados.';

// Tabela que vira cartões no celular (cada célula leva o nome da coluna).
function tabela(cols, linhas, { vazio = SEM_DADOS, rodape } = {}) {
  const c = cols.map(x => typeof x === 'string' ? { t: x } : x);
  const td = (v, i) => `<td data-label="${c[i]?.t || ''}"${c[i]?.num ? ' class="num"' : ''}>${v ?? ''}</td>`;
  const corpo = linhas.length
    ? linhas.map(l => Array.isArray(l) ? `<tr>${l.map(td).join('')}</tr>` : `<tr ${l.a || ''}>${l.c.map(td).join('')}</tr>`).join('')
    : `<tr class="vazia"><td colspan="${c.length}">${vazio}</td></tr>`;
  return `<div class="tab-wrap"><table class="resp"><thead><tr>${c.map(x => `<th${x.num ? ' class="num"' : ''}>${x.t}</th>`).join('')}</tr></thead>
    <tbody>${corpo}</tbody>${rodape && linhas.length ? `<tfoot><tr>${rodape.map(td).join('')}</tr></tfoot>` : ''}</table></div>`;
}
function filtro(k, v) {
  F[k] = v;
  render(false);
}
function buscar(q) {
  q = q.trim().toLowerCase();
  for (const el of document.querySelectorAll('#conteudo [data-busca]')) el.hidden = !el.dataset.busca.includes(q);
}

// ---------- animação de números ----------
function contarNumeros(raiz) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const el of raiz.querySelectorAll('[data-contar]')) {
    const fim = Number(el.dataset.contar), pad = 'pad' in el.dataset, t0 = performance.now();
    const fmt = v => pad ? p2(v) : v.toLocaleString('pt-BR');
    const passo = t => {
      const k = Math.min(1, (t - t0) / 1000);
      el.textContent = fmt(Math.round(fim * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  }
}

// ---------- gráficos ----------
function barra(x, y, w, h) {
  if (h <= 0) return '';
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}
function passo(v) {
  const e = 10 ** Math.floor(Math.log10(v || 1));
  return e * [1, 2, 2.5, 5, 10].find(f => f * e >= v);
}
const legenda = itens => `<div class="legenda">${itens.map(([rot, cor]) => `<span><i style="background:${cor}"></i>${rot}</span>`).join('')}</div>`;
// Barras agrupadas por mês; pts = [{rot, nome, v:[min por série]}], series = [{nome, cor}].
function grafico(pts, series) {
  const st = passo(Math.max(1, ...pts.flatMap(p => p.v)) / 60 / 4), max = st * 4;
  const L = 46, Rx = 592, T = 12, B = 196, grp = (Rx - L) / pts.length, bw = Math.min(18, grp / (series.length + 1.5));
  let s = `<svg class="grafico" viewBox="0 0 600 222" role="img" aria-label="${esc(series.map(x => x.nome).join(' e '))} por mês">`;
  for (let i = 0; i <= 4; i++) {
    const y = B - (B - T) * i / 4, v = st * i;
    s += `<line x1="${L}" x2="${Rx}" y1="${y}" y2="${y}" class="grade"/><text x="${L - 8}" y="${y + 4}" class="eixo" text-anchor="end">${v >= 1000 ? (v / 1000).toLocaleString('pt-BR') + 'k' : v}</text>`;
  }
  pts.forEach((p, i) => {
    const cx = L + grp * i + grp / 2, larg = series.length * bw + (series.length - 1) * 2;
    series.forEach((se, j) => {
      const h = (B - T) * p.v[j] / 60 / max;
      s += `<path class="barra-v" d="${barra(cx - larg / 2 + j * (bw + 2), B - h, bw, h)}" fill="${se.cor}" tabindex="0" data-tip="${esc(`${p.nome}\n${se.nome}: ${hh(p.v[j])}`)}"/>`;
    });
    s += `<text x="${cx}" y="${B + 18}" class="eixo" text-anchor="middle">${p.rot}</text>`;
  });
  return s + '</svg>';
}
function barrasH(itens) {
  if (!itens.length || !itens.some(i => i.min)) return `<div class="vazio">${SEM_DADOS}</div>`;
  const max = Math.max(1, ...itens.map(i => i.min));
  return itens.map(i => `<div class="hb"><span title="${esc(i.rot)}">${esc(i.rot)}</span><div class="hb-trilho"><div class="hb-barra" style="width:${i.min / max * 100}%" tabindex="0" data-tip="${esc(`${i.rot}: ${hh(i.min)}`)}"></div></div><b class="num">${hh(i.min)}</b></div>`).join('');
}
function composicao(partes) {
  const tot = partes.reduce((t, p) => t + p[1], 0);
  if (!tot) return `<div class="vazio">${SEM_DADOS}</div>`;
  return `<div class="empilhada">${partes.filter(p => p[1]).map(([rot, min, cor]) =>
      `<div style="flex:${min};background:${cor}" tabindex="0" data-tip="${esc(`${rot}: ${hh(min)} (${pct(min / tot)})`)}"></div>`).join('')}</div>
    <div class="legenda-lista">${partes.map(([rot, min, cor]) =>
      `<div><span><i style="background:${cor}"></i>${rot}</span><b>${hh(min)}</b><span class="apagado">${pct(min / tot)}</span></div>`).join('')}</div>`;
}
// Rosca da situação dos fechamentos: partes de um todo, no máximo 4 estados, cada um com rótulo e número.
const COR_FEC = { preparacao: '#b7c0b5', conferencia: 'var(--ambar)', aprovado: 'var(--g-real)', reaberto: '#d0786f' };
function rosca(lista) {
  const total = lista.length;
  if (!total) return `<div class="vazio">${SEM_DADOS}</div>`;
  const cont = {};
  for (const p of lista) cont[fechDe(p.id).status] = (cont[fechDe(p.id).status] || 0) + 1;
  const r = 52, C = 2 * Math.PI * r, itens = Object.keys(R.STATUS_FEC).filter(st => cont[st]);
  let off = 0, arcos = '';
  for (const st of itens) {
    const len = C * cont[st] / total, vis = itens.length > 1 ? Math.max(len - 3, 1) : len;
    arcos += `<circle class="arco" r="${r}" cx="70" cy="70" fill="none" stroke="${COR_FEC[st]}" stroke-width="16" stroke-dasharray="${vis} ${C - vis}" stroke-dashoffset="${-off}" tabindex="0" data-tip="${R.STATUS_FEC[st]}: ${cont[st]} de ${total}"/>`;
    off += len;
  }
  const ap = cont.aprovado || 0;
  return `<div class="rosca"><svg viewBox="0 0 140 140" role="img" aria-label="${ap} de ${total} fechamentos aprovados">
      <circle r="${r}" cx="70" cy="70" fill="none" stroke="var(--linha2)" stroke-width="16"/><g transform="rotate(-90 70 70)">${arcos}</g>
      <text x="70" y="70" text-anchor="middle" class="rosca-num">${ap}/${total}</text><text x="70" y="88" text-anchor="middle" class="rosca-rot">aprovados</text></svg>
    <ul class="rosca-leg">${Object.keys(R.STATUS_FEC).filter(st => st !== 'reaberto' || cont.reaberto).map(st =>
      `<li><i style="background:${COR_FEC[st]}"></i>${R.STATUS_FEC[st]}<b>${cont[st] || 0}</b></li>`).join('')}</ul></div>`;
}

function mostrarTip(el, x, y) {
  const t = $('#tip');
  t.textContent = el.dataset.tip;
  t.hidden = false;
  t.style.left = Math.max(8, Math.min(x + 14, innerWidth - t.offsetWidth - 8)) + 'px';
  t.style.top = Math.min(y + 14, innerHeight - t.offsetHeight - 8) + 'px';
}
document.addEventListener('pointermove', e => {
  const el = e.target.closest?.('[data-tip]');
  if (el) mostrarTip(el, e.clientX, e.clientY); else $('#tip').hidden = true;
});
document.addEventListener('focusin', e => {
  const el = e.target.closest?.('[data-tip]');
  if (el) { const r = el.getBoundingClientRect(); mostrarTip(el, r.left, r.bottom); }
});
document.addEventListener('focusout', () => $('#tip').hidden = true);
document.addEventListener('keydown', e => { if (e.key === 'Escape') menuPerfil(false); });

// ---------- dados do gerente ----------
const proj = id => D.projetos.find(p => p.id === id);
const natureza = id => proj(id)?.natureza;
const fichaDe = pid => D.fichas[pid] || { status: 'ativo', alocacoes: [] };
const meus = (comArquivados = false) => D.projetos.filter(p => p.natureza === 1 && (comArquivados || fichaDe(p.id).status !== 'arquivado'));
const nomeColab = id => D.equipe.find(c => c.id === id)?.nome ?? `Profissional ${id}`;
const pessoa = (id, negrito) => `<span class="pessoa">${foto(id, nomeColab(id))}${negrito ? `<b>${esc(nomeColab(id))}</b>` : esc(nomeColab(id))}</span>`;
const doMes = (a = comp.ano, m = comp.mes) => D.lancamentos.filter(l => l.a === a && l.m === m);
const fechDe = pid => D.fechamentos[R.chave(comp.ano, comp.mes, pid)] || { status: 'preparacao', decisoes: {}, historico: [] };
const calcFech = pid => R.fechamento(D, D.registros, pid, comp.ano, comp.mes, fechDe(pid), HOJE_ISO);
function registrosDoMes() {
  const [ini, fim] = R.limites(comp.ano, comp.mes);
  return D.registros.filter(r => r.status !== 'cancelada' && r.inicio <= fim && r.fim >= ini);
}
function uteisAteHoje() {
  const [ini, fim] = R.limites(comp.ano, comp.mes);
  return R.diasUteis(ini, fim < HOJE_ISO ? fim : HOJE_ISO, { feriados: D.feriados }).length;
}
function membrosProjeto(pid) {
  return new Set([...D.lancamentos.filter(l => l.p === pid).map(l => l.c), ...(fichaDe(pid).alocacoes || []).map(a => a.colabId)]);
}
// Profissionais cujas horas no projeto mudaram no AudiHoras depois da aprovação (RF-FEC-006).
function alterados(pid) {
  const f = fechDe(pid);
  if (f.status !== 'aprovado' || !f.foto) return [];
  const agora = agrupar(doMes().filter(l => l.p === pid), 'c');
  const antes = new Map(f.foto.linhas.map(l => [l.c, l.projeto]));
  return [...new Set([...agora.keys(), ...antes.keys()])].filter(c => (agora.get(c) || 0) !== (antes.get(c) || 0));
}
function alertasCarteira(lista) {
  const out = [];
  for (const p of lista) {
    const alt = alterados(p.id), fi = fichaDe(p.id);
    if (alt.length) out.push(`Horas de ${alt.length} profissional(is) mudaram no AudiHoras depois da aprovação de <b>${esc(p.nome)}</b>.`);
    if (fechDe(p.id).status !== 'aprovado') {
      const c = calcFech(p.id);
      if (c.pendentes) out.push(`${c.pendentes} ausência(s) aguardando sua decisão no fechamento de <b>${esc(p.nome)}</b>.`);
    }
    if (fi.status === 'aguardando') out.push(`<b>${esc(p.nome)}</b> está aguardando novo contrato.`);
    if (fi.fim && fi.fim >= HOJE_ISO && fi.fim <= somaDias(HOJE_ISO, 30)) out.push(`A vigência de <b>${esc(p.nome)}</b> termina em ${dataBR(fi.fim)}.`);
  }
  const regs = registrosDoMes().filter(r => r.tipo === 'atestado');
  const emValidacao = regs.filter(r => ['registrada', 'em_validacao'].includes(r.status)).length;
  const semDoc = regs.filter(r => !r.documento).length;
  if (emValidacao) out.push(`${emValidacao} atestado(s) da competência aguardando validação do RH.`);
  if (semDoc) out.push(`${semDoc} atestado(s) ainda sem documento no cofre do RH.`);
  return out;
}
const consulta = () => `Horas consultadas no AudiHoras em ${dataHora(D.consultadoEm)}.`;
function evolucao(pid) {
  const pts = D.meses.map(m => {
    const lm = D.lancamentos.filter(l => l.a === m.ano && l.m === m.mes && (!pid || l.p === pid));
    return { rot: MESES[m.mes - 1].slice(0, 3), nome: nomeMes(m.ano, m.mes), v: pid ? [soma(lm)] : [m.uteis * 480 * D.equipe.length, soma(lm)] };
  });
  return pid ? grafico(pts, [{ nome: 'Horas realizadas no projeto', cor: 'var(--g-real)' }])
    : grafico(pts, [{ nome: 'Previstas', cor: 'var(--g-prev)' }, { nome: 'Realizadas', cor: 'var(--g-real)' }]);
}

// ---------- Visão Geral ----------
function visao() {
  const mp = meus(), ids = new Set(mp.map(p => p.id)), noProj = doMes().filter(l => ids.has(l.p));
  const abertos = mp.filter(p => fechDe(p.id).status !== 'aprovado').length;
  const ativos = mp.filter(p => noProj.some(l => l.p === p.id)).length;
  const alertas = alertasCarteira(mp);
  const maxH = Math.max(1, ...mp.map(p => soma(noProj.filter(l => l.p === p.id))));
  return cab('Painel do gerente', `Olá, ${esc(EU.nome.split(/\s+/)[0])}`,
      `Sua carteira em ${nomeMes()}: ${ativos} projeto(s) com horas e ${abertos} fechamento(s) em aberto.`,
      '<a class="btn" href="#relatorios">↗ Relatório executivo</a>')
    + `<div class="kpis">
        ${kpi('projetos', 'Projetos ativos', num(ativos, true), 'Na sua carteira')}
        ${kpi('equipe', 'Profissionais alocados', num(new Set(noProj.map(l => l.c)).size, true), `De ${D.equipe.length} na sua equipe`)}
        ${kpi('horas', 'Horas realizadas', `${num(Math.round(soma(noProj) / 60))}<small> h</small>`, 'Origem: AudiHoras')}
        ${kpi('fechamento', 'Fechamentos pendentes', num(abertos, true), abertos ? 'Aguardando conferência' : 'Tudo aprovado')}
      </div>
      <div class="layout-visao">
        <section>
          <div class="titulo-bloco"><div><h2>Meus projetos</h2><p class="sub">Toque em um projeto para abrir o fechamento</p></div><a class="link" href="#projetos">Ver todos →</a></div>
          <div class="tiles">${mp.map(p => tileProjeto(p, noProj, maxH)).join('') || `<div class="card vazio">${SEM_DADOS}</div>`}</div>
          <section class="card" style="margin-top:20px"><div class="card-cab"><div><h2>Evolução mensal de horas</h2><p class="sub">Previstas (dias úteis × 8 h) × realizadas · toda a equipe · últimos 6 meses</p></div>
            ${legenda([['Previstas', 'var(--g-prev)'], ['Realizadas', 'var(--g-real)']])}</div>${evolucao()}</section>
        </section>
        <aside class="lateral-visao">
          <section class="card"><h2>Fechamentos</h2><p class="sub">${nomeMes()}</p>${rosca(mp)}</section>
          <section class="card"><h2>Atenção</h2><ul class="lista-alertas">${alertas.map(a => `<li>${a}</li>`).join('') || '<li class="ok">Nenhuma pendência na competência.</li>'}</ul></section>
          <a class="cta" href="#relatorios"><span class="cta-ic"><svg viewBox="0 0 24 24">${ICONES.relatorios}</svg></span>
            <span><b>Relatórios gerenciais</b>Resumo executivo, gráficos e PDF prontos para a reunião.</span><span class="cta-seta">→</span></a>
        </aside>
      </div>`;
}
// Projeto sem horas na competência: diz o último mês com horas (a janela é de 6 meses), para não parecer erro.
function semHorasNoMes(pid) {
  const u = D.lancamentos.filter(l => l.p === pid).reduce((u, l) => (!u || l.a * 12 + l.m > u.a * 12 + u.m ? l : u), null);
  return ` · ${u ? `últimas em ${MESES[u.m - 1].toLowerCase()}${u.a !== comp.ano ? ` de ${u.a}` : ''}` : 'sem horas nos últimos 6 meses'}`;
}
function tileProjeto(p, noProj, maxH) {
  const lp = noProj.filter(l => l.p === p.id), h = soma(lp), fi = fichaDe(p.id);
  const gente = [...agrupar(lp, 'c')].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return `<a class="tile" href="#fechamento/${p.id}">
    <div class="tile-topo"><div><b>${esc(p.nome)}</b><small>${esc(fi.cliente || 'Cliente não informado')}</small></div>${pillPrj(fi.status)}</div>
    <div class="tile-num">${hh(h)}<span>em ${MESES[comp.mes - 1].toLowerCase()}${h ? '' : semHorasNoMes(p.id)}</span></div>
    <div class="mini"><div style="width:${h / maxH * 100}%"></div></div>
    <div class="tile-rodape"><div class="rostos">${gente.slice(0, 4).map(c => foto(c, nomeColab(c))).join('')}${gente.length > 4 ? `<i class="foto mais">+${gente.length - 4}</i>` : ''}</div>
      ${pillFec(fechDe(p.id).status)}</div>
  </a>`;
}

// ---------- Projetos ----------
function projetos() {
  const lista = meus(true).filter(p => (F.prjArq || fichaDe(p.id).status !== 'arquivado') && (!F.prjStatus || fichaDe(p.id).status === F.prjStatus));
  const lm = doMes();
  const extras = D.projetos.filter(p => p.natureza !== 1).map(p => {
    const lp = lm.filter(l => l.p === p.id);
    return lp.length ? [esc(p.nome), p.natureza === 3 ? 'Benefício' : 'Não remunerado', new Set(lp.map(l => l.c)).size, hh(soma(lp))] : null;
  }).filter(Boolean);
  return cab('Carteira', 'Projetos', 'Projetos em que você e a sua equipe estão alocados, com ficha de gestão e alocações.')
    + `<div class="filtros">
        <label>Buscar<input type="search" placeholder="Projeto ou cliente" oninput="buscar(this.value)"></label>
        <label>Status<select onchange="filtro('prjStatus', this.value)"><option value="">Todos</option>${opcoes(R.STATUS_PRJ, F.prjStatus)}</select></label>
        <label class="chk"><input type="checkbox" ${F.prjArq ? 'checked' : ''} onchange="filtro('prjArq', this.checked)"> Mostrar arquivados</label>
      </div>`
    + somenteLeitura()
    + (lista.map(p => cardProjeto(p, lm)).join('') || `<div class="card vazio">${SEM_DADOS}</div>`)
    + `<section class="card"><h2>Horas adicionais da equipe</h2><p class="sub">Benefícios e atividades não remuneradas apontadas no AudiHoras (não contam como projeto)</p><br>
      ${tabela(['Lançamento', 'Categoria', { t: 'Profissionais', num: 1 }, { t: 'Horas', num: 1 }], extras, { vazio: 'Nenhuma hora adicional nesta competência.' })}</section>`;
}
function cardProjeto(p, lm) {
  const fi = fichaDe(p.id), lp = lm.filter(l => l.p === p.id), porC = agrupar(lp, 'c'), total = soma(lp);
  const horas = [...porC].sort((a, b) => b[1] - a[1]).map(([c, min]) =>
    [pessoa(c), hh(min), `<div class="mini"><div style="width:${total ? min / total * 100 : 0}%"></div></div>`]);
  const aloc = (fi.alocacoes || []).map(a => [esc(a.colab), dataBR(a.inicio), a.fim ? dataBR(a.fim) : 'Em aberto',
    `<button class="link perigo" onclick="removerAlocacao(${p.id}, '${a.id}')">Remover</button>`]);
  return `<details class="card projeto" data-busca="${esc(`${p.nome} ${fi.cliente || ''}`.toLowerCase())}" ${ABERTOS.has(p.id) ? 'open' : ''} ontoggle="ABERTOS[this.open ? 'add' : 'delete'](${p.id})">
    <summary>
      <div class="resumo-prj"><div><h2>${esc(p.nome)}</h2><p class="sub">${esc(fi.cliente || 'Cliente não informado')} · ID AudiHoras ${p.id}</p></div>
        <div class="acoes">${pillPrj(fi.status)} ${pillFec(fechDe(p.id).status)}<span class="seta" aria-hidden="true">⌄</span></div></div>
      <div class="stats"><span><b>${hh(total)}</b>em ${MESES[comp.mes - 1].toLowerCase()}${total ? '' : semHorasNoMes(p.id)}</span><span><b>${porC.size}</b>com horas</span>
        <span><b>${(fi.alocacoes || []).length}</b>alocados</span><span>Vigência <b>${dataBR(fi.inicio)}</b> a <b>${dataBR(fi.fim)}</b></span></div>
    </summary>
    <div class="corpo-prj">
      <div class="ficha">
        <div><span>Referência contratual</span>${esc(fi.referencia) || '<i class="apagado">Não informada</i>'}</div>
        <div><span>Observação</span>${esc(fi.obs) || '·'}</div>
        <div><span>Última atualização</span>${fi.atualizadoEm ? `${esc(fi.atualizadoPor)}, ${dataHora(fi.atualizadoEm)}` : '·'}</div>
      </div>
      <div class="acoes" style="margin-bottom:16px">
        <button class="btn-sec" onclick="editarFicha(${p.id})">Editar ficha</button>
        <button class="btn-sec" onclick="alocarDlg(${p.id})">+ Alocar profissional</button>
        <a class="btn-sec" href="#fechamento/${p.id}">Fechamento →</a>
        <a class="btn-sec" href="#relatorios/${p.id}">Relatório →</a>
      </div>
      <div class="grid-igual">
        <div><h3>Horas por profissional (AudiHoras)</h3>${tabela(['Profissional', { t: 'Horas no mês', num: 1 }, 'Participação'], horas, { vazio: 'Sem horas nesta competência.' })}</div>
        <div><h3>Alocações (ACCOUNT)</h3>${tabela(['Profissional', 'Início', 'Término', ''], aloc, { vazio: 'Nenhuma alocação registrada.' })}</div>
      </div>
    </div>
  </details>`;
}
function editarFicha(pid) {
  const fi = fichaDe(pid);
  dialogo(`Ficha de ${esc(proj(pid).nome)}`, `
    <p>O identificador oficial (ID ${pid}) e as horas vêm do AudiHoras e não mudam aqui.</p>
    <label class="inteiro">Cliente<input name="cliente" maxlength="120" value="${esc(fi.cliente)}"></label>
    <label>Status<select name="status">${opcoes(R.STATUS_PRJ, fi.status)}</select></label>
    <label>Início da vigência<input type="date" name="inicio" value="${fi.inicio || ''}"></label>
    <label>Fim da vigência<input type="date" name="fim" value="${fi.fim || ''}"></label>
    <label class="inteiro">Referência contratual<input name="referencia" maxlength="300" value="${esc(fi.referencia)}" placeholder="Número do contrato, pedido de compra, regra de faturamento"></label>
    <label class="inteiro">Observação<textarea name="obs" maxlength="500">${esc(fi.obs)}</textarea></label>
    <p class="dica">Contratos não são anexados. Arquivar preserva fechamentos, vínculos e histórico.</p>`, {
    enviar: async fd => {
      D.fichas[pid] = await api(`/api/projetos/${pid}`, { method: 'POST', body: Object.fromEntries(fd) });
      render(false);
      aviso('Ficha do projeto salva.');
    },
  });
}
function alocarDlg(pid) {
  dialogo(`Alocar em ${esc(proj(pid).nome)}`, `
    <label class="inteiro">Profissional<select name="colabId" required><option value="">Selecione</option>${D.equipe.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label>
    <label>Início<input type="date" name="inicio" required value="${HOJE_ISO}"></label>
    <label>Término (opcional)<input type="date" name="fim"></label>
    <p class="dica">Um profissional pode estar em mais de um projeto.</p>`, {
    ok: 'Alocar',
    enviar: async fd => {
      D.fichas[pid] = await api(`/api/projetos/${pid}/alocacoes`, { method: 'POST', body: Object.fromEntries(fd) });
      ABERTOS.add(pid);
      render(false);
      aviso('Profissional alocado.');
    },
  });
}
function removerAlocacao(pid, id) {
  const a = fichaDe(pid).alocacoes.find(x => x.id === id);
  dialogo('Remover alocação', `<p>Remover ${esc(a.colab)} de ${esc(proj(pid).nome)}? As horas do AudiHoras não mudam.</p>`, {
    ok: 'Remover', perigo: true,
    enviar: async () => {
      D.fichas[pid] = await api(`/api/projetos/${pid}/alocacoes/${id}`, { method: 'DELETE' });
      render(false);
      aviso('Alocação removida.');
    },
  });
}

// ---------- Gestão de Equipes ----------
function equipe() {
  const lm = doMes(), regs = registrosDoMes(), prev = uteisAteHoje() * 480;
  const membros = F.eqProj ? membrosProjeto(Number(F.eqProj)) : null;
  const linhas = D.equipe.filter(c => !membros || membros.has(c.id)).map(c => {
    const lc = lm.filter(l => l.c === c.id), total = soma(lc);
    const projs = [...new Set(lc.filter(l => natureza(l.p) === 1).map(l => proj(l.p).nome))];
    const aus = regs.filter(r => r.colabId === c.id).map(r => {
      const an = R.analisar(r, lc, natureza, { a: comp.ano, m: comp.mes, ate: HOJE_ISO, feriados: D.feriados });
      return `<div>${tag(r.tipo)} <span class="apagado">${an.dias}d</span><span class="situacao ${an.situacao}">${ICONE_SIT[an.situacao]} ${R.SITUACAO[an.situacao]}</span></div>`;
    }).join('');
    return { a: `data-busca="${esc(c.nome.toLowerCase())}"`, c: [pessoa(c.id, true), projs.map(esc).join(', ') || '·', hh(total), hh(prev),
      `<span class="${total < prev ? 'neg' : total > prev ? 'pos' : ''}">${sinal(total - prev)}</span>`, aus || '·', esc(c.ultimo) || '·'] };
  });
  return cab('Pessoas', 'Gestão de Equipes', 'Faltas, férias, ausências combinadas, atestados e histórico da sua equipe.')
    + `<div class="filtros">
        <label>Projeto<select onchange="filtro('eqProj', this.value)"><option value="">Todos os projetos</option>${meus(true).map(p => `<option value="${p.id}" ${String(p.id) === F.eqProj ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}</select></label>
        <label>Buscar profissional<input type="search" placeholder="Nome" oninput="buscar(this.value)"></label>
      </div>
      <section class="card"><div class="card-cab"><div><h2>Equipe em ${nomeMes()}</h2>
        <p class="sub">Apontado no AudiHoras × previsto até hoje (dias úteis × 8 h). Ausências são sinalizadas, não descontadas: a decisão é tomada no fechamento.</p></div></div>
        ${tabela(['Profissional', 'Projetos no mês', { t: 'Apontado', num: 1 }, { t: 'Previsto', num: 1 }, { t: 'Diferença', num: 1 }, 'Ausências no mês', 'Último apontamento'], linhas)}
      </section>
      <section class="card"><h2>Registrar ausência</h2><p class="sub">Fica salvo no ACCOUNT, não altera o AudiHoras</p><br>${formRegistro()}</section>
      ${historico()}`;
}
function formRegistro() {
  return `<form class="form" onsubmit="salvarRegistro(event, this)">
    <label>Profissional<select name="colabId" required><option value="">Selecione</option>${D.equipe.map(c => `<option value="${c.id}">${esc(c.nome)}</option>`).join('')}</select></label>
    <label>Tipo<select name="tipo">${opcoes(R.TIPOS, 'falta')}</select></label>
    <label>De<input type="date" name="inicio" required oninput="this.form.fim.min=this.value; if(!this.form.fim.value || this.form.fim.value < this.value) this.form.fim.value=this.value"></label>
    <label>Até<input type="date" name="fim" required></label>
    <label class="largo">Observação administrativa (opcional)<input name="obs" maxlength="500" placeholder="Ex.: compensação combinada com o cliente"></label>
    <label>Documento (PDF ou imagem)<input type="file" name="arquivo" accept=".pdf,.png,.jpg,.jpeg,.webp"></label>
    <button class="btn">Registrar ausência</button>
    <p class="dica inteiro">Não informe diagnóstico nem CID. O documento médico vai direto para o cofre do RH e não fica visível para a gestão.</p>
  </form>`;
}
async function salvarRegistro(ev, f, confirmar = false) {
  ev?.preventDefault();
  const dados = Object.fromEntries(new FormData(f)), arq = f.arquivo.files[0];
  delete dados.arquivo;
  if (dados.fim < dados.inicio) return aviso('A data final vem antes da inicial.', true);
  if (arq && arq.size > LIMITE_DOC) return aviso(`Documento grande demais (máx. ${LIMITE_DOC / 1e6} MB).`, true);
  const b = f.querySelector('.btn');
  b.disabled = true;
  try {
    if (arq) dados.arquivo = { nome: arq.name, dataUrl: await lerArquivo(arq) };
    await api('/api/registros', { method: 'POST', body: { ...dados, confirmar } });
    f.reset();
    aviso('Ausência registrada.');
    await recarregar();
  } catch (e) {
    if (e.sobreposto) dialogo('Registros sobrepostos', `<p>${esc(e.message)}</p>`, { ok: 'Registrar mesmo assim', enviar: () => salvarRegistro(null, f, true) });
    else if (!e.silencioso) aviso(e.message, true);
  }
  b.disabled = false;
}
function historico() {
  let regs = D.registros.slice().sort((a, b) => b.inicio.localeCompare(a.inicio));
  if (F.eqProj) { const m = membrosProjeto(Number(F.eqProj)); regs = regs.filter(r => m.has(r.colabId)); }
  if (F.hColab) regs = regs.filter(r => r.colabId === Number(F.hColab));
  if (F.hTipo) regs = regs.filter(r => r.tipo === F.hTipo);
  if (F.hStatus === 'ativos') regs = regs.filter(r => r.status !== 'cancelada');
  else if (F.hStatus) regs = regs.filter(r => r.status === F.hStatus);
  if (F.hDe) regs = regs.filter(r => r.fim >= F.hDe);
  if (F.hAte) regs = regs.filter(r => r.inicio <= F.hAte);
  const linhas = regs.map(r => [esc(r.colab), tag(r.tipo), periodo(r), R.diasUteis(r.inicio, r.fim, { feriados: D.feriados }).length, pillReg(r.status),
    r.documento ? '🔒 Com o RH' : r.tipo === 'atestado' ? '<span class="neg">Pendente</span>' : '·', esc(r.obs) || '·',
    `${esc(r.por)}<small>${dataHora(r.em)}</small>`, r.status === 'cancelada' ? '' : `<button class="link perigo" onclick="cancelarRegistro('${r.id}')">Cancelar</button>`]);
  return `<section class="card"><h2>Histórico de ausências</h2><p class="sub">Por projeto, profissional, tipo e período, inclusive o que já foi usado em meses fechados</p><br>
    <div class="filtros">
      <label>Profissional<select onchange="filtro('hColab', this.value)"><option value="">Todos</option>${D.equipe.map(c => `<option value="${c.id}" ${String(c.id) === F.hColab ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label>Tipo<select onchange="filtro('hTipo', this.value)"><option value="">Todos</option>${opcoes(R.TIPOS, F.hTipo)}</select></label>
      <label>Situação<select onchange="filtro('hStatus', this.value)"><option value="ativos" ${F.hStatus === 'ativos' ? 'selected' : ''}>Não canceladas</option><option value="" ${F.hStatus === '' ? 'selected' : ''}>Todas</option>${opcoes(R.STATUS_REG, F.hStatus)}</select></label>
      <label>De<input type="date" value="${F.hDe}" onchange="filtro('hDe', this.value)"></label>
      <label>Até<input type="date" value="${F.hAte}" onchange="filtro('hAte', this.value)"></label>
    </div>
    ${tabela(['Profissional', 'Tipo', 'Período', { t: 'Dias úteis', num: 1 }, 'Situação', 'Documento', 'Observação', 'Registrado por', ''], linhas)}</section>`;
}
function cancelarRegistro(id) {
  const r = (D?.registros || RHD?.registros || []).find(x => x.id === id);
  dialogo('Cancelar registro', `<p>${R.TIPOS[r.tipo]} de ${esc(r.colab)} (${periodo(r)}). O registro continua no histórico como cancelado.</p>
    <label class="inteiro">Motivo<textarea name="obs" required maxlength="500"></textarea></label>`, {
    ok: 'Cancelar registro', perigo: true,
    enviar: async fd => {
      await api(`/api/registros/${id}/status`, { method: 'POST', body: { status: 'cancelada', obs: fd.get('obs') } });
      aviso('Registro cancelado.');
      await recarregar();
    },
  });
}

// ---------- Fechamento Mensal ----------
function fechamento(arg) {
  const mp = meus(true);
  const topo = cab('Controle mensal', 'Fechamento Mensal', 'Selecione projeto e competência, confira horas e ausências e aprove.');
  if (!mp.length) return topo + `<div class="card vazio">${SEM_DADOS}</div>`;
  const p = mp.find(x => x.id === Number(arg)) || mp.find(x => x.id === F.fecProj) || mp[0];
  F.fecProj = p.id;
  const f = fechDe(p.id), calc = calcFech(p.id), aprovado = f.status === 'aprovado', alt = alterados(p.id);
  const ordem = f.status === 'reaberto' ? ['reaberto', 'conferencia', 'aprovado'] : ['preparacao', 'conferencia', 'aprovado'];
  const idx = ordem.indexOf(f.status);
  const desc = { preparacao: 'Horas ainda não conferidas', reaberto: 'Reaberto para nova conferência', conferencia: 'Gerente analisando horas e ausências', aprovado: 'Competência validada' };
  const passos = ordem.map((st, i) => `<div class="passo ${i < idx ? 'feito' : i === idx ? 'atual' : ''}"><b>${i + 1}. ${R.STATUS_FEC[st]}</b>${desc[st]}</div>`).join('');
  const linhas = calc.linhas.sort((a, b) => b.projeto - a.projeto).map(l => [
    `${pessoa(l.c, true)}${alt.includes(l.c) ? ' <span class="tag t-falta">mudou no AudiHoras</span>' : ''}`,
    `<b>${hh(l.projeto)}</b>`, hh(l.total), hh(l.previsto), `<span class="${l.dif < 0 ? 'neg' : l.dif > 0 ? 'pos' : ''}">${sinal(l.dif)}</span>`,
    l.ausencias.map(x => tag(x.r.tipo)).join(' ') || '·']);
  const tot = k => calc.linhas.reduce((t, l) => t + l[k], 0);
  const aus = calc.linhas.flatMap(l => l.ausencias.map(x => [
    pessoa(l.c), `${tag(x.r.tipo)} ${pillReg(x.r.status)}`, periodo(x.r), x.dias,
    `<span class="situacao ${x.situacao}">${ICONE_SIT[x.situacao]} ${R.SITUACAO[x.situacao]}</span>`,
    x.dias ? `<select aria-label="Decisão" onchange="decidirAusencia(${p.id}, '${x.r.id}', this.value)" ${aprovado ? 'disabled' : ''}><option value="">A decidir</option>${opcoes(R.DECISOES, x.decisao || '')}</select>
      ${x.decisao ? '' : `<small>Sugestão: ${x.situacao === 'sem_apontamento' ? 'deduzir' : 'não deduzir'}</small>`}` : '<span class="apagado">Sem impacto até hoje</span>']));
  const acoes = {
    preparacao: [['conferir', 'Iniciar conferência', 'btn']], reaberto: [['conferir', 'Iniciar nova conferência', 'btn']],
    conferencia: [['aprovar', '✓ Aprovar fechamento', 'btn']], aprovado: [['reabrir', 'Reabrir competência', 'btn-perigo']],
  }[f.status].map(([a, rot, cls]) => `<button class="${cls}" onclick="acaoFech(${p.id}, '${a}')">${rot}</button>`).join('');
  const avisos = [];
  if (alt.length) avisos.push(`<div class="aviso ambar"><b>● Alteração retroativa no AudiHoras</b><br>${alt.length} profissional(is) tiveram horas alteradas depois da aprovação. O fechamento aprovado não mudou; reabra a competência para conferir.</div>`);
  if (!aprovado && calc.pendentes) avisos.push(`<div class="aviso ambar"><b>● ${calc.pendentes} ausência(s) a decidir</b><br>Veja se cada ausência já está refletida no AudiHoras antes de deduzir, para não descontar duas vezes.</div>`);
  if (!aprovado && calc.divergencias) avisos.push(`<div class="aviso azul"><b>● Existem divergências que precisam ser avaliadas</b><br>${calc.divergencias} profissional(is) com diferença entre apontado e previsto. A aprovação pede justificativa.</div>`);
  return topo + `
    <section class="card">
      <div class="card-cab"><div><div class="eyebrow">${nomeMes()}</div><h2 style="font-size:20px;margin-top:4px">${esc(p.nome)}</h2><p class="sub">${esc(fichaDe(p.id).cliente || '')}</p></div>
        <label class="filtros" style="margin:0"><span class="apagado" style="font-size:11.5px">Projeto</span><select onchange="location.hash='#fechamento/'+this.value">${mp.map(x => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></label></div>
      <div class="passos">${passos}</div>
      <div class="somente-leitura" style="margin-bottom:0">🔒 ${consulta()} Achou apontamento incorreto? A correção é feita no AudiHoras; depois&nbsp;<button class="link" onclick="carregar(true)">atualize os dados</button>.</div>
      ${avisos.join('')}
    </section>
    <section class="card"><h2>Horas por profissional</h2><p class="sub">Previsto = ${calc.base / 480} dias úteis até hoje × 8 h, menos as ausências que você decidiu deduzir</p><br>
      ${tabela(['Profissional', { t: 'Horas no projeto', num: 1 }, { t: 'Total no mês', num: 1 }, { t: 'Previsto', num: 1 }, { t: 'Diferença', num: 1 }, 'Ausências'], linhas,
        { vazio: 'Ninguém apontou horas neste projeto na competência.', rodape: ['Total', hh(tot('projeto')), hh(tot('total')), hh(tot('previsto')), sinal(tot('dif')), ''] })}</section>
    <section class="card"><h2>Ausências da competência</h2><p class="sub">Nenhuma dedução é automática: decida cada caso olhando o que já está no AudiHoras</p><br>
      ${tabela(['Profissional', 'Ausência', 'Período', { t: 'Dias no mês', num: 1 }, 'No AudiHoras', 'Decisão'], aus, { vazio: 'Nenhuma ausência registrada para a equipe deste projeto na competência.' })}
      <div class="acoes" style="margin-top:16px;justify-content:flex-end">${acoes}</div></section>
    ${f.foto ? fotoCard(f.foto) : ''}
    <section class="card"><h2>Trilha de auditoria</h2><br><ul class="historico">${f.historico.slice().reverse().map(h =>
      `<li>${pillFec(h.status)} <b>${esc(h.por)}</b> · ${dataHora(h.em)}${h.obs ? ' · ' + esc(h.obs) : ''}</li>`).join('') || '<li>Nenhuma ação ainda.</li>'}</ul></section>`;
}
function fotoCard(foto) {
  return `<section class="card"><h2>Fotografia da aprovação</h2>
    <p class="sub">Aprovado por ${esc(foto.aprovadoPor)} em ${dataHora(foto.aprovadoEm)} · base: consulta ao AudiHoras de ${dataHora(foto.consultadoEm)}${foto.justificativa ? ` · justificativa: ${esc(foto.justificativa)}` : ''}</p><br>
    ${tabela(['Profissional', { t: 'Horas no projeto', num: 1 }, { t: 'Total no mês', num: 1 }, { t: 'Previsto', num: 1 }, { t: 'Diferença', num: 1 }],
      foto.linhas.map(l => [esc(l.nome || nomeColab(l.c)), hh(l.projeto), hh(l.total), hh(l.previsto), sinal(l.dif)]))}</section>`;
}
async function enviarFech(pid, acao, obs) {
  const f = await api('/api/fechamentos', { method: 'POST', body: { ano: comp.ano, mes: comp.mes, projetoId: pid, acao, obs } });
  D.fechamentos[R.chave(comp.ano, comp.mes, pid)] = f;
  render(false);
  aviso(`Fechamento: ${R.STATUS_FEC[f.status]}.`);
}
function acaoFech(pid, acao) {
  const nome = esc(proj(pid).nome);
  if (acao === 'conferir') return enviarFech(pid, acao).catch(e => e.silencioso || aviso(e.message, true));
  if (acao === 'reabrir') {
    return dialogo('Reabrir competência', `<p>${nome} · ${nomeMes()}. A aprovação atual e sua fotografia ficam no histórico.</p>
      <label class="inteiro">Motivo da reabertura<textarea name="obs" required maxlength="500"></textarea></label>`, {
      ok: 'Reabrir', perigo: true, enviar: fd => enviarFech(pid, acao, fd.get('obs')),
    });
  }
  const c = calcFech(pid), corrente = comp.ano === HOJE.getFullYear() && comp.mes === HOJE.getMonth() + 1;
  dialogo('Aprovar fechamento', `<p>${nome} · ${nomeMes()}. Ficam registrados responsável, data, justificativa e a fotografia das horas do AudiHoras.${corrente ? ' <b>Atenção: o mês ainda não terminou.</b>' : ''}</p>
    ${c.pendentes ? `<p class="neg">Ainda há ${c.pendentes} ausência(s) sem decisão.</p>` : ''}
    <label class="inteiro">Justificativa${c.divergencias ? ` (obrigatória: ${c.divergencias} divergência(s))` : ' (opcional)'}<textarea name="obs" maxlength="500" ${c.divergencias ? 'required' : ''}></textarea></label>`, {
    ok: '✓ Aprovar', enviar: fd => enviarFech(pid, acao, fd.get('obs')),
  });
}
async function decidirAusencia(pid, registroId, decisao) {
  try {
    const f = await api('/api/fechamentos/decisao', { method: 'POST', body: { ano: comp.ano, mes: comp.mes, projetoId: pid, registroId, decisao: decisao || null } });
    D.fechamentos[R.chave(comp.ano, comp.mes, pid)] = f;
    render(false);
  } catch (e) { if (!e.silencioso) aviso(e.message, true); }
}

// ---------- Relatórios ----------
function relatorios(arg) {
  const mp = meus(true);
  if (arg === 'consolidado' || mp.some(p => p.id === Number(arg))) F.relTipo = arg;
  if (F.relTipo !== 'consolidado' && !mp.some(p => p.id === Number(F.relTipo))) F.relTipo = 'consolidado';
  const pid = F.relTipo === 'consolidado' ? null : Number(F.relTipo);
  const escopo = pid ? mp.filter(p => p.id === pid) : meus(), ids = new Set(escopo.map(p => p.id));
  const lm = doMes(), noEscopo = lm.filter(l => ids.has(l.p)), horas = soma(noEscopo);
  const pessoas = new Set(noEscopo.map(l => l.c));
  const regs = registrosDoMes().filter(r => !pid || pessoas.has(r.colabId));
  const diasDe = tipos => regs.filter(r => tipos.includes(r.tipo)).reduce((n, r) => n + R.diasUteis(r.inicio, r.fim, { a: comp.ano, m: comp.mes, feriados: D.feriados }).length, 0);
  const aprovados = escopo.filter(p => fechDe(p.id).status === 'aprovado').length;
  const idx = D.meses.findIndex(m => m.ano === comp.ano && m.mes === comp.mes);
  const horasMes = m => soma(D.lancamentos.filter(l => l.a === m.ano && l.m === m.mes && ids.has(l.p)));
  const anterior = idx > 0 ? horasMes(D.meses[idx - 1]) : 0;
  const media = D.meses.reduce((t, m) => t + horasMes(m), 0) / D.meses.length;
  const variacao = anterior ? (horas - anterior) / anterior : null;
  const pendentes = escopo.map(p => ({ p, f: fechDe(p.id), c: calcFech(p.id) }));
  const listaPend = [
    ...pendentes.filter(x => x.f.status !== 'aprovado').map(x => `Fechamento de <b>${esc(x.p.nome)}</b>: ${R.STATUS_FEC[x.f.status].toLowerCase()}.`),
    ...pendentes.filter(x => x.f.status !== 'aprovado' && x.c.pendentes).map(x => `${x.c.pendentes} ausência(s) a decidir em <b>${esc(x.p.nome)}</b>.`),
  ];
  const alertas = alertasCarteira(escopo).filter(a => !/aguardando sua decisão/.test(a));
  const chaveCom = `${comp.ano}-${p2(comp.mes)}|${pid || 'consolidado'}`, comentario = D.comentarios[chaveCom]?.texto || '';
  const titulo = pid ? `Relatório do projeto ${esc(proj(pid).nome)}` : 'Relatório consolidado da carteira';
  const porNat = n => soma(lm.filter(l => natureza(l.p) === n && (!pid || pessoas.has(l.c))));
  const texto = [
    `${pid ? 'Relatório do projeto ' + proj(pid).nome : 'Relatório consolidado da carteira'} · ${nomeMes()} · ${D.gerente || EU.nome}`,
    `Horas realizadas: ${hh(horas)}${variacao == null ? '' : ` (${variacao >= 0 ? '+' : '−'}${pct(Math.abs(variacao))} sobre o mês anterior)`}`,
    ...escopo.map(p => `  · ${p.nome}: ${hh(soma(noEscopo.filter(l => l.p === p.id)))}, fechamento ${R.STATUS_FEC[fechDe(p.id).status].toLowerCase()}`),
    `Profissionais com horas: ${pessoas.size}`,
    `Férias: ${diasDe(['ferias'])} dia(s) úteis · Atestados: ${diasDe(['atestado'])} · Faltas e ausências combinadas: ${diasDe(['falta', 'combinada'])}`,
    `Fechamentos aprovados: ${aprovados} de ${escopo.length}`,
    ...(comentario ? ['', 'Comentários gerenciais:', comentario] : []),
    '', `Fonte das horas: AudiHoras, consulta de ${dataHora(D.consultadoEm)}.`,
  ].join('\n');
  const selTipo = `<select aria-label="Tipo de relatório" onchange="location.hash='#relatorios/'+this.value">
    <option value="consolidado" ${!pid ? 'selected' : ''}>Consolidado da carteira</option>${mp.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''}>Projeto: ${esc(p.nome)}</option>`).join('')}</select>`;
  return cab('Relatórios gerenciais', titulo, 'Resumo executivo, gráficos e detalhamento, prontos para a reunião.', `${selTipo}<button class="btn" onclick="print()">Exportar PDF</button>`)
    + `<section class="card capa">
        <img src="${LOGO}" alt="ACCOUNT, Gestão de Contas e Projetos">
        <dl><dt>Relatório</dt><dd>${titulo}</dd><dt>Período</dt><dd>${nomeMes()}</dd><dt>Gerente</dt><dd>${esc(D.gerente || EU.nome)}</dd>
          <dt>Emitido em</dt><dd>${dataHora(new Date().toISOString())}</dd><dt>Fonte das horas</dt><dd>AudiHoras, ${dataHora(D.consultadoEm)}</dd></dl>
      </section>
      <section class="card"><div class="eyebrow">Resumo executivo</div><h2 style="margin:4px 0 14px">Indicadores essenciais</h2>
        <div class="kpis" style="margin-bottom:6px">
          ${kpi('horas', 'Horas realizadas', `${num(Math.round(horas / 60))}<small> h</small>`, 'Origem: AudiHoras')}
          ${kpi('equipe', 'Profissionais com horas', num(pessoas.size, true), `${escopo.length} projeto(s) no relatório`)}
          ${kpi('fechamento', 'Fechamentos aprovados', `${num(aprovados)}<small> de ${escopo.length}</small>`, aprovados === escopo.length ? 'Competência fechada' : 'Há conferências abertas')}
          ${kpi('sol', 'Dias de férias', num(diasDe(['ferias']), true), 'Registrados no ACCOUNT')}
          ${kpi('medico', 'Dias de atestado', num(diasDe(['atestado']), true), 'Documentos com o RH')}
          ${kpi('alerta', 'Faltas e combinadas', num(diasDe(['falta', 'combinada']), true), 'Dias úteis no mês')}
        </div>
        <div class="grid-igual">
          <div><h3>Tendências</h3><ul class="lista-alertas">
            <li class="ok">${variacao == null ? 'Sem mês anterior na janela para comparar.' : `Horas ${variacao >= 0 ? 'subiram' : 'caíram'} ${pct(Math.abs(variacao))} em relação ao mês anterior (${hh(anterior)}).`}</li>
            <li class="ok">Média dos últimos 6 meses: ${hh(media)} por mês.</li></ul></div>
          <div><h3>Pendências</h3><ul class="lista-alertas">${listaPend.map(a => `<li>${a}</li>`).join('') || '<li class="ok">Nenhuma pendência.</li>'}</ul></div>
          <div><h3>Alertas</h3><ul class="lista-alertas">${alertas.map(a => `<li>${a}</li>`).join('') || '<li class="ok">Nenhum alerta.</li>'}</ul></div>
        </div>
        <h3 style="margin-top:18px">Comentários gerenciais</h3>
        <div class="so-tela"><textarea id="comentario" maxlength="3000" style="width:100%" placeholder="Contexto, riscos e próximos passos para a reunião">${esc(comentario)}</textarea>
          <div class="acoes" style="margin-top:8px"><button class="btn-sec" onclick="salvarComentario('${chaveCom}')">Salvar comentário</button>
          ${D.comentarios[chaveCom] ? `<span class="apagado" style="font-size:12px">Salvo em ${dataHora(D.comentarios[chaveCom].em)}</span>` : ''}</div></div>
        <div class="comentario-print">${esc(comentario) || 'Sem comentários.'}</div>
      </section>
      <div class="grid2">
        <section class="card"><div class="card-cab"><div><h2>${pid ? 'Horas do projeto por mês' : 'Previstas × realizadas'}</h2><p class="sub">Últimos 6 meses${pid ? '' : ' · previstas = dias úteis × 8 h × equipe'}</p></div>
          ${pid ? '' : legenda([['Previstas', 'var(--g-prev)'], ['Realizadas', 'var(--g-real)']])}</div>${evolucao(pid)}</section>
        <section class="card"><h2>Situação dos fechamentos</h2><p class="sub">${nomeMes()}</p>${rosca(escopo)}</section>
      </div>
      <div class="grid2">
        <section class="card"><h2>${pid ? 'Horas por profissional' : 'Horas por projeto'}</h2><p class="sub">${nomeMes()}</p><br>
          ${pid ? barrasH([...agrupar(noEscopo, 'c')].map(([c, min]) => ({ rot: nomeColab(c), min })).sort((a, b) => b.min - a.min))
            : barrasH(escopo.map(p => ({ rot: p.nome, min: soma(noEscopo.filter(l => l.p === p.id)) })).sort((a, b) => b.min - a.min))}</section>
        <section class="card"><h2>Composição das horas</h2><p class="sub">Tudo que ${pid ? 'a equipe do projeto' : 'a equipe'} apontou no AudiHoras</p><br>
          ${composicao([['Projetos da carteira', porNat(1), 'var(--g-real)'], ['Não remunerado', porNat(2), 'var(--g-prev)'], ['Benefícios', porNat(3), 'var(--g-ben)']])}</section>
      </div>
      <section class="card"><div class="card-cab"><div><h2>Indicadores financeiros</h2><p class="sub">Receita, custos e margem</p></div>${pill('Pendente do Financeiro', 'fec-conferencia')}</div>
        <p class="dica">Serão exibidos quando a fonte dos dados, a fórmula da margem e as faixas de saúde forem aprovadas pelo Financeiro. Nenhuma classificação financeira é aplicada até lá.</p></section>
      ${escopo.map(p => detalheProjeto(p, lm)).join('')}
      <section class="card no-print"><div class="card-cab"><div><h2>Resumo para enviar</h2><p class="sub">Copie e cole no e-mail ou no Teams</p></div>
        <button class="btn-sec" onclick="copiar('#resumo')">Copiar</button></div>
        <textarea class="resumo" id="resumo" readonly>${esc(texto)}</textarea></section>`;
}
function detalheProjeto(p, lm) {
  const fi = fichaDe(p.id), f = fechDe(p.id), c = calcFech(p.id), lp = lm.filter(l => l.p === p.id);
  const aus = c.linhas.flatMap(l => l.ausencias.map(x => [pessoa(l.c), tag(x.r.tipo), periodo(x.r), x.dias, x.decisao ? R.DECISOES[x.decisao] : 'A decidir']));
  return `<section class="card"><div class="card-cab"><div><div class="eyebrow">Detalhamento</div><h2 style="font-size:18px;margin-top:4px">${esc(p.nome)}</h2>
      <p class="sub">${esc(fi.cliente || 'Cliente não informado')} · vigência ${dataBR(fi.inicio)} a ${dataBR(fi.fim)}</p></div><div>${pillPrj(fi.status)} ${pillFec(f.status)}</div></div>
    <div class="stats" style="margin:0 0 14px"><span><b>${hh(soma(lp))}</b>no projeto</span><span><b>${c.linhas.length}</b>profissionais</span><span><b>${aus.length}</b>ausências</span>
      ${f.foto ? `<span>Aprovado por <b>${esc(f.foto.aprovadoPor)}</b> em ${dataHora(f.foto.aprovadoEm)}</span>` : ''}</div>
    ${tabela(['Profissional', { t: 'Horas no projeto', num: 1 }, { t: 'Total no mês', num: 1 }, { t: 'Previsto', num: 1 }, { t: 'Diferença', num: 1 }],
      c.linhas.sort((a, b) => b.projeto - a.projeto).map(l => [pessoa(l.c), hh(l.projeto), hh(l.total), hh(l.previsto), sinal(l.dif)]))}
    ${aus.length ? `<h3 style="margin-top:16px">Ausências</h3>${tabela(['Profissional', 'Tipo', 'Período', { t: 'Dias no mês', num: 1 }, 'Tratamento no fechamento'], aus)}` : ''}
  </section>`;
}
async function salvarComentario(chave) {
  try {
    D.comentarios[chave] = await api('/api/comentarios', { method: 'POST', body: { chave, texto: $('#comentario').value } });
    render(false);
    aviso('Comentário salvo.');
  } catch (e) { if (!e.silencioso) aviso(e.message, true); }
}

// ---------- RH ----------
function validacao() {
  const regs = RHD.registros, n = st => regs.filter(r => r.status === st).length;
  let lista = regs.slice().sort((a, b) => b.em.localeCompare(a.em));
  if (F.rhStatus === 'abertas') lista = lista.filter(r => ['registrada', 'em_validacao'].includes(r.status));
  else if (F.rhStatus) lista = lista.filter(r => r.status === F.rhStatus);
  if (F.rhTipo) lista = lista.filter(r => r.tipo === F.rhTipo);
  const linhas = lista.map(r => ({ a: `data-busca="${esc(r.colab.toLowerCase())}"`, c: [
    `<b>${esc(r.colab)}</b>`, tag(r.tipo), periodo(r), R.diasUteis(r.inicio, r.fim).length, pillReg(r.status), docCelula(r),
    `${esc(r.por)}<small>${dataHora(r.em)}</small>`, acoesRH(r)] }));
  return cab('RH autorizado', 'Validação de ausências', 'Valide faltas, férias, ausências combinadas e atestados registrados pelos gerentes.')
    + `<div class="kpis">
        ${kpi('relatorios', 'Registradas', num(n('registrada'), true), 'Aguardando o RH')}
        ${kpi('horas', 'Em validação', num(n('em_validacao'), true), 'Em análise')}
        ${kpi('validacao', 'Validadas', num(n('validada'), true), 'Total')}
        ${kpi('alerta', 'Atestados sem documento', num(regs.filter(r => r.tipo === 'atestado' && !r.arquivo && r.status !== 'cancelada').length, true), 'Anexe no cofre')}
      </div>
      <div class="filtros">
        <label>Situação<select onchange="filtro('rhStatus', this.value)"><option value="abertas" ${F.rhStatus === 'abertas' ? 'selected' : ''}>Abertas</option><option value="" ${F.rhStatus === '' ? 'selected' : ''}>Todas</option>${opcoes(R.STATUS_REG, F.rhStatus)}</select></label>
        <label>Tipo<select onchange="filtro('rhTipo', this.value)"><option value="">Todos</option>${opcoes(R.TIPOS, F.rhTipo)}</select></label>
        <label>Buscar profissional<input type="search" placeholder="Nome" oninput="buscar(this.value)"></label>
      </div>
      <section class="card">${tabela(['Profissional', 'Tipo', 'Período', { t: 'Dias úteis', num: 1 }, 'Situação', 'Documento', 'Registrado por', ''], linhas)}</section>`;
}
function docCelula(r) {
  const anexar = `<label class="link">${r.arquivo ? 'Substituir' : 'Anexar'}<input type="file" hidden accept=".pdf,.png,.jpg,.jpeg,.webp" onchange="anexarDocumento('${r.id}', this)"></label>`;
  if (r.arquivo) return `<a class="link" href="/api/arquivo/${r.arquivo.id}" target="_blank" rel="noopener">🔒 Abrir</a> · ${anexar}`;
  return `${r.tipo === 'atestado' ? '<span class="neg">Pendente</span> · ' : ''}${anexar}`;
}
function acoesRH(r) {
  const hist = `<button class="link" onclick="historicoRegistro('${r.id}')">Histórico</button>`;
  if (r.status === 'cancelada') return hist;
  return '<div class="acoes-linha">' + [r.status === 'registrada' && `<button class="btn-sec mini-btn" onclick="statusRH('${r.id}', 'em_validacao')">Iniciar validação</button>`,
    r.status !== 'validada' && `<button class="btn mini-btn" onclick="statusRH('${r.id}', 'validada')">Validar</button>`,
    `<button class="link perigo" onclick="cancelarRegistro('${r.id}')">Cancelar</button>`, hist].filter(Boolean).join('') + '</div>';
}
async function statusRH(id, status) {
  try {
    await api(`/api/registros/${id}/status`, { method: 'POST', body: { status } });
    aviso(`Ausência ${R.STATUS_REG[status].toLowerCase()}.`);
    await recarregar();
  } catch (e) { if (!e.silencioso) aviso(e.message, true); }
}
async function anexarDocumento(id, input) {
  const arq = input.files[0];
  if (!arq) return;
  if (arq.size > LIMITE_DOC) return aviso(`Documento grande demais (máx. ${LIMITE_DOC / 1e6} MB).`, true);
  try {
    await api(`/api/registros/${id}/documento`, { method: 'POST', body: { arquivo: { nome: arq.name, dataUrl: await lerArquivo(arq) } } });
    aviso('Documento guardado no cofre.');
    await recarregar();
  } catch (e) { if (!e.silencioso) aviso(e.message, true); }
}
function historicoRegistro(id) {
  const r = RHD.registros.find(x => x.id === id);
  dialogo(`Histórico · ${esc(r.colab)}`, `<p>${R.TIPOS[r.tipo]}, ${periodo(r)}${r.obs ? ` · ${esc(r.obs)}` : ''}</p>
    <ul class="historico inteiro">${r.historico.slice().reverse().map(h => `<li>${pillReg(h.status)} <b>${esc(h.por)}</b> · ${dataHora(h.em)}${h.obs ? ' · ' + esc(h.obs) : ''}</li>`).join('')}</ul>`, { somenteFechar: true });
}
function cofre() {
  const docs = RHD.registros.filter(r => r.arquivo).sort((a, b) => (b.arquivo.em || b.em).localeCompare(a.arquivo.em || a.em));
  const total = docs.reduce((t, r) => t + r.arquivo.tamanho, 0);
  const linhas = docs.map(r => ({ a: `data-busca="${esc(r.colab.toLowerCase())}"`, c: [
    `<b>${esc(r.colab)}</b>`, tag(r.tipo), periodo(r), `${esc(r.arquivo.nome)}<small>${Math.ceil(r.arquivo.tamanho / 1024)} KB</small>`, pillReg(r.status),
    dataHora(r.arquivo.em || r.em), `<a class="btn-sec mini-btn" href="/api/arquivo/${r.arquivo.id}" target="_blank" rel="noopener">🔒 Abrir</a>`] }));
  return cab('RH autorizado', 'Cofre de documentos', 'Atestados e comprovantes, restritos ao RH autorizado.')
    + `<div class="kpis">
        ${kpi('cofre', 'Documentos no cofre', num(docs.length, true), 'Cifrados em disco')}
        ${kpi('alerta', 'Atestados sem documento', num(RHD.registros.filter(r => r.tipo === 'atestado' && !r.arquivo && r.status !== 'cancelada').length, true), 'Anexe em Validação')}
        ${kpi('disco', 'Espaço usado', `${num(Math.ceil(total / 1024))}<small> KB</small>`, 'Limite de 8 MB por arquivo')}
      </div>
      <div class="aviso azul" style="margin:0 0 18px"><b>● Sigilo médico</b><br>Armazenamento privado e cifrado, sem links públicos. Cada abertura fica registrada na auditoria. Gerentes veem só que o documento existe. Política de retenção e descarte: a definir com RH e LGPD.</div>
      <div class="filtros"><label>Buscar profissional<input type="search" placeholder="Nome" oninput="buscar(this.value)"></label></div>
      <section class="card">${tabela(['Profissional', 'Documento', 'Período', 'Arquivo', 'Situação', 'Guardado em', ''], linhas, { vazio: 'Nenhum documento no cofre.' })}</section>`;
}

// ---------- Administração ----------
function usuarios() {
  const us = ADM.usuarios, n = st => us.filter(u => u.status === st).length;
  const linhas = us.map(u => ({ a: `data-busca="${esc(`${u.nome} ${u.email}`.toLowerCase())}"`, c: [
    `<b>${esc(u.nome)}</b><small>${esc(u.email)}</small>`, R.PERFIS[u.perfil], pillUsr(u.status), `${esc(u.vinculo)}${u.audihoras ? '<small>definido pelo administrador</small>' : '<small>pelo e-mail</small>'}`, u.ultimoAcesso ? dataHora(u.ultimoAcesso) : 'Nunca',
    '<div class="acoes-linha">' + [`<button class="link" onclick="editarUsuarioDlg('${u.id}')">Editar</button>`,
      u.email !== EU.email && (u.status === 'bloqueado' ? `<button class="link" onclick="statusUsuario('${u.id}', 'ativo')">Reativar</button>` : `<button class="link perigo" onclick="statusUsuario('${u.id}', 'bloqueado')">Bloquear</button>`),
    ].filter(Boolean).join('') + '</div>'] }));
  return cab('Administração', 'Usuários', 'Só o administrador cadastra. Cada pessoa entra com o usuário e a senha dela no AudiHoras.', '<button class="btn" onclick="novoUsuarioDlg()">+ Novo usuário</button>')
    + `<div class="kpis">
        ${kpi('validacao', 'Ativos', num(n('ativo'), true), 'Com acesso')}
        ${kpi('chave', 'Ainda não entraram', num(us.filter(u => u.status === 'ativo' && !u.ultimoAcesso).length, true), 'Cadastrados, sem acesso ainda')}
        ${kpi('bloqueio', 'Bloqueados', num(n('bloqueado'), true), 'Sem acesso')}
        ${kpi('equipe', 'Gerentes', num(us.filter(u => u.perfil === 'gerente' && u.status === 'ativo').length, true), 'Ativos')}
      </div>
      <div class="filtros"><label>Buscar<input type="search" placeholder="Nome ou e-mail" oninput="buscar(this.value)"></label></div>
      <section class="card">${tabela(['Usuário', 'Perfil', 'Situação', 'Usuário do AudiHoras', 'Último acesso', ''], linhas)}</section>`;
}
function novoUsuarioDlg() {
  dialogo('Novo usuário', `<label class="inteiro">Nome<input name="nome" required maxlength="100"></label>
    <label class="inteiro">E-mail corporativo<input name="email" type="email" required></label>
    <label class="inteiro">Perfil<select name="perfil">${opcoes(R.PERFIS, 'gerente')}</select></label>
    <label class="inteiro">Usuário do AudiHoras (opcional)<input name="audihoras" maxlength="60" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Vazio = começo do e-mail"></label>
    <p class="dica">Quase sempre fica vazio. Não é a senha: a pessoa entra com o usuário e a senha dela no AudiHoras, sem convite. Gerente precisa ter perfil de gestor lá.</p>`, {
    ok: 'Criar usuário',
    enviar: async fd => {
      const u = await api('/api/usuarios', { method: 'POST', body: Object.fromEntries(fd) });
      await recarregar();
      aviso(`${u.nome} já pode entrar com o usuário "${u.vinculo}" do AudiHoras.`);
    },
  });
}
function editarUsuarioDlg(id) {
  const u = ADM.usuarios.find(x => x.id === id);
  dialogo(`Editar ${esc(u.nome)}`, `<label class="inteiro">Nome<input name="nome" required maxlength="100" value="${esc(u.nome)}"></label>
    <label class="inteiro">Perfil<select name="perfil">${opcoes(R.PERFIS, u.perfil)}</select></label>
    <label class="inteiro">Usuário do AudiHoras (opcional)<input name="audihoras" maxlength="60" autocomplete="off" autocapitalize="none" spellcheck="false" value="${esc(u.audihoras)}" placeholder="${esc(u.email.split('@')[0])} (começo do e-mail)"></label>
    <p class="dica">E-mail: ${esc(u.email)}. Deixe vazio para usar o começo do e-mail; preencha só quando o usuário da pessoa no AudiHoras for diferente. Não é a senha.</p>`, {
    enviar: async fd => {
      await api(`/api/usuarios/${id}`, { method: 'POST', body: Object.fromEntries(fd) });
      await recarregar();
      aviso('Usuário atualizado.');
    },
  });
}
function statusUsuario(id, status) {
  const u = ADM.usuarios.find(x => x.id === id);
  dialogo(status === 'ativo' ? 'Reativar usuário' : 'Bloquear usuário',
    `<p>${status === 'ativo' ? `Reativar o acesso de ${esc(u.nome)}?` : `Bloquear ${esc(u.nome)}? As sessões abertas caem na hora.`}</p>`, {
      ok: status === 'ativo' ? 'Reativar' : 'Bloquear', perigo: status !== 'ativo',
      enviar: async () => {
        await api(`/api/usuarios/${id}/status`, { method: 'POST', body: { status } });
        await recarregar();
        aviso(status === 'ativo' ? 'Usuário reativado.' : 'Usuário bloqueado.');
      },
    });
}
const ACOES = {
  login: 'Entrou', logout: 'Saiu', login_falhou: 'Login recusado', login_sem_cadastro: 'AudiHoras sem cadastro no ACCOUNT', conta_ativada: 'Conta ativada', senha_redefinida: 'Senha redefinida',
  recuperacao_pedida: 'Pediu nova senha', usuario_criado: 'Usuário criado', usuario_editado: 'Usuário editado', usuario_bloqueado: 'Usuário bloqueado',
  usuario_reativado: 'Usuário reativado', convite_reenviado: 'Convite reenviado', link_redefinicao_gerado: 'Link de senha gerado',
  audihoras_conectado: 'AudiHoras conectado', ausencia_registrada: 'Ausência registrada', ausencia_em_validacao: 'Ausência em validação',
  ausencia_validada: 'Ausência validada', ausencia_cancelada: 'Ausência cancelada', documento_anexado: 'Documento anexado',
  documento_aberto: 'Documento médico aberto', projeto_atualizado: 'Ficha de projeto', alocacao_incluida: 'Alocação incluída',
  alocacao_removida: 'Alocação removida', fechamento_conferir: 'Conferência iniciada', fechamento_aprovar: 'Fechamento aprovado',
  fechamento_reabrir: 'Fechamento reaberto', fechamento_decisao: 'Decisão de ausência',
};
function auditoria() {
  const linhas = AUD.map(a => ({ a: `data-busca="${esc(`${a.por} ${a.acao} ${ACOES[a.acao] || ''} ${a.detalhe}`.toLowerCase())}"`, c: [
    dataHora(a.em), esc(a.por), `<b>${ACOES[a.acao] || esc(a.acao)}</b>`, esc(a.detalhe) || '·'] }));
  return cab('Administração', 'Auditoria', 'Acessos, perfis, vínculos, ausências, fechamentos e aberturas de documentos restritos (últimos 1.000 eventos).')
    + `<div class="filtros"><label>Buscar<input type="search" placeholder="Pessoa, ação ou detalhe" oninput="buscar(this.value)"></label></div>
      <section class="card">${tabela(['Quando', 'Quem', 'Ação', 'Detalhe'], linhas, { vazio: 'Nenhum evento registrado.' })}</section>`;
}

// ---------- Financeiro ----------
function financeiro() {
  const pend = [['Origem da receita por projeto', 'Financeiro'], ['Origem dos custos (profissionais e despesas)', 'Financeiro'],
    ['Fórmula oficial da margem', 'Financeiro'], ['Faixas de saúde do projeto', 'Financeiro'], ['Permissões de acesso aos dados financeiros', 'Financeiro e TI']];
  return cab('Financeiro autorizado', 'Indicadores financeiros', 'Receita, custos e margem entram nos relatórios gerenciais depois das definições oficiais.')
    + `<section class="card"><div class="card-cab"><div><h2>Situação</h2><p class="sub">Especificação funcional V1 · RF-REL-006 e RN-010</p></div>${pill('Pendente do Financeiro', 'fec-conferencia')}</div>
        <p class="dica" style="margin-bottom:14px">Até essas definições serem aprovadas, o ACCOUNT não calcula nem classifica a saúde financeira dos projetos.</p>
        ${tabela(['Definição necessária', 'Responsável', 'Situação'], pend.map(([d, r]) => [d, r, pill('Pendente', 'fec-conferencia')]))}</section>`;
}

// ---------- início ----------
(async () => {
  const me = await api('/api/me').catch(() => ({}));
  LIMITE_DOC = me.limiteDoc || LIMITE_DOC;
  if (me.usuario) {
    EU = me.usuario;
    abrirApp();
  } else telaLogin();
})();
