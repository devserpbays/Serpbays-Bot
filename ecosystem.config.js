/**
 * PM2 ecosystem config for bot-serp.
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *
 * Next.js app runs as single instance (port 3005).
 * Worker can be scaled to multiple instances for parallel job processing.
 */
module.exports = {
  apps: [
    {
      name: 'bot-serp',
      script: 'node_modules/.bin/next',
      args: 'start -p 3005',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3005,
      },
      max_memory_restart: '1G',
      error_file: '/var/log/pm2/bot-serp-error.log',
      out_file: '/var/log/pm2/bot-serp-out.log',
    },
    {
      name: 'bot-serp-worker',
      script: 'npx',
      args: 'tsx src/worker.ts',
      instances: 2,           // Scale workers for parallel job processing
      exec_mode: 'fork',      // Each worker is independent
      env: {
        NODE_ENV: 'production',
        WORKER_PROCESS: '1',
        MAX_BROWSER_CONCURRENCY: '2',  // Per worker — total = instances * 2
      },
      max_memory_restart: '800M',
      error_file: '/var/log/pm2/bot-serp-worker-error.log',
      out_file: '/var/log/pm2/bot-serp-worker-out.log',
      // Wait for current jobs to finish before restart
      kill_timeout: 30000,
      listen_timeout: 10000,
    },
  ],
};
