const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

// No Windows, o cache interno do sharp mantém o arquivo mapeado em memória
// após leitura/gravação, o que pode causar EBUSY ao tentar remover/mover o
// arquivo logo em seguida. Desabilitar o cache evita esse lock residual.
sharp.cache(false);

const UPLOAD_DIR = path.join(__dirname, '..', 'public', 'uploads', 'products');
const TARGET = 800;
const BG = { r: 255, g: 255, b: 255, alpha: 1 };
const QUALITY = 80;
const MAX_DOWNLOAD = 10 * 1024 * 1024; // 10 MB
const TIMEOUT_MS = 8000;

// Baixa uma imagem de uma URL http(s), validando tipo e tamanho. Lança em falha.
async function fetchImageBuffer(url) {
  if (!/^https?:\/\/.+/i.test(String(url || ''))) {
    throw new Error('URL de imagem inválida (http/https).');
  }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: 'follow' });
    if (!res.ok) throw new Error('Não foi possível baixar a imagem (HTTP ' + res.status + ').');
    const ct = res.headers.get('content-type') || '';
    if (!/^image\//i.test(ct)) throw new Error('O link não aponta para uma imagem.');
    const declared = Number(res.headers.get('content-length') || 0);
    if (declared && declared > MAX_DOWNLOAD) throw new Error('Imagem muito grande (máx 10 MB).');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('Imagem vazia.');
    if (buf.length > MAX_DOWNLOAD) throw new Error('Imagem muito grande (máx 10 MB).');
    return buf;
  } finally {
    clearTimeout(timer);
  }
}

// Padroniza (800x800 contain, fundo branco, WebP) e salva no disco. Retorna caminho relativo.
async function processAndSaveProductImage(buffer, productId) {
  if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = `p${productId}_${Date.now()}.webp`;
  const abs = path.join(UPLOAD_DIR, filename);
  await sharp(buffer)
    .resize(TARGET, TARGET, { fit: 'contain', background: BG })
    .flatten({ background: BG }) // achata transparência (PNG) sobre branco
    .webp({ quality: QUALITY })
    .toFile(abs);
  return '/uploads/products/' + filename;
}

module.exports = { fetchImageBuffer, processAndSaveProductImage, UPLOAD_DIR };
