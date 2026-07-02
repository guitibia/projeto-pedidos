# Loja — Redesenho "Minha conta" (#4) + menu rápido no header (#8) — Design

**Data:** 2026-06-30
**Loja:** Beleza Multi Marcas (em produção). Branch: Teste.
**Backend:** já pronto — `/me` retorna cep+city e `PUT /me` (updateMe) grava cep+city (entregue em #5/#6). **Nada de backend novo.**

## Decisões (travadas na conversa)
- #4 layout: **cabeçalho de perfil + cartões** (coluna única), estilo Clean Boutique.
- #4: incluir **CEP (com ViaCEP) + Cidade** no "Meus dados" (endereço completo, editável).
- #8: **logado** → ícone de pessoa abre **dropdown**; **deslogado** → vai direto pro `entrar.html` (sem dropdown).
- #8 itens: Meus dados, Meus pedidos, Favoritos, Sair (+ "Olá, {nome}" no topo).

## #4 — `conta.html` (cabeçalho de perfil + cartões)

Manter toda a lógica existente (guard de auth, load `/me`, salvar dados, trocar senha, logout, excluir conta) — só reorganizar visualmente e completar o endereço.

**Estrutura:**
- **Cabeçalho de perfil**: círculo com iniciais do nome + "Olá, {nome}!" + e-mail. (iniciais derivadas do nome via JS.)
- **Cartões** (reusar tokens do `loja.css`: `--surface`, `--border`, `--radius`, sombra suave; empilham no mobile):
  - 👤 **Meus dados** — nome; e-mail e CPF **somente leitura**; telefone; nascimento; **endereço**: CEP (busca ViaCEP, preenche rua/bairro/cidade), Cidade, Endereço (rua), Número, Bairro. Botão Salvar → `PUT /me` incluindo `cep` e `city`.
  - 🔑 **Trocar senha** — senha atual, nova, confirmar → `PUT /password` (inalterado).
  - 📦 **Meus pedidos** — cartão-link para `meus-pedidos.html`.
  - ❤ **Favoritos** — cartão-link para `favoritos.html` (novo).
  - 🚪 **Sair** — botão logout (inalterado).
  - ⚠ **Excluir conta** — cartão de perigo discreto; fluxo de confirmação atual preservado (botão → digitar EXCLUIR → confirmar `DELETE /me`).

**Load `/me`:** preencher também `#cep` e `#city` (os campos novos). **Salvar:** o corpo do `PUT /me` passa a incluir `cep` (dígitos) e `city`.

**ViaCEP no conta:** replicar o `buscarCep` simples (preenche rua/bairro/cidade; CEP enviado só com dígitos — o servidor já normaliza/valida).

## #8 — Menu rápido (dropdown no header)

Centralizado em `account.js` (tem `StoreAuth` com estado de login + usuário), valendo em todas as páginas da loja.

- **`initAccountMenu()`** (novo, em `account.js`, roda no DOMContentLoaded):
  - Se **deslogado**: garante que `#account-link` aponta para `entrar.html` (comportamento atual; o `syncAccountLink` do loja.js já faz isso — manter compatível).
  - Se **logado**: transforma o `#account-link` em gatilho de menu (`aria-haspopup`, `aria-expanded`), injeta um `<div class="account-menu" role="menu">` posicionado sob o ícone, com:
    - topo não-clicável: "Olá, {nome}" + e-mail (do `StoreAuth.getUser()`),
    - 👤 Meus dados → `/loja/conta.html`
    - 📦 Meus pedidos → `/loja/meus-pedidos.html`
    - ❤ Favoritos → `/loja/favoritos.html`
    - 🚪 Sair → `StoreAuth.logout()` + redireciona para `/loja/`.
  - **Comportamento:** abre/fecha no clique do ícone; fecha ao clicar fora e no **Esc**; `aria-expanded` reflete o estado.
- **CSS** do dropdown em `loja.css` (compartilhado): posicionamento absoluto sob o ícone, cartão com borda/sombra/raio do tema, itens com hover, responsivo (no mobile abre ancorado à direita, sem vazar a tela).
- **Padronização:** adicionar `id="account-link"` ao anchor de conta nas 4 páginas que têm header mas não têm o id: `cadastro.html`, `conta.html`, `entrar.html`, `verificar.html` (as outras 12 já têm). Assim o menu se anexa em qualquer página.
- **Coexistência com `syncAccountLink`:** o `syncAccountLink` (loja.js) continua setando href/title quando deslogado; quando logado, `initAccountMenu` assume o clique (previne a navegação e abre o menu). Garantir que ambos rodem sem conflito (o menu intercepta o clique via listener; o href fica como fallback de acessibilidade apontando pra conta.html).

## Erros / bordas
- Página `conta.html` sem login → já redireciona pra `entrar.html` (guard mantido).
- `account.js`/`loja.js` precisam estar carregados nas páginas com header (a maioria já tem; conferir e incluir onde faltar).
- Dropdown fecha em clique-fora/Esc; não deixa múltiplos menus abertos.
- Iniciais: se nome vazio, usar a 1ª letra do e-mail.

## Fora de escopo
- Conteúdo de `meus-pedidos.html` / `favoritos.html` (só linko).
- Backend (já pronto).
- Desconto (#3).

## Testes (curl + navegador)
1. `conta.html` carrega `/me` e mostra cep+city; editar dados+endereço e Salvar → `PUT /me` persiste (conferir no banco/`/me`).
2. Navegador: visual dos cartões + cabeçalho; ViaCEP preenche; senha/excluir continuam funcionando.
3. Dropdown: logado abre/fecha (clique, fora, Esc); links corretos; Sair desloga e volta pra home; deslogado vai direto pro `entrar.html`.
4. Estático: `conta.html` e as 4 páginas padronizadas servem 200; JS parseia.

## Decomposição prevista (para o plano)
T1 redesenho `conta.html` (cabeçalho + cartões + CEP/cidade/ViaCEP + load/save incluindo cep+city). · T2 dropdown no header (`account.js` initAccountMenu + CSS no `loja.css` + `id="account-link"` nas 4 páginas).
