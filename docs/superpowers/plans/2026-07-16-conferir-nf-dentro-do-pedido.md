# Conferir a NF de dentro do pedido — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trazer a conferência da NF para dentro do modal do pedido (botão "Conferir com a NF" que marca veio/faltou e liga itens que não casaram), e deixar a aba separada só com o relatório.

**Architecture:** Só front-end em `src/public/demanda.html`, reaproveitando os endpoints existentes (`GET /api/nf`, `GET /api/demanda/:id`, `GET /api/demanda/nf/:nfId/conferir`, `POST /api/demanda/conciliar-manual`). Task 1 adiciona a conferência por-pedido; Task 2 remove o conferir da aba e a renomeia para "Relatório".

**Tech Stack:** Front vanilla JS + Bootstrap 5 + SweetAlert2 (`Auth.apiFetch`, `esc`).

## Global Constraints

- Branch `Teste` apenas. NUNCA commitar/mergear em `main` sem pedido explícito.
- Só mexe em `src/public/demanda.html`. Sem mudança de backend (endpoints já existem e têm testes).
- Dado do backend interpolado no DOM via `esc()`.
- Sem testes automatizados de UI (padrão do projeto) — verificação por smoke (curl 200 + leitura de coerência de ids/funções). Se subir servidor de teste, matar só ele (NÃO o `node` da porta 3000, que é o `npm run dev` do usuário).

---

## File Structure

- `src/public/demanda.html` — **MODIFICAR** (único arquivo).

---

### Task 1: Botão "Conferir com a NF" dentro do pedido

**Files:**
- Modify: `src/public/demanda.html` (função `abrirPedido` + novas funções `conferirPedido`, `renderConferenciaPedido`, `ligarNoPedido`)
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `GET /api/nf`, `GET /api/demanda/:id`, `GET /api/demanda/nf/:nfId/conferir`, `POST /api/demanda/conciliar-manual`.
- Produces: no modal do pedido, um botão "Conferir com a NF" que abre a conferência por-pedido (resumo veio/faltou + ligar itens não casados).

- [ ] **Step 1: Botão no modal do pedido**

Em `src/public/demanda.html`, na função `abrirPedido(id)`, dentro do `html` do `Swal.fire` (a tabela de itens do pedido), adicionar ANTES da tabela um botão:

```html
<div class="text-end mb-2"><button id="btn-conferir-nf" class="btn btn-sm btn-success">Conferir com a NF</button></div>
```

E no `didOpen` do mesmo `Swal.fire` (onde já é ligado o `it-add`), adicionar:

```js
        const btnConf = document.getElementById('btn-conferir-nf');
        if (btnConf) btnConf.onclick = () => conferirPedido(id);
```

- [ ] **Step 2: Funções da conferência por-pedido**

Adicionar no `<script>` da página (perto das outras funções, ex.: depois de `abrirPedido`):

```js
async function conferirPedido(pedidoId){
  const r = await Auth.apiFetch('/api/nf'); const nfs = await r.json();
  const nfOpts = nfs.map(n => `<option value="${n.id}">#${n.id} — ${esc(n.emitente_nome||'')} (nota ${esc(String(n.numero||''))})</option>`).join('');
  Swal.fire({
    title: 'Conferir com a NF', width: 820, showConfirmButton: false, showCloseButton: true,
    html: `
      <select id="cp-nf" class="form-select form-select-sm mb-2"><option value="">Escolha a NF importada…</option>${nfOpts}</select>
      <div id="cp-conteudo" class="text-muted small">Escolha uma NF pra conferir.</div>`,
    didOpen: () => { document.getElementById('cp-nf').onchange = (e) => renderConferenciaPedido(pedidoId, e.target.value); },
    willClose: () => { abrirPedido(pedidoId); }   // reabre o pedido com os status atualizados
  });
}

