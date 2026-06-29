# Loja — CEP/endereço no cadastro (#5) + escolher endereço no checkout (#6) — Design

**Data:** 2026-06-29
**Loja:** Beleza Multi Marcas (em produção). Branch: Teste.
**Depende de:** frete por bairro/zona (checkout já tem ViaCEP, bairro como dropdown de zonas, guarda de cidade).

## Decisões (travadas na conversa)
- #5: endereço no cadastro é **obrigatório** (CEP + número; ViaCEP preenche rua/bairro/cidade).
- #5: bairro no cadastro é **texto livre** (ViaCEP), não o dropdown de zonas (pessoa pode ser de qualquer lugar).
- #5: **sem bloqueio por cidade no cadastro** (ter conta ≠ ter entrega; a restrição de cidade fica só no checkout, já implementada no servidor).
- #6: no checkout, "usar endereço do cadastro" vem **pré-selecionado** quando o `/me` tem endereço.

## Estado atual (relevante)
- `clients` já tem as colunas `cep, address, house_number, neighborhood, city` (nulas) — **sem migração**.
- `storeAuthController.register` aceita `{name,email,cpf,birthdate,phone,password,consent}` e NÃO grava endereço.
- `storeAuthController.me` retorna `address, house_number, neighborhood` (NÃO retorna `cep` nem `city`).
- `storeAuthController.updateMe` grava `name, phone, address, house_number, neighborhood, birthdate` (sem cep/city).
- `cadastro.html`: form sem endereço; submit valida via `setErr(fieldId, errId, show)` e faz POST `/api/loja/auth/register`.
- `checkout.html`: tem `#cep`, `#address`, `#houseNumber`, `#neighborhood` (select de zonas), `#city`; helpers `buscarCep`, `handleCepLookup`, `popularSelectBairros(bairros, preSelecionar)`, `cidadeOk`; e `promiseMe = StoreAuth.api('/me')` que pré-preenche.

## #5 — Endereço obrigatório no cadastro

### `cadastro.html`
Adicionar, antes do bloco de senha (ou após telefone), os campos:
- **CEP** (`#cep`, busca ViaCEP — replicar o padrão de `buscarCep`/`handleCepLookup` do checkout, versão simples: preenche rua/bairro/cidade).
- **Endereço/logradouro** (`#address`), **Número** (`#houseNumber`), **Bairro** (`#neighborhood`, texto livre), **Cidade** (`#city`).
Cada um com seu `.field-error`. Todos **obrigatórios** (validação client-side via `setErr`).
No submit, incluir no corpo do POST: `cep, address, houseNumber, neighborhood, city`.

### `storeAuthController.register`
- Desestruturar também `cep, address, houseNumber, neighborhood, city`.
- Validar presença (junto da validação atual): se faltar qualquer um → `400 'Preencha o endereço completo.'`.
- Incluir no `INSERT INTO clients (... cep, address, house_number, neighborhood, city ...)`.
- **Sem** checagem de cidade (registro é agnóstico de cidade).

## #6 — Escolher endereço no checkout

### Backend — `storeAuthController`
- `me`: acrescentar `cep` e `city` ao SELECT e ao JSON retornado.
- `updateMe`: aceitar `cep, city` no body e incluí-los no `UPDATE` (pra edição de conta não zerar). Mantém os demais campos.

### `checkout.html`
No topo do bloco "Endereço de entrega", um **seletor (radio)** com duas opções:
- **"Usar meu endereço cadastrado"** — pré-selecionado **se** o `/me` trouxe endereço utilizável (pelo menos `cep`/`address`/`city`). Ao selecionar: preenche `#cep`, `#address`, `#houseNumber`, `#city` a partir do `/me`, e chama `popularSelectBairros(cfg.bairros, me.neighborhood)` pra casar o bairro salvo com a zona (se não casar, cai em "Meu bairro não está na lista"). Roda a validação de cidade (`cidadeOk`) e o `atualizarResumo`.
- **"Entregar em outro endereço"** — limpa `#cep`, `#address`, `#houseNumber`, `#city` e reseta o select de bairro pro placeholder, pra digitação manual (ViaCEP normal volta a agir no CEP digitado).
Cliente **sem** endereço no `/me` → o seletor inicia em "outro endereço" (e a opção "usar cadastro" pode ficar desabilitada ou ausente).

O resto do fluxo (ViaCEP ao digitar, dropdown de bairro, guarda de cidade, recálculo de frete, `foraDeArea`) **permanece**. O seletor só controla *preencher do cadastro × limpar pra digitar*. O servidor continua autoritativo (frete pelo bairro, cidade validada).

## Erros / bordas
- Cliente antigo sem endereço → checkout em "outro endereço"; nada quebra.
- Bairro salvo que não casa com nenhuma zona → select em "__outro__" → frete padrão (comportamento já existente).
- Cadastro com cidade fora de São João → registra normalmente (sem entrega; bloqueio só no checkout).
- Validação de endereço no cadastro é client-side **e** server-side (register rejeita se faltar).

## Fora de escopo
- Redesenho visual da página "Minha conta" (#4) e menu rápido (#8). Aqui só se estende `/me`/`updateMe` no necessário.
- Múltiplos endereços salvos / agenda de endereços (YAGNI — só "cadastro" vs "outro" digitado na hora).

## Testes (curl + navegador)
1. `register` com endereço completo → `clients` salvou cep/address/house_number/neighborhood/city; faltando um campo → 400.
2. `GET /me` retorna cep + city; `updateMe` com cep/city persiste e não zera os demais.
3. Navegador — cadastro: CEP preenche rua/bairro/cidade; sem endereço não envia.
4. Navegador — checkout: cliente com endereço → "usar cadastro" pré-selecionado e preenchido, bairro casa com a zona certa (frete correto); trocar pra "outro endereço" limpa; cliente sem endereço → "outro endereço".

## Decomposição prevista (para o plano)
T1 backend `storeAuthController` (register grava endereço + valida; me retorna cep+city; updateMe grava cep+city) · T2 `cadastro.html` (campos de endereço + ViaCEP + validação + body do POST) · T3 `checkout.html` (seletor usar-cadastro/outro + preencher do /me + limpar).
