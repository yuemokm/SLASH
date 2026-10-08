import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import path from 'node:path';
import type { ImageAttachmentRef, LoadedImageAttachment } from '../shared/vision.js';

export const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
const MAX_PIXELS = 80_000_000;
const IMAGE_DIR = 'vision-attachments';

type VerifiedImage = { mimeType: string; width: number; height: number };

function u32be(data: Uint8Array, offset: number): number { return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, false); }
function u32le(data: Uint8Array, offset: number): number { return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true); }
function u16le(data: Uint8Array, offset: number): number { return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(offset, true); }
function fail(code: string): never { throw new Error(code); }

function parsePng(data: Uint8Array): VerifiedImage {
  if (data.length < 33 || ![137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => data[i] === v)) fail('IMAGE_INVALID_MAGIC');
  if (new TextDecoder().decode(data.subarray(12, 16)) !== 'IHDR' || u32be(data, 8) !== 13) fail('IMAGE_INVALID_PNG');
  const width = u32be(data, 16), height = u32be(data, 20);
  if (!width || !height) fail('IMAGE_INVALID_DIMENSIONS');
  let offset = 8, hasIend = false;
  while (offset + 12 <= data.length) {
    const length = u32be(data, offset); const end = offset + 12 + length;
    if (end > data.length) fail('IMAGE_TRUNCATED');
    const type = new TextDecoder().decode(data.subarray(offset + 4, offset + 8));
    if (type === 'IHDR' && length !== 13) fail('IMAGE_INVALID_PNG');
    if (type === 'IEND') { if (length !== 0) fail('IMAGE_INVALID_PNG'); hasIend = true; break; }
    offset = end;
  }
  if (!hasIend) fail('IMAGE_TRUNCATED');
  return { mimeType: 'image/png', width, height };
}

function parseGif(data: Uint8Array): VerifiedImage {
  const head = new TextDecoder().decode(data.subarray(0, 6));
  if (data.length < 14 || (head !== 'GIF87a' && head !== 'GIF89a')) fail('IMAGE_INVALID_MAGIC');
  const width = u16le(data, 6), height = u16le(data, 8);
  if (!width || !height || data[data.length - 1] !== 0x3b) fail('IMAGE_INVALID_GIF');
  return { mimeType: 'image/gif', width, height };
}

function parseJpeg(data: Uint8Array): VerifiedImage {
  if (data.length < 4 || data[0] !== 0xff || data[1] !== 0xd8) fail('IMAGE_INVALID_MAGIC');
  let p = 2;
  while (p + 3 < data.length) {
    if (data[p] !== 0xff) { p++; continue; }
    while (p < data.length && data[p] === 0xff) p++;
    const marker = data[p++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (p + 2 > data.length) fail('IMAGE_TRUNCATED');
    const length = (data[p] << 8) | data[p + 1];
    if (length < 2 || p + length > data.length) fail('IMAGE_TRUNCATED');
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
      if (length < 7) fail('IMAGE_INVALID_JPEG');
      const height = (data[p + 3] << 8) | data[p + 4], width = (data[p + 5] << 8) | data[p + 6];
      if (!width || !height) fail('IMAGE_INVALID_DIMENSIONS');
      return { mimeType: 'image/jpeg', width, height };
    }
    p += length;
  }
  fail('IMAGE_INVALID_JPEG');
}

function parseWebp(data: Uint8Array): VerifiedImage {
  if (data.length < 30 || new TextDecoder().decode(data.subarray(0, 4)) !== 'RIFF' || new TextDecoder().decode(data.subarray(8, 12)) !== 'WEBP') fail('IMAGE_INVALID_MAGIC');
  const chunk = new TextDecoder().decode(data.subarray(12, 16));
  if (chunk === 'VP8X') {
    if (data.length < 30) fail('IMAGE_TRUNCATED');
    const width = 1 + data[24] + (data[25] << 8) + (data[26] << 16), height = 1 + data[27] + (data[28] << 8) + (data[29] << 16);
    return { mimeType: 'image/webp', width, height };
  }
  if (chunk === 'VP8 ' && data.length >= 30 && data[23] === 0x9d && data[24] === 0x01 && data[25] === 0x2a) {
    return { mimeType: 'image/webp', width: u16le(data, 26) & 0x3fff, height: u16le(data, 28) & 0x3fff };
  }
  // VP8L stores dimensions in the first five bytes after the signature.
  if (chunk === 'VP8L' && data.length >= 25 && data[20] === 0x2f) {
    const bits = data[21] | (data[22] << 8) | (data[23] << 16) | (data[24] << 24);
    return { mimeType: 'image/webp', width: 1 + (bits & 0x3fff), height: 1 + ((bits >>> 14) & 0x3fff) };
  }
  fail('IMAGE_INVALID_WEBP');
}

