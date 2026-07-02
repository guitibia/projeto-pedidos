# Loja — Mesclar franquias na home (#7) — Design

**Data:** 2026-06-29
**Loja:** Beleza Multi Marcas (em produção). Branch: Teste.

## Problema

Na home (`src/public/loja/index.html`) as duas vitrines de entrada — **Ofertas** e **Novidades** — ordenam por `created_at DESC` (mais recentes). Como os produtos são cadastrados em lote por franquia, os 8 mais novos tendem a ser todos da mesma franquia, então a entrada mostra "só uma franquia".

## Solução

Intercalar as franquias por **rodízio** (round-robin), nas duas vitrines. Sem mudança de API/backend — só `index.html`.

### Helper `intercalarPorFranquia(items)`
Recebe a lista já ordenada por recentes; agrupa por `franchise` preservando a ordem recebida (mais novo primeiro dentro de cada franquia); percorre os grupos em rodízio (A, B, C, A, B, C…) montando o resultado. A ordem de rodízio das franquias = ordem da primeira aparição (ou seja, quem tem o produto mais recente vem primeiro no ciclo).

```js
function intercalarPorFranquia(items) {
  var grupos = {}, ordem = [];
  items.forEach(function (p) {
    var f = (p.franchise || '');
    if (!grupos[f]) { grupos[f] = []; ordem.push(f); }
    grupos[f].push(p);
  });
  var resultado = [], resta = true;
  while (resta) {
    resta = false;
    ordem.forEach(function (f) {
      if (grupos[f].length) { resultado.push(grupos[f].shift()); resta = true; }
    });
  }
  return resultado;
}
```

### Aplicação
- **Novidades** (`grid-novidades`): `intercalarPorFranquia(data).slice(0, 8)` (antes: `data.slice(0, 8)`).
- **Ofertas** (`grid-ofertas`): filtra `promotion_price > 0` → `intercalarPorFranquia(...)` → `.slice(0, 8)`.

## Comportamento / bordas
- Estável: mesma ordem a cada carregamento (não usa RAND).
- Mantém "mais novo primeiro" dentro de cada franquia → preserva o sentido de Novidades/Ofertas.
- Só uma franquia cadastrada → resultado = só ela (como hoje).
- Menos de 8 produtos → mostra o que houver.
- `franchise` null/vazio → agrupado sob chave '' (entra no rodízio normalmente).

## Fora de escopo
- Página `produtos.html` (catálogo completo, com filtro por franquia — comportamento por franquia ali é intencional).
- Backend / novos endpoints.

## Testes (sem suíte automatizada)
1. Node: rodar `intercalarPorFranquia` sobre os dados reais de `/api/loja/produtos` e confirmar que os 8 primeiros cobrem múltiplas franquias (quando há mais de uma).
2. `curl` `http://localhost:3000/loja/index.html` → 200; parse do script inline OK.
3. Navegador: home mostra franquias variadas em Ofertas e Novidades.
