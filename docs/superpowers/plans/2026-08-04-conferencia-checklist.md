# Conferência como checklist + puxar da NF + imprimir separação — Plano

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a conferência de "casar código" por um checklist simples (✓ Chegou / ✗ Não veio) dentro do pedido, com pré-marcação automática pela NF por semelhança de nome, e um botão de imprimir a separação por cliente.

**Architecture:** Só front-end em `src/public/demanda.html`, reaproveitando endpoints existentes (`PUT /api/demanda/itens/:id/alocacao`, `GET /api/nf`, `GET /api/demanda/nf/:nfId/conferir`, `GET /api/demanda/:id`). Sem backend, sem migração.

**Tech Stack:** Front vanilla JS + Bootstrap + SweetAlert2 (`Auth.apiFetch`, `esc`). Reusa os helpers de similaridade de nome (`_scoreNome`) que já existem no arquivo.

## Global Constraints

- Branch `Teste`. NUNCA mergear em `main` sem pedido explícito.
- Só mexe em `src/public/demanda.html`. Sem backend/migração.
- Marcar recebido usa `PUT /api/demanda/itens/:id/alocacao` `{ qtd_recebida }` (já valida ≤ pedido).
- Dado do backend no DOM via `esc()`.
- Sem testes de UI (padrão do projeto) — verificação por smoke (serve 200 + leitura). Se subir servidor de teste, matar só ele (NÃO o node da porta 3000 do usuário).

---

## File Structure

- `src/public/demanda.html` — **MODIFICAR** (único arquivo).

---

### Task 1: Checklist dos itens no modal do pedido

**Files:**
- Modify: `src/public/demanda.html` (função `abrirPedido`: `linhas` map ~160-168, header da tabela ~173, e um resumo no topo)
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `ajustarRecebido(itemId, val, pedidoId)` (já existe; faz `PUT alocacao` e reabre o pedido).

- [ ] **Step 1: Resumo + novo cabeçalho + linhas como checklist**

Em `abrirPedido(id)`, ANTES do `Swal.fire`, calcular o resumo:

```js
    const nVeio = p.itens.filter(i => i.status==='veio').length;
    const nParcial = p.itens.filter(i => i.status==='parcial').length;
    const nFaltou = p.itens.filter(i => i.status!=='veio' && i.status!=='parcial').length;
```

Trocar o `const linhas = p.itens.map(i => ` ... `).join('')` por um checklist (produto, pediu, ✓/✗, qtd, badge):

```js
    const linhas = p.itens.map(i => {
      const badge = i.status==='veio' ? '<span class="badge bg-success">veio</span>'
        : (i.status==='parcial' ? '<span class="badge bg-warning text-dark">parcial</span>' : '<span class="badge bg-secondary">faltou</span>');
      return `
      <tr>
        <td>${esc(i.nome || i.codigo || '')}</td>
        <td class="text-center">${i.qtd_pedida}</td>
        <td>
          <button class="btn btn-sm btn-outline-success" title="Chegou tudo" onclick="ajustarRecebido(${i.id}, ${i.qtd_pedida}, ${id})">✓ Chegou</button>
          <button class="btn btn-sm btn-outline-secondary" title="Não veio" onclick="ajustarRecebido(${i.id}, 0, ${id})">✗ Não veio</button>
          <input type="number" min="0" max="${i.qtd_pedida}" value="${i.qtd_recebida}" style="width:56px" class="form-control form-control-sm d-inline-block ms-1" title="quantidade recebida (parcial)"
                 onchange="ajustarRecebido(${i.id}, this.value, ${id})">
          ${badge}
        </td>
        <td><button class="btn btn-sm btn-outline-danger" title="Remover item" onclick="removerItem(${i.id}, ${id})">×</button></td>
      </tr>`;
    }).join('');
```

Trocar o cabeçalho da tabela e adicionar o resumo no topo do `html` do `Swal.fire`. Onde hoje é:

```js
        <div class="text-end mb-2"><button id="btn-conferir-nf" class="btn btn-sm btn-success">Conferir com a NF</button></div>
        <table class="table table-sm"><thead><tr><th>Fornecedor</th><th>Cód.</th><th>Produto</th><th>Ped.</th><th>Rec.</th><th>Status</th><th></th></tr></thead>
```

trocar por:

```js
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="small">✅ Vieram: <b>${nVeio}</b> &nbsp;·&nbsp; 🟡 Parcial: <b>${nParcial}</b> &nbsp;·&nbsp; ❌ Faltaram: <b>${nFaltou}</b></div>
          <button id="btn-conferir-nf" class="btn btn-sm btn-success">Conferir com a NF</button>
        </div>
        <table class="table table-sm align-middle"><thead><tr><th>Produto</th><th class="text-center">Pediu</th><th>Conferência</th><th></th></tr></thead>
```

