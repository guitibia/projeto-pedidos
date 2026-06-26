# Loja — Sub-projeto 6: Deploy em VPS (ir ao ar) — Design

**Data:** 2026-06-26
**Loja:** Beleza Multi Marcas (Node/Express + MySQL)
**Depende de:** sub-1 a sub-5 (toda a loja). É o passo de produção que também destrava PIX/webhook reais do Mercado Pago.
**Fora de escopo:** CI/CD automático, escalonamento/load balancer, CDN, containerização (Docker).

## Objetivo

Publicar a loja num **VPS Ubuntu (Hostinger)** com domínio próprio e HTTPS, rodando Node atrás do Nginx com MySQL local e imagens em disco persistente. Ao final, ativar as credenciais de **produção** do Mercado Pago + **chave PIX** (que dependem do site no ar).

## Decisões (travadas na conversa)

- **Hospedagem:** VPS Ubuntu na **Hostinger** (servidor único: Node + MySQL + uploads).
- **Merge:** levar **Teste → main**; o deploy roda a partir da `main`.
- **Dados:** **exportar o `db_pedidos` local (dump) e importar** no servidor (catálogo/clientes reais).
- **Domínio:** registrar um novo (ex.: `.com.br` no Registro.br) e apontar o DNS para o VPS.

## Arquitetura

```
Internet → Nginx (80/443, TLS) → Node/Express via PM2 (127.0.0.1:3000) → MySQL (localhost)
                                       └ imagens: <app>/public/uploads/products (disco persistente)
Certbot/Let's Encrypt → certificado HTTPS (renovação automática)
ufw → portas 22, 80, 443 (MySQL só localhost)
```

- Node escuta só em `127.0.0.1:3000`; o Nginx é o único exposto.
- PM2 mantém o processo vivo, reinicia em falha e sobe no boot (`pm2 startup` + `pm2 save`).
- MySQL acessível apenas pelo localhost; usuário dedicado (não-root) com senha forte.

## Artefatos no repositório (o que construímos)

- `ecosystem.config.js` — config do PM2: nome `beleza-loja`, script `src/app.js`, `env: { NODE_ENV: 'production' }`, `instances: 1`, `autorestart: true`.
- `deploy/nginx.conf.example` — server block do Nginx: `server_name <dominio>`, proxy para `http://127.0.0.1:3000`, headers (`X-Forwarded-For`/`Proto`), `client_max_body_size` ~10M (uploads de imagem), bloco de TLS (preenchido pelo Certbot).
- `deploy/deploy.sh` — atualização: `git pull origin main && npm ci --omit=dev && pm2 restart beleza-loja`.
- `.env.production.example` — modelo das variáveis de produção (sem valores reais), comentado.
- `deploy/RUNBOOK.md` — passo a passo completo do servidor (provisionar Hostinger, instalar Node/MySQL/Nginx, DNS, Certbot, importar banco, subir o app, go-live MP, backup).
- Ajuste mínimo: garantir que em produção o banco venha de **`DB_NAME=db_pedidos`** no `.env` (o `connection.js` já prioriza `process.env.DB_NAME`; confirmar que a detecção por branch git não quebra sem git e cai no fallback). Sem mudança de lógica obrigatória — é configuração + verificação.

> O `.env` real, segredos e o dump do banco **nunca** vão para o Git. `public/uploads/` permanece gitignored e persistente no servidor.

## Banco de dados em produção

1. No PC local: `mysqldump db_pedidos` → arquivo `.sql` (catálogo/clientes reais).
2. No servidor: criar o banco `db_pedidos` + usuário dedicado; importar o `.sql`.
3. No primeiro boot, as migrações idempotentes do `connection.js` completam colunas/tabelas que faltarem (incl. as dos sub-2..sub-5).
4. Rodar a **correção do estoque inflado** (dupla restauração cancelar+excluir) no `db_pedidos` de produção — a varredura `cancelado`+`excluído` por produto, descontando a quantidade (ver memória [[project-estoque-dupla-restauracao-producao]]).

