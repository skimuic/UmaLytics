import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'UmaLytics',
    version: '0.1.2',
    version_name: '0.1.2-beta.1',
    description: 'Prematch scouting companion for Uma Drafter.',
    action: {
      default_title: 'Open UmaLytics Scout'
    },
    permissions: ['storage', 'scripting'],
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
