# Sorria Leste - Sistema de Gestao Odontologica

Sistema web para gestao completa de clinica odontologica. Gerencia toda a jornada do paciente: chegada, triagem, avaliacao, pagamento, execucao de procedimentos e agendamento de retornos. Suporte a multiplas unidades.

## Stack

| Camada | Tecnologia |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript |
| Banco de dados | Cloudflare D1 (SQLite) |
| Storage | Cloudflare R2 |
| Deploy | Cloudflare Workers (via opennextjs-cloudflare) |
| Estilo | Tailwind CSS v4 |
| Testes | Jest + Testing Library |

## Setup Local

### Pre-requisitos
- Node.js 18+
- Wrangler CLI (`npm install -g wrangler`)
- Conta Cloudflare com D1 e R2 configurados

### Instalacao

```bash
# Clonar e instalar
git clone <repo-url>
cd mvp-sorria-leste-app
npm install

# Configurar banco local
npm run d1:migrate:local
npm run d1:seed:local

# Iniciar dev server
npm run dev
```

Acesse `http://localhost:3000`.

### Credenciais de teste (seed)

| Email | Senha | Role |
|---|---|---|
| admin@sorria.com | Sorria@123 | admin |
| atendente@sorria.com | Sorria@123 | atendente |
| avaliador@sorria.com | Sorria@123 | avaliador |
| executor@sorria.com | Sorria@123 | executor |

## Comandos Principais
```bash
npm run dev              # Dev server
npm test                 # Testes
npm run lint             # Linting
npm run deploy           # Build + deploy producao
npm run preview          # Preview local (Cloudflare)
npm run d1:pull-prod     # Baixar banco de producao
```

## Estrutura

```
app/api/     # 43 API routes
app/*/       # 22 paginas
components/  # UI primitivos + componentes de dominio
lib/         # DB, auth, types, constants, utils
contexts/    # AuthContext
__tests__/   # Testes
```

## Roles

- **Admin**: acesso total, dashboard, gestao de usuarios e procedimentos
- **Atendente**: recebe pacientes, cria atendimentos, registra pagamentos e acompanha dashboard
- **Avaliador**: avalia pacientes, define procedimentos e valores, e acompanha dashboard
- **Executor**: executa procedimentos, registra evolucoes clinicas e preenche prontuarios por etapa

## Pipeline de Atendimento

```
Triagem -> Avaliacao -> Aguardando Pagamento -> Em Execucao -> Finalizado -> Encerrado
```

## Deploy

```bash
npm run deploy
```

Migrations manuais em producao:
```bash
wrangler d1 execute sorria-leste-db --file=lib/migrations/<arquivo>.sql
```
