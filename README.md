# Binder Manager API

API do fichário do Palácio del Gallo: fichas, trocas, comandas (venda de fichas
a crédito, adiantamentos, devolução com taxa operacional e repasse), clientes
com limite de fichas, configurações, usuários, auditoria e dashboard.

Front-end: `../binder-manager-web` (Next.js).

## Rodando localmente

```bash
cp .env.devlopment .env          # ajuste JWT_SECRET
docker compose up -d database    # Postgres em localhost:5432
bun install
bun run migrate
bun run seed                     # dados de exemplo (APAGA o banco)
bun run dev                      # http://localhost:3333 (docs em /swagger)
```

Usuários do seed: `admin / admin123` (ADMIN) e `vendedor / vendedor123` (SELLER).
Em produção, crie só o admin com `SEED_ADMIN_PASSWORD=... bun run seed:prod`.

## Regras principais

- Valores em centavos; taxa operacional em basis points (1000 = 10%).
- Fechamento (`orders.settlement.ts`): taxa sobre as fichas devolvidas, o
  líquido abate a dívida e o restante é repassado ao cliente.
- Limite de fichas: copiado das configurações ao criar o cliente; a soma em
  aberto nas comandas abertas não pode passar dele.
- Trocas: entrada e saída precisam ter o mesmo valor; o caixa é atualizado no
  fim da troca. Editar ou cancelar desfaz a movimentação anterior.

## Scripts

`bun test` · `bun run typecheck` · `bun run biome:check` · `bun run generate`