async function renderConferenciaPedido(pedidoId, nfId){
  const cont = document.getElementById('cp-conteudo');
  if (!nfId) { cont.innerHTML = 'Escolha uma NF pra conferir.'; return; }
  const [pr, cr] = await Promise.all([ Auth.apiFetch('/api/demanda/'+pedidoId), Auth.apiFetch('/api/demanda/nf/'+nfId+'/conferir') ]);
  const p = await pr.json(); const conf = await cr.json();
  const nfOpts = (conf.itens||[]).map(i => `<option value="${esc(i.cprod)}">${esc(i.cprod)} — ${esc(i.descricao||i.produto_nome||'')} (qtd ${i.quantidade})</option>`).join('');
  const veio = p.itens.filter(i => i.status==='veio').length;
  const parcial = p.itens.filter(i => i.status==='parcial').length;
  const faltou = p.itens.filter(i => i.status!=='veio' && i.status!=='parcial').length;
  const linhas = p.itens.map(i => {
    const badge = i.status==='veio' ? '<span class="badge bg-success">veio</span>'
      : (i.status==='parcial' ? '<span class="badge bg-warning text-dark">parcial</span>' : '<span class="badge bg-secondary">faltou</span>');
    const acao = i.status==='veio' ? '' : `
      <select class="form-select form-select-sm d-inline-block" style="max-width:320px" id="cp-link-${i.id}"><option value="">Ligar ao produto da NF…</option>${nfOpts}</select>
      <button class="btn btn-sm btn-primary" onclick="ligarNoPedido(${i.id}, '${esc(i.codigo)}', ${nfId}, ${pedidoId})">Ligar</button>`;
    return `<tr><td>${esc(i.codigo)}</td><td>${esc(i.nome||'')}</td><td>${i.qtd_pedida}</td><td>${i.qtd_recebida}</td><td>${badge}</td><td>${acao}</td></tr>`;
  }).join('');
  cont.innerHTML = `
    <div class="mb-2 text-start">✅ Vieram: <b>${veio}</b> &nbsp;·&nbsp; 🟡 Parcial: <b>${parcial}</b> &nbsp;·&nbsp; ❌ Faltaram: <b>${faltou}</b></div>
    <table class="table table-sm"><thead><tr><th>Cód.</th><th>Produto</th><th>Ped.</th><th>Rec.</th><th>Status</th><th>Conferir</th></tr></thead>
    <tbody>${linhas || '<tr><td colspan=6 class="text-muted">Sem itens</td></tr>'}</tbody></table>`;
}

async function ligarNoPedido(itemId, codigo, nfId, pedidoId){
  const sel = document.getElementById('cp-link-'+itemId);
  const cprod = sel ? sel.value : '';
  if (!cprod) return Swal.fire('Escolha o produto da NF', 'Selecione qual item da NF corresponde a esse produto.', 'warning');
  const r = await Auth.apiFetch('/api/demanda/conciliar-manual', { method:'POST', headers:{'Content-Type':'application/json'},
    body: JSON.stringify({ nf_id: nfId, cprod, codigo_pedido: codigo }) });
  const d = await r.json();
  if (!r.ok) return Swal.fire('Erro', d.error || '', 'error');
  renderConferenciaPedido(pedidoId, nfId);   // recarrega: o item vira veio/parcial e o resumo atualiza
}
```

- [ ] **Step 3: Smoke manual**

Run: `npm run dev` (use a 3000 do usuário se já estiver de pé; se subir um node só pra testar, mate só ele). Confirme `GET /demanda.html` → 200 (`curl -s -o /dev/null -w '%{http_code}'`). Por leitura, confira: o botão `btn-conferir-nf` existe no modal e está ligado a `conferirPedido`; `conferirPedido`/`renderConferenciaPedido`/`ligarNoPedido` estão definidas; os campos usados (`i.status`, `i.codigo`, `i.nome`, `i.qtd_pedida`, `i.qtd_recebida`, `conf.itens[].cprod/descricao/quantidade`, `nf.emitente_nome/numero`) batem com os retornos dos endpoints. No navegador (se possível): abrir um pedido → "Conferir com a NF" → escolher a NF → ver o resumo e ligar um item não casado → virar "veio".

- [ ] **Step 4: Commit**

```bash
git add src/public/demanda.html
git commit -m "feat(demanda): botão 'Conferir com a NF' dentro do pedido (veio/faltou + ligar)"
```

---

### Task 2: Aba só com o relatório (remover o conferir de lá + renomear)

**Files:**
- Modify: `src/public/demanda.html` (seção `#tab-relatorio`, `show(tab)`, remover funções antigas do conferir, renomear a aba)
- Test: verificação manual (smoke).