E ajustar o `colspan` da linha vazia de 7 para 4:

```js
        <tbody>${linhas || '<tr><td colspan=4 class="text-muted">Sem itens</td></tr>'}</tbody></table>
```

- [ ] **Step 2: Smoke manual**

Run: `npm run dev` (use a 3000 do usuário; se subir node só pra testar, mate só ele). Confirme `GET /demanda.html` → 200. No navegador: abrir um pedido → clicar "✓ Chegou" num item (vira "veio" e o resumo atualiza) e "✗ Não veio" noutro (vira "faltou"); digitar uma qtd parcial (vira "parcial").

- [ ] **Step 3: Commit**

```bash
git add src/public/demanda.html
git commit -m "feat(demanda): conferência vira checklist (Chegou/Não veio + resumo) no pedido"
```

---

### Task 2: "Puxar da NF" pré-marca por nome (sai o ligar-código)

**Files:**
- Modify: `src/public/demanda.html` (`conferirPedido` título/botão; `renderConferenciaPedido` reescrita; remover `ligarNoPedido`; renomear o botão do modal)
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `GET /api/nf`, `GET /api/demanda/nf/:nfId/conferir`, `GET /api/demanda/:id`, `PUT /api/demanda/itens/:id/alocacao`, e o helper `_scoreNome` (já existe no arquivo).

- [ ] **Step 1: Reescrever `renderConferenciaPedido` para pré-marcar por nome**

Substituir a função `renderConferenciaPedido` inteira por:

```js
  async function renderConferenciaPedido(pedidoId, nfId){
    const cont = document.getElementById('cp-conteudo');
    if (!nfId) { cont.innerHTML = 'Escolha uma NF pra conferir.'; return; }
    cont.innerHTML = 'Conferindo pela NF…';
    const [pr, cr] = await Promise.all([ Auth.apiFetch('/api/demanda/'+pedidoId), Auth.apiFetch('/api/demanda/nf/'+nfId+'/conferir') ]);
    const p = await pr.json(); const conf = await cr.json();
    const nfItens = conf.itens || [];
    let marcados = 0, semMatch = 0;
    for (const i of p.itens) {
      if (i.status === 'veio') continue;
      // acha o item da NF de nome mais parecido
      let best = null, bestScore = 0;
      for (const it of nfItens) { const sc = _scoreNome(i.nome, it.descricao || it.produto_nome || ''); if (sc > bestScore) { bestScore = sc; best = it; } }
      if (best && bestScore >= 1) {
        const nfQ = Math.floor(Number(best.quantidade) || 0);
        const qtd = nfQ > 0 ? Math.min(Number(i.qtd_pedida) || 0, nfQ) : (Number(i.qtd_pedida) || 0);
        const rr = await Auth.apiFetch('/api/demanda/itens/'+i.id+'/alocacao', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ qtd_recebida: qtd }) });
        if (rr.ok) marcados++;
      } else { semMatch++; }
    }
    cont.innerHTML = `Pré-marquei <b>${marcados}</b> item(ns) que a NF trouxe (por semelhança de nome).`
      + (semMatch ? ` <b>${semMatch}</b> não deu pra adivinhar — marque na mão no pedido.` : '')
      + `<div class="mt-2"><button class="btn btn-sm btn-primary" onclick="Swal.close()">Voltar ao pedido e conferir</button></div>`;
  }
```

- [ ] **Step 2: Remover `ligarNoPedido` e renomear o botão/título**

- Remover a função `ligarNoPedido` inteira (não é mais usada).
- Em `conferirPedido`, trocar o título `title: 'Conferir com a NF'` por `title: 'Puxar da NF'` e o texto de ajuda do `#cp-conteudo` de "Escolha uma NF pra conferir." por "Escolha a NF que você importou.".
- Em `abrirPedido`, trocar o texto do botão `Conferir com a NF` por `Puxar da NF` (o id `btn-conferir-nf` continua).
- Conferir (grep) que não sobrou referência a `ligarNoPedido`, `cp-link-`.

- [ ] **Step 3: Smoke manual**

Run: `npm run dev`. Confirme `GET /demanda.html` → 200. No navegador: abrir um pedido → "Puxar da NF" → escolher a NF → ver a mensagem "Pré-marquei N itens" → "Voltar ao pedido" → os de nome parecido aparecem como veio/parcial; os que não bateram ficam pra marcar na mão. Confirme por leitura que `_scoreNome` existe e nada referencia `ligarNoPedido`.

- [ ] **Step 4: Commit**

