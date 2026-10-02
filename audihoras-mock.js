// AudiHoras de mentira para o teste automático (test.js). Qualquer usuário entra com a senha demo; "gestor" é o gestor.
// Fala o mesmo protocolo da API real: POST JSON, token que gira a cada chamada, "detalhe" como string JSON.
const crypto = require('node:crypto');
const M = require('./dados-ficticios.js');
const md5 = s => crypto.createHash('md5').update(s).digest('hex');

const PMD = usuario => md5(usuario + md5('audi' + 'demo')); // qualquer usuário com a senha demo; "gestor" é o gestor
const somaHoras = l => M.hhmm(l.reduce((t, x) => t + M.minutos(x.qtdhoras), 0));

const sessoes = new Map(); // token -> { pmd, lid (liderado em foco) }
exports.responder = (servico, b) => {
  if (servico === 'Login') {
    const usuario = String(b.Username).toLowerCase();
    if (b.Password !== PMD(usuario)) return { rc: false, detalhe: 'usuário ou senha inválidos', token: '' };
    const token = crypto.randomUUID();
    sessoes.set(token, { pmd: b.Password, lid: 0 });
    return { rc: true, detalhe: usuario === 'gestor' ? 'Adm' : 'Colaborador', token };
  }
  const atual = [...sessoes].find(([t, x]) => md5(t + x.pmd) === b.Token);
  if (!atual) return { rc: false, detalhe: 'token inválido', token: 'erro' };
  const token = crypto.randomUUID(), sessao = atual[1];
  sessoes.delete(atual[0]);
  const ok = d => { sessoes.set(token, sessao); return { rc: true, detalhe: typeof d === 'string' ? d : JSON.stringify(d), token }; };
  const colab = M.EQUIPE.find(e => e.id === sessao.lid);

  switch (servico) {
    case 'SetLiderado': sessao.lid = b.idLiderado; return ok('ok');
    // Como no site (ShowImg.js): a foto vem fora do "detalhe", em base64.
    case 'GetColaboradorFoto': sessoes.set(token, sessao); return { rc: true, foto: M.foto(b.IdLiderado), token };
    // Como no real: a lista é a de quem está em foco. O gestor sozinho só vê os internos, não os projetos de cliente da equipe.
    case 'Projetos': return ok(M.PROJETOS.filter(p => p.Natureza !== 1 || (colab && (p === colab.projeto || p === colab.extra))));
    case 'GetColaboradores': {
      const hoje = new Date();
      return ok({
        nomeGerente: 'Gestor Demonstração',
        dadosColaboradores: M.EQUIPE.map(e => ({
          idColaborador: e.id, nomeColaborador: e.nome, ativo: e.ativo, dataUltLancamento: M.ultimoDoMes(e),
          qtdHoras: somaHoras(M.doMes(e, hoje.getFullYear(), hoje.getMonth() + 1)),
        })),
      });
    }
    case 'MesAtual': {
      const l = colab ? M.doMes(colab, b.Ano, b.Mes) : [];
      return ok({
        mes: b.Mes, ano: b.Ano, mesTxt: M.MESES[b.Mes - 1], nomeColaborador: colab?.nome || 'Gestor Demonstração', total: somaHoras(l),
        dadosdia: Array.from({ length: new Date(b.Ano, b.Mes, 0).getDate() }, (_, i) => ({
          dia: i + 1, diasemana: M.SEMANA[new Date(b.Ano, b.Mes - 1, i + 1).getDay()],
          qtdhoras: somaHoras(l.filter(x => x.dia === i + 1)), feriado: M.FERIADOS[`${b.Ano}-${b.Mes}-${i + 1}`] || '',
        })),
      });
    }
    case 'PesquisaApontamentos': {
      const meses = b.Mes ? [b.Mes] : Array.from({ length: 12 }, (_, i) => i + 1);
      let l = colab ? meses.flatMap(m => M.doMes(colab, b.Ano, m)) : [];
      if (b.IdProjeto) l = l.filter(x => x.idProjeto === b.IdProjeto);
      return ok({ total: somaHoras(l), lancamentos: l });
    }
  }
  return { rc: false, detalhe: `serviço ${servico} não existe no AudiHoras de mentira`, token };
};
