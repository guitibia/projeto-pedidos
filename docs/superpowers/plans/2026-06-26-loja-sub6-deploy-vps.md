# Loja — Sub-projeto 6: Deploy em VPS (Hostinger) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publicar a loja num VPS Ubuntu (Hostinger) com Nginx + HTTPS + PM2 + MySQL local, a partir da `main`, e deixar o caminho pronto para ativar produção/PIX do Mercado Pago.

**Architecture:** Subagentes criam os artefatos de repositório (PM2, Nginx exemplo, deploy.sh, .env exemplo) + um RUNBOOK completo. Os passos de servidor são executados pelo usuário no VPS via SSH (sem acesso do agente). O merge Teste→main é feito pelo coordenador.

**Tech Stack:** Node/Express, MySQL, PM2, Nginx, Certbot/Let's Encrypt, ufw, Ubuntu.

## Global Constraints

- Branch de trabalho atual: `Teste`. O deploy roda da `main` (merge na T3).
- `.env` e segredos NUNCA vão para o Git (`.env` é gitignored; usamos `.env.production.example` sem valores reais). `public/uploads/` é persistente e gitignored.
- Em produção o banco vem de `DB_NAME=db_pedidos` explícito no `.env` (o `connection.js` já prioriza `process.env.DB_NAME`).
- Node escuta só em `127.0.0.1:3000`; Nginx é o único exposto (80/443); MySQL só localhost; ufw abre 22/80/443.
- Catálogo real: `mysqldump` do `db_pedidos` local → import no servidor. Rodar a correção de estoque inflado (cancelar+excluir) em produção.
- Atrás do Nginx, o app precisa de `app.set('trust proxy', 1)` para o rate-limit/IP funcionarem.
- A maior parte é operacional (servidor) — os artefatos são verificados localmente por sintaxe/presença; o smoke real é no VPS pelo usuário.

---

### Task 1: Artefatos de deploy no repositório + trust proxy

**Files:**
- Create: `ecosystem.config.js`, `.env.production.example`, `deploy/nginx.conf.example`, `deploy/deploy.sh`
- Modify: `src/app.js`

- [ ] **Step 1: `ecosystem.config.js` (PM2)**

```js
// Configuração do PM2 para produção. Use: pm2 start ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'beleza-loja',
      script: 'src/app.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_restarts: 10,
      // PORT, DB_*, JWT_SECRET, APP_URL, MP_ACCESS_TOKEN etc. vêm do .env (dotenv no app.js)
      env: { NODE_ENV: 'production' },
    },
  ],
};
```

- [ ] **Step 2: `.env.production.example`**

```
# ===== Produção — copie para .env no servidor e preencha os TROQUE_ =====
DB_HOST=localhost
DB_USER=beleza_app
DB_PASSWORD=TROQUE_por_uma_senha_forte
DB_NAME=db_pedidos
PORT=3000
NODE_ENV=production

# Gere um segredo novo e forte:  openssl rand -hex 32
JWT_SECRET=TROQUE_por_um_segredo_forte_e_aleatorio
JWT_EXPIRES_IN=8h

HOME_ADDRESS=Rua David Carvalho, 233, São João da Boa Vista, SP
HOME_EMAIL=gui.14.2006@gmail.com

# E-mail (Gmail App Password) — ativa o e-mail de verificação real
SMTP_USER=gui.14.2006@gmail.com
SMTP_PASS=TROQUE_pela_app_password_de_16_digitos

# Domínio público (HTTPS) — usado em back_urls/webhook do Mercado Pago e nos links de e-mail
APP_URL=https://SEUDOMINIO.com.br

# Mercado Pago — token de PRODUÇÃO (preencher após ativar produção + cadastrar chave PIX)
# MP_ACCESS_TOKEN=APP_USR-...producao...
```

- [ ] **Step 3: `deploy/nginx.conf.example`**

