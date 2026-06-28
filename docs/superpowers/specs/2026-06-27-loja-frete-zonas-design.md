# Loja — Frete por bairro/zona + entrega só na cidade — Design

**Data:** 2026-06-27
**Loja:** Beleza Multi Marcas (Node/Express + MySQL) — EM PRODUÇÃO
**Depende de:** sub-3 (checkout), sub-4 (pagamento).
**Substitui:** o cálculo de frete por distância (`utils/geo.js` / Nominatim), que é impreciso e cobra errado em produção (causa raiz confirmada: o geocoding ignora o número da casa e falha para muitas ruas → distância sem relação com a realidade).

## Objetivo

1. **Entregar apenas em São João da Boa Vista-SP.** Cliente de outra cidade é avisado que não entregamos (verificação confiável pela cidade do CEP via ViaCEP).
2. **Frete por bairro/zona**, configurável no painel admin: um valor por bairro + um **valor padrão** para bairros não cadastrados. No checkout o cliente **escolhe o bairro numa lista**; o frete vem dessa escolha.
3. **Vendas pelo painel (presencial) → frete 0** (cliente vem até você).

## Decisões (travadas na conversa)

- Bairro no checkout: **menu (dropdown)** com os bairros cadastrados + opção "Meu bairro não está na lista".
- Bairro não cadastrado: **cobra um valor padrão** configurável.
- **Cidade de entrega configurável** (padrão "São João da Boa Vista").
- Servidor é autoritativo no frete e na cidade.

## Banco de dados (migrações no padrão `try/catch` do `connection.js`)

```sql
CREATE TABLE IF NOT EXISTS delivery_zones (
  id INT AUTO_INCREMENT PRIMARY KEY,
  bairro VARCHAR(120) NOT NULL,
  fee DECIMAL(6,2) NOT NULL DEFAULT 0,
  active TINYINT(1) NOT NULL DEFAULT 1,
  UNIQUE KEY uq_bairro (bairro)
);
CREATE TABLE IF NOT EXISTS store_settings (
  skey VARCHAR(60) PRIMARY KEY,
  svalue VARCHAR(255)
);
-- seeds (INSERT IGNORE): cidade_entrega='São João da Boa Vista', frete_padrao='15.00'
```
`store_settings` é chave-valor (servirá também ao desconto global do item #3 no futuro).

## Backend

- `src/utils/delivery.js` (novo) — encapsula o frete por zona:
  - `getSetting(key, default)` / `getCidadeEntrega()` / `getFretePadrao()` (lê `store_settings`).
  - `normalizar(bairro)` (minúsculo, sem acento, trim).
  - `freteDoBairro(bairro)` → consulta `delivery_zones` (match normalizado, `active=1`); achou → `fee`; senão → `frete_padrao`.
  - `cidadeAtende(cidade)` → `normalizar(cidade) === normalizar(cidadeEntrega)`.
- **Loja (substitui o geo):** em `storeOrderController.resumo` e `paymentController.criarPagamento`/`criarPix`, trocar `geocodeFee`/`deliveryFee` por:
  - validar a **cidade** do pedido (campo `city` do body): se `!cidadeAtende(city)` → `400 { error: 'Entregamos apenas em <cidade>.' , foraDeArea: true }`.
  - `fee = await freteDoBairro(bairro)` (o `bairro` vem do body — o que o cliente escolheu).
  - o resto do fluxo (intenção, total, criarPedidoPago) usa esse `fee`.
- **Painel (presencial):** em `orderController.createOrder`, remover o cálculo via geo e gravar `delivery_fee = 0` (venda presencial não tem frete).
- `utils/geo.js` deixa de ser usado pela loja e pelo painel → fica obsoleto (remover ao final).

## API

- **Admin (sob `auth`):** `src/routes/deliveryZones.js` montado em `/api/delivery-zones`:
  - `GET /api/delivery-zones` → `{ zones: [{id,bairro,fee,active}], cidade, fretePadrao }`.
  - `POST /api/delivery-zones` `{bairro, fee}` → cria (UNIQUE no bairro).
  - `PUT /api/delivery-zones/:id` `{bairro, fee, active}` → edita.
  - `DELETE /api/delivery-zones/:id` → remove.
  - `PUT /api/delivery-zones/settings` `{cidade, fretePadrao}` → atualiza a config.
- **Loja (público, sem login — o checkout precisa antes de logar):** `GET /api/loja/entrega/config` → `{ cidade, fretePadrao, bairros: [{bairro, fee}] }` (só zonas `active`). Montado em `/api/loja` (router de pagamentos/pedidos ou um pequeno router de loja).

## Frontend

- **Painel — `entrega.html` (nova página admin)** + link no menu lateral (`painel.html`): tabela de bairros (adicionar/editar/remover, com valor), campos de **cidade de entrega** e **frete padrão**. Mesma autenticação/`Auth.apiFetch` das outras páginas admin.
- **Loja — `checkout.html`:**
  - Ao preencher o **CEP**, o ViaCEP traz a cidade; se `!cidadeAtende(cidade)` → mostra aviso "Entregamos apenas em São João da Boa Vista" e **bloqueia** o botão Finalizar.
  - O campo **Bairro** vira um **`<select>`** populado por `GET /api/loja/entrega/config` (lista os bairros + a opção "Meu bairro não está na lista"). Ao escolher, o **resumo recalcula** o frete (o `resumo` do servidor já devolve o `fee` do bairro). Para "Meu bairro não está na lista", usa o `frete_padrao`.
  - O `cep`, `address`, `houseNumber`, `city` continuam; o `bairro` enviado é o selecionado.

## Erros / segurança

- Frete **sempre** recalculado no servidor pelo bairro (não confia em valor do cliente); cidade validada no servidor (não dá pra burlar mandando outra).
- Endpoints admin sob `auth`; loja `config` é só leitura (lista de bairros/valores não é sensível).
- Bairro normalizado para casar certo; `UNIQUE` evita bairros duplicados.

## Testes (sem suíte automatizada — curl + navegador)

1. Admin: cadastrar 2 bairros (ex.: Centro R$5, Vila Valentin R$8) + frete padrão R$15 + cidade.
2. Loja: `GET /api/loja/entrega/config` retorna os bairros + cidade + padrão.
3. `resumo`/`criarPix` com `city='São João da Boa Vista'` + `bairro='Centro'` → frete R$5; bairro fora da lista → R$15.
4. `city` de outra cidade → 400 `foraDeArea`.
5. Painel: criar pedido presencial → `delivery_fee = 0`.
6. Navegador: CEP de outra cidade bloqueia; bairro da lista cobra certo; "não está na lista" usa o padrão.

## Decomposição prevista (para o plano)

T1 migrações (`delivery_zones`, `store_settings` + seeds) + `utils/delivery.js` · T2 API admin (CRUD zonas + settings) + rota montada com `auth` · T3 API loja `GET /entrega/config` + trocar o frete no fluxo da loja (resumo/criarPagamento/criarPix) por `freteDoBairro` + guarda de cidade + painel `createOrder` frete 0 · T4 painel `entrega.html` + link no menu · T5 checkout (CEP cidade + dropdown de bairro + frete pela escolha).
