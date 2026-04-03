# CLAUDE.md - Sorria Leste

Sistema de gestao odontologica para clinica Sorria Leste. MVP em producao.

## Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Banco**: Cloudflare D1 (SQLite) — NAO usa PostgreSQL, NAO usa ORM
- **Storage**: Cloudflare R2 (arquivos/anexos)
- **Deploy**: Cloudflare Workers via opennextjs-cloudflare
- **Estilo**: Tailwind CSS v4 (`@theme` em `app/globals.css`)
- **Fonte**: Plus Jakarta Sans (variavel `--font-sans`)
- **Icons**: lucide-react
- **Charts**: recharts (dashboard)
- **Testes**: Jest + Testing Library
- **Auth**: JWT customizado (lib/auth/)

## Comandos

```bash
npm run dev              # Dev server (Next.js)
npm test                 # Rodar todos os testes
npm run test:watch       # Testes em watch mode
npm run test:components  # Testes de componentes (jest.components.config.js)
npm run lint             # ESLint
npm run deploy           # Build + deploy Cloudflare Workers
npm run preview          # Build + preview local Cloudflare

# D1 Database
npm run d1:migrate:local    # Rodar schema localmente
npm run d1:migrate          # Rodar schema na producao
npm run d1:seed:local       # Seed local
npm run d1:seed             # Seed producao
npm run d1:pull-prod        # Baixar banco de producao (scripts/pull-prod-db.sh)

# Migrations manuais
wrangler d1 execute sorria-leste-db --local --file=lib/migrations/nome.sql
wrangler d1 execute sorria-leste-db --file=lib/migrations/nome.sql  # producao
```

## Estrutura de Pastas

```
app/
  api/                    # API routes (43 arquivos route.ts)
  [pagina]/page.tsx       # 22 paginas
  globals.css             # Design tokens (@theme)
  layout.tsx              # Root layout (AuthProvider + ToastProvider + AppLayout)

components/
  ui/                     # 28 primitivos (Button, Card, Modal, Table, etc.)
  domain/                 # Componentes de negocio (StatusBadge, PagamentoForm, etc.)
  layout/                 # AppLayout, Sidebar, Header, UnitSelector

lib/
  db.ts                   # Helpers D1: query(), queryOne(), execute(), batch()
  types.ts                # Tipos TypeScript de todas as entidades
  schema.sql              # Schema completo do banco (fonte de verdade)
  auth/
    jwt.ts                # Gerar/verificar tokens JWT
    middleware.ts          # withAuth(), withRole(), withUnit(), withUnitRole()
    password.ts            # Hash de senha
  constants/
    status.ts              # Labels, cores e transicoes de status (fonte unica)
    roles.ts               # Labels e cores de roles
    navigation.ts          # Menu items por role
    agendamentos.ts        # Constantes de agendamento
    origens.ts             # Origens de cliente
  helpers/
    gerarComissoes.ts      # Logica de geracao de comissoes
  hooks/
    useUnitFetch.ts        # Fetch com header X-Unidade-Id
  utils/
    apiFetch.ts            # Fetch wrapper com auth token
    formatters.ts          # Formatacao de moeda, data, etc.
    masks.ts               # Mascaras de input (CPF, telefone)
    validators.ts          # Validacoes (CPF, email)
    useForm.ts             # Hook de formulario
    useDebounce.ts         # Hook de debounce
    usePageTitle.ts        # Hook de titulo da pagina
  migrations/              # Migrations SQL incrementais

contexts/
  AuthContext.tsx           # Provider de autenticacao (JWT + role + unidade)

__tests__/                 # Testes organizados por dominio
scripts/                   # Scripts utilitarios (pull-prod-db.sh)
```

## Banco de Dados

**17 tabelas** em D1 (SQLite). Acesso SEMPRE via raw SQL usando helpers de `lib/db.ts`:

```ts
import { query, queryOne, execute, batch } from '@/lib/db';

const clientes = await query<Cliente>('SELECT * FROM clientes WHERE nome LIKE ?', [`%${termo}%`]);
const cliente = await queryOne<Cliente>('SELECT * FROM clientes WHERE id = ?', [id]);
const result = await execute('INSERT INTO clientes (nome, cpf) VALUES (?, ?)', [nome, cpf]);
```