```nginx
# /etc/nginx/sites-available/beleza-loja
# Habilite:  sudo ln -s /etc/nginx/sites-available/beleza-loja /etc/nginx/sites-enabled/
# HTTPS:     sudo certbot --nginx -d SEUDOMINIO.com.br -d www.SEUDOMINIO.com.br
server {
    listen 80;
    server_name SEUDOMINIO.com.br www.SEUDOMINIO.com.br;

    client_max_body_size 10M;   # uploads de imagem de produto

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
# O Certbot adiciona automaticamente o bloco 'listen 443 ssl' e o redirect 80→443.
```

- [ ] **Step 4: `deploy/deploy.sh`**

```bash
#!/usr/bin/env bash
# Atualiza a loja no servidor. Rode de qualquer lugar: bash deploy/deploy.sh
set -e
cd "$(dirname "$0")/.."
echo "→ git pull origin main"
git pull origin main
echo "→ npm ci --omit=dev"
npm ci --omit=dev
echo "→ pm2 restart beleza-loja"
pm2 restart beleza-loja
echo "✅ Deploy concluído."
```

- [ ] **Step 5: `app.set('trust proxy', 1)` no app.js**

Em `src/app.js`, logo após `const app = express();`, adicionar:
```js

// Atrás do Nginx (proxy reverso): confiar no primeiro proxy para IP/rate-limit corretos
app.set('trust proxy', 1);
```

- [ ] **Step 6: Verificar (sintaxe + presença)**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
node -e "const c=require('./ecosystem.config.js'); console.log('pm2 app:', c.apps[0].name, '| env:', JSON.stringify(c.apps[0].env));"
bash -n deploy/deploy.sh && echo "deploy.sh sintaxe OK"
node -e "const h=require('fs').readFileSync('src/app.js','utf8'); console.log('trust proxy:', h.includes(\"app.set('trust proxy', 1)\"));"
node -c src/app.js && echo "app.js sintaxe OK"   # checa sintaxe SEM executar (não inicia o servidor)
for f in .env.production.example deploy/nginx.conf.example deploy/deploy.sh ecosystem.config.js; do test -f "$f" && echo "ok: $f" || echo "FALTA: $f"; done
```
Esperado: `pm2 app: beleza-loja | env: {"NODE_ENV":"production"}`; `deploy.sh sintaxe OK`; `trust proxy: true`; os 4 arquivos `ok`.

- [ ] **Step 7: Commit**

```bash
git add ecosystem.config.js .env.production.example deploy/nginx.conf.example deploy/deploy.sh src/app.js
git commit -m "chore(deploy): artefatos de produção (PM2, Nginx, deploy.sh, .env exemplo) + trust proxy"
```

---

### Task 2: RUNBOOK de deploy (passo a passo do servidor)

**Files:**
- Create: `deploy/RUNBOOK.md`

- [ ] **Step 1: Criar `deploy/RUNBOOK.md`** com exatamente este conteúdo:

````markdown
# RUNBOOK — Colocar a Beleza Multi Marcas no ar (Hostinger VPS)

Guia passo a passo. Você executa no servidor via SSH. Onde aparecer `SEUDOMINIO.com.br`, troque pelo seu domínio.

## 0. Antes de começar
- Conta na Hostinger com um plano **VPS** (Ubuntu 24.04 LTS).
- Um **domínio** registrado (ex.: Registro.br para .com.br).
- O **dump do banco** local (gerado no seu PC — ver o final deste runbook, seção "Gerar o dump").

## 1. Criar o VPS
1. No painel Hostinger: criar VPS → sistema **Ubuntu 24.04 LTS** → definir senha do root → anotar o **IP** do servidor.

## 2. Primeiro acesso e segurança básica
```bash
ssh root@SEU_IP
apt update && apt upgrade -y
# usuário não-root com sudo
adduser deploy
usermod -aG sudo deploy
# firewall
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable
```
(Recomendado: configurar login por chave SSH para o usuário `deploy` e depois desabilitar senha do root.)

## 3. Node.js + git
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs git
node -v   # deve mostrar v22.x
```

