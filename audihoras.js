// Cliente do AudiHoras (somente leitura) e coleta dos dados de uma competência.
const crypto = require('node:crypto');

const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const falha = (status, msg, extra) => Object.assign(new Error(msg), { status, extra });
const FALHA_AH = 'Não foi possível atualizar os apontamentos. Tente novamente.';

// Só serviços de leitura passam daqui: o ACCOUNT nunca cria nem corrige horas (RF-AUD-004).
const LEITURA = new Set(['Login', 'Projetos', 'MesAtual', 'PesquisaApontamentos', 'GetColaboradores', 'SetLiderado', 'GetColaboradorFoto']);

// Mesmo protocolo do front do AudiHoras (Post.js): Token = md5(token atual + PMD), e o token gira a cada resposta.
// bruto: devolve a resposta inteira (a foto vem fora do "detalhe").
async function chamar(ah, servico, dados = {}, bruto = false) {
  if (!LEITURA.has(servico)) throw falha(403, `Serviço ${servico} bloqueado: o ACCOUNT é somente leitura`);
  let j;
  try {
    const r = await fetch(ah.api + servico, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ Token: md5(ah.token + ah.pmd), ...dados }),
      signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    j = await r.json();
  } catch (e) {
    throw falha(502, `${FALHA_AH} (${e.message})`);
  }
  ah.token = j.token;
  if (j.token === 'erro' && servico !== 'Login') throw falha(401, 'A conexão com o AudiHoras expirou. Entre de novo.', { expirou: true });
  if (j.rc === false || (!bruto && !j.rc)) throw falha(servico === 'Login' ? 401 : 502, servico === 'Login' ? 'Usuário ou senha do AudiHoras inválidos.' : `${FALHA_AH} (${j.detalhe})`);
  if (bruto) return j;
  return typeof j.detalhe === 'string' && /^\s*[[{]/.test(j.detalhe) ? JSON.parse(j.detalhe) : j.detalhe;
}

// ah.cache: Map no servidor local; na Vercel, um hash no Redis com a mesma cara (get, set, clear assíncronos).
async function cache(ah, chave, fn, ttl = 5 * 60e3) {
  const c = await ah.cache.get(chave);
  if (c && Date.now() - c.em < ttl) return c.v;
  const v = await fn();
  await ah.cache.set(chave, { v, em: Date.now() });
  return v;
}

// SetLiderado troca de quem são as horas que o AudiHoras devolve; volta sempre para o próprio gestor.
async function liderado(ah, id) {
  if (ah.liderado !== id) await chamar(ah, 'SetLiderado', { idLiderado: id });
  ah.liderado = id;
}
// O gestor também aponta horas (gestão de contas, por exemplo), mas o AudiHoras só lista os liderados dele.
// Ele entra na equipe com um número negativo que sai do usuário: não bate com colaborador nem com outro gestor.
const idGestor = usuario => -(parseInt(md5(usuario).slice(0, 7), 16) + 1);
const foco = id => (id < 0 ? 0 : id); // no AudiHoras, 0 é o próprio gestor
const pesquisa = (ah, id, ano) => cache(ah, `pesq:${id}:${ano}`, async () => {
  await liderado(ah, foco(id));
  return chamar(ah, 'PesquisaApontamentos', { Mes: 0, Ano: ano, IdProjeto: 0, IdAtividade: 0, Observacao: '' });
});
// projAtivObs é "Projeto / Atividade / Observação" (sem o Id): casa pelo nome de projeto mais longo seguido de "/".
const maisLongoPrimeiro = (projetos, nome) => [...projetos].sort((a, b) => nome(b).length - nome(a).length);
const doProjeto = (texto, nome) => texto.startsWith(nome) && /^\s*(\/|$)/.test(texto.slice(nome.length));

async function conectar(api, usuario, senha) {
  if (!usuario || !senha) throw falha(400, 'Informe usuário e senha do AudiHoras');
  const pmd = md5(usuario.toLowerCase() + md5('audi' + senha));
  const ah = { api, usuario: usuario.toLowerCase(), token: '', pmd, fila: Promise.resolve(), cache: new Map(), liderado: null };
  // "Adm" é o perfil de gestor no AudiHoras; só ele lê as horas da equipe.
  ah.adm = (await chamar(ah, 'Login', { Username: usuario, Password: pmd })) === 'Adm';
  if (ah.adm) await liderado(ah, 0);
  return ah;
}

const minutos = hhmm => { const [h, m] = String(hhmm).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
const p2 = n => String(n).padStart(2, '0');

// Seis meses até a competência: calendário, projetos, equipe (liderados ativos) e horas por pessoa/projeto/dia.
async function coletar(ah, ano, mes) {
  const janela = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(ano, mes - 6 + i, 1);
    return { ano: d.getFullYear(), mes: d.getMonth() + 1 };
  });
  try {
    await liderado(ah, 0);
    const meses = [], feriados = {}, catalogo = new Map(), contas = new Set();
    for (const j of janela) {
      const m = await cache(ah, `mes:${j.ano}-${j.mes}`, () => chamar(ah, 'MesAtual', { Mes: j.mes, Ano: j.ano }), 12 * 3600e3);
      let uteis = 0;
      for (const d of m.dadosdia) {
        if (d.feriado) feriados[`${j.ano}-${p2(j.mes)}-${p2(d.dia)}`] = d.feriado;
        else if (d.diasemana !== 'Sábado' && d.diasemana !== 'Domingo') uteis++;
      }
      meses.push({ ...j, uteis });
      // A lista de projetos depende da data: une a de cada mês para não perder projeto encerrado.
      const ult = new Date(j.ano, j.mes, 0).getDate();
      const ps = await cache(ah, `proj:${j.ano}-${j.mes}`, () => chamar(ah, 'Projetos', { Dia: ult, Mes: j.mes, Ano: j.ano }), 3600e3);
      for (const p of ps) {
        catalogo.set(p.Id, p);
        // Contas do gerente: os projetos internos dele "Gestão de contas - Cliente".
        const conta = /^gest[aã]o de contas\s*-\s*(.+)$/i.exec(p.Nome);
        if (conta) contas.add(conta[1].trim());
      }
    }
    const colab = await cache(ah, 'equipe', () => chamar(ah, 'GetColaboradores', { MesAnterior: false }));
    const equipe = colab.dadosColaboradores.filter(c => c.ativo)
      .map(c => ({ id: c.idColaborador, nome: c.nomeColaborador, ultimo: c.dataUltLancamento }));
    // O próprio gestor, a não ser que o AudiHoras já o traga entre os liderados.
    const gestor = String(colab.nomeGerente || ah.usuario).trim();
    if (!equipe.some(c => c.nome.trim().toLowerCase() === gestor.toLowerCase())) equipe.unshift({ id: idGestor(ah.usuario), nome: gestor, gestor: true });

    // Projetos devolve os projetos de quem está em foco: os do gestor não trazem os projetos de cliente da equipe
    // (visto com um gestor real em 02/10/2026). Então o catálogo junta também os de cada liderado, mês a mês.
    const apontamentos = [];
    for (const c of equipe) {
      for (const j of c.gestor ? [] : janela) { // os do gestor já vieram acima
        const ult = new Date(j.ano, j.mes, 0).getDate();
        const ps = await cache(ah, `proj:${c.id}:${j.ano}-${j.mes}`, async () => {
          await liderado(ah, c.id);
          return chamar(ah, 'Projetos', { Dia: ult, Mes: j.mes, Ano: j.ano });
        }, 3600e3);
        for (const p of ps) catalogo.set(p.Id, p);
      }
      for (const a of new Set(janela.map(j => j.ano))) {
        // As horas do próprio gestor são um extra: se o AudiHoras não as entregar, a carteira abre sem ele.
        const r = await pesquisa(ah, c.id, a).catch(e => { if (!c.gestor || e.extra?.expirou) throw e; c.semHoras = true; return {}; });
        for (const l of r.lancamentos || []) apontamentos.push({ c: c.id, l });
      }
    }
    if (equipe[0].semHoras) { equipe.shift(); apontamentos.splice(0, apontamentos.length, ...apontamentos.filter(x => x.c > 0)); }

    const porNome = maisLongoPrimeiro(catalogo.values(), p => p.Nome);
    const naJanela = new Set(janela.map(j => `${j.ano}-${j.mes}`));
    const soma = new Map(), soltos = new Map(); // soltos: horas que não casaram com projeto nenhum, para avisar na tela
    for (const { c, l } of apontamentos) {
      if (!naJanela.has(`${l.ano}-${l.mes}`)) continue;
      const p = porNome.find(p => doProjeto(String(l.projAtivObs), p.Nome));
      if (!p) {
        const k = `${c}|${l.ano}|${l.mes}`, x = soltos.get(k) || { c, a: l.ano, m: l.mes, min: 0, exemplos: [] };
        const nome = String(l.projAtivObs).split('/')[0].trim();
        x.min += minutos(l.qtdhoras);
        if (x.exemplos.length < 3 && !x.exemplos.includes(nome)) x.exemplos.push(nome);
        soltos.set(k, x);
        continue;
      }
      const k = `${c}|${p.Id}|${l.ano}|${l.mes}|${l.dia}`;
      soma.set(k, (soma.get(k) || 0) + minutos(l.qtdhoras));
    }
    const lancamentos = [...soma].map(([k, min]) => {
      const [c, p, a, m, d] = k.split('|').map(Number);
      return { c, p, a, m, d, min };
    });
    // Só os projetos em que a sua equipe apontou horas na janela, de qualquer natureza (a tela separa os benefícios).
    const comHoras = new Set(lancamentos.map(l => l.p));
    const projetos = [...catalogo.values()].filter(p => comHoras.has(p.Id))
      .map(p => ({ id: p.Id, nome: p.Nome, natureza: p.Natureza }));
    return { meses, feriados, projetos, equipe, lancamentos, contas: [...contas], semProjeto: [...soltos.values()], consultadoEm: new Date().toISOString() };
  } finally {
    await liderado(ah, 0).catch(() => {});
  }
}

