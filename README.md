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
- Pagamentos e repasses aceitam várias partes (`payments`/`payouts`: parte em
  PIX, parte em dinheiro), no adiantamento, no fechamento e no acerto. Cada
  parte vira um registro; o troco só existe no dinheiro (`receivedAmount`).
- Fechamento da comanda: basta informar as fichas devolvidas. Pagamento e
  repasse são opcionais (inteiros ou parciais); se sobrar valor para algum
  lado, a comanda fica `AWAITING_SETTLEMENT` (o cliente deve `openAmount` ou a
  casa deve `pendingPayout`) até o acerto em `POST /orders/:id/settle`. A
  dívida pendente continua contando no limite do cliente.
- Fechamento de caixa (`/cash-closings`): cada venda, pagamento, devolução,
  taxa e repasse gera um lançamento em `cash_movements`; o fechamento pega
  todos os lançamentos ainda sem fechamento. Como a venda é fiado, os
  pagamentos de cada comanda quitam primeiro a dívida dos períodos anteriores
  (`previousCreditReceived`) e o que sobrar das vendas do período é o fiado
  novo (`sales.onCredit`). Também guarda o saldo de fiado a receber e de
  repasses pendentes, e confere o dinheiro contado com o esperado
  (fundo de troco + dinheiro recebido − repasses em dinheiro).
  `GET /cash-closings/current` mostra a prévia antes de fechar.

## Scripts

`bun test` · `bun run typecheck` · `bun run biome:check` · `bun run generate`
