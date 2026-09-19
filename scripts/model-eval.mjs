#!/usr/bin/env node
// Biweekly translation-model evaluation.
//
// Purpose: compare candidate Workers AI text-generation models on the SAME
// Korean cloud-news translation task, scoring each against the fluent-korean
// guideline (scripts/fluent-korean-reference.md, from github.com/snflkd/
// fluent-korean) and measuring Neuron cost, so a human can decide whether to
// switch TRANSLATION_MODEL. It NEVER changes the live model — it only reports.
//
// Quality is the priority: the deterministic score flags guideline violations,
// but the report also prints each model's raw output so a human makes the call.
//
// Usage:
//   CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... node scripts/model-eval.mjs
// Optional env:
//   EVAL_MODELS   comma-separated model IDs (default: candidate set below)
//   EVAL_SAMPLES  number of source articles to pull (default 8)
//   MCP_TOKEN     bearer token for POST /mcp format="source" (to pull real
//                 vendor-original text); falls back to built-in fixtures.
//   API_BASE      default https://api.whats-new.kr

const ACCOUNT = process.env.CLOUDFLARE_ACCOUNT_ID;
const TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const API = process.env.API_BASE || 'https://api.whats-new.kr';
const MCP_TOKEN = process.env.MCP_TOKEN || '';
const SAMPLES = Number(process.env.EVAL_SAMPLES || 8);

// Current production model first, then cheaper/newer non-reasoning candidates.
const DEFAULT_MODELS = [
  '@cf/zai-org/glm-4.7-flash',              // current (reasoning; expensive output)
  '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
  '@cf/mistralai/mistral-small-3.1-24b-instruct',
  '@cf/meta/llama-4-scout-17b-16e-instruct',
  '@cf/meta/llama-3.1-8b-instruct-fp8',
];
const MODELS = (process.env.EVAL_MODELS || '').trim()
  ? process.env.EVAL_MODELS.split(',').map((m) => m.trim()).filter(Boolean)
  : DEFAULT_MODELS;

// GLM-4.7-flash unit pricing (docs). Used only for a rough $ estimate; the
// per-model neuron count from the API usage block is the primary signal.
const NEURON_USD = 0.011 / 1000; // $0.011 per 1k neurons beyond the free tier

if (!ACCOUNT || !TOKEN) {
  console.error('Set CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN.');
  process.exit(1);
}