**Entidades principais**: usuarios, clientes, procedimentos, atendimentos, itens_atendimento, pagamentos, comissoes, agendamentos, saldo_clientes, movimentacoes_saldo, unidades

## Autenticacao e Autorizacao

4 roles: `admin`, `atendente`, `avaliador`, `executor`

Middleware em API routes:
```ts
import { withAuth, withRole, withUnit, withUnitRole } from '@/lib/auth/middleware';

// Qualquer usuario autenticado
export const GET = withAuth(async (req, ctx) => { ... });

// Apenas admin e atendente
export const POST = withRole(['admin', 'atendente'], async (req, ctx) => { ... });

// Com contexto de unidade
export const GET = withUnitRole(['admin'], async (req, ctx) => {
  const unidadeId = ctx.unidadeId;
  ...
});
```

Frontend: `AuthContext` fornece user, login, logout. `apiFetch()` injeta token automaticamente. `useUnitFetch()` injeta header `X-Unidade-Id`.

## Modelo de Dominio

### Status Machine (Atendimento)
```
triagem -> avaliacao -> aguardando_pagamento -> em_execucao -> finalizado -> encerrado
```
Definido em `lib/constants/status.ts` (fonte unica de verdade para labels, cores e transicoes).

### Dois caminhos de entrada
1. **Walk-in (tipo='normal')**: Cliente chega -> triagem -> avaliacao -> pagamento -> execucao
2. **Sessao agendada (tipo='sessao')**: Agendamento "Chegou" -> cria atendimento com itens pre-carregados -> pagamento -> execucao

### Regras criticas
- 1 agendamento = 1 procedimento (multiplos agrupados por cliente+data na UI)
- Atendimento abre e fecha no mesmo dia
- `por_dente`: N dentes selecionados = N itens separados (com `group_id` compartilhado)
- Procedimentos nao feitos no dia viram agendamentos futuros
- Parcelas NAO existem mais (removidas por decisao de produto)
- Multi-unidade: atendimentos e agendamentos sao filtrados por unidade

## Convencoes de Codigo

### API Routes
- Sempre usar middleware de auth (`withAuth`, `withRole`, etc.)
- Retornar `NextResponse.json()` com status codes apropriados
- Validar input no inicio da funcao, retornar 400 com mensagem clara
- SQL parametrizado (NUNCA concatenar strings em queries)

### Componentes
- Componentes UI em `components/ui/` — primitivos reutilizaveis
- Componentes de dominio em `components/domain/` — logica de negocio
- Exportar via barrel (`components/ui/index.ts`)
- Props tipadas com interface exportada (ex: `export interface ButtonProps`)
- `'use client'` apenas quando necessario (hooks, interatividade)

### Estilo
- Tokens semanticos definidos em `app/globals.css` via `@theme`
- Usar tokens do design system (`primary-*`, `neutral-*`, `success-*`, `error-*`, etc.)
- NAO usar cores Tailwind raw (ex: nao usar `blue-500`, usar `info-500`)
- Paleta primaria: laranja (`primary-500: #f97316`)

### Tipos
- Tipos de entidades em `lib/types.ts`
- Labels e cores de status em `lib/constants/status.ts`
- Labels de roles em `lib/constants/roles.ts`

## O que NAO fazer

- NAO instalar ORM (Prisma, Drizzle, etc.) — o projeto usa raw SQL com D1
- NAO trocar deploy pra Vercel — o projeto roda em Cloudflare Workers
- NAO usar PostgreSQL — o banco e D1 (SQLite)
- NAO criar sistema de parcelas/installments — foi removido por decisao de produto
- NAO usar cores Tailwind padrao (blue, red, green) — usar os tokens semanticos (info, error, success)
- NAO criar arquivos de documentacao (*.md) a menos que explicitamente pedido
- NAO adicionar comentarios/docstrings em codigo que nao foi alterado
