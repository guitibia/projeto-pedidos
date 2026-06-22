# Busca de Produto na Criação de Pedido — Design

**Data:** 2026-06-22
**Branch:** Teste

## Problema

Na tela de Criar Pedido, o produto é escolhido num `<select>` nativo dentro de uma coluna estreita: nomes longos ficam cortados e não há como buscar. Com muitos produtos por franquia, achar o item certo é trabalhoso.

## Objetivo

Substituir o `<select>` de produto por um campo de busca com lista (combobox) que mostra o nome completo dos produtos e permite filtrar por nome ou código, mantendo o fluxo de escolher a franquia primeiro.

## Decisões tomadas

- **Franquia primeiro:** mantém o `<select>` de Franquia; a busca opera só dentro da franquia escolhida.
- **Resultados mostram:** nome completo + código (`COD xxx`). Sem preço.
- **Sem mudança no backend:** os produtos já carregam via `GET /api/products?franchise=` (retorna `cost`, `sale_value`, `promotion_price`, `name`, `code`, `id`).
- **Preenchimento automático de Custo/Venda:** a lógica atual (Custo do `cost`; Venda do `sale_value` só quando vazia; promo) é preservada, apenas passa a ler do produto selecionado no combobox em vez do `<select>`.

## Componentes (tudo em `src/public/pedidos.html`)

### HTML
Substituir o bloco do `<select id="products">` por um combobox:
- `#productSearch` — `<input type="text">`, placeholder "Buscar produto por nome ou código", `autocomplete="off"`, inicia desabilitado.
- `#productResults` — painel de resultados (lista) posicionado logo abaixo do input, escondido por padrão.
- `#selectedProductId` — `<input type="hidden">` que guarda o id do produto selecionado (fonte da seleção para o restante do código).

### Estado JS
- `currentProducts` — array dos produtos da franquia atual (objetos com `id, name, code, cost, sale_value, promotion_price`), preenchido no change da franquia.
- `selectedProduct` — objeto do produto escolhido (ou `null`).

### Comportamento
1. **Change da franquia (`#franchiseId`):**
   - `GET /api/products?franchise=` → popula `currentProducts`.
   - Limpa `#productSearch`, `#selectedProductId`, `selectedProduct`, `#productCost`, `#salePrice`.
   - Habilita `#productSearch` (ou mantém desabilitado e com aviso se nenhuma franquia).
2. **Focar `#productSearch` (vazio):** abre `#productResults` com **todos** os produtos da franquia (nome completo + `COD`).
3. **Digitar em `#productSearch`:** filtra `currentProducts` por `name` OU `code` contendo o texto (case-insensitive, `toLowerCase`), renderiza a lista. Sem resultados → linha "Nenhum produto encontrado".
4. **Selecionar um resultado (clique ou Enter):**
   - `selectedProduct` = produto; `#selectedProductId.value` = id; `#productSearch.value` = nome completo.
   - `#productCost` = `cost` (2 casas); `#salePrice` = `sale_value` (2 casas) **só se estiver vazio**.
   - Fecha `#productResults`.
5. **Teclado:** seta ↓/↑ move o destaque; Enter seleciona o destacado; Esc fecha a lista.
6. **Clique fora do combobox:** fecha `#productResults`.
7. **Adicionar produto à lista (`#addProductBtn`):** lê de `selectedProduct` em vez do `<select>`. Após adicionar, limpa `#productSearch`, `#selectedProductId`, `selectedProduct`.

### Integração com o que já existe
- O handler de change do `#products` (que preenchia Custo/Venda) é substituído pela seleção no combobox.
- O handler do checkbox `#promotionalPrice` passa a ler `selectedProduct` (custo editável; promo do `promotion_price`; desmarcar volta Venda para `sale_value`).
- `#addProductBtn` valida `selectedProduct` em vez de `sel.value`; usa `selectedProduct.name` para o nome exibido no item.

## CSS
Estilizar `#productResults` no tema escuro (mesmas variáveis `--bg-card`, `--border`, `--text-primary`, `--bg-hover`, `--accent`): lista rolável (altura máx. ~260px), item com destaque no hover/teclado, código em cor secundária. Posição absoluta ancorada ao input.

## Casos de borda
- **Sem franquia escolhida:** `#productSearch` desabilitado, placeholder "Selecione a franquia primeiro".
- **Sem resultados:** linha "Nenhum produto encontrado" (não selecionável).
- **Nome com caracteres especiais:** usar `esc()` ao renderizar nome e código no HTML da lista.
- **Reabrir/editar:** ao trocar de franquia, a seleção anterior é descartada.

## Fora de escopo
- Busca global entre franquias (mantido franquia-primeiro).
- Mostrar preço nos resultados (só nome + código).
- Mudanças de backend.
