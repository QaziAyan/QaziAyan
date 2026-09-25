const { spawn } = require('node:child_process');
const path = require('node:path');

const viteCli = path.join(__dirname, 'node_modules', 'vite', 'bin', 'vite.js');
const api = spawn(process.execPath, [path.join(__dirname, 'server.js')], { stdio: 'inherit', env: { ...process.env, PT_API_PORT: '4174', PT_ORIGIN_PORT: '4173' } });
const web = spawn(process.execPath, [viteCli, '--host', '127.0.0.1', '--port', '4173', '--strictPort'], { stdio: 'inherit', env: process.env });

function stop() { api.kill(); web.kill(); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
api.on('exit', code => { if (code && code !== 0) { stop(); process.exit(code); } });
web.on('exit', code => { stop(); if (code && code !== 0) process.exit(code); });

