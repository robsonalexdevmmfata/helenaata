# Relatório de alterações — 02/11/2026

Este relatório resume as correções feitas hoje no projeto. Nenhuma chave, senha ou outro segredo foi incluído.

## Cadastro, login e Supabase

- Conectado o cadastro e o login de clientes à API do servidor e ao PostgreSQL/Supabase, em vez de depender de credenciais salvas no navegador.
- Implementados no servidor a criação e a busca de contas, com senha armazenada como hash scrypt.
- Adicionadas validações e respostas para credenciais inválidas, conta duplicada, banco indisponível e tabela ausente.
- A conexão local com o banco e a existência da tabela `public.app_accounts` foram verificadas. Nenhuma conta de teste foi criada.
- O Render precisa ter `DATABASE_URL` configurada no ambiente do serviço; `.env.local` não é enviado automaticamente para produção.

## Erros de compilação e preferências

- Corrigida a declaração duplicada de `out` na rota `/api/helena/cycle`.
- Corrigidos blocos incompletos no orquestrador que causavam erro de sintaxe.
- Restauradas as funções de leitura e gravação de preferências do workspace e a inicialização do tema, que estavam faltando e impediam a compilação.
- Ajustado o login local para validar senhas com hash, mantendo o fluxo de autenticação pelo servidor para contas reais.

## Landing page

- Restaurados textos da landing page conforme solicitado.
- Ajustada a revelação dos blocos para que o conteúdo continue visível sem JavaScript, mantendo a animação quando disponível.
- A validação local confirmou a visibilidade dos 19 blocos.

## Arquivos relacionados

- API e banco: `server/api.mjs`, `server/auth.mjs`, `server/helena-db.mjs`
- Autenticação no cliente: `src/lib/backend.ts`, `src/lib/auth.ts`
- Telas de acesso: `src/routes/cadastro.tsx`, `src/routes/login.tsx`
- Preferências e tema: `src/lib/store.ts`, `src/lib/theme.ts`, `src/lib/types.ts`
- Orquestrador: `src/lib/helena/orchestrator.ts`
- Landing: `src/styles.css`, `src/hooks/use-landing-motion.ts`, `src/components/marketing/LandingPage.tsx`
- Configuração de deploy: `render.yaml`
- Schema de contas: `database/migrations/006_supabase_workspace_state.sql`

## Verificações

- `npm run build` — passou.
- `npm run build:render` — passou.
- Testes direcionados de SaaS e segurança — 25 testes passaram.
- `node --check` nos arquivos principais do servidor — passou.
- `git diff --check` nos arquivos das correções de tema/preferências — passou.

## Pendente para produção

- Configurar e confirmar `DATABASE_URL` no serviço do Render.
- Publicar as alterações no Render/Vercel e testar cadastro e login no ambiente publicado. Isso não foi feito nesta sessão.
- Não houve commit, push nem alteração de dados remotos.
- Como credenciais foram compartilhadas na conversa, revogue-as e gere novas antes de usar em produção.
