const { test } = require('node:test');
const assert = require('node:assert');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const { fetchImageBuffer, processAndSaveProductImage, UPLOAD_DIR } = require('../src/utils/imageProcessor');

async function makePng() {
  return await sharp({ create: { width: 50, height: 80, channels: 3, background: { r: 10, g: 20, b: 30 } } }).png().toBuffer();
}

test('processAndSaveProductImage gera webp 800x800', async () => {
  const png = await makePng();
  const rel = await processAndSaveProductImage(png, 999999);
  assert.match(rel, /^\/uploads\/products\/p999999_\d+\.webp$/);
  const abs = path.join(UPLOAD_DIR, path.basename(rel));
  assert.ok(fs.existsSync(abs), 'arquivo salvo em disco');
  const meta = await sharp(abs).metadata();
  assert.strictEqual(meta.width, 800);
  assert.strictEqual(meta.height, 800);
  assert.strictEqual(meta.format, 'webp');
  fs.unlinkSync(abs);
});

test('fetchImageBuffer rejeita URL sem http/https', async () => {
  await assert.rejects(() => fetchImageBuffer('ftp://x/y.png'), /inválida/i);
});

test('fetchImageBuffer baixa imagem de servidor http local', async () => {
  const png = await makePng();
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'image/png', 'content-length': png.length });
    res.end(png);
  });
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  try {
    const buf = await fetchImageBuffer('http://127.0.0.1:' + port + '/foto.png');
    assert.ok(Buffer.isBuffer(buf) && buf.length === png.length);
  } finally { server.close(); }
});

test('fetchImageBuffer rejeita content-type não-imagem', async () => {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html></html>');
  });
  await new Promise(r => server.listen(0, r));
  const port = server.address().port;
  try {
    await assert.rejects(() => fetchImageBuffer('http://127.0.0.1:' + port + '/x'), /não aponta para uma imagem/i);
  } finally { server.close(); }
});
