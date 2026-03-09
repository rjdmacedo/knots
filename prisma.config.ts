import 'dotenv/config'
import { defineConfig } from 'prisma/config'

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // Use tsx to run the TypeScript seed file in ESM mode
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Use the same URLs as configured in schema.prisma
    url: process.env.POSTGRES_PRISMA_URL ?? '',
    shadowDatabaseUrl: process.env.POSTGRES_URL_NON_POOLING,
  },
})
