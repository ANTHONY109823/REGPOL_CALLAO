/**
 * ZIP método STORE (sin comprimir). Sirve para empaquetar PDF ya comprimidos
 * y enviarlos en streaming, un archivo a la vez.
 */
'use strict';

const CRC_TABLE = new Int32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}

function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) {
    crc = CRC_TABLE[(crc ^ buf[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function writeAsync(stream, chunk) {
  return new Promise(function(resolve, reject) {
    const ok = stream.write(chunk, function(err) {
      if (err) reject(err);
    });
    if (ok) resolve();
    else stream.once('drain', resolve);
  });
}

function slugNombre(s, max) {
  const t = String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  const out = t.slice(0, max || 80);
  return out || 'archivo';
}

class ZipStoreWriter {
  constructor(writable) {
    this.out = writable;
    this.offset = 0;
    this.central = [];
    this.count = 0;
  }

  async write(buf) {
    await writeAsync(this.out, buf);
    this.offset += buf.length;
  }

  async addFile(name, data) {
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(data || '');
    const nbuf = Buffer.from(String(name || 'archivo').slice(0, 180), 'utf8');
    const crc = crc32(payload);
    const localOff = this.offset;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(payload.length, 22);
    local.writeUInt16LE(nbuf.length, 26);
    local.writeUInt16LE(0, 28);
    await this.write(local);
    await this.write(nbuf);
    await this.write(payload);
    this.central.push({ name: nbuf, crc: crc, size: payload.length, offset: localOff });
    this.count++;
  }

  async end() {
    const cdStart = this.offset;
    for (let i = 0; i < this.central.length; i++) {
      const e = this.central[i];
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(0, 10);
      c.writeUInt16LE(0, 12);
      c.writeUInt16LE(0, 14);
      c.writeUInt32LE(e.crc, 16);
      c.writeUInt32LE(e.size, 20);
      c.writeUInt32LE(e.size, 24);
      c.writeUInt16LE(e.name.length, 28);
      c.writeUInt16LE(0, 30);
      c.writeUInt16LE(0, 32);
      c.writeUInt16LE(0, 34);
      c.writeUInt16LE(0, 36);
      c.writeUInt32LE(0, 38);
      c.writeUInt32LE(e.offset, 42);
      await this.write(c);
      await this.write(e.name);
    }
    const cdSize = this.offset - cdStart;
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(0, 4);
    end.writeUInt16LE(0, 6);
    end.writeUInt16LE(this.count, 8);
    end.writeUInt16LE(this.count, 10);
    end.writeUInt32LE(cdSize, 12);
    end.writeUInt32LE(cdStart, 16);
    end.writeUInt16LE(0, 20);
    await this.write(end);
    this.out.end();
  }
}

module.exports = { ZipStoreWriter, slugNombre, crc32 };
