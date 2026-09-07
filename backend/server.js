/**
 * 支点 Fulcrum · 供应链维权智能查询工具 · 后端 API 服务（零依赖，Node 内置模块实现）
 *
 * 接口（框架文档 §5.3）：
 *   POST /api/analyze           { company_name } -> 三态判定 + 品牌匹配 + 工商信息
 *   GET  /api/biz-info          ?company_name=   -> 信用代码 / 注册地址
 *   GET  /api/brand-library                      -> 海外品牌白名单库
 *   GET  /api/templates                          -> 模板库（含字段定义）
 *   GET  /api/evidence-presets                   -> 证据清单预设
 *
 * 前端：静态托管 ../frontend（/ 即入口页）
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const searchService = require('./services/searchService');
const bizInfoService = require('./services/bizInfoService');
const analysisService = require('./services/analysisService');
const llmService = require('./services/llmService');
const cache = require('./services/cache');

const PORT = process.env.PORT || 3710;
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');
const DATA_DIR = path.join(__dirname, 'data');

const templates = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'templates.json'), 'utf8'));
const evidencePresets = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'evidencePresets.json'), 'utf8'));
const brandLibrary = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'brandLibrary.json'), 'utf8'));

/* 模板字段 optionsRef 引用解析（violationOptions 双语违规类型） */
for (const key of Object.keys(templates.templates)) {
  const tpl = templates.templates[key];
  tpl.fields = tpl.fields.map(f =>
    f.optionsRef ? { ...f, options: templates[f.optionsRef] } : f
  );
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
};

function sendJSON(res, code, data) {
  const body = JSON.stringify(data);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', c => { raw += c; if (raw.length > 1e6) req.destroy(); });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch (e) { reject(new Error('INVALID_JSON')); }
    });
    req.on('error', reject);
  });
}

async function handleApi(req, res, url) {
  const { pathname, searchParams } = url;

  if (pathname === '/api/analyze' && req.method === 'POST') {
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, 400, { error: '请求体必须为 JSON' }); }
    const companyName = String(body.company_name || '').trim();
    if (!companyName) return sendJSON(res, 400, { error: 'company_name 不能为空' });
    if (companyName.length > 100) return sendJSON(res, 400, { error: 'company_name 过长' });

    /* AI 配置由前端页面设置传入（用户浏览器 localStorage），后端不存储 */
    const ai = body.ai && body.ai.apiKey && body.ai.model ? {
      baseUrl: String(body.ai.baseUrl || ''), apiKey: String(body.ai.apiKey), model: String(body.ai.model),
    } : null;

    const engine = ai ? 'ai' : 'rules';
    const cacheKey = `analyze:${engine}:${companyName}`;
    let result = cache.get(cacheKey);
    let cached = !!result;
    let aiError = null;

    if (!result) {
      if (ai) {
        /* AI 模式：用户自配模型；失败时降级规则模式并附错误说明 */
        try {
          result = await analysisService.analyzeWithAI(companyName, ai);
        } catch (e) {
          aiError = e.message;
          console.error('[AI Analyze Failed]', e.message);
        }
      }
      if (!result) {
        const docs = await searchService.search(companyName);
        const verdict = analysisService.analyze(companyName, docs);
        const biz = await bizInfoService.getBizInfo(companyName);
        result = {
          company_name: companyName,
          state: verdict.state,
          suggestion: verdict.suggestion,
          verdict_chips: verdict.verdict_chips,
          matched_brands: verdict.matched_brands,
          biz_info: biz || { creditCode: '', address: '' },
          reason: verdict.reason,
          data_source: 'demo', // 接入真实检索源后由 Provider 上报：external
          generated_at: new Date().toISOString(),
        };
      }
      /* AI 失败的降级结果不缓存：避免用户修正 AI 配置后仍命中旧的降级结果 */
      if (!aiError) cache.set(cacheKey, result);
    }
    const resp = { ...result, cached, cache_ttl_days: cache.CACHE_TTL_DAYS };
    if (aiError) resp.ai_error = aiError;
    if (ai && !aiError) resp.ai_model = ai.model;
    return sendJSON(res, 200, resp);
  }

  if (pathname === '/api/ai-test' && req.method === 'POST') {
    /* AI 连接测试：配置同样仅当次使用，不落盘 */
    let body;
    try { body = await readBody(req); } catch (e) { return sendJSON(res, 400, { error: '请求体必须为 JSON' }); }
    if (!body.ai) return sendJSON(res, 400, { error: '缺少 ai 配置' });
    try {
      const reply = await llmService.testConnection(body.ai);
      return sendJSON(res, 200, { ok: true, reply });
    } catch (e) {
      return sendJSON(res, 200, { ok: false, error: e.message });
    }
  }

  if (pathname === '/api/biz-info' && req.method === 'GET') {
    const companyName = String(searchParams.get('company_name') || '').trim();
    if (!companyName) return sendJSON(res, 400, { error: 'company_name 不能为空' });
    const biz = await bizInfoService.getBizInfo(companyName);
    return sendJSON(res, 200, { company_name: companyName, biz_info: biz || { creditCode: '', address: '' }, found: !!biz });
  }

  if (pathname === '/api/brand-library' && req.method === 'GET') {
    return sendJSON(res, 200, brandLibrary);
  }

  if (pathname === '/api/templates' && req.method === 'GET') {
    return sendJSON(res, 200, templates);
  }

  if (pathname === '/api/evidence-presets' && req.method === 'GET') {
    return sendJSON(res, 200, evidencePresets);
  }

  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJSON(res, 200, { ok: true, version: '1.0.0', data_source: 'demo' });
  }

  return sendJSON(res, 404, { error: '接口不存在' });
}

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const filePath = path.join(FRONTEND_DIR, rel);
  if (!filePath.startsWith(FRONTEND_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Not Found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname.startsWith('/api/')) {
    try { return await handleApi(req, res, url); }
    catch (e) {
      console.error('[API Error]', e);
      return sendJSON(res, 500, { error: '服务内部错误' });
    }
  }
  return serveStatic(res, url.pathname);
});

server.listen(PORT, () => {
  console.log(`[支点 Fulcrum] 供应链维权智能查询工具后端已启动: http://localhost:${PORT}`);
  console.log(`[星宇助手] 数据源模式: demo（配置 SEARCH_PROVIDER / BIZ_INFO_API_URL 后接入真实数据源）`);
});
