const fs = require('fs')
const envFile = '/var/www/time-tracking/.env'
const envVars = {}
if (fs.existsSync(envFile)) {
  fs.readFileSync(envFile, 'utf8').split('\n').forEach(line => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx > 0) envVars[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
  })
}
module.exports = {
  apps: [{
    name: 'woven-time-tracking',
    script: '/var/www/time-tracking/server.js',
    cwd: '/var/www/time-tracking',
    node_args: '--experimental-sqlite',
    env: { NODE_ENV: 'production', PORT: '3001', ...envVars }
  }]
}
