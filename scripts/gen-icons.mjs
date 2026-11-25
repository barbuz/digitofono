// Generates the PWA icons from the app mark: a pitch axis with a played node.
// Hand-rolled rasterizer + PNG encoder, so the repo carries no image tooling.
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const outDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');
mkdirSync(resolve(outDir, 'icons'), { recursive: true });

const BG = [10, 14, 23]; // #0a0e17
const SURFACE = [17, 23, 38]; // #111726
const INK = [231, 234, 242]; // #e7eaf2
const ACCENT = [61, 123, 255]; // #3d7bff

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
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) {
    const rowStart = y * (size * 4 + 1);
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

function distanceToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function backgroundAt(x, y) {
  const dist = Math.hypot(x - 0.5, y - 0.5);
  let t = Math.max(0, Math.min(1, 1 - dist / 0.52));
  t = t * t * (3 - 2 * t);
  return [
    Math.round(BG[0] + (SURFACE[0] - BG[0]) * t),
    Math.round(BG[1] + (SURFACE[1] - BG[1]) * t),
    Math.round(BG[2] + (SURFACE[2] - BG[2]) * t),
  ];
}

// The mark in a 0..1 box, scaled about the centre for the maskable safe area.
function sample(x, y, scale) {
  const sx = 0.5 + (x - 0.5) / scale;
  const sy = 0.5 + (y - 0.5) / scale;

  const ringDist = Math.hypot(sx - 0.5, sy - 0.5);
  if (ringDist <= 0.1328) {
    return Math.abs(ringDist - 0.1016) <= 0.0273 ? ACCENT : backgroundAt(x, y);
  }
  if (distanceToSegment(sx, sy, 0.5, 0.14, 0.5, 0.86) <= 0.03125) return INK;
  if (distanceToSegment(sx, sy, 0.375, 0.2656, 0.625, 0.2656) <= 0.0234) return INK;
  if (distanceToSegment(sx, sy, 0.375, 0.7344, 0.625, 0.7344) <= 0.0234) return INK;
  return backgroundAt(x, y);
}

function render(size, scale) {
  const pixels = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy += 1) {
        for (let sx = 0; sx < ss; sx += 1) {
          const c = sample((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size, scale);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      pixels[i] = Math.round(acc[0] / n);
      pixels[i + 1] = Math.round(acc[1] / n);
      pixels[i + 2] = Math.round(acc[2] / n);
      pixels[i + 3] = 255;
    }
  }
  return pixels;
}

const targets = [
  { dir: 'icons', file: 'icon-192.png', size: 192, scale: 1 },
  { dir: 'icons', file: 'icon-512.png', size: 512, scale: 1 },
  { dir: 'icons', file: 'icon-maskable-512.png', size: 512, scale: 0.82 },
  { dir: '', file: 'apple-touch-icon.png', size: 180, scale: 1 },
];

for (const { dir, file, size, scale } of targets) {
  const png = encodePng(size, render(size, scale));
  writeFileSync(resolve(outDir, dir, file), png);
  console.log(`wrote ${dir ? `${dir}/` : ''}${file} (${size}x${size})`);
}
