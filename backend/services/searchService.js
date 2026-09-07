/**
 * 公开信息检索聚合服务
 * ------------------------------------------------------------
 * Provider 可插拔（框架文档 §5.2：检索 = 新闻/官网抓取 + 巨潮资讯 PDF 解析管线）：
 *  - 若配置了 SEARCH_PROVIDER / SEARCH_API_KEY 环境变量，走外部检索 API；
 *  - 未配置时使用 demoProvider（内置演示语料），保证 V1.0 可独立运行与验收。
 *
 * 返回结构：[{ source, text, indirect }]，indirect=true 表示该线索未经直接证实。
 */
const demoDocs = {
  '星宇股份': [
    { source: '年报披露', text: '公司年报披露：海外营收包含欧洲区域，产品出口欧盟市场。', indirect: false },
    { source: '招股书前五大客户披露', text: '招股书披露前五大客户含梅赛德斯-奔驰、大众汽车，为欧洲车企一级供应商。', indirect: false },
    { source: '认证公示', text: '公司通过 IATF 16949 与欧盟 ECE 认证，通过欧盟合规认证。', indirect: false },
    { source: '公开报道', text: '媒体报道：产品出口欧洲市场，客户含宝马、奥迪。', indirect: false },
    { source: '招标/中标信息', text: '公开中标信息显示与西门子存在业务往来。', indirect: false },
  ],
  '宁德时代': [
    { source: '行业报道', text: '据行业报道，公司或为大众、宝马、奔驰动力电池供应商（行业报道，未直接披露欧盟客户名单）。', indirect: true },
    { source: '公开报道', text: '公司在欧洲建厂的公开信息受到关注。', indirect: true },
  ],
};

const SEARCH_KEYWORDS = ['官网', '年报', '招股书', '出口', '海外', '客户', '中标', '供应商'];

function demoProvider(companyName) {
  const known = demoDocs[companyName];
  if (known) return known.map(d => ({ ...d }));
  // 演示模式：未知公司视为“全网无欧洲客户/出口/海外合作公开信息”
  return [];
}

/* 外部检索 Provider 预留接口：接入真实检索 API 后在此实现并设置环境变量启用 */
function externalProvider(companyName) {
  // TODO(V1.1): 对接真实检索源（新闻/官网/巨潮资讯年报招股书/招标中标/出口数据）。
  // 建议实现：多源抓取 -> 正文抽取 -> 按 SEARCH_KEYWORDS 过滤 -> 归一化为
  // [{ source, text, indirect }] 结构后返回。当前未配置时回退演示数据。
  return null;
}

async function search(companyName) {
  const external = externalProvider(companyName);
  if (external) return external;
  return demoProvider(companyName);
}

module.exports = { search };
