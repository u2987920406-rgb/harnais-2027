/**
 * Rendu d'image en ASCII/ANSI truecolor (half-block).
 * 0 dependance npm : lit le PNG via zlib + decode manuel PNG (IHDR/IDAT).
 * Technique : chaque caractere terminal affiche 2 pixels (haut+bas)
 * via le demi-bloc '▀' (U+2580) colore haut/bas.
 */
import { readFileSync } from 'fs';
import { inflateSync } from 'zlib';

// --- Decode PNG minimal (8-bit RGB/RGBA, non entrelace) ---
function decodePng(buf: Buffer): { w: number; h: number; rgb: number[] } {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG invalide');
  let off = 8;
  let w = 0, h = 0, bitDepth = 0, colorType = 0;
  const idat: Buffer[] = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 1;
  const stride = w * channels;
  const out = new Array(w * h * 3).fill(0);
  let prev = new Uint8Array(stride);
  let pos = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[pos++];
    const line = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const rawB = raw[pos++];
      const a = x >= channels ? line[x - channels] : 0;
      const b = prev[x];
      const c = x >= channels ? prev[x - channels] : 0;
      let v = rawB;
      if (filter === 1) v = (rawB + a) & 255;
      else if (filter === 2) v = (rawB + b) & 255;
      else if (filter === 3) v = (rawB + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        v = (rawB + pr) & 255;
      }
      line[x] = v;
    }
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      out[i] = line[x * channels];
      out[i + 1] = line[x * channels + 1];
      out[i + 2] = line[x * channels + 2];
    }
    prev = line;
  }
  return { w, h, rgb: out };
}

/**
 * Convertit un PNG en chaine ANSI half-block.
 * @param path chemin du PNG
 * @param maxW largeur max en caracteres (defaut 70)
 */
export function imageToAnsi(path: string, maxW = 70): string {
  const { w, h, rgb } = decodePng(readFileSync(path));
  // largeur cible en chars; hauteur = pixels/2
  const scale = maxW / w;
  const cw = maxW;
  const ch = Math.max(1, Math.round((h * scale) / 2));
  const lines: string[] = [];
  for (let cy = 0; cy < ch; cy++) {
    let row = '';
    for (let cx = 0; cx < cw; cx++) {
      const px = Math.min(w - 1, Math.floor(cx / scale));
      const pyT = Math.min(h - 1, Math.floor((cy * 2) / scale));
      const pyB = Math.min(h - 1, Math.floor((cy * 2 + 1) / scale));
      const i1 = (pyT * w + px) * 3, i2 = (pyB * w + px) * 3;
      const r1 = rgb[i1], g1 = rgb[i1 + 1], b1 = rgb[i1 + 2];
      const r2 = rgb[i2], g2 = rgb[i2 + 1], b2 = rgb[i2 + 2];
      // Si fond sombre (proche du #0d1117) -> espace transparent
      const isDark = (r: number, g: number, b: number) => r < 30 && g < 35 && b < 45;
      if (isDark(r1, g1, b1) && isDark(r2, g2, b2)) { row += ' '; continue; }
      if (isDark(r1, g1, b1)) {
        row += `\x1b[40m\x1b[38;2;${r2};${g2};${b2}m▀`;
      } else if (isDark(r2, g2, b2)) {
        row += `\x1b[38;2;${r1};${g1};${b1}m\x1b[49m▀`;
      } else {
        row += `\x1b[38;2;${r1};${g1};${b1}m\x1b[48;2;${r2};${g2};${b2}m▀`;
      }
    }
    lines.push(row + '\x1b[0m');
  }
  return lines.join('\n');
}
