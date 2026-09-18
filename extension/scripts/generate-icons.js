// Generate simple SVG-based PNG icons for the extension
const fs = require('fs');
const path = require('path');

const sizes = [16, 48, 128];

function generateSvgIcon(size) {
  const padding = Math.round(size * 0.15);
  const r = Math.round((size - padding * 2) / 2);
  const cx = size / 2;
  const cy = size / 2;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#8b5cf6"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.2)}" fill="url(#bg)"/>
  <circle cx="${cx - r * 0.1}" cy="${cy - r * 0.1}" r="${r * 0.45}" fill="none" stroke="white" stroke-width="${Math.max(1.5, size * 0.06)}"/>
  <line x1="${cx + r * 0.22}" y1="${cy + r * 0.22}" x2="${cx + r * 0.55}" y2="${cy + r * 0.55}" stroke="white" stroke-width="${Math.max(1.5, size * 0.06)}" stroke-linecap="round"/>
</svg>`;
}

const distIcons = path.join(__dirname, '..', 'dist', 'icons');
const publicIcons = path.join(__dirname, '..', 'public', 'icons');

[distIcons, publicIcons].forEach((dir) => {
  fs.mkdirSync(dir, { recursive: true });
  sizes.forEach((size) => {
    const svg = generateSvgIcon(size);
    // Save as SVG — Chrome extension supports SVG icons in manifest v3
    fs.writeFileSync(path.join(dir, `icon${size}.svg`), svg);
    // Also save a simple PNG placeholder (1x1 transparent) — real icons replace these
    fs.writeFileSync(path.join(dir, `icon${size}.png`), Buffer.alloc(0));
  });
});

console.log('Icons generated in dist/icons/ and public/icons/');
