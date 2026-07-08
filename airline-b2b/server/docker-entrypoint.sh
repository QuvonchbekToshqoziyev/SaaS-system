#!/bin/sh
set -eu

node <<'NODE'
const net = require('net');

const url = new URL(process.env.DATABASE_URL);
const host = url.hostname;
const port = Number(url.port || 5432);
let attempts = 0;

function wait() {
  attempts += 1;
  const socket = net.connect({ host, port });
  socket.on('connect', () => {
    socket.end();
    process.exit(0);
  });
  socket.on('error', () => {
    if (attempts >= 60) process.exit(1);
    setTimeout(wait, 1000);
  });
}

wait();
NODE

if [ "${DOCKER_APPLY_SCHEMA:-false}" = "true" ]; then
  npx prisma db push
fi

exec "$@"
