/* Renders icon-192.png and icon-512.png from scratch — no dependencies.
   Draws the Ballpark mark ([ • ] on tape yellow with ruler ticks) into an
   RGBA buffer and encodes a valid PNG by hand. Run: node tools/make-icons.js */
"use strict";
const zlib = require("node:zlib");
const fs = require("node:fs");
const path = require("node:path");

// ---- PNG encoder ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function encodePNG(pixels, w, h) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0; // filter: none
    pixels.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---- tiny rasterizer ----
const YELLOW = [0xff, 0xc9, 0x33], INK = [0x1b, 0x27, 0x33], PAPER = [0xfa, 0xfa, 0xf7];
function draw(size) {
  const px = Buffer.alloc(size * size * 4);
  const s = size / 512; // design space is 512
  const put = (x, y, rgb, a) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    const na = a + (px[i + 3] / 255) * (1 - a);
    if (na === 0) return;
    for (let c = 0; c < 3; c++) px[i + c] = Math.round((rgb[c] * a + px[i + c] * (px[i + 3] / 255) * (1 - a)) / na);
    px[i + 3] = Math.round(na * 255);
  };
  const fillRect = (x0, y0, x1, y1, rgb) => {
    for (let y = Math.round(y0 * s); y < Math.round(y1 * s); y++)
      for (let x = Math.round(x0 * s); x < Math.round(x1 * s); x++) put(x, y, rgb, 1);
  };
  // rounded-square background with 2px supersampled edges
  const R = 104;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = Math.max(0, Math.max(R * s - x, x - (size - R * s)));
      const dy = Math.max(0, Math.max(R * s - y, y - (size - R * s)));
      const d = Math.hypot(dx, dy) - R * s;
      const a = d < -0.5 ? 1 : d > 0.5 ? 0 : 0.5 - d;
      if (a > 0) put(x, y, YELLOW, a);
    }
  }
  // ruler ticks
  const tick = (x, tall) => fillRect(x, tall ? 404 : 416, x + 8, 440, [0x8a, 0x74, 0x2a]);
  [76, 252, 428].forEach((x) => tick(x, true));
  [136, 196, 308, 368].forEach((x) => tick(x, false));
  // brackets [ ]
  const T = 34;
  fillRect(120, 150, 120 + T, 362, INK);           // left vertical
  fillRect(120, 150, 172 + 10, 150 + T, INK);      // left top arm
  fillRect(120, 362 - T, 172 + 10, 362, INK);      // left bottom arm
  fillRect(392 - T, 150, 392, 362, INK);           // right vertical
  fillRect(340 - 10, 150, 392, 150 + T, INK);      // right top arm
  fillRect(340 - 10, 362 - T, 392, 362, INK);      // right bottom arm
  // center ball: solid ink dot (anti-aliased)
  const cx = 256 * s, cy = 256 * s, r1 = 62 * s;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d < r1 - 0.5) put(x, y, INK, 1);
      else if (d < r1 + 0.5) put(x, y, INK, r1 + 0.5 - d);
    }
  }
  return px;
}

for (const size of [192, 512]) {
  const png = encodePNG(draw(size), size, size);
  const out = path.join(__dirname, "..", `icon-${size}.png`);
  fs.writeFileSync(out, png);
  console.log(`wrote ${out} (${png.length} bytes)`);
}
