// Generates the PWA icons as PNGs with a tiny hand-rolled encoder, so the repo
// carries no image tooling or binary assets authored by hand.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const BG = [11, 13, 18];
const GLOW = [140, 200, 255];

function crc32(buf) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return ~crc >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([length, typeBuf, data, crcBuf]);
}

function encodePng(size, pixels) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x += 1) {
      const src = (y * size + x) * 4;
      const dst = rowStart + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }
  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** A glowing dot on a dark field: the instrument's single-gesture idea. */
function render(size, padding) {
  const pixels = Buffer.alloc(size * size * 4);
  const center = size / 2;
  const inner = size * (0.5 - padding);
  const outer = size * (0.5 - padding * 0.2);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const distance = Math.hypot(x + 0.5 - center, y + 0.5 - center);
      let t = 0;
      if (distance <= inner) {
        t = 1;
      } else if (distance <= outer) {
        t = 1 - (distance - inner) / (outer - inner);
      }
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(BG[0] + (GLOW[0] - BG[0]) * t);
      pixels[i + 1] = Math.round(BG[1] + (GLOW[1] - BG[1]) * t);
      pixels[i + 2] = Math.round(BG[2] + (GLOW[2] - BG[2]) * t);
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

const targets = [
  { file: 'icon-192.png', size: 192, padding: 0.16 },
  { file: 'icon-512.png', size: 512, padding: 0.16 },
  { file: 'icon-maskable-512.png', size: 512, padding: 0.3 },
  { file: 'apple-touch-icon.png', size: 180, padding: 0.16 },
];

for (const { file, size, padding } of targets) {
  const png = encodePng(size, render(size, padding));
  writeFileSync(resolve(outDir, file), png);
  console.log(`wrote icons/${file} (${size}x${size})`);
}