```bash
git add src/public/demanda.html
git commit -m "feat(demanda): 'Puxar da NF' pré-marca por nome (sai o ligar-código)"
```

---

### Task 3: Imprimir separação por cliente

**Files:**
- Modify: `src/public/demanda.html` (botão no modal + função `imprimirSeparacao`)
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `GET /api/demanda/:id`.

- [ ] **Step 1: Botão no modal do pedido**

Em `abrirPedido`, na linha dos botões de baixo (onde estão "Gerar venda do que veio" e "Avisar no WhatsApp"), adicionar:

```js
          <button id="btn-imprimir-sep" class="btn btn-sm btn-outline-primary" onclick="imprimirSeparacao(${id})"><i class="bi bi-printer"></i> Imprimir separação</button>
```

- [ ] **Step 2: Função de impressão (client-side)**

Adicionar a função no `<script>`:

```js
  async function imprimirSeparacao(pedidoId){
    const r = await Auth.apiFetch('/api/demanda/'+pedidoId); const p = await r.json();
    const vieram   = p.itens.filter(i => Number(i.qtd_recebida) > 0);
    const faltaram = p.itens.filter(i => Number(i.qtd_recebida) < Number(i.qtd_pedida));
    const linhasVeio = vieram.map(i => `<tr><td>${esc(i.nome || i.codigo || '')}</td><td style="text-align:center">${i.qtd_recebida}</td></tr>`).join('')
      || '<tr><td colspan="2">Nenhum item recebido ainda.</td></tr>';
    const linhasFalta = faltaram.map(i => `<li>${esc(i.nome || i.codigo || '')} — faltou ${Number(i.qtd_pedida) - Number(i.qtd_recebida)}</li>`).join('');
    const w = window.open('', '_blank', 'width=720,height=860');
    if (!w) { Swal.fire('Bloqueado', 'O navegador bloqueou a janela de impressão. Permita pop-ups pra este site.', 'warning'); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Separação — ${esc(p.client_name)}</title>
      <style>
        body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:24px}
        h1{font-size:20px;margin:0 0 2px} .sub{color:#555;font-size:13px;margin-bottom:16px}
        h2{font-size:15px;margin:18px 0 6px;border-bottom:1px solid #ccc;padding-bottom:3px}
        table{width:100%;border-collapse:collapse} td,th{padding:6px 8px;border-bottom:1px solid #eee;font-size:14px;text-align:left}
        th:last-child,td:last-child{text-align:center;width:70px}
        ul{margin:.3rem 0;padding-left:20px} li{font-size:13px;color:#333}
        @media print{body{margin:0}}
      </style></head><body>
      <h1>Separação — ${esc(p.client_name)}</h1>
      <div class="sub">Data: ${new Date().toLocaleDateString('pt-BR')}</div>
      <h2>Separar / entregar</h2>
      <table><thead><tr><th>Produto</th><th>Qtd</th></tr></thead><tbody>${linhasVeio}</tbody></table>
      ${linhasFalta ? `<h2>Faltou (avisar a cliente)</h2><ul>${linhasFalta}</ul>` : ''}
      </body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); }, 300);
  }
```

- [ ] **Step 3: Smoke manual**

Run: `npm run dev`. Confirme `GET /demanda.html` → 200. No navegador: abrir um pedido com itens marcados → "Imprimir separação" → abre a folha com o que veio (produto + qtd) e, se houver, o que faltou. Confirme por leitura que o botão chama `imprimirSeparacao(${id})` e a função está definida.

- [ ] **Step 4: Commit**

```bash
git add src/public/demanda.html
git commit -m "feat(demanda): imprimir separação por cliente (o que veio + o que faltou)"
```

---

## Self-Review (checklist do plano)

- **Cobertura da spec:** checklist ✓/✗ + resumo (T1), "Puxar da NF" pré-marca por nome e remove o ligar-código (T2), imprimir separação (T3). NF segue só pro estoque (não muda). ✔
- **Consistência:** reusa `ajustarRecebido` (T1), `_scoreNome` (T2), `esc` (todos). Botão `btn-conferir-nf` mantém o id, só muda o texto. Remoção de `ligarNoPedido`/`cp-link-` sem sobrar referência. ✔
- **Sem placeholders de lógica:** todos os passos trazem o código real.
- **Riscos:** só front, endpoints inalterados; `alocacao` valida qtd; pré-marcação por nome é best-effort (ela revisa); impressão é client-side (trata pop-up bloqueado). Tudo na `Teste`.

## Ordem de execução

T1 (checklist) → T2 (puxar da NF) → T3 (imprimir). Cada task é um commit; a T1 já deixa a conferência simples utilizável.
