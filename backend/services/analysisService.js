/**
 * 供应链分析判定服务（V1.0：关键词 + 白名单匹配兜底，V1.1 引入 AI 推理）
 * ------------------------------------------------------------
 * 判定规则（PRD §5 / 框架文档 §3.1）：
 *  A. eu        —— 已证实线索中出现白名单品牌 且 命中欧盟关键词（任一）；
 *  C. suspected —— 仅存在间接线索（行业报道/未证实），或仅命中关键词但无白名单品牌；
 *  B. domestic  —— 无任何欧洲客户/出口/海外合作公开信息。
 */
const brandLibrary = require('../data/brandLibrary.json');
const llmService = require('./llmService');

/* PRD §5.1 判定为欧盟供应链的关键词 */
const EU_KEYWORDS = [
  '欧洲客户', '欧盟客户', '出口欧盟', '出口欧洲', '欧洲市场', '欧洲区域',
  '海外营收', '一级供应商', '欧盟合规认证', '服务欧洲品牌', 'IATF 16949', 'ECE',
];

/* 疑似间接供应链线索标识 */
const INDIRECT_CUES = ['行业报道', '未直接披露', '或将成为', '有望进入', '未经证实'];

const BRAND_STATE_MAP = Object.fromEntries(
  (brandLibrary.brands || []).map(b => [b.name, b])
);

function isIndirect(text) {
  return INDIRECT_CUES.some(c => text.includes(c));
}

function hitEUKeywords(text) {
  return EU_KEYWORDS.filter(k => text.includes(k));
}

/**
 * @param {string} companyName
 * @param {Array<{source,text,indirect}>} docs searchService 检索结果
 * @returns {{ state, matched_brands, verdict_chips, suggestion, reason }}
 */
function analyze(companyName, docs) {
  const confirmedKeywords = new Set();
  const confirmedBrands = new Set();
  const indirectKeywords = new Set();
  const indirectBrands = new Set();

  (docs || []).forEach(doc => {
    const text = `${doc.source || ''} ${doc.text || ''}`;
    const kws = hitEUKeywords(text);
    const brands = Object.keys(BRAND_STATE_MAP).filter(b => text.includes(b));

    if (doc.indirect || isIndirect(text)) {
      kws.forEach(k => indirectKeywords.add(k));
      brands.forEach(b => indirectBrands.add(b));
    } else {
      kws.forEach(k => confirmedKeywords.add(k));
      brands.forEach(b => confirmedBrands.add(b));
    }
  });

  // 状态 A：已证实品牌 + 欧盟关键词
  if (confirmedBrands.size > 0 && confirmedKeywords.size > 0) {
    return {
      state: 'eu',
      suggestion: 'eu',
      matched_brands: Array.from(confirmedBrands).map(name => {
        const b = BRAND_STATE_MAP[name];
        return {
          name: b.name, en: b.en, email: b.email, channel: b.channel,
          source: findBrandSource(docs, name),
        };
      }),
      verdict_chips: Array.from(confirmedKeywords).slice(0, 6),
      reason: '已证实公开信息中同时命中海外品牌与欧盟供应链关键词（PRD §5.1）',
    };
  }

  // 状态 C：间接线索 / 仅关键词无品牌
  if (indirectBrands.size > 0 || confirmedBrands.size > 0 ||
      confirmedKeywords.size > 0 || indirectKeywords.size > 0) {
    return {
      state: 'suspected',
      suggestion: 'domestic_with_pressure',
      matched_brands: [],
      verdict_chips: Array.from(new Set([...indirectBrands, ...confirmedBrands]))
        .map(b => `${b}（行业报道，未证实）`)
        .concat(Array.from(indirectKeywords).slice(0, 3))
        .slice(0, 5),
      reason: '存在间接关联线索但未经直接证实，或仅命中关键词未匹配到白名单品牌',
    };
  }

  // 状态 B：无任何公开海外供应链信息
  return {
    state: 'domestic',
    suggestion: 'domestic',
    matched_brands: [],
    verdict_chips: [],
    reason: '全网无任何欧洲客户、出口、海外合作公开信息（PRD §5.2）',
  };
}

function findBrandSource(docs, brandName) {
  const doc = (docs || []).find(d => `${d.source || ''}${d.text || ''}`.includes(brandName));
  return doc ? (doc.source || '公开信息') : '公开信息';
}

/* ============================================================
 * AI 分析（用户自配模型，产品不内置 Key）
 * 规则：让模型基于自身知识按 PRD §5 规则做供应链判定与工商信息召回，
 * 输出结构化 JSON；后端校验并用白名单库补全投诉渠道/邮箱。
 * ============================================================ */
