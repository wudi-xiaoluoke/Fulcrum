/**
 * 检索结果缓存（内存 + 文件持久化，TTL 7 天）
 * 注意：仅缓存分析结论类数据，模板/白名单库等静态内容不经过此模块。
 */
const fs = require('fs');
const path = require('path');

const CACHE_FILE = path.join(__dirname, '..', 'data', 'cache.json');
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

const mem = new Map();

/* 启动时加载磁盘缓存，过期条目直接丢弃 */
try {
  const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  const now = Date.now();
  for (const [k, v] of Object.entries(raw || {})) {
    if (v && v.expiresAt && v.expiresAt > now) mem.set(k, v);
  }
} catch (e) { /* 首次运行无缓存文件 */ }

let flushTimer = null;
function flush() {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    try {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(mem), null, 2));
    } catch (e) { /* 写失败不影响主流程 */ }
  }, 300);
}

exports.get = (key) => {
  const hit = mem.get(key);
  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) { mem.delete(key); flush(); return null; }
  return hit.value;
};

exports.set = (key, value, ttlMs = TTL_MS) => {
  mem.set(key, { value, expiresAt: Date.now() + ttlMs });
  flush();
};

exports.CACHE_TTL_DAYS = 7;
