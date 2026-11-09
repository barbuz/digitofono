import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import './styles/global.css';

// Registering through this virtual module is what wires up auto-update: it adds
// the listener that reloads the page once a new service worker activates. The
// bare `registerSW.js` the plugin injects otherwise never reloads, leaving the
// installed app stuck on whatever build it first loaded.
registerSW({
  immediate: true,
  // An installed PWA is usually resumed from the background rather than
  // navigated, and the browser only checks for a new worker on navigation.
  // Poll on foreground so a long-lived session still picks up deploys.
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') void registration.update().catch(() => {});
    });
  },
});

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app mount point');

const app = mount(App, { target });

export default app;
