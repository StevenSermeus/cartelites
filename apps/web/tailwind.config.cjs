const tokens = ['background','foreground','primary','secondary','accent','muted','card','popover','destructive'];
module.exports = {
  content: [require('node:path').join(__dirname, 'src/**/*.{ts,tsx}')],
  corePlugins: { preflight: false },
  theme: { extend: {
    colors: { ...Object.fromEntries(tokens.map(token => [token, {DEFAULT: `var(--${token})`, foreground: `var(--${token}-foreground)`}])), border: 'var(--border)', input: 'var(--input)', ring: 'var(--ring)' },
  } },
};
