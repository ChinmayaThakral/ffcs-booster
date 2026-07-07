import { defineConfig } from 'wxt';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  vite: () => ({
    plugins: [tailwindcss()],
  }),
  manifest: {
    name: 'FFCS Booster',
    description:
      'Captures course, faculty, slot and seat data while you browse the FFCS portal. Read-only: never registers for you.',
    permissions: ['storage', 'downloads'],
    host_permissions: [
      'https://dev.vitbhopal.ac.in/*',
      'https://apps.vitbhopal.ac.in/*',
    ],
  },
});
