// Vercel Serverless Function - 豆包 API 代理
const https = require('https');

const SYSTEM_PROMPT = `你是一个知识学习助手，专门帮助用户快速理解一个新的领域或概念。
你的回答必须严格按照以下 JSON 格式返回，不要有任何额外的文字、解释或 markdown 标记：

{
  "title": "概念的中文名称",
  "englishName": "概念的英文名称（如果没有则留空）",
  "definition": "一句话精确定义，100字以内",
  "overview": "这个概念/领域的整体介绍，200-300字，通俗易懂",
  "coreIdeas": ["核心理念1", "核心理念2", "核心理念3"],
  "keyProcess": [{"step": "步骤名称", "desc": "这个步骤做什么，1-2句话"}],
  "keyTools": [{"name": "工具/方法名称", "desc": "一句话说明用途"}],
  "mindmap": {
    "center": "中心主题",
    "branches": [{"label": "一级分支名称", "children": ["子节点1", "子节点2", "子节点3"]}]
  },
  "quiz": [{"question": "题目", "options": ["A","B","C","D"], "answer": 0, "explanation": "解析"}]
}

要求：
1. coreIdeas 3-5条
2. keyProcess 4-8个步骤，按流程顺序
3. keyTools 4-6个
4. mindmap.branches 3-5个一级分支，每个 3-5个子节点
5. quiz 5-8道选择题
6. 必须是合法JSON，双引号，无注释
7. 内容准确专业有深度，适合成年人快速学习`;

function callDoubaoAPI(apiKey, userMessage, model) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify({
      model: model || 'doubao-seed-1-6-250715',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.7,
      max_tokens: 4000
    });

    const options = {
      hostname: 'ark.cn-beijing.volces.com',
      path: '/api/v3/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + apiKey,
        'Content-Length': Buffer.byteLength(requestBody)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error('API ' + res.statusCode + ': ' + data));
          return;
        }
        try {
          const result = JSON.parse(data);
          resolve(result.choices[0].message.content);
        } catch (e) {
          reject(new Error('解析失败: ' + e.message));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.setTimeout(60000, () => { req.destroy(); reject(new Error('请求超时')); });
    req.write(requestBody);
    req.end();
  });
}

function parseJSONContent(content) {
  try { return JSON.parse(content); } catch (e) {}
  const m1 = content.match(/```json\n([\s\S]*?)\n```/);
  if (m1) { try { return JSON.parse(m1[1].trim()); } catch (_) {} }
  const m2 = content.match(/```\n([\s\S]*?)\n```/);
  if (m2) { try { return JSON.parse(m2[1].trim()); } catch (_) {} }
  const first = content.indexOf('{');
  const last = content.lastIndexOf('}');
  if (first !== -1 && last > first) {
    try { return JSON.parse(content.slice(first, last + 1)); } catch (_) {}
  }
  throw new Error('无法解析 AI 返回内容');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { topic, model } = req.body || {};
    if (!topic || !topic.trim()) return res.status(400).json({ error: '请输入学习主题' });

    const apiKey = process.env.DOUBAO_API_KEY;
    if (!apiKey) return res.status(400).json({ error: '服务器未配置 DOUBAO_API_KEY 环境变量' });

    const raw = await callDoubaoAPI(apiKey, '请帮我生成关于「' + topic.trim() + '」的完整知识学习资料。', model);
    const data = parseJSONContent(raw);
    return res.status(200).json({ data: data });
  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
