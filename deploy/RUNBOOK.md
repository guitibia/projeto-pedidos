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
