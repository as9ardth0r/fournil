import { defineConfig } from 'vitest/config';

// Configuration séparée : les tests du moteur tournent sous Node, sans le plugin Cloudflare.
export default defineConfig({ test: { include: ['tests/**/*.test.ts'] } });
