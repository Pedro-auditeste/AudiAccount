// Núcleo do ACCOUNT: regras, permissões e rotas da API, sem rede nem disco.
// O server.js liga isto à rede, ao disco e à criptografia; o test.js usa direto.
(function (N) {
  const R = require('./public/regras.js');
  const falha = (status, msg, extra) => Object.assign(new Error(msg), { status, extra });
  N.falha = falha;

  // d = dependências de cada ambiente: { db, salvar, uuid, sessoes: { ler, gravar, apagar }, gravarDoc, lerDoc, apagarDoc,
  //   conectarAH, dadosAH, fotoAH, maxDoc }. Sessões e documentos podem ser assíncronos (Redis na Vercel).
  N.criar = d => {
    const { db } = d;
    const agora = () => new Date().toISOString();
    const salvar = () => d.salvar();
    // Bancos de antes do login pelo AudiHoras: sem senha, sem convite e sem pedido de nova senha.
    for (const u of db.usuarios) { if (u.status === 'convite') u.status = 'ativo'; delete u.senha; delete u.link; }
    delete db.pedidos;

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
      ultimoAcesso: u.ultimoAcesso, audihoras: u.audihoras || '', vinculo: vinculoDe(u),
    });

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
    async function dados(ah, ano, mes, atualizar) {
      const x = await d.dadosAH(ah, ano, mes, atualizar);
      ah.meus = new Map(x.projetos.filter(R.ehProjeto).map(p => [p.id, p.nome]));
      ah.equipe = new Map(x.equipe.map(c => [c.id, c.nome]));
      return x;
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
    // O gerente vê só metadados administrativos: nem o nome do arquivo do documento médico (RF-EQP-005).
    const paraGerente = r => ({ ...r, arquivo: undefined, documento: !!r.arquivo });

    // ---------- Projetos ----------
    const ficha = pid => (db.projetos[pid] ||= { cliente: '', inicio: '', fim: '', status: 'ativo', referencia: '', obs: '' });
    function salvarFicha(s, pid, b) {
      const ah = exigeProjeto(s, pid);
      if (!R.STATUS_PRJ[b.status]) throw falha(400, 'Status inválido');
      for (const x of [b.inicio, b.fim]) if (x && !DATA.test(x)) throw falha(400, 'Vigência inválida');
      if (b.inicio && b.fim && b.inicio > b.fim) throw falha(400, 'A vigência termina antes de começar');
      const f = ficha(pid);
      Object.assign(f, {
        cliente: texto(b.cliente, 120), inicio: b.inicio || '', fim: b.fim || '', status: b.status,
        referencia: texto(b.referencia, 300), obs: texto(b.obs), atualizadoPor: s.u.nome, atualizadoEm: agora(),
      });
      auditar(s, 'projeto_atualizado', `${ah.meus.get(pid)}: ${R.STATUS_PRJ[b.status]}`);
      salvar();
      return f;
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
        const x = await dados(ah, a, m);
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
      ['GET', '/api/me', ({ s }) => ({ limiteDoc: d.maxDoc || 8e6, usuario: s && { nome: s.u.nome, email: s.u.email, perfil: s.u.perfil, audihoras: vinculoDe(s.u) } }), null],
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
        const x = await dados(ah, ano, mes, q.has('atualizar'));
        const pick = obj => Object.fromEntries(Object.entries(obj).filter(([k]) => ah.meus.has(Number(k.split('|').pop()))));
        const prefixo = s.u.id + '|';
        return {
          ...x, fichas: Object.fromEntries([...ah.meus.keys()].map(pid => [pid, ficha(pid)])),
          fechamentos: pick(db.fechamentos), registros: doTime(s).map(paraGerente),
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
      ['POST', '/api/registros', async ({ b, s }) => paraGerente(await novoRegistro(s, b)), ['gerente']],
      ['POST', `/api/registros/${ID}/status`, ({ b, s, p }) => {
        const r = mudarRegistro(s, p[0], b.status, b.obs);
        return s.u.perfil === 'gerente' ? paraGerente(r) : r;
      }, ['gerente', 'rh']],
      ['POST', '/api/projetos/(\\d+)', ({ b, s, p }) => salvarFicha(s, Number(p[0]), b), ['gerente']],
      ['POST', '/api/fechamentos', ({ b, s }) => acaoFechamento(s, b), ['gerente']],
      ['POST', '/api/fechamentos/decisao', ({ b, s }) => decidir(s, b), ['gerente']],
      ['POST', '/api/comentarios', ({ b, s }) => {
        const m = /^\d{4}-\d{2}\|(consolidado|\d+)$/.exec(b.chave || '');
        if (!m) throw falha(400, 'Relatório inválido');
        if (m[1] !== 'consolidado') exigeProjeto(s, Number(m[1]));
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
      ['GET', `/api/arquivo/${ID}`, async ({ s, p, saida }) => {
        const r = db.registros.find(x => x.arquivo?.id === p[0]);
        if (!r) throw falha(404, 'Documento não encontrado');
        saida.arquivo = { mime: r.arquivo.mime, nome: r.arquivo.nome, dados: await d.lerDoc(r.arquivo.id) };
        auditar(s, 'documento_aberto', `${R.TIPOS[r.tipo]} de ${r.colab}: ${r.arquivo.nome}`);
        salvar();
      }, ['rh']],

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
        auditar(s, 'usuario_editado', `${u.email}: ${antes} → ${R.PERFIS[u.perfil]}, AudiHoras "${vinculoDe(u)}"`);
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
