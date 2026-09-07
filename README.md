# ⚖️ 支点 Fulcrum

> 供应链维权智能查询工具 —— 「给我一个支点，我能撬动地球。」

输入公司名，一键判断该企业是否处于欧盟供应链（CSDDD / CSDDD 前瞻义务 / 德国 LkSG）监管链条上，并生成对应的**维权行动方案**：

- **A 类 · 欧盟供应链企业** → 生成中英双语投诉邮件 + 品牌官方合规举报渠道（海外 CSDDD 版证据清单）
- **B 类 · 国内经营企业** → 生成 12333 / 12345 投诉信模板（国内版证据清单）
- **C 类 · 疑似间接供应链** → 给出保守建议与进一步核实路径

## ✨ 特性

- 🔍 **三态智能判定**：关键词 + 品牌白名单规则引擎，按 PRD §5 规则输出结构化结论
- 🤖 **AI 能力用户自配（产品零内置 AI）**：在页面「⚙️ AI 设置」中填入你自己的 OpenAI 兼容 API（智谱 / Kimi / DeepSeek / 通义 / OpenAI / 中转站均可），Key 仅存浏览器 localStorage，随请求传入、后端不存储、不上传
- 🧯 **自动降级**：后端断连降级为演示模式；AI 调用失败自动降级为规则模式并提示原因（失败结果不写缓存）
- 📋 **模板实时同步**：分析结果与中英投诉模板双向联动，一键复制
- 🗂️ **证据清单预设**：海外 CSDDD 版 / 国内版各 10 项，逐项勾选
- 💾 **7 天 TTL 缓存**（内存 + 文件持久化），降低重复查询成本
- 🛡️ **合规常驻**：顶部免责栏、强制风险提示、禁止虚构投诉警示

## 🚀 快速开始

零依赖，无需 `npm install`（仅使用 Node 内置模块），Node ≥ 18 即可：

```bash
cd backend
node server.js
# 打开 http://localhost:3710
```

### 启用 AI 分析（可选）

1. 打开页面 → 点「⚙️ AI 设置」
2. 选择服务商预设（或选「自定义」填中转站 Base URL）
3. 填入 API Key 与模型名 → 「测试连接」→ 保存
4. 重新查询即得 AI 供应链分析；不配置则使用规则/演示模式

> Key 仅保存在你本机浏览器的 localStorage 中，仅随请求发往你填写的 API 地址。

## 🏗️ 架构

```
├── backend/
│   ├── server.js              # 零依赖 HTTP 服务（API + 前端静态托管）
│   ├── services/
│   │   ├── searchService.js   # 检索聚合（Provider 可插拔，预留真实数据源接入点）
│   │   ├── bizInfoService.js  # 工商信息（同上，预留 externalProvider）
│   │   ├── analysisService.js # 规则判定 + analyzeWithAI（AI 结构化分析）
│   │   ├── llmService.js      # OpenAI Chat Completions 兼容客户端
│   │   └── cache.js           # 7 天 TTL 缓存（内存 + 文件）
│   └── data/                  # 品牌白名单库 / 模板库 / 证据清单预设
└── frontend/
    └── index.html             # 单页应用（接入 API，断连自动降级演示模式）
```

### API 一览

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/analyze` | 供应链三态分析（body 可带 `ai` 配置启用 AI） |
| POST | `/api/ai-test` | AI 连接测试 |
| GET | `/api/biz-info?company_name=` | 工商信息查询 |
| GET | `/api/brand-library` | 品牌白名单库 |
| GET | `/api/templates` | 投诉模板库 |
| GET | `/api/evidence-presets` | 证据清单预设 |
| GET | `/api/health` | 健康检查 |

### 接入真实数据源

当前检索与工商信息为演示语料（页面有黄色标注）。接入真实数据只需实现 `searchService.externalProvider` / `bizInfoService.externalProvider` 两个预留函数（搜索 API、企业工商数据 API 等），AI 分析则通过页面设置即可启用。

## ⚠️ 免责声明

- 本工具仅提供公开信息整合与文书辅助，不构成法律意见；维权决定请咨询专业律师
- 严禁基于本工具输出虚构投诉——所有投诉必须以真实劳动事实和真实证据为依据
- 品牌投诉渠道来自人工预录入白名单库，使用前请自行核验
- 当前版本的检索/工商数据为演示语料或 AI 基于模型知识的分析结果，均需人工核验后方可作为依据

## 写在最后

> 在星宇事件后受启发而 vibe coding 的作品，希望帮到有需要的人，也为了自己万一以后也遇到这种情况。期待有人做出更全面、更能帮助打工人维权的工具。
>
> —— 无敌小洛克

## License

[MIT](LICENSE)
