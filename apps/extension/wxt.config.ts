import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'UmaLytics',
    description: 'Prematch scouting companion for Uma Drafter.',
    permissions: ['storage']
  },
  modules: ['@wxt-dev/module-react']
});
