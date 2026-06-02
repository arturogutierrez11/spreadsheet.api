module.exports = {
  apps: [
    {
      name: 'spreadsheet-api',
      script: 'dist/main.js',
      cwd: '/opt/spreadsheet.api',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '512M',
      time: true,
    },
  ],
};