// ---- fluent-korean deterministic checks (mirrors the worker's quality gate
// and the guideline in scripts/fluent-korean-reference.md) --------------------
function splitSentences(text) {
  return String(text || '').replace(/(\d)\.(\d)/g, '$1·$2')
    .split(/(?<=[.!?。])\s+/).map((s) => s.trim()).filter(Boolean);
}
function tokenSet(text) {
  return new Set(String(text || '').replace(/(\d)\.(\d)/g, '$1·$2')
    .split(/[^가-힣A-Za-z0-9·]+/)
    .map((t) => t.replace(/(을|를|이|가|은|는|과|와|의|에|에서|으로|로|도|만|에게|부터|까지)$/, ''))
    .filter((t) => t.length >= 2));
}
function overlap(a, b) {
  const A = tokenSet(a), B = tokenSet(b);
  if (A.size < 3) return 0;
  let hit = 0; for (const t of A) if (B.has(t)) hit++;
  return hit / A.size;
}
function scoreCard(card) {
  const title = card.title || '', summary = card.summary || '', target = card.target || '';
  const sents = splitSentences(summary);
  const flags = [];
  // 문장 단위: 완결된 1~2문장, 종결어미
  if (sents.length < 1 || sents.length > 2) flags.push('sentence-count');
  // 구 단위: 첫 문장 주어/변화 생략, 군더더기 연결
  if (/^(이는|또한|이제|이 기능|이 변경|이러한|이 업데이트|이 새로운)/.test(summary)) flags.push('omits-subject');
  if (sents.slice(1).some((s) => /^(또한|이는|이를 통해)\s/.test(s))) flags.push('filler-connector');
  // 2번째 문장이 첫 문장/제목/대상 반복
  if (sents.length >= 2 && (overlap(sents[1], sents[0]) >= 0.6 || overlap(sents[1], `${title} ${target}`) >= 0.8)) flags.push('redundant-2nd');
  // 제목: 명사구(문장 종결 금지), 영어 동사 잔재, 미번역
  if (/(?:합니다|됩니다|습니다|[다요])\.?$/.test(title) || /\.$/.test(title)) flags.push('title-is-sentence');
  if (/\b(delivers|announces|now supports|is now available)\b/i.test(title)) flags.push('title-english-verb');
  if (!/[가-힣]/.test(title)) flags.push('title-not-translated');
  if (title.length > 40) flags.push('title>40');
  // 독자 지시문 금지 (사실 서술)
  if (/(?:하세요|하십시오|바랍니다|해\s?보세요)[.!]?(?:\s|$)/.test(summary)) flags.push('imperative');
  // 영어 어간+한국어 어미
  if (/[A-Za-z]{3,}(?:하거나|하여|합니다|되며|됩니다|했습니다|되었습니다|하는 |되는 )/.test(summary)) flags.push('english-stem-korean-ending');
  // 미번역 영어 구절
  if (/[가-힣][A-Z]{3,}/.test(`${title} ${summary}`)) flags.push('garbled-hangul-caps');
  // 엠대시 자제
  if (/—/.test(`${title} ${summary}`)) flags.push('em-dash');
  // CJK 오염 (한자/가나)
  if (/[\u4e00-\u9fff\u3040-\u30ff]/.test(`${title} ${summary}`)) flags.push('cjk-contamination');
  // 마크다운 잔재
  if (/\*\*|`|_workflow_/.test(`${title} ${summary}`)) flags.push('markdown-artifact');
  return flags;
}

async function aiRun(model, messages, maxTokens = 768) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/ai/run/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, max_tokens: maxTokens, temperature: 0.1 }),
  });
  const data = await res.json();
  if (!data.success) throw new Error(JSON.stringify(data.errors));
  const r = data.result || {};
  const text = r.response ?? r.choices?.[0]?.message?.content ?? '';
  const usage = r.usage || {};
  return { text, usage };
}

function parseJSON(text) {
  const clean = String(text).replace(/```json\s*/g, '').replace(/```\s*/g, '')
    .replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  const s = clean.indexOf('{'), e = clean.lastIndexOf('}') + 1;
  if (s < 0 || e <= s) return null;
  try { return JSON.parse(clean.slice(s, e)); } catch { return null; }
}

// System prompt: compact but faithful to the fluent-korean guideline intent.
const SYS = [
  'You are a Korean cloud-news summarizer for IT professionals.',
  'OUTPUT valid JSON only, no markdown: {"title","summary","target","features","regions","status"}.',
  'Follow the fluent-Korean guideline:',
  '- 의미 있는 문장 성분을 생략하지 말고, 서술어와 종결어미로 완결된 문장을 쓴다.',
  '- 조사와 어미를 생략하지 않고, 맥락에 맞는 한자어에 조사·어미를 붙여 관계를 분명히 한다.',
  '- 비유적 어휘로 일반 명사·동사를 대체하지 않는다. 엠대시(—) 대신 콜론·접속사를 쓴다.',
  '- 제품명/버전/리전코드는 영어 원문 유지. 제목은 명사구(40자 이내), 합니다/됩니다/마침표로 끝내지 않는다.',
  '- summary 첫 문장에 주어와 핵심 변화를 쓰고 이는/또한/이제로 시작하지 않는다. 1~2문장.',
  '- 독자 지시문(하세요/하십시오) 금지, 사실만 서술. 영어 어간에 한국어 어미를 붙이지 않는다.',
  'status는 정식 출시/미리보기/베타/지원 종료 중에서 배열로.',
].join('\n');

const FIXTURES = [
  { title: 'AWS Lambda now supports Python 3.13 runtime', description: 'Customers can now create and update Lambda functions using Python 3.13, which includes improved error messages, a new REPL, and performance improvements. Available in all AWS Regions where Lambda is available.' },
  { title: 'Amazon RDS for PostgreSQL supports minor version 16.4', description: 'Amazon RDS for PostgreSQL now supports PostgreSQL minor version 16.4. This release contains bug fixes and improvements. We recommend upgrading to keep current with security and performance patches.' },
  { title: '[Preview] Azure Cosmos DB continuous backup for analytical store', description: 'Azure Cosmos DB now supports continuous backup and point-in-time restore for analytical store data. This feature is currently in public preview.' },
];

async function loadSamples() {
  if (!MCP_TOKEN) return FIXTURES.slice(0, SAMPLES);
  const out = [];
  for (const csp of ['aws', 'gcp', 'azure']) {
    try {
      const res = await fetch(`${API}/mcp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MCP_TOKEN}` },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'search_releases', arguments: { csp, format: 'source', limit: Math.ceil(SAMPLES / 3) } } }),
      });
      const data = await res.json();
      const text = data?.result?.content?.[0]?.text || '[]';
      const arr = JSON.parse(text.replace(/\n\n---[\s\S]*$/, ''));
      for (const a of arr) out.push({ title: a.title, description: a.description });
    } catch { /* fall through to whatever we have */ }
  }
  return (out.length ? out : FIXTURES).slice(0, SAMPLES);
}

async function main() {
  const samples = await loadSamples();
  console.log(`# Translation model evaluation — ${new Date().toISOString().slice(0, 16)}Z`);
  console.log(`Samples: ${samples.length} | Models: ${MODELS.length}`);
  console.log(`Rubric: scripts/fluent-korean-reference.md (github.com/snflkd/fluent-korean)\n`);

  const results = [];
  for (const model of MODELS) {
    let neurons = 0, outTok = 0, flagged = 0, parseFail = 0;
    const samplesOut = [];
    for (const s of samples) {
      const userMsg = `Title: ${s.title}\nDescription: ${String(s.description || '').slice(0, 1500)}`;
      let text = '', usage = {};
      try {
        ({ text, usage } = await aiRun(model, [{ role: 'system', content: SYS }, { role: 'user', content: userMsg }]));
      } catch (e) {
        parseFail++; samplesOut.push({ src: s.title, err: String(e.message).slice(0, 120) }); continue;
      }
      neurons += Number(usage.neurons || 0);
      outTok += Number(usage.completion_tokens || 0);
      const card = parseJSON(text);
      if (!card || !card.title) { parseFail++; samplesOut.push({ src: s.title, err: 'unparseable/empty JSON' }); continue; }
      const flags = scoreCard(card);
      if (flags.length) flagged++;
      samplesOut.push({ src: s.title, title: card.title, summary: card.summary, flags });
    }
    const n = samples.length;
    results.push({ model, neurons, neuronPer: neurons / n, outTokPer: outTok / n, flagged, parseFail, n, samplesOut });
  }

  // Summary table
  console.log('## Summary (lower neurons = cheaper; lower flagged = better fluent-Korean adherence)\n');
  console.log('| model | neuron/card | out_tok/card | flagged | parse_fail | est $/1k cards |');
  console.log('|---|---|---|---|---|---|');
  for (const r of results) {
    const per1k = (r.neuronPer * 1000 * NEURON_USD).toFixed(2);
    console.log(`| ${r.model} | ${r.neuronPer.toFixed(1)} | ${r.outTokPer.toFixed(0)} | ${r.flagged}/${r.n} | ${r.parseFail}/${r.n} | $${per1k} |`);
  }

  // Per-model samples for human review (quality is the priority)
  console.log('\n## Raw outputs for human review\n');
  for (const r of results) {
    console.log(`### ${r.model}`);
    for (const s of r.samplesOut) {
      if (s.err) { console.log(`- [ERR] ${s.src} :: ${s.err}`); continue; }
      const fl = s.flags.length ? `  ⚠️ ${s.flags.join(', ')}` : '  ✅';
      console.log(`- ${s.title}${fl}`);
      console.log(`    ${String(s.summary).slice(0, 160)}`);
    }
    console.log();
  }

  console.log('> Deterministic flags catch guideline violations, but do NOT auto-switch the model.');
  console.log('> A human reviews the raw outputs above, then sets TRANSLATION_MODEL if a candidate wins on both quality and cost.');
}

main().catch((e) => { console.error(e); process.exit(1); });
