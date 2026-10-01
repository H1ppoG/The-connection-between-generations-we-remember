/* Сервер проекта «Связь поколений: мы помним»
   - раздаёт статические файлы сайта;
   - ведёт учёт зажжённых свечей по IP (разные устройства за одним IP
     свечу не блокируют) в файле data/candles.json;
   - обслуживает «Бессмертный полк»: заявки посетителей с фото и текстом
     проходят модерацию (data/regiment.json), админ-панель — admin.html
     (вход по паролю, см. ADMIN_PASSWORD ниже).

   Запуск:  node server.js        (порт 8123)
            node server.js 3000   (произвольный порт)
            ADMIN_PASSWORD=... node server.js  (свой пароль админки)

   Сайт работает и без сервера (двойной клик по index.html) — тогда
   подсветка свечи сохраняется только в браузере, без учёта по IP,
   а полк показывает примеры без модерации.
*/
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
/* Порт: в облаках (Render и др.) задаётся переменной окружения PORT,
   локально — аргументом команды, по умолчанию 8123. */
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 8123;
/* Максимум свечей с одного IP-адреса — защита от автоматических кликов.
   Разные устройства за одним IP (школьная сеть, домашний Wi-Fi) свечу не блокирует. */
const CANDLES_PER_IP = Number(process.env.CANDLES_PER_IP) || 50;
/* Пароль админ-панели «Бессмертного полка» (admin.html). Фиксированный
   простой пароль для конкурсной версии; можно переопределить через env. */
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin2026';
const ADMIN_SESSION_HOURS = 8;
const DATA_DIR = path.join(ROOT, 'data');
const FILE = path.join(DATA_DIR, 'candles.json');
const REG_FILE = path.join(DATA_DIR, 'regiment.json');
/* Предельный размер фото в заявке (base64 data-URL), ~2.5 МБ файла. */
const MAX_PHOTO_BYTES = 3.5 * 1024 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8'
};

function readCandles() {
  try {
    const parsed = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    const byIp = parsed.byIp;
    if (byIp && typeof byIp === 'object' && !Array.isArray(byIp)) return byIp;
    // миграция старого формата { ips: [...] }
    if (Array.isArray(parsed.ips)) {
      const out = {};
      parsed.ips.forEach((addr) => { out[addr] = ['ip:' + addr]; });
      return out;
    }
    return {};
  } catch {
    return {};
  }
}

function writeCandles(byIp) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify({ byIp }, null, 2));
}

function totalCandles(byIp) {
  let n = 0;
  for (const addr in byIp) n += byIp[addr].length;
  return n;
}

function tokenLit(byIp, token) {
  for (const addr in byIp) {
    if (byIp[addr].indexOf(token) !== -1) return true;
  }
  return false;
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function sendJson(res, code, obj) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

/* ---------- «Бессмертный полк»: хранение, модерация, сессии ---------- */
const adminSessions = new Map(); // token -> срок действия (мс)

function readRegiment() {
  try {
    const parsed = JSON.parse(fs.readFileSync(REG_FILE, 'utf8'));
    if (Array.isArray(parsed.items)) return parsed.items;
    return [];
  } catch {
    return [];
  }
}

function writeRegiment(items) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(REG_FILE, JSON.stringify({ items }, null, 2));
}