## 4. MySQL
```bash
sudo apt install -y mysql-server
sudo mysql_secure_installation   # defina senha do root, remova anônimos/test, etc.
sudo mysql
```
No prompt do MySQL:
```sql
CREATE DATABASE db_pedidos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'beleza_app'@'localhost' IDENTIFIED BY 'SUA_SENHA_FORTE';
GRANT ALL PRIVILEGES ON db_pedidos.* TO 'beleza_app'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

## 5. Código + dependências + .env
```bash
sudo su - deploy
git clone https://github.com/guitibia/projeto-pedidos.git
cd projeto-pedidos
npm ci --omit=dev
cp .env.production.example .env
nano .env   # preencha todos os TROQUE_ (DB_PASSWORD, JWT_SECRET, SMTP_PASS, APP_URL=https://SEUDOMINIO.com.br)
# gere o JWT_SECRET:  openssl rand -hex 32
chmod 640 .env
```

## 6. Importar o banco + corrigir estoque
```bash
# envie o dump do seu PC para o servidor (rode no SEU PC):
#   scp db_pedidos_dump.sql deploy@SEU_IP:~/projeto-pedidos/
# no servidor:
mysql -u beleza_app -p db_pedidos < ~/projeto-pedidos/db_pedidos_dump.sql
```
Corrigir o estoque inflado (dupla restauração cancelar+excluir), rode dentro de `~/projeto-pedidos`:
```bash
node -e "
require('dotenv').config();
const db=require('./src/database/connection');
(async()=>{
  const [rows]=await db.query(\`
    SELECT c.product_id, c.quantidade,
      SUBSTRING_INDEX(SUBSTRING_INDEX(c.observacao,'#',-1),' ',1) AS pedido
    FROM estoque_movimentacoes c
    JOIN estoque_movimentacoes x
      ON x.product_id=c.product_id AND x.tipo='Entrada'
     AND x.observacao=REPLACE(c.observacao,'cancelado','excluído')
    WHERE c.tipo='Entrada' AND c.observacao LIKE '%cancelado%'\`);
  if(!rows.length){ console.log('Nenhum estoque inflado encontrado.'); process.exit(0); }
  for(const r of rows){
    await db.query('UPDATE products SET estoque=estoque-? WHERE id=?',[r.quantidade,r.product_id]);
    await db.query('INSERT INTO estoque_movimentacoes (product_id,tipo,quantidade,observacao) VALUES (?,?,?,?)',
      [r.product_id,'Saída',r.quantidade,'Ajuste: correção dupla restauração (Pedido #'+r.pedido+')']);
    console.log('corrigido produto',r.product_id,'(-'+r.quantidade+')');
  }
  console.log('OK'); process.exit(0);
})().catch(e=>{console.error(e.message);process.exit(1)});
"
```

## 7. PM2 (manter o app no ar)
```bash
sudo npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u deploy --hp /home/deploy   # rode o comando que ele imprimir
pm2 status   # beleza-loja deve estar 'online'
curl -s http://127.0.0.1:3000/loja/ | head -c 200   # responde HTML
```

## 8. Nginx
```bash
sudo apt install -y nginx
sudo cp deploy/nginx.conf.example /etc/nginx/sites-available/beleza-loja
sudo nano /etc/nginx/sites-available/beleza-loja   # troque SEUDOMINIO.com.br
sudo ln -s /etc/nginx/sites-available/beleza-loja /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

## 9. DNS
No painel do seu registrador de domínio, crie:
- Registro **A**: `@` → IP do VPS
- Registro **A**: `www` → IP do VPS
Aguarde a propagação (minutos a algumas horas). Teste: `ping SEUDOMINIO.com.br`.

## 10. HTTPS (Certbot)
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d SEUDOMINIO.com.br -d www.SEUDOMINIO.com.br
# escolha redirecionar HTTP→HTTPS quando perguntar
```
Teste no navegador: `https://SEUDOMINIO.com.br/loja/` (com cadeado).

## 11. Go-live no Mercado Pago
Com o site já em `https://SEUDOMINIO.com.br`:
1. Painel MP → sua aplicação → **Credenciais de produção** → preencha **Site** = `https://SEUDOMINIO.com.br` → **Ativar produção**.
2. App do Mercado Pago → **PIX → Minhas chaves → Cadastrar chave** (CPF/e-mail/telefone/aleatória).
3. Copie o **Access Token de produção** → no servidor: `nano .env` → preencha `MP_ACCESS_TOKEN=APP_USR-...` → `pm2 restart beleza-loja`.
4. Pronto: cartão, **PIX (QR)** e **webhook** passam a funcionar de verdade.

## 12. Backup diário (cron)
```bash
mkdir -p ~/backups
crontab -e
# adicione (backup 3h da manhã, mantém 7 dias):
0 3 * * * mysqldump -u beleza_app -p'SUA_SENHA_FORTE' db_pedidos > ~/backups/db_$(date +\%F).sql && find ~/backups -name 'db_*.sql' -mtime +7 -delete
```
(Periodicamente baixe os backups para fora do servidor: `scp deploy@SEU_IP:~/backups/db_*.sql .`)

## 13. Atualizações futuras
Depois de aprovar mudanças na `main`:
```bash
cd ~/projeto-pedidos
bash deploy/deploy.sh
```

---

## Gerar o dump (no seu PC, antes do passo 6)
```bash
# Windows (Git Bash), com o MySQL local rodando:
mysqldump -u root db_pedidos > db_pedidos_dump.sql
# depois envie ao servidor:
scp db_pedidos_dump.sql deploy@SEU_IP:~/projeto-pedidos/
```
````

- [ ] **Step 2: Verificar**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
test -f deploy/RUNBOOK.md && echo "RUNBOOK criado"
grep -c "SEUDOMINIO" deploy/RUNBOOK.md   # deve ser > 0
for termo in "ufw" "mysql_secure_installation" "pm2 start" "certbot --nginx" "Minhas chaves" "mysqldump"; do grep -q "$termo" deploy/RUNBOOK.md && echo "ok: $termo" || echo "FALTA: $termo"; done
```
Esperado: `RUNBOOK criado`; SEUDOMINIO > 0; todos os termos `ok` (cobre firewall, MySQL, PM2, HTTPS, chave PIX, backup).

- [ ] **Step 3: Commit**

```bash
git add deploy/RUNBOOK.md
git commit -m "docs(deploy): RUNBOOK do servidor (Hostinger → produção + go-live MP)"
```

---

### Task 3: Merge Teste → main (coordenador) + handoff do dump

> Esta task é executada pelo **coordenador** (não por subagente): é um merge para `main`, autorizado pelo usuário. O "dump" é apenas um comando documentado que o usuário roda no PC dele.

- [ ] **Step 1: Garantir tudo commitado e a Teste sincronizada**

```bash
cd "c:/Users/gui14/Documents/GitHub/projeto-pedidos"
git status -s            # deve estar limpo (fora de .superpowers, que é gitignored)
git push origin Teste
```

- [ ] **Step 2: Merge Teste → main e push**

```bash
git checkout main
git pull origin main
git merge --no-ff Teste -m "merge: loja completa (sub-1 a sub-6) para produção"
git push origin main
git checkout Teste        # voltar para a branch de trabalho
```
Esperado: `main` passa a conter todo o trabalho da loja; `origin/main` atualizado.

- [ ] **Step 3: Handoff do dump (o usuário roda no PC dele)**

Informe o comando para gerar o dump do catálogo real (não é executado aqui):
```bash
mysqldump -u root db_pedidos > db_pedidos_dump.sql
```
Esse arquivo será enviado ao servidor no passo 6 do RUNBOOK. **Não** commitar o dump.

- [ ] **Step 4: (sem commit próprio)** — o merge já foi publicado; nada a commitar nesta etapa.
