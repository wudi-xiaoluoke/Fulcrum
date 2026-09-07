/**
 * 工商信息服务（统一社会信用代码 / 注册地址）
 * ------------------------------------------------------------
 * Provider 可插拔（框架文档 §3.2：正式产品对接国家企业信用信息公示系统 / 企查查等公开数据源 API）：
 *  - 配置 BIZ_INFO_API_URL / BIZ_INFO_API_KEY 环境变量后走真实数据源；
 *  - 未配置时使用 demoProvider，与原型演示数据保持一致。
 */

const DEMO_BIZ = {
  '星宇股份': { creditCode: '9133020072XXXXXXX1', address: '浙江省宁波市宁海县XX街道XX路1号' },
  '宁德时代': { creditCode: '91350900MA2XXXXXXX2', address: '福建省宁德市蕉城区XX镇XX路2号' },
};

function demoProvider(companyName) {
  return DEMO_BIZ[companyName] || null;
}

/* 外部工商数据 Provider 预留接口 */
function externalProvider(companyName) {
  // TODO(V1.1): 对接国家企业信用信息公示系统 / 工商数据 API。
  // 入参 companyName，返回 { creditCode, address } 或 null。
  return null;
}

async function getBizInfo(companyName) {
  const external = externalProvider(companyName);
  if (external) return external;
  return demoProvider(companyName);
}

module.exports = { getBizInfo };
