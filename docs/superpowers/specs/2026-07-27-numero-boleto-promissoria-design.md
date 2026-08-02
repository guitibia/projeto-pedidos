# Número do boleto na promissória — Design

**Data:** 2026-07-27
**Branch:** `Teste` (banco `db_pedidos_teste` nos testes; local `db_pedidos` em uso real).

## Objetivo

Ao cadastrar uma nova promissória, ter um campo **"Nº boleto"** por linha, pra controle melhor dos
boletos. Os já cadastrados ficam como estão (sem número); os novos passam a capturar. Opcional (não trava
o cadastro). O número aparece no card da parcela na tela de promissórias.

## Contexto (como funciona hoje)

- Modal "Nova Promissória": escolhe fornecedor + adiciona **linhas**, cada uma com **data + valor**.
- `promissoriaController.createPromissoria({ fornecedor, itens })`: para **cada `item` (linha)** cria uma
  `notas_fiscais` (quase tudo null) + uma `promissorias` (1 parcela) + uma `parcelas` (numero_parcela=1).
  Ou seja, **cada linha do modal = 1 boleto = 1 parcela**.
- `listPromissorias`: monta, por promissória, um array `parcelas[]` com
  `{ numero, valor, status, data_vencimento }` (usado pra desenhar os cards por fornecedor→mês→parcela).
- `parcelas` table: `id, promissoria_id, numero_parcela, data_vencimento, valor, status`.

## Decisões (confirmadas com o usuário)

1. O número do boleto é **por linha/boleto** (cada linha já é uma parcela).
2. **Opcional** — pode deixar em branco; não bloqueia o cadastro.
3. Antigos permanecem sem número (coluna nula); só os novos capturam.
4. Mostrar o número no card da parcela (quando houver).

## Modelo de dados

- Migração aditiva idempotente em `connection.js`:
  `ALTER TABLE parcelas ADD COLUMN numero_boleto VARCHAR(60) NULL` (dentro de `try/catch`).
  Nula por padrão → parcelas existentes ficam sem número.

## Backend

- `createPromissoria`: cada `item` pode trazer `numero_boleto` (string opcional). O INSERT em `parcelas`
  passa a incluir `numero_boleto` (sanitiza: `String(item.numero_boleto || '').trim().slice(0,60) || null`).
  Validação de valor/data continua igual; boleto **não** é obrigatório.
- `listPromissorias`: incluir `numero_boleto` no SELECT e no objeto `parcela` retornado
  (`parc.push({ numero, valor, status, data_vencimento, numero_boleto })`).

## UI

### Modal "Nova Promissória" (`promissorias.html`)
- Cada linha de item ganha um input **"Nº boleto"** (opcional), ao lado de data e valor. O botão
  "Adicionar" cria linhas já com esse campo.
- No submit, ao montar `itens`, incluir `numero_boleto` de cada linha (ou string vazia).

### Tela de promissórias (card da parcela)
- No card de cada parcela, quando `numero_boleto` existir, mostrar discretamente, ex.:
  `Boleto nº 12345` (abaixo do valor ou perto da data). Se não houver, não mostra nada (cards antigos ficam
  idênticos).

## Tratamento de erros / validação
- `numero_boleto` vazio → grava `NULL`. Sem validação de formato (aceita o que a distribuidora usar).
- Nada muda na validação de data/valor nem no fluxo de pagar/excluir.

## Testes
- `createPromissoria` grava `numero_boleto` quando informado e `NULL` quando vazio; `listPromissorias`
  retorna o campo. (Teste de controller com banco de teste, seeds `zz_test_`.)
- UI: verificação manual (o projeto não testa UI) — cadastrar com e sem número, ver aparecer no card.

## Fora de escopo
- Editar o número do boleto depois de cadastrado (por enquanto só no cadastro; pode virar melhoria futura).
- Validar/parsear código de barras do boleto.
- Preencher número nos boletos antigos (ficam como estão).