const WHITELIST_TEXT = (brandLibrary.brands || [])
  .map(b => `${b.name}(${b.en})`).join('、');

function buildAnalyzeMessages(companyName) {
  const system = `你是企业供应链合规研究员，服务于一个维权渠道信息整理工具。你的任务是：基于你掌握的公开知识（上市公司年报/招股书、公开报道、工商公示信息），对给定企业做供应链合规判定。

判定规则（必须严格遵守）：
1. state="eu"：有较可靠依据表明该企业为欧洲车企/欧盟品牌供应商、产品出口欧盟/欧洲市场、海外营收包含欧洲区域、或通过欧盟合规认证服务欧洲品牌——并能给出具体匹配的欧洲品牌；
2. state="suspected"：仅存在间接线索（如行业报道、传闻、未证实的供应关系），或有海外业务但无法确认欧洲供应链；
3. state="domestic"：没有公开信息支持该企业存在欧洲客户/出口/海外合作，或该企业信息不足/无法确认。

硬性要求：
- 宁可保守，不可编造。matched_brands 只放你能给出依据的品牌；依据不足归入 suspected 或 domestic；
- brand.source 必须写明依据来源（如"年报披露海外营收含欧洲区域""招股书前五大客户""公开报道"），没有依据就不要输出该品牌；
- biz_info 仅在确有把握时填写真实统一社会信用代码与注册地址，任何不确定都留空字符串，禁止编造格式相近的代码；
- verdict_chips 用简短判定依据短语（每条≤14字，最多6条）。

输出要求：只输出一个 JSON 对象，不要任何其他文字、不要代码块标记。格式：
{"state":"eu|suspected|domestic","matched_brands":[{"name":"品牌中文名","en":"Brand En","source":"依据来源"}],"verdict_chips":["依据1"],"biz_info":{"creditCode":"或空串","address":"或空串"},"reason":"一句话判定说明"}`;

  const user = `请分析企业：${companyName}

参考海外品牌白名单（匹配到其中品牌时 name 请使用其中文名）：${WHITELIST_TEXT}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

/** 校验并归一化模型输出的 JSON */
function normalizeAiResult(companyName, raw) {
  if (!raw || !['eu', 'suspected', 'domestic'].includes(raw.state)) return null;
  const whitelist = new Map((brandLibrary.brands || []).map(b => [b.name, b]));
  const byEn = new Map((brandLibrary.brands || []).map(b => [b.en.toLowerCase(), b]));
  const matched = (Array.isArray(raw.matched_brands) ? raw.matched_brands : [])
    .filter(b => b && b.name)
    .slice(0, 8)
    .map(b => {
      const hit = whitelist.get(b.name) || byEn.get(String(b.en || '').toLowerCase()) || null;
      return {
        name: hit ? hit.name : String(b.name),
        en: hit ? hit.en : String(b.en || ''),
        source: String(b.source || 'AI 基于公开知识的判定'),
        email: hit ? hit.email : '',   // 白名单内才有预录入渠道，其余留空由人工核验
        channel: hit ? hit.channel : '待核验（不在预录白名单库中）',
      };
    });
  const chips = (Array.isArray(raw.verdict_chips) ? raw.verdict_chips : [])
    .map(c => String(c).slice(0, 20)).filter(Boolean).slice(0, 6);
  const biz = raw.biz_info || {};
  return {
    company_name: companyName,
    state: raw.state,
    suggestion: raw.state === 'eu' ? 'eu' : raw.state === 'suspected' ? 'domestic_with_pressure' : 'domestic',
    matched_brands: matched,
    verdict_chips: chips,
    biz_info: {
      creditCode: /^[\w]{15,22}$/.test(String(biz.creditCode || '').trim()) ? String(biz.creditCode).trim() : '',
      address: String(biz.address || '').trim().slice(0, 120),
    },
    reason: String(raw.reason || '').slice(0, 200),
    data_source: 'ai',
    generated_at: new Date().toISOString(),
  };
}

/**
 * AI 模式分析入口（供 server.js 调用）
 * @returns {Promise<object>} 归一化分析结果
 * @throws {Error} 模型调用或解析失败时抛出，由调用方决定降级
 */
async function analyzeWithAI(companyName, aiConfig) {
  const reply = await llmService.chat(aiConfig, buildAnalyzeMessages(companyName), { timeoutMs: 90000 });
  const raw = llmService.extractJson(reply);
  const result = normalizeAiResult(companyName, raw);
  if (!result) throw new Error('AI 返回内容无法解析为约定 JSON 结构');
  return result;
}

module.exports = { analyze, analyzeWithAI };
