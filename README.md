# ACCOUNT · Gestão de Contas e Projetos (Auditeste)

Portal para gerentes de conta, RH e administração, seguindo a *Especificação Funcional V1* do ACCOUNT. As horas vêm do AudiHoras e nunca são alteradas aqui.

## Rodar

Precisa só do Node 18 ou mais novo (sem `npm install`).

```bash
npm start        # sobe o ACCOUNT, com o AudiHoras de verdade
npm test         # checagem ponta a ponta (usa um AudiHoras de mentira, só dentro do teste)
```

Varredura das telas (todas as telas e ações de cada perfil num navegador, no celular e no PDF): `PUPPETEER=<pasta do puppeteer> CHROME=<chrome.exe> node varredura.js`, ou com `VERCEL=1` para passar pela função da Vercel. Precisa de um puppeteer instalado em outro lugar; não é dependência do projeto.

Os dados ficam em `data/` (`db.json`, e os documentos cifrados em `data/cofre/`).

Abre em http://localhost:3000. Para a rede acessar: `HOST=0.0.0.0 npm start`.

**Primeiro uso real:** rode com `ADMIN_EMAIL=seu.email@auditeste.com.br npm start`. O console mostra com qual usuário do AudiHoras o administrador entra (o começo do e-mail). Depois ele cadastra os demais pela tela Usuários.

