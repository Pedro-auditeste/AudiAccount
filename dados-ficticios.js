// Dados fictícios do AudiHoras de mentira que o teste automático usa (audihoras-mock.js).
(function (M) {
  const HOJE = new Date();
  const p2 = n => String(n).padStart(2, '0');
  M.PROJETOS = [
    { Id: 101, Nome: 'Banco Aurora', Natureza: 1 },
    { Id: 102, Nome: 'Varejo Norte', Natureza: 1 },
    { Id: 103, Nome: 'Saúde Mais', Natureza: 1 },
    { Id: 104, Nome: 'Seguradora Prisma', Natureza: 1 },
    { Id: 201, Nome: 'Treinamento interno', Natureza: 2 },
    { Id: 202, Nome: 'Pré-venda', Natureza: 2 },
    { Id: 301, Nome: 'Férias', Natureza: 3 },
    { Id: 302, Nome: 'Day off', Natureza: 3 },
  ];
  const [AURORA, VAREJO, SAUDE, PRISMA, TREINO, , FERIAS] = M.PROJETOS;
  M.EQUIPE = [
    ['Ana Souza', AURORA], ['Bruno Lima', AURORA], ['Carla Mendes', AURORA], ['Diego Rocha', AURORA, PRISMA],
    ['Elisa Prado', AURORA], ['Fábio Nunes', VAREJO], ['Gabriela Reis', VAREJO], ['Henrique Alves', VAREJO, PRISMA],
    ['Isabela Costa', SAUDE], ['João Pedro Dias', SAUDE], ['Karen Tavares', PRISMA], ['Lucas Martins', AURORA],
  ].map(([nome, projeto, extra], i) => ({ id: 11 + i, nome, projeto, extra, ativo: i !== 11 }));

  M.FERIADOS = {
    '2025-1-1': 'Confraternização Universal', '2025-3-3': 'Carnaval', '2025-3-4': 'Carnaval', '2025-4-18': 'Sexta-feira Santa',
    '2025-4-21': 'Tiradentes', '2025-5-1': 'Dia do Trabalho', '2025-6-19': 'Corpus Christi', '2025-9-7': 'Independência',
    '2025-10-12': 'Nossa Senhora Aparecida', '2025-11-2': 'Finados', '2025-11-15': 'Proclamação da República',
    '2025-11-20': 'Consciência Negra', '2025-12-25': 'Natal',
    '2026-1-1': 'Confraternização Universal', '2026-2-16': 'Carnaval', '2026-2-17': 'Carnaval', '2026-4-3': 'Sexta-feira Santa',
    '2026-4-21': 'Tiradentes', '2026-5-1': 'Dia do Trabalho', '2026-6-4': 'Corpus Christi', '2026-9-7': 'Independência',
    '2026-10-12': 'Nossa Senhora Aparecida', '2026-11-2': 'Finados', '2026-11-15': 'Proclamação da República',
    '2026-11-20': 'Consciência Negra', '2026-12-25': 'Natal',
  };
  // Fotos de exemplo (PNG 96 px). Um em cada quatro fica sem foto para mostrar as iniciais.
  M.FOTOS = [
    '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',
  ];
  M.foto = id => (id % 4 ? M.FOTOS[id % 3] : null);
  M.SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  M.MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  // Aleatório determinístico (FNV-1a): o mesmo dia gera sempre as mesmas horas.
  const rnd = (...k) => {
    let h = 2166136261;
    for (const ch of k.join('|')) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    return (h >>> 0) / 0xffffffff;
  };
  M.hhmm = min => `${p2(Math.floor(min / 60))}:${p2(min % 60)}`;
  const minutosEntre = (i, f) => { const [a, b] = i.split(':').map(Number), [x, y] = f.split(':').map(Number); return x * 60 + y - a * 60 - b; };
  M.minutos = s => minutosEntre('00:00', s);

  let seq = 0;
  function lancamentosDoDia(c, a, m, d) {
    const dt = new Date(a, m - 1, d);
    if (dt > HOJE || dt.getDay() % 6 === 0 || M.FERIADOS[`${a}-${m}-${d}`]) return [];
    const lanc = (inicio, final, p, ativ, obs) => ({
      idApontamento: ++seq, dia: d, mes: m, ano: a, inicio, final, projAtivObs: `${p.Nome} / ${ativ} / ${obs}`,
      qtdhoras: M.hhmm(minutosEntre(inicio, final)), idProjeto: p.Id,
    });
    if (m === 1 + (c.id * 5) % 12 && d <= 15) return [lanc('09:00', '17:00', FERIAS, 'Férias', 'Período de férias')];
    const r = rnd(c.id, a, m, d);
    if (r < 0.03) return []; // esqueceu de apontar
    const manha = r < 0.12 ? [TREINO, 'Capacitação', 'Trilha de automação'] : [c.projeto, 'Execução de testes', 'Regressão'];
    const tarde = c.extra && dt.getDay() % 2 ? c.extra : c.projeto;
    return [lanc('09:00', '12:00', ...manha), lanc('13:00', '18:00', tarde, 'Execução de testes', 'Ciclo da sprint')];
  }
  M.doMes = (c, a, m) => Array.from({ length: new Date(a, m, 0).getDate() }, (_, i) => lancamentosDoDia(c, a, m, i + 1)).flat();
  M.ultimoDoMes = c => {
    const a = HOJE.getFullYear(), m = HOJE.getMonth() + 1, l = M.doMes(c, a, m);
    return l.length ? `${p2(l.at(-1).dia)}/${p2(m)}/${a}` : '';
  };

})(module.exports);
