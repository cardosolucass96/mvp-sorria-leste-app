# Deploy para Cloudflare - Sorria Leste MVP

Este guia explica como fazer deploy da aplicação Sorria Leste MVP para a Cloudflare usando D1 (banco SQLite na edge).

## Pré-requisitos

1. Conta na Cloudflare
2. Wrangler CLI instalado e autenticado

```bash
npx wrangler login
```

## Passos para Deploy

### 1. Criar o banco de dados D1

```bash
npm run d1:create
```

Isso vai criar o banco `sorria-leste-db` na sua conta Cloudflare e retornar um `database_id`.

**Copie o `database_id` retornado** e atualize o arquivo `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "sorria-leste-db"
database_id = "SEU_DATABASE_ID_AQUI"  # <-- Cole aqui
```

### 2. Executar as migrações (criar tabelas)

```bash
npm run d1:migrate
```

### 3. Popular dados iniciais (opcional)

```bash
npm run d1:seed
```

### 4. Deploy da aplicação

```bash
npm run deploy
```

Pronto! Sua aplicação estará disponível em `https://sorria-leste-app.<seu-subdominio>.workers.dev`

## Comandos Úteis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento local (Next.js) |
| `npm run preview` | Preview local no runtime Cloudflare |
| `npm run deploy` | Build + Deploy para Cloudflare |
| `npm run d1:create` | Criar banco D1 |
| `npm run d1:migrate` | Executar schema.sql no D1 remoto |
| `npm run d1:migrate:local` | Executar schema.sql no D1 local |
| `npm run d1:seed` | Popular dados iniciais no D1 remoto |
| `npm run d1:seed:local` | Popular dados iniciais no D1 local |

## Desenvolvimento Local com D1

Para desenvolver localmente usando o D1:

```bash
# 1. Criar tabelas localmente
npm run d1:migrate:local

# 2. Popular dados localmente
npm run d1:seed:local

# 3. Executar em modo preview
npm run preview
```

## Estrutura do Banco

O banco utiliza SQLite via D1 com as seguintes tabelas:

- `usuarios` - Usuários do sistema (admin, atendente, avaliador, executor)
- `clientes` - Pacientes da clínica
- `procedimentos` - Catálogo de procedimentos odontológicos
- `atendimentos` - Jornada do cliente
- `itens_atendimento` - Procedimentos vinculados ao atendimento
- `pagamentos` - Registro de pagamentos
- `parcelas` - Parcelas de pagamentos parcelados
- `comissoes` - Comissões calculadas
- `notas_execucao` - Anotações durante execução
- `anexos_execucao` - Arquivos de exames

## Variáveis de Ambiente

Configure em `.dev.vars` para desenvolvimento local:

```
NEXTJS_ENV=development
```

Para produção, configure diretamente no painel da Cloudflare ou via:

```bash
npx wrangler secret put NOME_DA_VARIAVEL
```

## Limitações D1

- **Tamanho máximo do banco**: 10GB (plano gratuito: 500MB)
- **Transações**: Suportadas via batch
- **Sincronização**: Automática em todas as regiões

## Troubleshooting

### Erro: "D1 database context not set"

Certifique-se de que o `wrangler.toml` está configurado corretamente com o `database_id`.

### Erro no build

```bash
# Limpar cache e rebuildar
rm -rf .next .open-next
npm run build
```

### Verificar logs

```bash
npx wrangler tail
```