Variáveis: `PORT` (3000), `HOST` (127.0.0.1), `AUDIHORAS_API` (http://152.249.241.111:72/api/), `DATA_DIR` (./data), `ADMIN_EMAIL`, `COFRE_KEY` (64 hex; sem ela a chave fica em `data/cofre.key`).

E-mail das validações do fechamento: o administrador configura na tela E-mails o endereço de destino e a conta que envia (servidor SMTP, porta 465 ou 587, usuário, senha e remetente). A senha fica cifrada com a chave do cofre e nunca volta para a tela; trocar o servidor ou o usuário exige digitar a senha de novo. O e-mail de teste vai só para quem pediu. Sem conta configurada nada é enviado: cada validação fica registrada, com o PDF para baixar, e o e-mail fica aguardando. Alternativa pelas variáveis do servidor (vale quando a tela está vazia): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` e `EMAIL_FROM`.

## Na Vercel

`api/index.js` roda o ACCOUNT na Vercel (as telas saem de `public/`, e o `vercel.json` manda `/api/*` para a função). Lá nada fica em disco: banco, sessões, cache do AudiHoras e documentos do cofre vão para um Redis da Upstash.

1. Importar o repositório na Vercel (sem build).
2. Storage: criar um banco "Upstash for Redis" e ligar ao projeto. Ele cria `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
3. Variável `ADMIN_EMAIL`: o primeiro administrador. Opcionais: `COFRE_KEY` (64 hex; sem ela, a chave do cofre fica no próprio Redis), `AUDIHORAS_API` e as `SMTP_*` do e-mail das validações.

Diferenças do servidor local: documentos de até 3 MB (a Vercel recusa envio acima de 4,5 MB) e funções em São Paulo (`gru1`), perto do AudiHoras. A credencial do AudiHoras guardada na sessão vai cifrada com uma chave que só existe no cookie de quem entrou.

## Organização

`nucleo.js` tem as regras e rotas, `http-comum.js` o que o servidor local e a Vercel fazem igual, `server.js` liga o núcleo à rede, ao disco e à criptografia, `audihoras.js` lê o AudiHoras, `envio.js` gera o PDF da validação e envia o e-mail (SMTP, sem biblioteca), `public/regras.js` tem os cálculos usados pela tela e pelo servidor. `audihoras-mock.js`, `dados-ficticios.js` e `smtp-falso.js` servem só ao `npm test` e à varredura.

## Perfis e telas

| Perfil | Telas |
|---|---|
| Gerente de Contas | Visão Geral (contas com horas no mês; o resto é histórico sob demanda), Contas e projetos (gestão da conta, relação dos recursos por pessoa e projeto com exportação para Excel, criar projeto, equipe com papéis, checklist), Gestão de Equipes (por projeto ou por pessoa, ausências e histórico), Ponto e apontamentos (o mês de cada pessoa, dia a dia), Fechamento Mensal (OK e validação do recurso por e-mail), Relatórios (consolidado, por conta e por projeto, PDF), Cofre (documentos da própria equipe) |
| RH autorizado | Validação de Ausências (validar, cancelar, anexar documento), Cofre de Documentos |
| Administrador | Usuários (cadastro, perfil, usuário do AudiHoras, permissão do cofre, bloqueio), Auditoria, E-mails das validações (destino, teste e histórico de envios) |
| Financeiro autorizado | Situação dos indicadores financeiros (pendentes de definição) |
| Acesso total | Todas as telas acima. As de horas continuam exigindo gestor (Adm) no AudiHoras |

## Regras implementadas

* Login pelo AudiHoras: a pessoa entra com o usuário e a senha de lá, quem confere a senha é o próprio AudiHoras e o ACCOUNT não guarda nenhuma. O ACCOUNT só decide quem tem acesso e com qual perfil: o administrador cadastra a pessoa, e o usuário do AudiHoras dela é o começo do e-mail (nome.sobrenome@auditeste.com.br → nome.sobrenome), ou outro que ele definir. Cinco erros seguidos travam o usuário por 15 minutos.
* Gerente precisa ter perfil de gestor (Adm) no AudiHoras; o mesmo login já traz as horas da equipe. Se o AudiHoras derrubar a conexão, a sessão termina e a pessoa entra de novo.
* Com o AudiHoras fora do ar, ninguém entra no ACCOUNT (nem o RH).
* As fotos dos profissionais vêm do AudiHoras (GetColaboradorFoto), só para o gerente da equipe; sem foto, aparecem as iniciais.
* Só serviços de leitura do AudiHoras passam pelo servidor.
* Tela principal por competência: aparece o que teve hora no mês escolhido (e o projeto criado no ACCOUNT que segue em andamento). Projeto encerrado ou sem hora no mês vira histórico: continua guardado e aparece quando o gerente pede ("Ver histórico"). Fechamentos pendentes contam só projetos com horas no mês.
* O gestor é uma pessoa da carteira: as horas dele entram com as da equipe (o AudiHoras só lista os liderados). Os projetos internos "Gestão de contas - Cliente" não são projeto para fechar: viram o bloco "Gestão da conta" dentro da conta do cliente, que aparece mesmo sem equipe apontando lá.
* Projetos: dá para criar um projeto no ACCOUNT (trabalho que ainda não está no AudiHoras), com nome, conta e equipe; quando ele existir no AudiHoras, "Ligar ao AudiHoras" passa equipe, checklist e ficha para o de lá. Em qualquer projeto o gerente adiciona pessoas buscando pelo nome, informa o papel de cada uma ali (a mesma pessoa pode ter papéis diferentes em projetos diferentes) e mantém um checklist.
* Horas separadas por projeto: Gestão de Equipes abre por projeto, cada um com a própria equipe e as horas de cada pessoa nele; quem atua em dois projetos aparece nos dois. A relação dos recursos e a planilha têm uma linha por pessoa e projeto.
* Ponto e apontamentos: o mês de cada pessoa em calendário (dia com ponto, sem ponto, ausência registrada, feriado) e cada apontamento com início, fim, projeto, atividade e observação, como no AudiHoras, sem sair do ACCOUNT. Continua somente leitura.
* Validação do recurso: depois do OK, "Finalizar e enviar" registra a validação, gera um PDF com as horas conferidas e envia por e-mail ao endereço configurado. Um recurso já enviado só vai de novo se o gerente pedir ("Reenviar"); o motivo médico de uma ausência não vai no documento.
* Contas: cada projeto cai numa conta sozinho (cliente da ficha; senão as contas do gerente no AudiHoras, os projetos "Gestão de contas - Cliente"; senão o começo do nome, como "D4Sign PC1657..."). A tela Contas traz a relação dos recursos de cada conta e exporta para o Excel.
* Ficha da conta: sobre o que é, tecnologias usadas e contatos (nome, papel, e-mail, telefone). Dá para criar uma conta à mão (cliente que ainda não tem projeto com horas); ela aparece para quem criou e recebe os projetos sozinha quando houver horas. A ficha do projeto tem "Sobre o projeto".
* Equipes: o nome abre as horas da pessoa por projeto e as ausências e férias dela; programação de férias da equipe; tipos de ausência incluem licença médica e "Outro motivo" (obrigatório contar o que aconteceu), com documento ou print.
* Fechamento: o nome abre as horas da pessoa em cada projeto do mês, e o gerente marca OK em cada profissional conferido.
* Relatórios: consolidado, por conta ou por projeto; o gerente escolhe quais partes vão para o PDF, e o detalhamento de cada projeto traz gráficos. As cores saem no PDF mesmo com "gráficos de plano de fundo" desligado.
* Conferência com o AudiHoras: hora lançada que não casa com projeto nenhum aparece como aviso na Visão Geral e na linha da pessoa em Gestão de Equipes.
* Carteira = projetos com horas da equipe (liderados no AudiHoras) nos últimos 6 meses, remunerados e internos; benefícios (férias, day off, licenças) entram como horas adicionais. Tudo é validado no servidor, inclusive relatórios e documentos.
* Ausência não desconta sozinha: o fechamento mostra se ela já está refletida no AudiHoras e o gerente decide deduzir ou não. Aprovação exige todas as decisões e justificativa quando há divergência, e guarda a fotografia das horas. Mudança posterior no AudiHoras gera alerta.
* Documento médico: cifrado (AES-256-GCM), cada abertura vai para a auditoria. O RH (e o Acesso total) abre todos; o gerente de contas abre só os da própria equipe, e o administrador pode tirar essa permissão de cada gerente (aí ele vê só que o documento existe).
* Cancelamento de ausência é lógico (fica no histórico). Tudo relevante vai para a auditoria.

## Pendente da especificação

* Indicadores financeiros e saúde do projeto: aguardam o Financeiro (RF-REL-006, RN-010).
* Política de retenção do cofre (RH/LGPD) e parâmetros de sessão (TI/Segurança): hoje sessão de 8 h e auditoria limitada a 20 mil eventos.
* Lançar ou corrigir ponto pelo ACCOUNT: o servidor continua barrando os serviços de escrita do AudiHoras (RF-AUD-004). Para liberar é preciso autorização de quem cuida do AudiHoras, um usuário de teste lá e um perfil de colaborador aqui.
* A validar com um gestor real: as horas do próprio gestor (`PesquisaApontamentos` com o foco em 0). Se o AudiHoras não as entregar, a carteira abre só com os liderados.
