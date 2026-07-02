# Loja — Bairro automático nas zonas de entrega — Design

**Data:** 2026-06-29
**Loja:** Beleza Multi Marcas (em produção). Branch: Teste.

## Ideia
Quando um cliente novo se cadastra e o ViaCEP trouxe o bairro dele, se a cidade for a de entrega (São João da Boa Vista) e o bairro ainda não estiver nas zonas, **adicionar o bairro automaticamente** na aba Entrega com o **frete padrão**, para o admin revisar o valor depois. Assim a lista de zonas se preenche sozinha conforme os cadastros.

## Decisões (travadas na conversa)
- Bairro novo entra **ativo com `fee = frete_padrão`** (não inativo, não lista separada).
- Só captura se a cidade do cadastro for a **cidade de entrega**.
- **Sem selo "a revisar"** (mais simples; o admin identifica pelo valor padrão).

## Implementação
- **`utils/delivery.js`** — nova função `garantirZonaBairro(bairro, cidade)` (best-effort, com `try/catch` que engole erros — nunca quebra o cadastro):
  1. `n = normalizar(bairro)`; se vazio → retorna.
  2. se `!(await cidadeAtende(cidade))` → retorna.
  3. busca as zonas existentes e compara **normalizado**; se já houver bairro equivalente → retorna (não duplica "Centro"/"centro").
  4. senão → `INSERT INTO delivery_zones (bairro, fee) VALUES (?, frete_padrao)` com o bairro original (trim).
  (O `UNIQUE` em `bairro` cobre corrida de cadastros simultâneos com o mesmo texto exato — o erro é engolido.)
- **`storeAuthController.register`** — importar `garantirZonaBairro` e chamá-lo logo antes do `return res.status(201)`, com os valores já existentes `neighborhood`/`city`. Como a função engole os próprios erros, não afeta o fluxo do cadastro.

## Fora de escopo
- Selo/coluna "a revisar"; captura em `updateMe` (edição de conta); mexer no painel/entrega.html. Sem migração (a tabela já existe).

## Testes (node)
1. `garantirZonaBairro('Bairro Novo XYZ', 'São João da Boa Vista')` com a cidade de entrega configurada → cria a zona com `fee = frete_padrao`.
2. Repetir com o mesmo bairro (e variação de acento/caixa) → **não** duplica.
3. `garantirZonaBairro('Centro', 'Campinas')` → **não** cria (cidade fora).
4. Bairro vazio → não cria.
5. (Limpeza) remover as zonas de teste criadas.
