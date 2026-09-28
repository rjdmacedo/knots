#!/bin/sh

set -eu

npx prisma migrate deploy
exec ./node_modules/.bin/tsx src/worker/index.ts
