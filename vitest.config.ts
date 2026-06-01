import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

// Pure-logic unit tests only — never imports the Supabase client, never
// hits the DB. Vue SFCs are intentionally NOT compiled here because nothing
// under test depends on them. Add a vue plugin only if/when we test
// components.
export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    reporters: ['default'],
  },
})
