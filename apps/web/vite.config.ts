import { publicShopConfig } from '../../shop.config';
const brand = publicShopConfig.branding;
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
export default defineConfig({
  plugins: [react(), {
    name: 'instance-branding',
    transformIndexHtml(html) {
      const escape = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
      return html.replace('%BRAND_NAME%', escape(brand.name))
        .replace('%BRAND_DESCRIPTION%', escape(brand.description))
        .replace('%BRAND_COLOR%', escape(brand.theme.light.primary));
    },
  }],
  server: { host: '0.0.0.0', port: 5174, strictPort: true },
});
