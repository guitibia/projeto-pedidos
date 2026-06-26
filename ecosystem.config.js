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
