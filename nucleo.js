// Núcleo do ACCOUNT: regras, permissões e rotas da API, sem rede nem disco.
// O server.js liga isto à rede, ao disco e à criptografia; o test.js usa direto.
(function (N) {
  const R = require('./public/regras.js');
  const { pdf } = require('./envio.js');
  const falha = (status, msg, extra) => Object.assign(new Error(msg), { status, extra });
  N.falha = falha;

  // d = dependências de cada ambiente: { db, salvar, uuid, sessoes: { ler, gravar, apagar }, gravarDoc, lerDoc, apagarDoc,
  //   conectarAH, dadosAH, fotoAH, apontamentosAH, maxDoc, enviarEmail (só onde há SMTP configurado) }.
  // Sessões e documentos podem ser assíncronos (Redis na Vercel).
  N.criar = d => {
    const { db } = d;
    const agora = () => new Date().toISOString();
    const salvar = () => d.salvar();
    // Bancos de antes do login pelo AudiHoras: sem senha, sem convite e sem pedido de nova senha.
    for (const u of db.usuarios) { if (u.status === 'convite') u.status = 'ativo'; delete u.senha; delete u.link; }
    delete db.pedidos;
    db.contas ||= {}; // ficha de cada conta (cliente): sobre o que é, tecnologias e contatos
    db.config ||= {}; // emailValidacao: para onde vão as validações do fechamento
    db.envios ||= []; // histórico dos e-mails de validação

    function auditar(s, acao, detalhe = '') {
      db.auditoria.push({ em: agora(), por: s ? `${s.u.nome} <${s.u.email}>` : 'sistema', acao, detalhe: String(detalhe).slice(0, 300) });
      // ponytail: histórico limitado a 20 mil eventos; exportar para arquivo quando a política de retenção sair (RH/LGPD).
      if (db.auditoria.length > 20000) db.auditoria.splice(0, db.auditoria.length - 20000);
    }

    // ---------- Usuários e sessões ----------
    // Usuário do AudiHoras como no login de lá (ex.: nome.sobrenome). Barra senha digitada no campo errado.
    function lerVinculo(v) {
      v = texto(v, 60).toLowerCase();
      if (!/^[a-z0-9._-]*$/.test(v)) throw falha(400, 'Usuário do AudiHoras inválido: só o usuário (ex.: nome.sobrenome), sem senha nem e-mail. Na dúvida, deixe vazio.');
      return v;
    }
    function novoUsuario({ nome, email, perfil, audihoras }) {
      nome = String(nome || '').trim().slice(0, 100);
      email = String(email || '').trim().toLowerCase();
      if (!nome) throw falha(400, 'Informe o nome');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw falha(400, 'E-mail inválido');
      if (!R.PERFIS[perfil]) throw falha(400, 'Perfil inválido');
      if (db.usuarios.some(u => u.email === email)) throw falha(409, 'Já existe usuário com este e-mail');
      const u = { id: d.uuid(), nome, email, perfil, audihoras: lerVinculo(audihoras), status: 'ativo', criadoEm: agora() };
      vinculoLivre(u);
      db.usuarios.push(u);
      return u;
    }
    // Usuário do AudiHoras de cada conta, que é com o que a pessoa entra: o começo do e-mail (o próprio AudiHoras
    // manda a senha para usuario@auditeste.com.br), a não ser que o administrador tenha cadastrado outro.
    const vinculoDe = u => u.audihoras || u.email.split('@')[0];
    // Um usuário do AudiHoras entra em uma conta só.
    function vinculoLivre(u) {
      const v = vinculoDe(u);
      if (db.usuarios.some(x => x.id !== u.id && vinculoDe(x) === v)) throw falha(409, `O usuário "${v}" do AudiHoras já está ligado a outra conta.`);
    }
    const publico = u => ({
      id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, status: u.status, criadoEm: u.criadoEm,
      ultimoAcesso: u.ultimoAcesso, audihoras: u.audihoras || '', vinculo: vinculoDe(u), cofre: u.cofre !== false,
    });
    // Documentos do cofre: o RH abre todos; o gerente, os da própria equipe, a não ser que o administrador tire.
    const podeCofre = u => R.tem(u, 'rh') || (R.tem(u, 'gerente') && u.cofre !== false);

    // Sessão: { uid, criada, visto, ah }. Fica fora do banco (d.sessoes), porque muda a cada chamada ao AudiHoras.
    const OITO_HORAS = 8 * 3600e3;
    const tentativas = () => (db.tentativas ||= {}); // usuário do AudiHoras -> { n, ate }; no banco, vale em qualquer servidor
    async function sessao(sid) {
      const s = sid && await d.sessoes.ler(sid);
      if (!s) return null;
      const u = db.usuarios.find(x => x.id === s.uid);
      const derrubada = (s.criada || 0) < (u?.derrubadoEm || 0);
      if (!u || u.status !== 'ativo' || Date.now() - s.visto > OITO_HORAS || derrubada) { await d.sessoes.apagar(sid); return null; }
      s.visto = Date.now();
      s.u = u;
      return s;
    }
    // Quem confere a senha é o AudiHoras; o ACCOUNT só decide se aquele usuário tem acesso e com qual perfil.
    // Aceita o e-mail no lugar do usuário (fica o começo dele).
    async function entrar(usuario, senha) {
      usuario = String(usuario || '').trim().toLowerCase().split('@')[0];
      const t = tentativas()[usuario];
      if (t?.ate > Date.now()) throw falha(429, 'Muitas tentativas. Aguarde alguns minutos e tente de novo.');
      let ah;
      try {
        ah = await d.conectarAH(usuario, String(senha || ''));
      } catch (e) {
        if (e.status === 401) {
          const n = (t?.n || 0) + 1;
          tentativas()[usuario] = n >= 5 ? { n: 0, ate: Date.now() + 15 * 60e3 } : { n };
          auditar(null, 'login_falhou', usuario);
          salvar();
        }
        throw e;
      }
      delete tentativas()[usuario];
      const u = db.usuarios.find(x => vinculoDe(x) === usuario);
      if (!u) {
        auditar(null, 'login_sem_cadastro', usuario);
        salvar();
        throw falha(403, 'Seu usuário do AudiHoras ainda não tem acesso ao ACCOUNT. Peça ao administrador para cadastrar você.');
      }
      if (u.status !== 'ativo') throw falha(403, 'Seu acesso está indisponível. Contate o administrador.');
      if (u.perfil === 'gerente' && !ah.adm) throw falha(403, 'Para entrar como gerente, seu usuário do AudiHoras precisa ter perfil de gestor.');
      return abrirSessao(u, R.tem(u, 'gerente') && ah.adm ? ah : undefined);
    }
    async function abrirSessao(u, ah) {
      u.ultimoAcesso = agora();
      const sid = d.uuid();
      await d.sessoes.gravar(sid, { uid: u.id, criada: Date.now(), visto: Date.now(), ah });
      auditar({ u }, 'login', '');
      salvar();
      return sid;
    }
    // Derruba as sessões abertas da pessoa: as criadas antes disto deixam de valer.
    const derrubar = u => { u.derrubadoEm = Date.now(); };
    function exige(s, ...perfis) {
      if (!perfis.some(p => R.tem(s.u, p))) throw falha(403, 'Você não tem permissão para acessar este recurso.');
    }
    function exigeAH(s) {
      exige(s, 'gerente');
      if (!s.ah) throw falha(403, 'As horas só aparecem para quem é gestor (Adm) no AudiHoras.', { semHoras: true });
      return s.ah;
    }
    function exigeProjeto(s, pid) {
      const ah = exigeAH(s);
      if (!ah.meus?.has(pid)) throw falha(403, 'Você não tem permissão para acessar este projeto.');
      return ah;
    }
    // Carteira e equipe da competência em tela: é contra elas que as ações do gerente são validadas.
    // Junto vão os projetos que o gerente criou no ACCOUNT (sem horas no AudiHoras).
    async function dados(s, ano, mes, atualizar) {
      const ah = s.ah, x = await d.dadosAH(ah, ano, mes, atualizar);
      const manuais = Object.entries(db.projetos).filter(([, f]) => f.manual && f.dono === s.u.id)
        .map(([id, f]) => ({ id: Number(id), nome: f.nome, natureza: 1, manual: true }));
      const projetos = [...x.projetos, ...manuais];
      ah.meus = new Map(projetos.filter(R.ehProjeto).map(p => [p.id, p.nome]));
      ah.equipe = new Map(x.equipe.map(c => [c.id, c.nome]));
      return { ...x, projetos };
    }

    // ---------- Ausências e cofre ----------
    const MIMES = { 'application/pdf': 1, 'image/png': 1, 'image/jpeg': 1, 'image/webp': 1 };
    const DATA = /^\d{4}-\d{2}-\d{2}$/;
    const texto = (v, max = 500) => String(v || '').trim().slice(0, max);
    const doTime = s => db.registros.filter(r => s.ah?.equipe?.has(r.colabId));

    async function guardarArquivo(arquivo) {
      const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(arquivo?.dataUrl || '');
      if (!m || !MIMES[m[1]]) throw falha(400, 'O documento precisa ser PDF, PNG, JPG ou WEBP');
      const tamanho = Math.floor(m[2].length * 3 / 4) - (m[2].match(/=*$/)[0].length);
      const max = d.maxDoc || 8e6;
      if (tamanho > max) throw falha(413, `Documento grande demais (máx. ${max / 1e6} MB)`);
      const meta = { id: d.uuid(), nome: texto(arquivo.nome || 'documento', 120), mime: m[1], tamanho, em: agora() };
      await d.gravarDoc(meta.id, m[2]);
      return meta;
    }
    async function novoRegistro(s, b) {
      const ah = exigeAH(s), colabId = Number(b.colabId);
      if (!ah.equipe?.has(colabId)) throw falha(403, 'Profissional fora da sua equipe');
      if (!R.TIPOS[b.tipo]) throw falha(400, 'Tipo inválido');
      if (b.tipo === 'outro' && !texto(b.obs)) throw falha(400, 'Conte o que aconteceu no campo de observação.');
      if (!DATA.test(b.inicio) || !DATA.test(b.fim) || b.inicio > b.fim) throw falha(400, 'Período inválido');
      const sobreposto = db.registros.find(r => r.colabId === colabId && r.status !== 'cancelada' && r.inicio <= b.fim && r.fim >= b.inicio);
      if (sobreposto && !b.confirmar) throw falha(409, 'Há registros sobrepostos neste período. Revise antes de continuar.', { sobreposto: true });
      const r = {
        id: d.uuid(), colabId, colab: ah.equipe.get(colabId), tipo: b.tipo, inicio: b.inicio, fim: b.fim,
        obs: texto(b.obs), status: 'registrada', por: s.u.nome, em: agora(),
        historico: [{ status: 'registrada', obs: '', por: s.u.nome, em: agora() }],
      };
      if (b.arquivo) r.arquivo = await guardarArquivo(b.arquivo);
      db.registros.push(r);
      auditar(s, 'ausencia_registrada', `${R.TIPOS[r.tipo]} de ${r.colab} (${r.inicio} a ${r.fim})${sobreposto ? ', sobreposição confirmada' : ''}${r.arquivo ? ', com documento' : ''}`);
      salvar();
      return r;
    }
    function mudarRegistro(s, id, status, obs) {
      const r = db.registros.find(x => x.id === id);
      const podeVer = R.tem(s.u, 'rh') || (s.u.perfil === 'gerente' && s.ah?.equipe?.has(r?.colabId));
      if (!r || !podeVer) throw falha(404, 'Registro não encontrado');
      if (s.u.perfil === 'gerente' && status !== 'cancelada') throw falha(403, 'A validação de ausências é feita pelo RH.');
      if (!R.STATUS_REG[status] || status === 'registrada') throw falha(400, 'Situação inválida');
      if (r.status === 'cancelada') throw falha(409, 'Registro já cancelado');
      if (status === 'cancelada' && !texto(obs)) throw falha(400, 'Informe o motivo do cancelamento');
      r.status = status;
      r.historico.push({ status, obs: texto(obs), por: s.u.nome, em: agora() });
      auditar(s, 'ausencia_' + status, `${R.TIPOS[r.tipo]} de ${r.colab} (${r.inicio} a ${r.fim})${obs ? ': ' + texto(obs) : ''}`);
      salvar();
      return r;
    }
    // Gerente sem a permissão do cofre vê só metadados administrativos: nem o nome do arquivo (RF-EQP-005).
    const paraGerente = (s, r) => ({ ...r, arquivo: podeCofre(s.u) ? r.arquivo : undefined, documento: !!r.arquivo });

    // ---------- Projetos ----------
    const ficha = pid => (db.projetos[pid] ||= { cliente: '', inicio: '', fim: '', status: 'ativo', referencia: '', obs: '' });
    const nomeProjeto = (s, nome, menos) => {
      nome = texto(nome, 120);
      if (!nome) throw falha(400, 'Informe o nome do projeto');
      if ([...s.ah.meus].some(([id, n]) => id !== menos && n.trim().toLowerCase() === nome.toLowerCase())) throw falha(409, 'Já existe um projeto com esse nome na sua carteira.');
      return nome;
    };
    // Pessoas do projeto escolhidas à mão (além de quem aponta horas nele), cada uma com o papel dela ali.
    // A mesma pessoa pode estar em vários projetos, com papéis diferentes.
    const lerMembros = (s, lista) => (Array.isArray(lista) ? lista : []).slice(0, 100).map(m => {
      const c = Number(m?.colabId);
      if (!s.ah.equipe?.has(c)) throw falha(403, 'Profissional fora da sua equipe');
      return { c, papel: texto(m.papel, 60) };
    }).filter((m, i, l) => l.findIndex(x => x.c === m.c) === i);
    // Projeto criado no ACCOUNT: para organizar equipe e pendências de um trabalho que ainda não está no AudiHoras.
    // O número dele começa em 9 trilhões, bem longe dos códigos do AudiHoras (que passam de 600 milhões).
    function criarProjeto(s, b) {
      exigeAH(s);
      if (!s.ah.meus || !s.ah.equipe) throw falha(409, 'Abra a carteira antes de criar um projeto.');
      const nome = nomeProjeto(s, b.nome), id = db.seqProjeto = Math.max(db.seqProjeto || 0, 9e12) + 1;
      db.projetos[id] = {
        manual: true, dono: s.u.id, nome, cliente: texto(b.cliente, 120), inicio: '', fim: '', status: 'ativo', referencia: '', obs: '',
        descricao: texto(b.descricao, 2000), membros: lerMembros(s, b.membros), checklist: [], atualizadoPor: s.u.nome, atualizadoEm: agora(),
      };
      s.ah.meus.set(id, nome);
      auditar(s, 'projeto_criado', nome);
      salvar();
      return { id, nome, ficha: db.projetos[id] };
    }
    function tirarManual(s, pid) {
      const f = db.projetos[pid];
      if (!f?.manual || f.dono !== s.u.id) throw falha(403, 'Só vale para um projeto criado por você no ACCOUNT.');
      delete db.projetos[pid];
      for (const k of Object.keys(db.fechamentos)) if (k.endsWith('|' + pid)) delete db.fechamentos[k];
      s.ah.meus.delete(pid);
      return f;
    }
    function apagarProjeto(s, pid) {
      exigeProjeto(s, pid);
      auditar(s, 'projeto_excluido', tirarManual(s, pid).nome);
      salvar();
      return {};
    }
    // O projeto criado no ACCOUNT passou a existir no AudiHoras: equipe, checklist e ficha vão para o de lá.
    function ligarProjeto(s, pid, b) {
      const ah = exigeProjeto(s, pid), alvo = Number(b.alvo);
      if (alvo === pid || !ah.meus.has(alvo) || db.projetos[alvo]?.manual) throw falha(400, 'Escolha um projeto do AudiHoras.');
      const m = tirarManual(s, pid), f = ficha(alvo);
      for (const k of ['cliente', 'inicio', 'fim', 'referencia', 'obs', 'descricao']) f[k] ||= m[k] || '';
      f.membros = [...(f.membros || []), ...(m.membros || []).filter(x => !(f.membros || []).some(y => y.c === x.c))];
      f.checklist = [...(f.checklist || []), ...(m.checklist || [])];
      auditar(s, 'projeto_ligado', `${m.nome} → ${ah.meus.get(alvo)}`);
      salvar();
      return { id: alvo, ficha: f };
    }
    function membro(s, pid, b) {
      const ah = exigeProjeto(s, pid), f = ficha(pid), [m] = lerMembros(s, [b]);
      f.membros = (f.membros || []).filter(x => x.c !== m.c);
      if (!b.remover) f.membros.push(m);
      auditar(s, 'projeto_equipe', `${ah.meus.get(pid)}: ${ah.equipe.get(m.c)} ${b.remover ? 'saiu' : `entrou${m.papel ? ' como ' + m.papel : ''}`}`);
      salvar();
      return f;
    }
    function checklist(s, pid, b) {
      const ah = exigeProjeto(s, pid), f = ficha(pid), lista = (f.checklist ||= []), item = lista.find(x => x.id === b.id);
      if (b.acao === 'criar') {
        if (!texto(b.texto)) throw falha(400, 'Escreva o item do checklist');
        if (lista.length >= 100) throw falha(409, 'O checklist já tem 100 itens.');
        lista.push({ id: d.uuid(), texto: texto(b.texto, 200), feito: false, por: s.u.nome, em: agora() });
      } else if (!item) throw falha(404, 'Item não encontrado');
      else if (b.acao === 'marcar') Object.assign(item, { feito: !!b.feito, feitoPor: b.feito ? s.u.nome : undefined, feitoEm: b.feito ? agora() : undefined });
      else if (b.acao === 'apagar') lista.splice(lista.indexOf(item), 1);
      else throw falha(400, 'Ação inválida');
      auditar(s, 'projeto_checklist', `${ah.meus.get(pid)}: ${b.acao} "${item?.texto || texto(b.texto, 200)}"`);
      salvar();
      return f;
    }
    function salvarFicha(s, pid, b) {
      const ah = exigeProjeto(s, pid);
      if (!R.STATUS_PRJ[b.status]) throw falha(400, 'Status inválido');
      for (const x of [b.inicio, b.fim]) if (x && !DATA.test(x)) throw falha(400, 'Vigência inválida');
      if (b.inicio && b.fim && b.inicio > b.fim) throw falha(400, 'A vigência termina antes de começar');
      const f = ficha(pid);
      if (f.manual && b.nome !== undefined) ah.meus.set(pid, f.nome = nomeProjeto(s, b.nome, pid));
      Object.assign(f, {
        cliente: texto(b.cliente, 120), inicio: b.inicio || '', fim: b.fim || '', status: b.status,
        referencia: texto(b.referencia, 300), obs: texto(b.obs), descricao: texto(b.descricao, 2000), atualizadoPor: s.u.nome, atualizadoEm: agora(),
      });
      auditar(s, 'projeto_atualizado', `${ah.meus.get(pid)}: ${R.STATUS_PRJ[b.status]}`);
      salvar();
      return f;
    }

    // ---------- Contas ----------
    // Ficha da conta (cliente): sobre o que é, tecnologias e contatos. Vale para todos os gerentes. Conta criada à mão
    // (cliente que ainda não tem projeto com horas no AudiHoras) aparece só para quem criou, até ganhar projeto.
    const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    function salvarConta(s, b) {
      const nome = texto(b.nome, 80), atual = db.contas[nome];
      if (!nome) throw falha(400, 'Informe o nome da conta');
      if (b.nova && atual) throw falha(409, 'Já existe uma conta com esse nome');
      const contatos = (Array.isArray(b.contatos) ? b.contatos : []).slice(0, 20)
        .map(c => ({ nome: texto(c?.nome, 100), papel: texto(c?.papel, 80), email: texto(c?.email, 120).toLowerCase(), telefone: texto(c?.telefone, 40) }))
        .filter(c => c.nome || c.email || c.telefone);
      for (const c of contatos) if (c.email && !EMAIL.test(c.email)) throw falha(400, `E-mail inválido: ${c.email}`);
      const tecnologias = [...new Set((Array.isArray(b.tecnologias) ? b.tecnologias : String(b.tecnologias || '').split(','))
        .map(t => texto(t, 40)).filter(Boolean))].slice(0, 30);
      db.contas[nome] = {
        ...(atual || { criadaPor: s.u.id, criadaEm: agora(), manual: !!b.nova }),
        nome, descricao: texto(b.descricao, 2000), tecnologias, contatos, atualizadoPor: s.u.nome, atualizadoEm: agora(),
      };
      auditar(s, atual ? 'conta_atualizada' : 'conta_criada', nome);
      salvar();
      return db.contas[nome];
    }
    function apagarConta(s, nome) {
      const c = db.contas[nome];
      if (!c) throw falha(404, 'Conta não encontrada');
      if (!c.manual || c.criadaPor !== s.u.id) throw falha(403, 'Só dá para excluir uma conta criada por você à mão.');
      delete db.contas[nome];
      auditar(s, 'conta_excluida', nome);
      salvar();
      return {};
    }

    // ---------- Fechamento ----------
    const fech = (a, m, pid) => db.fechamentos[R.chave(a, m, pid)] ||= { status: 'preparacao', decisoes: {}, historico: [] };
    const TRANSICOES = {
      conferir: [['preparacao', 'reaberto'], 'conferencia'],
      aprovar: [['conferencia'], 'aprovado'],
      reabrir: [['aprovado'], 'reaberto'],
    };
    async function acaoFechamento(s, b) {
      const a = Number(b.ano), m = Number(b.mes), pid = Number(b.projetoId), obs = texto(b.obs);
      const ah = exigeProjeto(s, pid), f = fech(a, m, pid), t = TRANSICOES[b.acao];
      if (!t) throw falha(400, 'Ação inválida');
      if (!t[0].includes(f.status)) throw falha(409, `O fechamento está ${R.STATUS_FEC[f.status].toLowerCase()}; esta ação não se aplica.`);
      if (b.acao === 'reabrir' && !obs) throw falha(400, 'Informe o motivo da reabertura.');
      if (b.acao === 'aprovar') {
        const x = await dados(s, a, m);
        const calc = R.fechamento(x, doTime(s), pid, a, m, f);
        if (calc.pendentes) throw falha(409, 'Decida o tratamento de cada ausência antes de aprovar.');
        if (calc.divergencias && !obs) throw falha(409, 'Existem divergências que precisam ser avaliadas. Registre a justificativa para aprovar.');
        // Fotografia dos dados que fundamentaram a aprovação (RF-FEC-005); base do alerta de alteração retroativa.
        f.foto = {
          consultadoEm: x.consultadoEm, aprovadoEm: agora(), aprovadoPor: s.u.nome, justificativa: obs, decisoes: { ...f.decisoes },
          linhas: calc.linhas.map(l => ({ c: l.c, nome: ah.equipe.get(l.c), projeto: l.projeto, total: l.total, previsto: l.previsto, dif: l.dif })),
        };
      }
      f.status = t[1];
      f.historico.push({ status: f.status, obs, por: s.u.nome, em: agora() });
      auditar(s, 'fechamento_' + b.acao, `${ah.meus.get(pid)} ${String(m).padStart(2, '0')}/${a}${obs ? ': ' + obs : ''}`);
      salvar();
      return f;
    }
    // "OK" do gerente em cada profissional: as horas dele no mês foram conferidas.
    function conferirPessoa(s, b) {
      const a = Number(b.ano), m = Number(b.mes), pid = Number(b.projetoId), c = Number(b.colabId);
      const ah = exigeProjeto(s, pid), f = fech(a, m, pid);
      if (f.status === 'aprovado') throw falha(409, 'Fechamento aprovado: reabra para alterar.');
      if (!ah.equipe?.has(c)) throw falha(403, 'Profissional fora da sua equipe');
      if (!b.ok && f.validacoes?.[c]) throw falha(409, 'A validação deste recurso já foi finalizada. Para refazer, envie de novo.');
      f.conferidos ||= {};
      if (b.ok) f.conferidos[c] = { por: s.u.nome, em: agora() }; else delete f.conferidos[c];
      auditar(s, 'fechamento_pessoa', `${ah.meus.get(pid)} ${m}/${a}: ${ah.equipe.get(c)} ${b.ok ? 'conferido' : 'desmarcado'}`);
      salvar();
      return f;
    }
    // Validação do recurso: depois do OK, o gerente finaliza. Fica o registro, sai um PDF com o que foi validado e o
    // e-mail vai para o endereço que o administrador configurou. Recurso já enviado só vai de novo se o gerente pedir.
    const emEnvio = new Set(); // envios em andamento neste servidor (na Vercel, a trava do banco já deixa um por vez)
    const p2 = n => String(n).padStart(2, '0');
    const horas = min => (min / 60).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' h';
    const quando = iso => new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });
    const dataBR = iso => iso.split('-').reverse().join('/');
    async function validarRecursos(s, b) {
      const a = Number(b.ano), m = Number(b.mes), pid = Number(b.projetoId);
      const ah = exigeProjeto(s, pid), f = fech(a, m, pid), ids = [...new Set((Array.isArray(b.colabIds) ? b.colabIds : []).map(Number))];
      if (!ids.length) throw falha(400, 'Escolha ao menos um recurso.');
      f.validacoes ||= {};
      for (const c of ids) {
        if (!f.conferidos?.[c]) throw falha(409, `Dê o OK em ${ah.equipe?.get(c) || 'cada recurso'} antes de finalizar.`);
        if (f.validacoes[c]?.envio.status === 'enviado' && !b.reenviar) throw falha(409, `A validação de ${ah.equipe.get(c)} já foi enviada em ${quando(f.validacoes[c].envio.em)}.`, { jaEnviado: true });
      }
      const trava = ids.map(c => `${R.chave(a, m, pid)}|${c}`);
      if (trava.some(k => emEnvio.has(k))) throw falha(409, 'Esse envio já está em andamento.');
      trava.forEach(k => emEnvio.add(k));
      try {
        const x = await dados(s, a, m), calc = R.fechamento(x, doTime(s), pid, a, m, f);
        const linhas = ids.map(c => calc.linhas.find(l => l.c === c));
        if (linhas.some(l => !l)) throw falha(409, 'Só dá para validar quem tem horas neste projeto na competência.');
        const projeto = ah.meus.get(pid), nomes = linhas.map(l => ah.equipe.get(l.c)), varios = ids.length > 1, em = agora();
        const competencia = `${new Date(a, m - 1, 1).toLocaleString('pt-BR', { month: 'long' })} de ${a}`;
        const arquivo = pdf([
          { t: 'ACCOUNT · Gestão de Contas e Projetos', tam: 15, forte: true },
          { t: `Registro de validação de recurso${varios ? 's' : ''}`, tam: 12, forte: true }, '',
          `Projeto: ${projeto}${db.projetos[pid]?.manual ? '' : ` (ID AudiHoras ${pid})`}`,
          ...(ficha(pid).cliente ? [`Conta: ${ficha(pid).cliente}`] : []),
          `Competência: ${competencia}`, `Validado por: ${s.u.nome} <${s.u.email}>`, `Data da validação: ${quando(em)}`,
          `Fonte das horas: AudiHoras, consulta de ${quando(x.consultadoEm)}`, '',
          ...linhas.flatMap(l => [
            { t: ah.equipe.get(l.c), tam: 11, forte: true },
            `Horas no projeto: ${horas(l.projeto)}`,
            `Total no mês, em todos os projetos: ${horas(l.total)} · previsto: ${horas(l.previsto)} · diferença: ${l.dif > 0 ? '+' : ''}${horas(l.dif)}`,
            'Horas no projeto por dia: ' + x.lancamentos.filter(n => n.c === l.c && n.p === pid && n.a === a && n.m === m).sort((i, j) => i.d - j.d).map(n => `${p2(n.d)}/${p2(m)} ${horas(n.min)}`).join(' · '),
            // O motivo médico não sai do ACCOUNT: no documento a ausência aparece sem o tipo.
            ...l.ausencias.map(au => `Ausência: ${['atestado', 'licenca'].includes(au.r.tipo) ? 'justificada' : R.TIPOS[au.r.tipo].toLowerCase()}, ${dataBR(au.r.inicio)} a ${dataBR(au.r.fim)}, ${au.dias} dia(s) útil(eis) no mês · ${au.decisao ? R.DECISOES[au.decisao].toLowerCase() : 'sem decisão'}`),
            `OK dado por ${f.conferidos[l.c].por} em ${quando(f.conferidos[l.c].em)}`, 'Situação: validado, tudo OK.', '',
          ]),
          'Documento gerado automaticamente pelo ACCOUNT. As horas vêm do AudiHoras e não são alteradas aqui.',
        ]);
        const docId = d.uuid(), para = db.config.emailValidacao || [], envio = { status: 'pendente', para, em };
        await d.gravarDoc(docId, arquivo.toString('base64'));
        const assunto = `Validação de recurso${varios ? 's' : ''} · ${projeto} · ${p2(m)}/${a}`;
        if (!para.length) envio.erro = 'O endereço de destino ainda não foi configurado pelo administrador.';
        else if (!d.enviarEmail) envio.erro = 'O envio de e-mail ainda não foi ligado no servidor.';
        else {
          try {
            await d.enviarEmail({
              para, assunto, anexo: { nome: `Validacao-${a}-${p2(m)}-${projeto}.pdf`, mime: 'application/pdf', dados: arquivo },
              texto: `Olá,\n\nInformamos que ${varios ? 'os recursos abaixo foram devidamente validados' : 'o recurso foi devidamente validado'} e está tudo OK. Segue o documento referente à validação.\n\n`
                + `Recurso${varios ? 's' : ''}: ${nomes.join(', ')}\nProjeto: ${projeto}\nCompetência: ${competencia}\nValidado por: ${s.u.nome}\n\nMensagem automática do ACCOUNT · Gestão de Contas e Projetos (Auditeste).`,
            });
            envio.status = 'enviado';
          } catch (e) {
            envio.status = 'falhou';
            envio.erro = String(e.message).slice(0, 200);
          }
        }
        const velhos = new Set(ids.map(c => f.validacoes[c]?.docId).filter(Boolean));
        for (const c of ids) f.validacoes[c] = { por: s.u.nome, em, docId, envio };
        for (const id of velhos) if (!Object.values(f.validacoes).some(v => v.docId === id)) await d.apagarDoc(id);
        db.envios.push({ em, por: s.u.nome, para, assunto, recursos: nomes, status: envio.status, erro: envio.erro });
        if (db.envios.length > 500) db.envios.splice(0, db.envios.length - 500);
        auditar(s, 'validacao_' + envio.status, `${projeto} ${p2(m)}/${a}: ${nomes.join(', ')}${para.length ? ' → ' + para.join(', ') : ''}`);
        salvar();
        return f;
      } finally {
        trava.forEach(k => emEnvio.delete(k));
      }
    }
    const lerEmails = v => {
      const l = [...new Set(String(v || '').toLowerCase().split(/[,;\s]+/).filter(Boolean))];
      if (l.length > 5) throw falha(400, 'No máximo 5 endereços.');
      for (const e of l) if (!EMAIL.test(e)) throw falha(400, `E-mail inválido: ${e}`);
      return l;
    };
    const config = () => ({ emailValidacao: db.config.emailValidacao || [], envioLigado: !!d.enviarEmail, remetente: d.enviarEmail?.remetente || '', envios: db.envios.slice(-200).reverse() });
    function decidir(s, b) {
      const a = Number(b.ano), m = Number(b.mes), pid = Number(b.projetoId);
      const ah = exigeProjeto(s, pid), f = fech(a, m, pid);
      if (f.status === 'aprovado') throw falha(409, 'Fechamento aprovado: reabra para alterar.');
      const r = doTime(s).find(x => x.id === b.registroId);
      if (!r) throw falha(404, 'Registro não encontrado');
      if (b.decisao && !R.DECISOES[b.decisao]) throw falha(400, 'Decisão inválida');
      if (b.decisao) f.decisoes[r.id] = b.decisao; else delete f.decisoes[r.id];
      auditar(s, 'fechamento_decisao', `${ah.meus.get(pid)} ${m}/${a}: ${r.colab}, ${R.TIPOS[r.tipo]} → ${R.DECISOES[b.decisao] || 'a decidir'}`);
      salvar();
      return f;
    }

    // ---------- Rotas ----------
    // [método, caminho, função(ctx), perfis permitidos (null = público)]
    // ctx = { s, sid, p (partes do caminho), b (corpo), q (parâmetros), saida (cookie ou arquivo) }
    const ID = '([0-9a-f-]{36})';
    const rotas = [
      ['GET', '/api/me', ({ s }) => ({ limiteDoc: d.maxDoc || 8e6, usuario: s && { nome: s.u.nome, email: s.u.email, perfil: s.u.perfil, audihoras: vinculoDe(s.u), cofre: podeCofre(s.u) } }), null],
      ['POST', '/api/login', async ({ b, saida }) => { saida.cookie = await entrar(b.usuario, b.senha); return {}; }, null],
      ['POST', '/api/logout', ({ s, saida }) => {
        if (s) { s.fim = true; auditar(s, 'logout'); salvar(); }
        saida.cookie = '';
        return {};
      }, null],

      // Gerente
      ['GET', '/api/dados', async ({ q, s }) => {
        if (!s.ah && s.u.perfil === 'total') return { semHoras: 'As horas só aparecem para quem é gestor (Adm) no AudiHoras.' }; // não é erro: as outras telas seguem
        const ah = exigeAH(s), ano = Number(q.get('ano')), mes = Number(q.get('mes'));
        if (!(ano > 2000 && mes >= 1 && mes <= 12)) throw falha(400, 'Competência inválida');
        const x = await dados(s, ano, mes, q.has('atualizar'));
        const pick = obj => Object.fromEntries(Object.entries(obj).filter(([k]) => ah.meus.has(Number(k.split('|').pop()))));
        const prefixo = s.u.id + '|';
        return {
          ...x, fichas: Object.fromEntries([...ah.meus.keys()].map(pid => [pid, ficha(pid)])),
          fechamentos: pick(db.fechamentos), registros: doTime(s).map(r => paraGerente(s, r)),
          validacao: { para: db.config.emailValidacao || [], ligado: !!d.enviarEmail },
          fichasContas: Object.fromEntries(Object.entries(db.contas).filter(([, c]) => !c.manual || c.criadaPor === s.u.id)),
          comentarios: Object.fromEntries(Object.entries(db.comentarios).filter(([k]) => k.startsWith(prefixo)).map(([k, v]) => [k.slice(prefixo.length), v])),
        };
      }, ['gerente']],
      // Foto do AudiHoras, só de quem é da equipe. Só imagens comuns passam (nada de SVG, que pode carregar script).
      ['GET', '/api/foto/(\\d+)', async ({ s, p, saida }) => {
        const ah = exigeAH(s), id = Number(p[0]);
        if (!ah.equipe?.has(id)) throw falha(404, 'Profissional fora da sua equipe');
        const b64 = await d.fotoAH(ah, id);
        const mime = b64 && [['/9j/', 'image/jpeg'], ['iVBORw0KGgo', 'image/png'], ['R0lGOD', 'image/gif'], ['UklGR', 'image/webp']].find(([ini]) => b64.startsWith(ini))?.[1];
        if (!mime) return { semFoto: true }; // não é erro: a tela fica com as iniciais
        saida.arquivo = { mime, nome: `foto-${id}`, dados: b64, cache: 'private, max-age=3600' };
      }, ['gerente']],
      // Os apontamentos de uma pessoa da equipe no mês, um a um, como na tela do AudiHoras (somente leitura).
      ['GET', '/api/apontamentos', async ({ q, s }) => {
        const ah = exigeAH(s), c = Number(q.get('colab')), ano = Number(q.get('ano')), mes = Number(q.get('mes'));
        if (!ah.equipe?.has(c)) throw falha(404, 'Profissional fora da sua equipe');
        if (!(ano > 2000 && mes >= 1 && mes <= 12)) throw falha(400, 'Competência inválida');
        return { lancamentos: await d.apontamentosAH(ah, c, ano, mes) };
      }, ['gerente']],
      ['POST', '/api/registros', async ({ b, s }) => paraGerente(s, await novoRegistro(s, b)), ['gerente']],
      ['POST', `/api/registros/${ID}/status`, ({ b, s, p }) => {
        const r = mudarRegistro(s, p[0], b.status, b.obs);
        return s.u.perfil === 'gerente' ? paraGerente(s, r) : r;
      }, ['gerente', 'rh']],
      ['POST', '/api/projetos', ({ b, s }) => criarProjeto(s, b), ['gerente']],
      ['POST', '/api/projetos/(\\d+)', ({ b, s, p }) => salvarFicha(s, Number(p[0]), b), ['gerente']],
      ['DELETE', '/api/projetos/(\\d+)', ({ s, p }) => apagarProjeto(s, Number(p[0])), ['gerente']],
      ['POST', '/api/projetos/(\\d+)/ligar', ({ b, s, p }) => ligarProjeto(s, Number(p[0]), b), ['gerente']],
      ['POST', '/api/projetos/(\\d+)/membros', ({ b, s, p }) => membro(s, Number(p[0]), b), ['gerente']],
      ['POST', '/api/projetos/(\\d+)/checklist', ({ b, s, p }) => checklist(s, Number(p[0]), b), ['gerente']],
      ['POST', '/api/fechamentos', ({ b, s }) => acaoFechamento(s, b), ['gerente']],
      ['POST', '/api/fechamentos/decisao', ({ b, s }) => decidir(s, b), ['gerente']],
      ['POST', '/api/fechamentos/conferido', ({ b, s }) => conferirPessoa(s, b), ['gerente']],
      ['POST', '/api/fechamentos/validar', ({ b, s }) => validarRecursos(s, b), ['gerente']],
      ['GET', `/api/validacao/${ID}`, async ({ s, p, saida }) => {
        const ah = exigeAH(s);
        const k = Object.keys(db.fechamentos).find(k => ah.meus?.has(Number(k.split('|').pop())) && Object.values(db.fechamentos[k].validacoes || {}).some(v => v.docId === p[0]));
        if (!k) throw falha(404, 'Documento não encontrado');
        saida.arquivo = { mime: 'application/pdf', nome: `Validação ${k.split('|')[0]} ${ah.meus.get(Number(k.split('|')[1]))}.pdf`, dados: await d.lerDoc(p[0]) };
      }, ['gerente']],
      ['POST', '/api/contas', ({ b, s }) => salvarConta(s, b), ['gerente']],
      ['DELETE', '/api/contas', ({ q, s }) => apagarConta(s, q.get('nome')), ['gerente']],
      ['POST', '/api/comentarios', ({ b, s }) => {
        const m = /^\d{4}-\d{2}\|(consolidado|conta:.{1,80}|\d+)$/.exec(b.chave || '');
        if (!m) throw falha(400, 'Relatório inválido');
        if (/^\d+$/.test(m[1])) exigeProjeto(s, Number(m[1]));
        db.comentarios[`${s.u.id}|${b.chave}`] = { texto: texto(b.texto, 3000), em: agora() };
        salvar();
        return db.comentarios[`${s.u.id}|${b.chave}`];
      }, ['gerente']],

      // RH
      ['GET', '/api/rh', () => ({ registros: db.registros }), ['rh']],
      ['POST', `/api/registros/${ID}/documento`, async ({ b, s, p }) => {
        const r = db.registros.find(x => x.id === p[0]);
        if (!r) throw falha(404, 'Registro não encontrado');
        const antigo = r.arquivo;
        r.arquivo = await guardarArquivo(b.arquivo);
        if (antigo) await d.apagarDoc(antigo.id);
        auditar(s, 'documento_anexado', `${R.TIPOS[r.tipo]} de ${r.colab}${antigo ? ' (substituiu o anterior)' : ''}`);
        salvar();
        return r;
      }, ['rh']],
      // O RH abre qualquer documento; o gerente, só os da própria equipe (e se o administrador não tirou a permissão).
      ['GET', `/api/arquivo/${ID}`, async ({ s, p, saida }) => {
        const r = db.registros.find(x => x.arquivo?.id === p[0]);
        if (!R.tem(s.u, 'rh') && !(podeCofre(s.u) && s.ah?.equipe?.has(r?.colabId))) throw falha(403, 'Você não tem permissão para abrir este documento.');
        if (!r) throw falha(404, 'Documento não encontrado');
        saida.arquivo = { mime: r.arquivo.mime, nome: r.arquivo.nome, dados: await d.lerDoc(r.arquivo.id) };
        auditar(s, 'documento_aberto', `${R.TIPOS[r.tipo]} de ${r.colab}: ${r.arquivo.nome}`);
        salvar();
      }, ['rh', 'gerente']],

      // Administrador
      ['GET', '/api/usuarios', () => ({ usuarios: db.usuarios.map(publico) }), ['admin']],
      ['POST', '/api/usuarios', ({ b, s }) => {
        const u = novoUsuario(b);
        auditar(s, 'usuario_criado', `${u.nome} <${u.email}> como ${R.PERFIS[u.perfil]}, AudiHoras "${vinculoDe(u)}"`);
        salvar();
        return publico(u);
      }, ['admin']],
      ['POST', `/api/usuarios/${ID}`, ({ b, s, p }) => {
        const u = db.usuarios.find(x => x.id === p[0]);
        if (!u) throw falha(404, 'Usuário não encontrado');
        if (!R.PERFIS[b.perfil]) throw falha(400, 'Perfil inválido');
        if (u.id === s.u.id && !R.tem(b, 'admin')) throw falha(409, 'Você não pode tirar o seu próprio perfil de administrador.');
        const antes = `${R.PERFIS[u.perfil]}, AudiHoras "${vinculoDe(u)}"`, audihoras = lerVinculo(b.audihoras);
        vinculoLivre({ ...u, audihoras });
        if (vinculoDe({ ...u, audihoras }) !== vinculoDe(u)) derrubar(u);
        Object.assign(u, { nome: texto(b.nome, 100) || u.nome, perfil: b.perfil, audihoras });
        if (b.cofre !== undefined) u.cofre = b.cofre !== 'nao' && b.cofre !== false;
        auditar(s, 'usuario_editado', `${u.email}: ${antes} → ${R.PERFIS[u.perfil]}, AudiHoras "${vinculoDe(u)}"${R.tem(u, 'gerente') && u.cofre === false ? ', sem o cofre' : ''}`);
        salvar();
        return publico(u);
      }, ['admin']],
      ['POST', `/api/usuarios/${ID}/status`, ({ b, s, p }) => {
        const u = db.usuarios.find(x => x.id === p[0]);
        if (!u) throw falha(404, 'Usuário não encontrado');
        if (!['ativo', 'bloqueado'].includes(b.status)) throw falha(400, 'Situação inválida');
        if (u.id === s.u.id) throw falha(409, 'Você não pode bloquear a própria conta.');
        u.status = b.status;
        if (u.status === 'bloqueado') derrubar(u);
        auditar(s, b.status === 'ativo' ? 'usuario_reativado' : 'usuario_bloqueado', u.email);
        salvar();
        return publico(u);
      }, ['admin']],
      ['GET', '/api/auditoria', () => db.auditoria.slice(-1000).reverse(), ['admin']],
      // Para onde vão as validações do fechamento. A conta que envia (SMTP) fica nas variáveis do servidor, não aqui.
      ['GET', '/api/config', () => config(), ['admin']],
      ['POST', '/api/config', ({ b, s }) => {
        db.config.emailValidacao = lerEmails(b.emailValidacao);
        auditar(s, 'config_email', db.config.emailValidacao.join(', ') || 'sem destino');
        salvar();
        return config();
      }, ['admin']],
      ['POST', '/api/config/teste', async ({ s }) => {
        const para = db.config.emailValidacao || [];
        if (!para.length) throw falha(400, 'Salve o endereço de destino antes de testar.');
        if (!d.enviarEmail) throw falha(409, 'O envio de e-mail ainda não foi ligado no servidor.');
        await d.enviarEmail({ para, assunto: 'Teste do ACCOUNT', texto: `Olá,\n\nEste é um teste do envio de validações do ACCOUNT, pedido por ${s.u.nome}.` })
          .catch(e => { throw falha(502, e.message); });
        auditar(s, 'config_email_teste', para.join(', '));
        salvar();
        return config();
      }, ['admin']],
    ].map(([metodo, cam, fn, perfis]) => [metodo, new RegExp(`^${cam}$`), fn, perfis]);

    // Uma "requisição" sem HTTP: devolve { status, json, cookie?, arquivo? } para o ambiente responder.
    async function tratar(metodo, caminho, { sid, corpo = {}, busca = new URLSearchParams() } = {}) {
      const saida = {};
      let s = null;
      try {
        let achou = false;
        for (const [m, re, fn, perfis] of rotas) {
          const x = re.exec(caminho);
          if (!x) continue;
          achou = true;
          if (m !== metodo) continue;
          s = await sessao(sid);
          if (perfis && !s) return { status: 401, json: { erro: 'Sua sessão terminou. Entre de novo.' } };
          if (perfis) exige(s, ...perfis);
          const json = await fn({ s, sid, p: x.slice(1), b: corpo || {}, q: busca, saida });
          return { status: 200, json, ...saida };
        }
        return { status: achou ? 405 : 404, json: { erro: 'Rota não encontrada' } };
      } catch (e) {
        if (!e.status) console.error(e);
        if (e.extra?.expirou && s) s.fim = true; // o AudiHoras derrubou a conexão: entra de novo
        return { status: e.status || 500, json: { erro: e.status ? e.message : 'Erro interno: ' + e.message, ...e.extra } };
      } finally {
        // Grava mesmo quando a rota falha: o token do AudiHoras guardado na sessão muda a cada chamada.
        if (s) await (s.fim ? d.sessoes.apagar(sid) : d.sessoes.gravar(sid, s));
      }
    }

    // Primeiro uso: enquanto nenhum administrador entrou, o ADMIN_EMAIL (se vier) passa a ser o único.
    // Devolve quem é o administrador do primeiro acesso (vazio se não há nenhum), ou null se um já entrou.
    function garantirAdmin(email) {
      if (db.usuarios.some(u => R.tem(u, 'admin') && u.ultimoAcesso)) return null;
      if (email) {
        email = email.toLowerCase();
        db.usuarios = db.usuarios.filter(u => !R.tem(u, 'admin') || u.email === email);
        const u = db.usuarios.find(x => x.email === email) || novoUsuario({ nome: 'Administrador', email, perfil: 'admin' });
        Object.assign(u, { perfil: R.tem(u, 'admin') ? u.perfil : 'admin', status: 'ativo' });
        salvar();
      }
      const u = db.usuarios.find(x => R.tem(x, 'admin'));
      return u ? { email: u.email, usuario: vinculoDe(u) } : {};
    }

    return { tratar, garantirAdmin };
  };
})(module.exports);