**Interfaces:**
- Consumes: `GET /api/demanda/relatorio` (o relatório continua).

- [ ] **Step 1: Remover o bloco "Conferir NF importada" da aba**

Em `src/public/demanda.html`, dentro da seção `#tab-relatorio`, remover o bloco de conferência (o `<div class="card ..."> ... Conferir NF importada ... </div>` com o `#conf-nf`/`#conf-carregar`/`#conf-resultado`), deixando só o `<div id="conteudo-relatorio"></div>`.

- [ ] **Step 2: Remover as funções antigas do conferir da aba**

Remover as funções `carregarNfsConferencia`, `carregarConferencia` e `ligarItem` (as que usavam `#conf-nf`/`#conf-resultado`/`link-<cprod>`), e o listener `document.getElementById('conf-carregar').onclick = ...`. NÃO remover `carregarRelatorio` nem as novas funções da Task 1 (`conferirPedido`/`renderConferenciaPedido`/`ligarNoPedido`).

- [ ] **Step 3: Ajustar `show(tab)` e o nome da aba**

Na função `show(tab)`, na parte de `if (tab==='relatorio')`, deixar só `carregarRelatorio()` (remover a chamada `carregarNfsConferencia()`).

No HTML das abas, renomear o botão da aba de `Conciliação / Relatório` para `Relatório`:

```html
<li class="nav-item"><button class="nav-link" data-tab="relatorio">Relatório</button></li>
```

- [ ] **Step 4: Smoke manual**

Run: `npm run dev`. Confirme `GET /demanda.html` → 200. Por leitura: a aba se chama "Relatório", não há mais referências a `conf-nf`/`conf-carregar`/`conf-resultado`/`carregarNfsConferencia`/`ligarItem` (nem no HTML nem no JS, e nenhum `onclick` aponta pra função removida); `show('relatorio')` chama só `carregarRelatorio()`. No navegador: a aba Relatório mostra o relatório normalmente; a conferência agora só existe dentro do pedido (Task 1).

- [ ] **Step 5: Commit**

```bash
git add src/public/demanda.html
git commit -m "refactor(demanda): aba vira só 'Relatório' (conferir foi pra dentro do pedido)"
```

---

## Self-Review (checklist do plano)

- **Cobertura da spec:** botão "Conferir com a NF" no pedido com resumo veio/parcial/faltou + ligar não casados que aprende (T1); aba simplificada só com o relatório e renomeada (T2). Sem mudança de backend (reusa endpoints). ✔
- **Consistência:** funções novas `conferirPedido`/`renderConferenciaPedido`/`ligarNoPedido` (T1) não colidem com as removidas `carregarNfsConferencia`/`carregarConferencia`/`ligarItem` (T2); `conciliar-manual` recebe `{nf_id, cprod, codigo_pedido}` igual ao backend; campos do `esc()` conferem com os retornos. ✔
- **Sem placeholders:** todos os passos trazem o código/edições reais.
- **Riscos:** só front; endpoints inalterados (testes anteriores seguem válidos); `willClose` reabre o pedido com status atualizados; id `cp-link-<itemId>` usa id numérico (sem caractere especial). Tudo na `Teste`.

## Ordem de execução

T1 (adiciona a conferência no pedido) → T2 (remove o conferir da aba + renomeia). Cada task é um commit; a T1 já deixa o novo fluxo utilizável mesmo antes da T2.
