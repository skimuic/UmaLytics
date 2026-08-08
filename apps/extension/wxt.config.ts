import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'UmaLytics',
    description: 'Prematch scouting companion for Uma Drafter.',
    permissions: ['storage'],
    host_permissions: ['https://drafter-api.uma.guide/*', 'https://drafter.uma.guide/*'],
    web_accessible_resources: [
      {
        resources: ['pageHook.js'],
        matches: ['https://drafter.uma.guide/*']
      }
    ]
  },
  modules: ['@wxt-dev/module-react']
});