## Segredos de produção (`.env` no servidor)

`DB_HOST=localhost`, `DB_USER=<app>`, `DB_PASSWORD=<forte>`, `DB_NAME=db_pedidos`, `PORT=3000`, **`JWT_SECRET=<novo, forte>`** (diferente do dev), `JWT_EXPIRES_IN=8h`, `HOME_ADDRESS`, `HOME_EMAIL`, `SMTP_USER`/`SMTP_PASS` (Gmail App Password — ativa o e-mail de verificação de verdade), `APP_URL=https://<dominio>`, `NODE_ENV=production`, e — após o go-live — `MP_ACCESS_TOKEN=<produção>`.

## Domínio, HTTPS e firewall

- Registrar domínio → criar **registro A** apontando para o IP do VPS (e `www` se quiser).
- `ufw`: `allow OpenSSH`, `allow 'Nginx Full'`; `enable`. MySQL sem porta pública.
- Certbot (`--nginx`) emite e renova o certificado para `<dominio>` (e `www`).
- Hardening básico: `mysql_secure_installation`, login SSH por chave (recomendado), desabilitar root via senha se possível.

## Publicação

1. **Merge Teste → main** (todo o trabalho da loja) e push.
2. No servidor: `git clone` (branch `main`), `npm ci --omit=dev`, criar `.env`, importar o banco, `pm2 start ecosystem.config.js`, `pm2 save`, `pm2 startup`.
3. Configurar o Nginx (a partir do `nginx.conf.example`) + Certbot.
4. Atualizações futuras: `bash deploy/deploy.sh`.

## Go-live no Mercado Pago (com o site já no ar)

Em `https://<dominio>`: preencher o campo **"Site"** nas credenciais de produção → **ativar produção** → copiar o **Access Token de produção** → **cadastrar a chave PIX** na conta → pôr o token no `.env` do servidor + `pm2 restart`. O `notification_url`/`back_urls` agora são públicos → **webhook e PIX transparente** passam a funcionar; o `auto_return` (que exige https) volta a ser enviado.

## Backup

- `cron` diário: `mysqldump db_pedidos` para um arquivo datado (rotação ~7 dias) + cópia da pasta `public/uploads`. Guardar fora do servidor se possível (download periódico).

## Segurança

- Node não exposto (só localhost); Nginx + TLS na frente; ufw fechado.
- Segredos só no `.env` do servidor (640, dono do app); novo `JWT_SECRET` em produção.
- MySQL só localhost, usuário dedicado.
- Rate limits da aplicação (já existem: apiLimiter/loginLimiter) seguem valendo atrás do proxy (Node lê `X-Forwarded-For` via `app.set('trust proxy', 1)` — incluir esse ajuste para o rate-limit/IP funcionarem corretamente atrás do Nginx).

## Testes / validação (smoke pós-deploy)

1. `https://<dominio>/loja/` carrega com cadeado (TLS válido).
2. Cadastro de cliente → **e-mail de verificação chega de verdade** (SMTP prod).
3. Login admin (`/login.html`) → painel lista produtos/pedidos reais.
4. Checkout → cartão (Checkout Pro) com credenciais de produção (teste com valor mínimo) → pedido **Pago**; webhook chega (ver logs).
5. PIX transparente gera QR (com chave PIX ativa) → pagamento mínimo aprova.
6. `pm2 restart` e **reboot do servidor** → app volta sozinho.
7. Backup diário gera o `.sql`.

## Decomposição prevista (para o plano)

T1 artefatos de repo (`ecosystem.config.js`, `.env.production.example`, `deploy/nginx.conf.example`, `deploy/deploy.sh`) + `app.set('trust proxy', 1)` · T2 `deploy/RUNBOOK.md` (provisionamento Hostinger → app no ar) · T3 merge Teste → main + dump do `db_pedidos` local (script/handoff). Os passos de servidor (T's de runbook) são executados pelo usuário no VPS com acompanhamento — não por subagente (sem acesso SSH).
