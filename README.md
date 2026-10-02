# ACCOUNT · Gestão de Contas e Projetos (Auditeste)

Portal para gerentes de conta, RH e administração, seguindo a *Especificação Funcional V1* do ACCOUNT. As horas vêm do AudiHoras e nunca são alteradas aqui.

## Rodar

Precisa só do Node 18 ou mais novo (sem `npm install`).

```bash
npm start        # sobe o ACCOUNT, com o AudiHoras de verdade
npm test         # checagem ponta a ponta (usa um AudiHoras de mentira, só dentro do teste)
```

Os dados ficam em `data/` (`db.json`, e os documentos cifrados em `data/cofre/`).

Abre em http://localhost:3000. Para a rede acessar: `HOST=0.0.0.0 npm start`.

**Primeiro uso real:** rode com `ADMIN_EMAIL=seu.email@auditeste.com.br npm start`. O console mostra com qual usuário do AudiHoras o administrador entra (o começo do e-mail). Depois ele cadastra os demais pela tela Usuários.

Variáveis: `PORT` (3000), `HOST` (127.0.0.1), `AUDIHORAS_API` (http://152.249.241.111:72/api/), `DATA_DIR` (./data), `ADMIN_EMAIL`, `COFRE_KEY` (64 hex; sem ela a chave fica em `data/cofre.key`).

## Na Vercel

`api/index.js` roda o ACCOUNT na Vercel (as telas saem de `public/`, e o `vercel.json` manda `/api/*` para a função). Lá nada fica em disco: banco, sessões, cache do AudiHoras e documentos do cofre vão para um Redis da Upstash.

1. Importar o repositório na Vercel (sem build).
2. Storage: criar um banco "Upstash for Redis" e ligar ao projeto. Ele cria `KV_REST_API_URL` e `KV_REST_API_TOKEN`.
3. Variável `ADMIN_EMAIL`: o primeiro administrador. Opcionais: `COFRE_KEY` (64 hex; sem ela, a chave do cofre fica no próprio Redis) e `AUDIHORAS_API`.

Diferenças do servidor local: documentos de até 3 MB (a Vercel recusa envio acima de 4,5 MB) e funções em São Paulo (`gru1`), perto do AudiHoras. A credencial do AudiHoras guardada na sessão vai cifrada com uma chave que só existe no cookie de quem entrou.

## Organização

`nucleo.js` tem as regras e rotas, `http-comum.js` o que o servidor local e a Vercel fazem igual, `server.js` liga o núcleo à rede, ao disco e à criptografia, `audihoras.js` lê o AudiHoras, `public/regras.js` tem os cálculos usados pela tela e pelo servidor. `audihoras-mock.js` e `dados-ficticios.js` servem só ao `npm test`.

## Perfis e telas

| Perfil | Telas |
|---|---|
| Gerente de Contas | Visão Geral, Projetos (ficha, equipe automática pelos apontamentos do AudiHoras, arquivar), Gestão de Equipes (ausências e histórico), Fechamento Mensal, Relatórios (consolidado e por projeto, PDF) |
| RH autorizado | Validação de Ausências (validar, cancelar, anexar documento), Cofre de Documentos |
| Administrador | Usuários (cadastro, perfil, usuário do AudiHoras, bloqueio), Auditoria |
| Financeiro autorizado | Situação dos indicadores financeiros (pendentes de definição) |
| Acesso total | Todas as telas acima. As de horas continuam exigindo gestor (Adm) no AudiHoras |

## Regras implementadas

* Login pelo AudiHoras: a pessoa entra com o usuário e a senha de lá, quem confere a senha é o próprio AudiHoras e o ACCOUNT não guarda nenhuma. O ACCOUNT só decide quem tem acesso e com qual perfil: o administrador cadastra a pessoa, e o usuário do AudiHoras dela é o começo do e-mail (nome.sobrenome@auditeste.com.br → nome.sobrenome), ou outro que ele definir. Cinco erros seguidos travam o usuário por 15 minutos.
* Gerente precisa ter perfil de gestor (Adm) no AudiHoras; o mesmo login já traz as horas da equipe. Se o AudiHoras derrubar a conexão, a sessão termina e a pessoa entra de novo.
* Com o AudiHoras fora do ar, ninguém entra no ACCOUNT (nem o RH).
* As fotos dos profissionais vêm do AudiHoras (GetColaboradorFoto), só para o gerente da equipe; sem foto, aparecem as iniciais.
* Só serviços de leitura do AudiHoras passam pelo servidor.
* Carteira = projetos remunerados com horas da equipe (liderados no AudiHoras). Tudo é validado no servidor, inclusive relatórios e documentos.
* Ausência não desconta sozinha: o fechamento mostra se ela já está refletida no AudiHoras e o gerente decide deduzir ou não. Aprovação exige todas as decisões e justificativa quando há divergência, e guarda a fotografia das horas. Mudança posterior no AudiHoras gera alerta.
* Documento médico: cifrado em disco (AES-256-GCM), só o RH (e o Acesso total) abre, cada abertura vai para a auditoria. O gerente vê só que o documento existe.
* Cancelamento de ausência é lógico (fica no histórico). Tudo relevante vai para a auditoria.

## Pendente da especificação

* Indicadores financeiros e saúde do projeto: aguardam o Financeiro (RF-REL-006, RN-010).
* Política de retenção do cofre (RH/LGPD) e parâmetros de sessão (TI/Segurança): hoje sessão de 8 h e auditoria limitada a 20 mil eventos.
* A validar com um gestor real do AudiHoras: `PesquisaApontamentos` com `Mes: 0` e se `Projetos` já vem filtrado por gestor.
