/**
 * AI 服务（用户自配，产品本身不内置任何 AI Key）
 * ------------------------------------------------------------
 * 设计原则（用户要求）：
 *  - 后端不存储、不内置任何模型 Key；
 *  - AI 配置由前端页面设置（存于用户浏览器 localStorage），
 *    随 /api/analyze 请求体传入，仅当次请求使用；
 *  - 兼容 OpenAI Chat Completions 协议（智谱/Kimi/DeepSeek/通义兼容模式/
 *    OpenAI 及各类中转站均支持）。
 */

/**
 * 调用 chat/completions
 * @param {{baseUrl,apiKey,model,temperature?}} cfg AI 配置
 * @param {Array<{role,content}>} messages 消息
 * @param {{timeoutMs?:number,maxTokens?:number}} opts
 * @returns {Promise<string>} 助手回复文本
 */
async function chat(cfg, messages, opts = {}) {
  const baseUrl = String(cfg.baseUrl || '').trim().replace(/\/+$/, '');
  const apiKey = String(cfg.apiKey || '').trim();
  const model = String(cfg.model || '').trim();
  if (!baseUrl || !apiKey || !model) throw new Error('AI 配置不完整（需要 Base URL / API Key / 模型名）');

  const url = /\/chat\/completions$/.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), opts.timeoutMs || 90000);
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages,
        temperature: cfg.temperature != null ? cfg.temperature : 0.2,
        ...(opts.maxTokens ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: ctrl.signal,
    });
    if (!r.ok) {
      const text = await r.text().catch(() => '');
      throw new Error(`AI 接口返回 ${r.status}${text ? '：' + text.slice(0, 200) : ''}`);
    }
    const data = await r.json();
    const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (typeof content !== 'string') throw new Error('AI 响应格式异常（未取到 content）');
    return content;
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('AI 请求超时（90 秒），可在设置中更换模型或稍后重试');
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** 连接测试：发一条极短消息验证配置可用性 */
async function testConnection(cfg) {
  const reply = await chat(cfg, [
    { role: 'user', content: '回复"连接成功"四个字，不要输出其他内容。' },
  ], { timeoutMs: 20000, maxTokens: 20 });
  return reply.trim().slice(0, 50);
}

/**
 * 从模型回复中提取 JSON（容忍 ```json 代码块 / 前后缀文字）
 * @returns {object|null}
 */
function extractJson(text) {
  if (!text) return null;
  const cleaned = String(text).replace(/```(?:json)?/gi, '```');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try { return JSON.parse(cleaned.slice(start, end + 1)); }
  catch (e) { return null; }
}

module.exports = { chat, testConnection, extractJson };