function verifyImage(data: Uint8Array): VerifiedImage {
  if (data.byteLength > MAX_IMAGE_BYTES) fail('IMAGE_TOO_LARGE');
  let result: VerifiedImage;
  if (data.length >= 8 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) result = parsePng(data);
  else if (data.length >= 6 && (new TextDecoder().decode(data.subarray(0, 6)) === 'GIF87a' || new TextDecoder().decode(data.subarray(0, 6)) === 'GIF89a')) result = parseGif(data);
  else if (data.length >= 2 && data[0] === 0xff && data[1] === 0xd8) result = parseJpeg(data);
  else if (data.length >= 12 && new TextDecoder().decode(data.subarray(0, 4)) === 'RIFF' && new TextDecoder().decode(data.subarray(8, 12)) === 'WEBP') result = parseWebp(data);
  else fail('IMAGE_INVALID_MAGIC');
  if (!Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height) || result.width < 1 || result.height < 1 || result.width > 20_000 || result.height > 20_000 || result.width * result.height > MAX_PIXELS) fail('IMAGE_DIMENSIONS_UNSUPPORTED');
  return result;
}

async function readHandle(handle: FileHandle): Promise<Uint8Array> {
  const stat = await handle.stat();
  if (!stat.isFile()) fail('IMAGE_INPUT_NOT_FILE');
  if (stat.size > MAX_IMAGE_BYTES) fail('IMAGE_TOO_LARGE');
  const data = await handle.readFile();
  if (data.byteLength !== stat.size) fail('IMAGE_READ_RACE');
  return new Uint8Array(data);
}

function workspaceKey(workspaceRoot: string): string { return createHash('sha256').update(path.resolve(workspaceRoot).toLowerCase()).digest('hex').slice(0, 32); }

export class AttachmentRepository {
  private readonly root: string;
  constructor(dataDir: string | { dataDir: string }) { this.root = path.resolve(typeof dataDir === 'string' ? dataDir : dataDir.dataDir, IMAGE_DIR); }

  private async dir(workspaceRoot: string): Promise<string> { const value = path.join(this.root, workspaceKey(workspaceRoot)); await fs.mkdir(value, { recursive: true }); return value; }
  private async save(workspaceRoot: string, data: Uint8Array, name: string): Promise<ImageAttachmentRef> {
    const verified = verifyImage(data); const createdAt = new Date().toISOString(); const id = randomUUID();
    const ref: ImageAttachmentRef = Object.freeze({ id, name: path.basename(name).slice(0, 255) || `${id}.${verified.mimeType.split('/')[1]}`, mimeType: verified.mimeType, size: data.byteLength, sha256: createHash('sha256').update(data).digest('hex'), createdAt });
    const dir = await this.dir(workspaceRoot); const bin = path.join(dir, `${id}.bin`); const meta = path.join(dir, `${id}.json`);
    await fs.writeFile(bin, data, { flag: 'wx' });
    try { await fs.writeFile(meta, JSON.stringify(ref), { flag: 'wx' }); } catch (error) { await fs.rm(bin, { force: true }); throw error; }
    return ref;
  }

  async importBytes(input: { data: Uint8Array; name: string; workspaceRoot: string }): Promise<ImageAttachmentRef> {
    if (!(input.data instanceof Uint8Array)) fail('IMAGE_INPUT_INVALID');
    return this.save(input.workspaceRoot, new Uint8Array(input.data), input.name);
  }

  async importPath(filePath: string, workspaceRoot: string): Promise<ImageAttachmentRef> {
    const handle = await fs.open(path.resolve(filePath), 'r');
    try { const data = await readHandle(handle); return await this.save(workspaceRoot, data, path.basename(filePath)); } finally { await handle.close(); }
  }

  async get(id: string, workspaceRoot: string): Promise<ImageAttachmentRef> {
    if (!/^[a-z0-9-]{16,80}$/i.test(id)) fail('IMAGE_ATTACHMENT_NOT_FOUND');
    try { const value = JSON.parse(await fs.readFile(path.join(await this.dir(workspaceRoot), `${id}.json`), 'utf8')) as ImageAttachmentRef; return Object.freeze(value); } catch { fail('IMAGE_ATTACHMENT_NOT_FOUND'); }
  }

  async load(id: string, workspaceRoot: string): Promise<LoadedImageAttachment> {
    const ref = await this.get(id, workspaceRoot); const file = path.join(await this.dir(workspaceRoot), `${id}.bin`); const handle = await fs.open(file, 'r');
    try { const data = await readHandle(handle); const hash = createHash('sha256').update(data).digest('hex'); if (hash !== ref.sha256 || data.byteLength !== ref.size) fail('IMAGE_SNAPSHOT_CORRUPT'); return Object.freeze({ ref, data }); } finally { await handle.close(); }
  }

  async delete(id: string, workspaceRoot: string): Promise<void> {
    const dir = await this.dir(workspaceRoot); await fs.rm(path.join(dir, `${id}.json`), { force: true }); await fs.rm(path.join(dir, `${id}.bin`), { force: true });
  }
}

export { verifyImage };
export type { ImageAttachmentRef, LoadedImageAttachment } from '../shared/vision.js';