// Uma chamada por vez por conexão: o token muda a cada resposta e SetLiderado é estado no servidor do AudiHoras.
function emFila(ah, fn) {
  const p = ah.fila.then(fn);
  ah.fila = p.catch(() => {});
  return p;
}
function dados(ah, ano, mes, atualizar) {
  return emFila(ah, async () => {
    if (atualizar) await ah.cache.clear();
    return cache(ah, `coleta:${ano}-${mes}`, () => coletar(ah, ano, mes));
  });
}
// Foto do colaborador em base64 (só gestor); null quando não tem.
function foto(ah, id) {
  return emFila(ah, () => cache(ah, `foto:${id}`, async () => (await chamar(ah, 'GetColaboradorFoto', { IdLiderado: id }, true)).foto || null, 12 * 3600e3));
}
// Apontamentos de uma pessoa num mês, um a um (início, fim, projeto, atividade e observação): a conferência que antes
// pedia abrir o AudiHoras. Usa a mesma pesquisa que a coleta já guardou.
function apontamentos(ah, id, ano, mes) {
  return emFila(ah, async () => {
    try {
      const x = await cache(ah, `coleta:${ano}-${mes}`, () => coletar(ah, ano, mes));
      const porNome = maisLongoPrimeiro(x.projetos, p => p.nome);
      const r = await pesquisa(ah, id, ano);
      return (r.lancamentos || []).filter(l => l.mes === mes && l.ano === ano).map(l => {
        const texto = String(l.projAtivObs), p = porNome.find(p => doProjeto(texto, p.nome));
        const [nome, ativ, ...obs] = (p ? '/' + texto.slice(p.nome.length).replace(/^\s*\//, '') : texto).split('/');
        return { d: l.dia, inicio: l.inicio, final: l.final, min: minutos(l.qtdhoras), p: p ? p.id : null,
          projeto: p ? p.nome : nome.trim(), atividade: (ativ || '').trim(), obs: obs.join('/').trim() };
      }).sort((a, b) => a.d - b.d || String(a.inicio).localeCompare(String(b.inicio)));
    } finally {
      await liderado(ah, 0).catch(() => {});
    }
  });
}

module.exports = { chamar, conectar, dados, foto, apontamentos, falha, md5 };
