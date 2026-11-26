import path from 'node:path';
import { defineConfig, type WxtViteConfig } from 'wxt';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  srcDir: 'src',
  publicDir: path.resolve(__dirname, 'public'),
  manifest: {
    name: 'ZSpect — Universal UI Inspector & AI Feedback',
    short_name: 'ZSpect',
    description:
      'Inspect every page without dev packages: Framework X-Ray, Cross-Tab @ref Vault, VisBug Diff Tools, 30s Bug Capsule & .md/.xlsx Exports.',
    version: '1.0.0',
    homepage_url: 'https://github.com/zane-tv/zspect',
    permissions: [
      'activeTab',
      'scripting',
      'storage',
      'sidePanel',
      'offscreen',
      'clipboardWrite',
    ],
    host_permissions: ['<all_urls>'],
    optional_permissions: ['debugger'],
    action: {
      default_title: 'Toggle ZSpect Inspector (Alt+Z)',
      default_icon: {
        16: 'icon/16.png',
        32: 'icon/32.png',
        48: 'icon/48.png',
        128: 'icon/128.png',
      },
    },
    icons: {
      16: 'icon/16.png',
      32: 'icon/32.png',
      48: 'icon/48.png',
      128: 'icon/128.png',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    commands: {
      'toggle-zspect': {
        suggested_key: {
          default: 'Alt+Z',
          mac: 'Alt+Z',
        },
        description: 'Toggle ZSpect Inspector HUD on the active tab',
      },
      'freeze-state': {
        suggested_key: {
          default: 'Alt+Shift+F',
          mac: 'Alt+Shift+F',
        },
        description: 'Freeze ephemeral Tooltip/Hover/Animation states immediately',
      },
    },
  },
  vite: () => ({
    plugins: [preact(), tailwindcss()] as unknown as WxtViteConfig['plugins'],
  }),
});