function newRegimentId() {
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function cleanStr(v, max) {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function readBody(req, cb, limit) {
  let body = '';
  req.on('data', (c) => {
    body += c;
    if (Buffer.byteLength(body, 'utf8') > (limit || 6 * 1024 * 1024)) req.destroy();
  });
  req.on('end', () => {
    let payload = {};
    try { payload = JSON.parse(body) || {}; } catch { /* ignore */ }
    cb(payload);
  });
}

function validPhoto(photo) {
  if (typeof photo !== 'string' || !photo) return false;
  if (photo.length > MAX_PHOTO_BYTES) return false;
  return /^data:image\/(jpeg|png|webp);base64,/.test(photo);
}

function requireAdmin(req) {
  const header = req.headers['x-admin-token'] ||
    String(req.headers['authorization'] || '').replace(/^Bearer\s+/i, '');
  const exp = adminSessions.get(String(header));
  if (!exp || exp < Date.now()) {
    if (exp) adminSessions.delete(String(header));
    return false;
  }
  return true;
}

function newAdminToken() {
  const token = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 14);
  adminSessions.set(token, Date.now() + ADMIN_SESSION_HOURS * 60 * 60 * 1000);
  return token;
}

function publicRegiment(items) {
  return items
    .filter((it) => it.status === 'approved')
    .map(({ id, name, years, rank, place, text, author, photo }) =>
      ({ id, name, years, rank, place, text, author, photo }));
}

function countRegiment(items) {
  const counts = { pending: 0, approved: 0, rejected: 0 };
  items.forEach((it) => { if (it.status in counts) counts[it.status] += 1; });
  return counts;
}

http.createServer((req, res) => {
  const url = req.url.split('?')[0];
  const ip = clientIp(req);
  let search = null;
  try { search = new URL(req.url, 'http://localhost').searchParams; } catch { /* ignore */ }

  /* API свечи */
  if (url === '/api/candle' && req.method === 'GET') {
    const token = search && search.get('token') ? String(search.get('token')).slice(0, 64) : '';
    const byIp = readCandles();
    sendJson(res, 200, { lit: token ? tokenLit(byIp, token) : false, total: totalCandles(byIp) });
    return;
  }
  if (url === '/api/candle' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => {
      body += c;
      if (body.length > 4096) req.destroy();
    });
    req.on('end', () => {
      let payload = {};
      try { payload = JSON.parse(body) || {}; } catch { /* ignore */ }
      if ((payload.action || 'light') !== 'light') { sendJson(res, 400, { status: 'error' }); return; }
      const token = String(payload.token || '').slice(0, 64);
      if (!token) { sendJson(res, 400, { status: 'error', message: 'token required' }); return; }
      const byIp = readCandles();
      if (tokenLit(byIp, token)) { sendJson(res, 200, { status: 'already', total: totalCandles(byIp) }); return; }
      const bucket = byIp[ip] || (byIp[ip] = []);
      if (bucket.length >= CANDLES_PER_IP) { sendJson(res, 200, { status: 'limit', total: totalCandles(byIp) }); return; }
      bucket.push(token);
      writeCandles(byIp);
      sendJson(res, 200, { status: 'lit', total: totalCandles(byIp) });
    });
    return;
  }

  /* API «Бессмертного полка» и модерации */
  if (url === '/api/admin/login' && req.method === 'POST') {
    readBody(req, (payload) => {
      if (String(payload.password || '') === ADMIN_PASSWORD) {
        sendJson(res, 200, { ok: true, token: newAdminToken() });
      } else {
        sendJson(res, 200, { ok: false });
      }
    }, 4096);
    return;
  }

  if (url === '/api/regiment' && req.method === 'GET') {
    sendJson(res, 200, (() => {
      const items = publicRegiment(readRegiment());
      return { total: items.length, items };
    })());
    return;
  }

  if (url === '/api/regiment' && req.method === 'POST') {
    readBody(req, (payload) => {
      const now = Date.now();
      const name = cleanStr(payload.name, 80);
      const text = cleanStr(payload.text, 2000);
      const author = cleanStr(payload.author, 60);
      if (!name || !text || !author) {
        sendJson(res, 400, { status: 'error', message: 'Обязательные поля: имя, текст, автор' });
        return;
      }
      const items = readRegiment();
      items.push({
        id: newRegimentId(),
        name,
        years: cleanStr(payload.years, 30),
        rank: cleanStr(payload.rank, 90),
        place: cleanStr(payload.place, 90),
        text,
        author,
        photo: validPhoto(payload.photo) ? payload.photo : null,
        status: 'pending',
        createdAt: now
      });
      writeRegiment(items);
      sendJson(res, 200, { status: 'pending' });
    });
    return;
  }

  if (url === '/api/regiment/admin' && req.method === 'GET') {
    if (!requireAdmin(req)) { sendJson(res, 401, { ok: false, message: 'auth required' }); return; }
    const items = readRegiment();
    sendJson(res, 200, { items, counts: countRegiment(items) });
    return;
  }

  if (url === '/api/regiment/moderate' && req.method === 'POST') {
    if (!requireAdmin(req)) { sendJson(res, 401, { ok: false, message: 'auth required' }); return; }
    readBody(req, (payload) => {
      const id = String(payload.id || '');
      const action = String(payload.action || '');
      const items = readRegiment();
      const item = items.find((it) => it.id === id);
      if (!item) { sendJson(res, 404, { ok: false, message: 'not found' }); return; }
      if (action === 'delete') {
        writeRegiment(items.filter((it) => it.id !== id));
        sendJson(res, 200, { ok: true });
        return;
      }
      const edits = payload.edits && typeof payload.edits === 'object' ? payload.edits : null;
      if (edits) {
        if (edits.name !== undefined) item.name = cleanStr(edits.name, 80) || item.name;
        if (edits.years !== undefined) item.years = cleanStr(edits.years, 30);
        if (edits.rank !== undefined) item.rank = cleanStr(edits.rank, 90);
        if (edits.place !== undefined) item.place = cleanStr(edits.place, 90);
        if (edits.text !== undefined) item.text = cleanStr(edits.text, 2000) || item.text;
        if (edits.author !== undefined) item.author = cleanStr(edits.author, 60);
        if (edits.photoRemoved) item.photo = null;
      }
      if (action === 'approve') {
        item.status = 'approved';
        item.moderatedAt = Date.now();
      } else if (action === 'reject') {
        item.status = 'rejected';
        item.moderatedAt = Date.now();
      } else if (action === 'restore') {
        item.status = 'pending';
        delete item.moderatedAt;
      } else {
        sendJson(res, 400, { ok: false, message: 'bad action' });
        return;
      }
      writeRegiment(items);
      sendJson(res, 200, { ok: true });
    });
    return;
  }

  /* Статические файлы */
  let p = decodeURIComponent(url);
  if (p === '/') p = '/index.html';
  const f = path.join(ROOT, p.replace(/^[/\\]+/, ''));
  if (f !== ROOT && !f.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('403 Forbidden');
    return;
  }
  fs.readFile(f, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(f).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(PORT, () => console.log('Проект запущен: http://127.0.0.1:' + PORT));