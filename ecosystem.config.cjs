module.exports = {
  apps: [
    {
      name: 'field-data',
      script: 'server.js',
      cwd: __dirname,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
        PORT: 9898,
        HOSTNAME: '0.0.0.0',
      },
    },
  ],
};
