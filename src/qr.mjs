/* QR codes for the magazine cover (src/pages/cover.mjs): the platform's own encoder, utils/qr.ts in the Ontold repository, as
 * plain JavaScript (esbuild, types removed) because an ABC app ships without a build step. Byte mode, level M, versions 1 to 10;
 * longer text throws rather than encode a truncated link. Change it there first and copy it here. */
const BLOCKS_M = [
  [10, 1, 16, 0, 0],
  // v1  — 16 data codewords
  [16, 1, 28, 0, 0],
  // v2
  [26, 1, 44, 0, 0],
  // v3
  [18, 2, 32, 0, 0],
  // v4
  [24, 2, 43, 0, 0],
  // v5
  [16, 4, 27, 0, 0],
  // v6
  [18, 4, 31, 0, 0],
  // v7
  [22, 2, 38, 2, 39],
  // v8
  [22, 3, 36, 2, 37],
  // v9
  [26, 4, 43, 1, 44]
  // v10 — 216 data codewords
];
const ALIGN_CENTRES = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50]
];
const QR_MAX_VERSION = BLOCKS_M.length;
const QR_MAX_BYTES = 213;
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x = x << 1 ^ (x & 128 ? 285 : 0);
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}
const gfMul = (a, b) => a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
function rsGenerator(degree) {
  let poly = Uint8Array.of(1);
  for (let i = 0; i < degree; i++) {
    const next = new Uint8Array(poly.length + 1);
    for (let j = 0; j < poly.length; j++) {
      next[j] ^= poly[j];
      next[j + 1] ^= gfMul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}
function rsRemainder(data, degree) {
  const gen = rsGenerator(degree);
  const res = new Uint8Array(degree);
  for (const b of data) {
    const factor = b ^ res[0];
    res.copyWithin(0, 1);
    res[degree - 1] = 0;
    for (let i = 0; i < degree; i++) res[i] ^= gfMul(gen[i + 1], factor);
  }
  return res;
}
const utf8 = (text) => typeof TextEncoder !== "undefined" ? new TextEncoder().encode(text) : Uint8Array.from(
  encodeURIComponent(text).replace(
    /%([0-9A-F]{2})/g,
    (_, h) => String.fromCharCode(parseInt(h, 16))
  ),
  (c) => c.charCodeAt(0)
);
function dataCodewords(bytes, version) {
  const [, g1b, g1c, g2b, g2c] = BLOCKS_M[version - 1];
  const total = g1b * g1c + g2b * g2c;
  const countBits = version <= 9 ? 8 : 16;
  const out = new Uint8Array(total);
  let bit = 0;
  const push = (value, width) => {
    for (let i = width - 1; i >= 0; i--, bit++) {
      if (value >>> i & 1) out[bit >>> 3] |= 128 >>> (bit & 7);
    }
  };
  push(4, 4);
  push(bytes.length, countBits);
  for (const b of bytes) push(b, 8);
  push(0, Math.min(4, total * 8 - bit));
  bit = bit + 7 & ~7;
  for (let i = bit >>> 3, alt = 0; i < total; i++, alt++) {
    out[i] = alt % 2 === 0 ? 236 : 17;
  }
  return out;
}
function interleave(data, version) {
  const [ecLen, g1b, g1c, g2b, g2c] = BLOCKS_M[version - 1];
  const blocks = [];
  const ecs = [];
  let at = 0;
  for (let b = 0; b < g1b + g2b; b++) {
    const len = b < g1b ? g1c : g2c;
    const block = data.subarray(at, at + len);
    at += len;
    blocks.push(block);
    ecs.push(rsRemainder(block, ecLen));
  }
  const out = new Uint8Array(data.length + ecLen * blocks.length);
  let i = 0;
  const widest = Math.max(g1c, g2b > 0 ? g2c : 0);
  for (let c = 0; c < widest; c++) {
    for (const block of blocks) if (c < block.length) out[i++] = block[c];
  }
  for (let c = 0; c < ecLen; c++) {
    for (const ec of ecs) out[i++] = ec[c];
  }
  return out;
}
const getBit = (value, i) => (value >>> i & 1) !== 0;
const MASKS = [
  (x, y) => (x + y) % 2 === 0,
  (_x, y) => y % 2 === 0,
  (x) => x % 3 === 0,
  (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0,
  (x, y) => x * y % 2 + x * y % 3 === 0,
  (x, y) => (x * y % 2 + x * y % 3) % 2 === 0,
  (x, y) => ((x + y) % 2 + x * y % 3) % 2 === 0
];
function qrEncode(text) {
  const bytes = utf8(text);
  let version = 0;
  for (let v = 1; v <= QR_MAX_VERSION; v++) {
    const [, g1b, g1c, g2b, g2c] = BLOCKS_M[v - 1];
    const capacity = (g1b * g1c + g2b * g2c) * 8;
    if (4 + (v <= 9 ? 8 : 16) + bytes.length * 8 <= capacity) {
      version = v;
      break;
    }
  }
  if (version === 0) {
    throw new RangeError(`qrEncode: ${bytes.length} bytes exceeds the ${QR_MAX_BYTES}-byte ceiling`);
  }
  const size = version * 4 + 17;
  const modules = Array.from({ length: size }, () => new Array(size).fill(false));
  const reserved = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, dark) => {
    modules[y][x] = dark;
    reserved[y][x] = true;
  };
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, ring !== 2 && ring !== 4);
      }
    }
  }
  const centres = ALIGN_CENTRES[version - 1];
  const last = centres.length - 1;
  for (let i = 0; i < centres.length; i++) {
    for (let j = 0; j < centres.length; j++) {
      if (i === 0 && j === 0 || i === 0 && j === last || i === last && j === 0) continue;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          set(centres[j] + dx, centres[i] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }
  for (let i = 0; i < size; i++) {
    if (!reserved[6][i]) set(i, 6, i % 2 === 0);
    if (!reserved[i][6]) set(6, i, i % 2 === 0);
  }
  for (let i = 0; i <= 8; i++) {
    reserved[i][8] = true;
    reserved[8][i] = true;
  }
  for (let i = 0; i < 8; i++) {
    reserved[8][size - 1 - i] = true;
    reserved[size - 1 - i][8] = true;
  }
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) rem = rem << 1 ^ (rem >>> 11) * 7973;
    const bits = version << 12 | rem;
    for (let i = 0; i < 18; i++) {
      const dark = getBit(bits, i);
      const a = size - 11 + i % 3, b = Math.floor(i / 3);
      set(a, b, dark);
      set(b, a, dark);
    }
  }
  const stream = interleave(dataCodewords(bytes, version), version);
  let bit = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = (right + 1 & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (reserved[y][x] || bit >= stream.length * 8) continue;
        modules[y][x] = getBit(stream[bit >>> 3], 7 - (bit & 7));
        bit++;
      }
    }
  }
  let best = 0, bestScore = Infinity;
  for (let m = 0; m < 8; m++) {
    applyMask(modules, reserved, m);
    writeFormat(modules, m, size);
    const score = penalty(modules, size);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
    applyMask(modules, reserved, m);
  }
  applyMask(modules, reserved, best);
  writeFormat(modules, best, size);
  return { version, size, modules };
}
function applyMask(modules, reserved, mask) {
  const fn = MASKS[mask];
  for (let y = 0; y < modules.length; y++) {
    for (let x = 0; x < modules.length; x++) {
      if (!reserved[y][x] && fn(x, y)) modules[y][x] = !modules[y][x];
    }
  }
}
function writeFormat(modules, mask, size) {
  const data = 0 << 3 | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = rem << 1 ^ (rem >>> 9) * 1335;
  const bits = (data << 10 | rem) ^ 21522;
  for (let i = 0; i <= 5; i++) modules[i][8] = getBit(bits, i);
  modules[7][8] = getBit(bits, 6);
  modules[8][8] = getBit(bits, 7);
  modules[8][7] = getBit(bits, 8);
  for (let i = 9; i < 15; i++) modules[8][14 - i] = getBit(bits, i);
  for (let i = 0; i < 8; i++) modules[8][size - 1 - i] = getBit(bits, i);
  for (let i = 8; i < 15; i++) modules[size - 15 + i][8] = getBit(bits, i);
  modules[size - 8][8] = true;
}
function penalty(modules, size) {
  let score = 0;
  const runs = (at) => {
    let total = 0, run = 1;
    for (let i = 1; i < size; i++) {
      if (at(i) === at(i - 1)) {
        run++;
        if (run === 5) total += 3;
        else if (run > 5) total += 1;
      } else run = 1;
    }
    return total;
  };
  const FINDER = [true, false, true, true, true, false, true];
  const looksLikeFinder = (at, i) => {
    for (let k = 0; k < 7; k++) if (at(i + k) !== FINDER[k]) return false;
    const quietBefore = [1, 2, 3, 4].every((k) => i - k < 0 || !at(i - k));
    const quietAfter = [0, 1, 2, 3].every((k) => i + 7 + k >= size || !at(i + 7 + k));
    return quietBefore || quietAfter;
  };
  for (let i = 0; i < size; i++) {
    const row = (k) => modules[i][k];
    const col = (k) => modules[k][i];
    score += runs(row) + runs(col);
    for (let j = 0; j + 7 <= size; j++) {
      if (looksLikeFinder(row, j)) score += 40;
      if (looksLikeFinder(col, j)) score += 40;
    }
  }
  for (let y = 0; y + 1 < size; y++) {
    for (let x = 0; x + 1 < size; x++) {
      const a = modules[y][x];
      if (a === modules[y][x + 1] && a === modules[y + 1][x] && a === modules[y + 1][x + 1]) score += 3;
    }
  }
  let dark = 0;
  for (const row of modules) for (const m of row) if (m) dark++;
  const pct = dark * 100 / (size * size);
  score += Math.floor(Math.abs(pct - 50) / 5) * 10;
  return score;
}
const QR_QUIET_ZONE = 4;
function qrPathData(qr, quiet = QR_QUIET_ZONE) {
  const parts = [];
  for (let y = 0; y < qr.size; y++) {
    let x = 0;
    while (x < qr.size) {
      if (!qr.modules[y][x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < qr.size && qr.modules[y][x + run]) run++;
      parts.push(`M${x + quiet} ${y + quiet}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return parts.join("");
}
export {
  QR_MAX_BYTES,
  QR_MAX_VERSION,
  QR_QUIET_ZONE,
  qrEncode,
  qrPathData
};
