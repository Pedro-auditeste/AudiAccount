// Regras do ACCOUNT usadas pelo servidor e pela tela: um só cálculo de dias úteis, ausências e fechamento.
(function (R) {
  R.PERFIS = { gerente: 'Gerente de Contas', rh: 'RH autorizado', financeiro: 'Financeiro autorizado', admin: 'Administrador', total: 'Acesso total' };
  // "Acesso total" tem tudo o que os outros perfis têm (as horas continuam exigindo gestor no AudiHoras).
  R.tem = (u, perfil) => u.perfil === perfil || u.perfil === 'total';
  R.STATUS_USUARIO = { ativo: 'Ativo', bloqueado: 'Bloqueado' };
  R.TIPOS = { falta: 'Falta', combinada: 'Ausência combinada', ferias: 'Férias', atestado: 'Atestado médico' };
  R.STATUS_REG = { registrada: 'Registrada', em_validacao: 'Em validação', validada: 'Validada', cancelada: 'Cancelada' };
  R.STATUS_FEC = { preparacao: 'Em preparação', conferencia: 'Em conferência', aprovado: 'Aprovado', reaberto: 'Reaberto' };
  R.STATUS_PRJ = { ativo: 'Ativo', aguardando: 'Aguardando novo contrato', finalizado: 'Finalizado', arquivado: 'Arquivado' };
  R.DECISOES = { deduzir: 'Deduzir do previsto', nao_deduzir: 'Não deduzir' };
  R.SITUACAO = {
    futuro: 'Período ainda não ocorreu',
    conflito: 'Há horas de trabalho apontadas nos dias da ausência',
    refletida: 'Já refletida no AudiHoras (benefício lançado)',
    sem_apontamento: 'Sem apontamento nos dias da ausência',
  };

  const p2 = n => String(n).padStart(2, '0');
  R.iso = (a, m, d) => `${a}-${p2(m)}-${p2(d)}`;
  R.chave = (a, m, pid) => `${a}-${p2(m)}|${pid}`;
  R.limites = (a, m) => [R.iso(a, m, 1), R.iso(a, m, new Date(a, m, 0).getDate())];
  R.hoje = () => { const d = new Date(); return R.iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); };

  // Dias úteis (seg a sex, fora feriados) entre ini e fim; opcionalmente só no mês a/m e até a data "ate".
  R.diasUteis = (ini, fim, { a, m, ate, feriados = {} } = {}) => {
    const dias = [];
    for (const d = new Date(ini + 'T12:00'); ; d.setDate(d.getDate() + 1)) {
      const s = R.iso(d.getFullYear(), d.getMonth() + 1, d.getDate());
      if (!(s <= fim) || (ate && s > ate)) break;
      if (a && (d.getFullYear() !== a || d.getMonth() + 1 !== m)) continue;
      if (d.getDay() % 6 === 0 || feriados[s]) continue;
      dias.push(s);
    }
    return dias;
  };

  // Como a ausência aparece no AudiHoras nos dias úteis dela dentro da competência (até hoje).
  // Serve para sinalizar impacto sem deduzir nada sozinho (RN-005).
  R.analisar = (r, lancsDoColab, natureza, { a, m, ate, feriados }) => {
    const dias = R.diasUteis(r.inicio, r.fim, { a, m, ate, feriados });
    let trabalho = 0, beneficio = 0;
    for (const dia of dias) {
      const doDia = lancsDoColab.filter(l => l.d === Number(dia.slice(8)));
      if (doDia.some(l => natureza(l.p) !== 3)) trabalho++;
      else if (doDia.length) beneficio++;
    }
    const situacao = !dias.length ? 'futuro' : trabalho ? 'conflito' : beneficio === dias.length ? 'refletida' : 'sem_apontamento';
    return { dias: dias.length, trabalho, beneficio, situacao };
  };

  // Fechamento de um projeto na competência: horas do AudiHoras × previsto, ausências e decisões do gerente.
  // Previsto = dias úteis até hoje × 8 h, menos só as ausências que o gerente mandou deduzir.
  R.fechamento = (D, registros, pid, a, m, f = {}, hoje = R.hoje()) => {
    const [ini, fim] = R.limites(a, m);
    const ate = fim < hoje ? fim : hoje;
    const natureza = id => D.projetos.find(p => p.id === id)?.natureza;
    const doMes = D.lancamentos.filter(l => l.a === a && l.m === m);
    const base = R.diasUteis(ini, ate, { feriados: D.feriados }).length * 480;
    const decisoes = f.decisoes || {};
    let pendentes = 0, divergencias = 0;
    const pessoas = [...new Set(doMes.filter(l => l.p === pid).map(l => l.c))];
    const linhas = pessoas.map(c => {
      const lc = doMes.filter(l => l.c === c);
      const projeto = lc.filter(l => l.p === pid).reduce((t, l) => t + l.min, 0);
      const total = lc.reduce((t, l) => t + l.min, 0);
      const ausencias = registros
        .filter(r => r.colabId === c && r.status !== 'cancelada' && r.inicio <= fim && r.fim >= ini)
        .map(r => {
          const x = { r, ...R.analisar(r, lc, natureza, { a, m, ate, feriados: D.feriados }), decisao: decisoes[r.id] || null };
          if (x.dias && !x.decisao) pendentes++;
          return x;
        });
      const deduzidos = ausencias.filter(x => x.decisao === 'deduzir').reduce((n, x) => n + x.dias, 0);
      const previsto = Math.max(base - deduzidos * 480, 0);
      if (total !== previsto) divergencias++;
      return { c, projeto, total, previsto, dif: total - previsto, ausencias };
    });
    return { linhas, pendentes, divergencias, base };
  };
})(typeof module === 'object' ? module.exports : (window.Regras = {}));
