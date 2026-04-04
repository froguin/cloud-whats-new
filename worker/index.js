const RSS_FEEDS = {
  aws: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/',
  gcp: 'https://docs.cloud.google.com/feeds/gcp-release-notes.xml',
  azure: 'https://www.microsoft.com/releasecommunications/api/v2/azure/rss',
};

const PRIMARY_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';
const REVIEW_MODEL = '@cf/openai/gpt-oss-20b';

const TRANSLATION_RULES = `- Keep product names, versions, dates, region codes in English as-is
- Translate ALL other English to Korean. Never mix (e.g. write "및" not "and 및")
- Title: product name + core change. Remove status tags like [Preview], [Launched], [Retired], (GA)
- Summary: 2 sentences. First: what changed. Second: why it matters. Start with 이번/새로운/사용자는. Do not restate the title
- Status from description: "preview" → 미리보기, "beta" → 베타, "retired"/"deprecated" → 지원 종료, "GA"/"launched" → 정식 출시
- Features: 3 capability descriptions
- Regions: vendor standard Korean region names or "모든 리전"
- GCP date entries: YYYY년 M월 D일: main product 외 N건
- MUST KEEP ENTITIES in user message — reproduce exactly`;

const SYSTEM_PROMPT = `You are a Korean cloud news summarizer for IT professionals.

OUTPUT: valid JSON only, no markdown wrapping.

PROCESS — follow this order:
1. Read the Description and summarize in Korean (2 sentences: what changed + why it matters).
2. From the summary, derive a short Korean title: product name + core change.
3. Determine status from description content.
4. Fill target (who benefits), features (3 capability descriptions), regions.

RULES:
${TRANSLATION_RULES}`;

const REVIEW_PROMPT = `You review Korean cloud news cards. Compare the translated fields against the original English and fix errors per these rules:

${TRANSLATION_RULES}

OUTPUT JSON with corrected fields only. Omit fields that are correct.
{"title":"...", "status":[...], "regions":"...", "target":"...", "features":"..."}
If all correct, output: {"pass":true}`;

const FEW_SHOT = [
  // AWS: standard single-product update
  { role: 'user', content: 'Title: AWS Lambda now supports Python 3.13 runtime\nDescription: Customers can now create and update Lambda functions using Python 3.13. Python 3.13 includes improved error messages, a new REPL, and performance improvements. Available in all AWS Regions where Lambda is available.' },
  { role: 'assistant', content: '{"title":"AWS Lambda에서 Python 3.13 런타임 지원","summary":"Lambda 함수에서 개선된 오류 메시지와 새로운 REPL, 성능 향상 등 Python 3.13의 주요 기능을 바로 활용할 수 있게 되었습니다. 기존 Python 3.12 함수를 운영 중이라면 런타임 업그레이드를 검토할 시점입니다.","target":"Lambda 기반 서버리스 백엔드를 Python으로 운영하는 백엔드 개발자","features":"Python 3.13 런타임 선택 가능, 오류 메시지 개선, 콜드스타트 단축 기대","regions":"Lambda가 제공되는 모든 AWS 리전","status":["정식 출시"]}' },
  // GCP: multi-product date-based entry
  { role: 'user', content: 'Title: March 27, 2026\nDescription: Cloud Composer: Cloud Composer 2 environments can no longer be created in Melbourne (australia-southeast2). Compute Engine: A vulnerability (CVE-2026-23268) has been addressed.' },
  { role: 'assistant', content: '{"title":"2026년 3월 27일: Cloud Composer 외 1건","summary":"Cloud Composer 2가 Melbourne 리전에서 더 이상 생성할 수 없게 되면서 Cloud Composer 3으로 전환이 필요합니다. Compute Engine에서는 CVE-2026-23268 보안 취약점이 패치되었습니다.","target":"australia-southeast2 리전에서 Cloud Composer를 운영 중인 데이터 엔지니어","features":"Melbourne 리전 Composer 2 생성 중단, CVE-2026-23268 패치 적용, Composer 3 전환 필요","regions":"australia-southeast2, 모든 리전","status":["정식 출시"]}' },
  // Azure: preview status from description — title tag goes to status field
  { role: 'user', content: 'Title: [Preview] Azure Cosmos DB continuous backup for analytical store\nDescription: Azure Cosmos DB now supports continuous backup and point-in-time restore for analytical store data. This feature is currently in public preview.' },
  { role: 'assistant', content: '{"title":"Azure Cosmos DB 분석 저장소 연속 백업 지원","summary":"Azure Cosmos DB 분석 저장소에서 연속 백업과 특정 시점 복원이 가능해졌습니다. 분석 워크로드의 데이터 보호가 한층 강화됩니다.","target":"Azure Cosmos DB 분석 저장소를 운영하는 데이터 엔지니어","features":"분석 저장소 연속 백업, 특정 시점 복원, 데이터 보호 강화","regions":"모든 Azure 퍼블릭 리전","status":["미리보기"]}' },
];

const DEFAULT_QUEUE_LANG = 'ko';
const RETRY_BASE_DELAY_SECONDS = 30;
const FETCH_CRONS = new Set(['0,15,30,45 * * * *']);
let translationJobStateReady = false;

const REGION_DISPLAY_MAP = {
  aws: {
    'Asia Pacific (New Zealand)': '아시아 태평양(뉴질랜드) 리전',
    'Asia Pacific (Tokyo)': '아시아 태평양(도쿄) 리전',
    'Asia Pacific (Seoul)': '아시아 태평양(서울) 리전',
    'Asia Pacific (Osaka)': '아시아 태평양(오사카) 리전',
    'Asia Pacific (Sydney)': '아시아 태평양(시드니) 리전',
    'Asia Pacific (Melbourne)': '아시아 태평양(멜버른) 리전',
    'Asia Pacific (Jakarta)': '아시아 태평양(자카르타) 리전',
    'Asia Pacific (Mumbai)': '아시아 태평양(뭄바이) 리전',
    'Asia Pacific (Hong Kong)': '아시아 태평양(홍콩) 리전',
    'Asia Pacific (Singapore)': '아시아 태평양(싱가포르) 리전',
    'Europe (Ireland)': '유럽(아일랜드) 리전',
    'Europe (London)': '유럽(런던) 리전',
    'Europe (Frankfurt)': '유럽(프랑크푸르트) 리전',
    'Europe (Paris)': '유럽(파리) 리전',
    'Europe (Stockholm)': '유럽(스톡홀름) 리전',
    'Europe (Zurich)': '유럽(취리히) 리전',
    'US East (N. Virginia)': '미국 동부(버지니아 북부) 리전',
    'US East (Ohio)': '미국 동부(오하이오) 리전',
    'US West (Oregon)': '미국 서부(오리건) 리전',
    'US West (N. California)': '미국 서부(캘리포니아 북부) 리전',
    'South America (Sao Paulo)': '남아메리카(상파울루) 리전',
    'Middle East (UAE)': '중동(UAE) 리전',
    'Middle East (Bahrain)': '중동(바레인) 리전',
    'Africa (Cape Town)': '아프리카(케이프타운) 리전',
    'Canada (Central)': '캐나다(중부) 리전',
  },
  gcp: {
    'asia-northeast3': '서울 리전',
    'asia-northeast1': '도쿄 리전',
    'asia-southeast1': '싱가포르 리전',
    'australia-southeast1': '시드니 리전',
    'australia-southeast2': '멜버른 리전',
    'us': 'US 멀티 리전',
    'eu': 'EU 멀티 리전',
  },
  azure: {
    'New Zealand North': '뉴질랜드 북부',
    'Korea Central': '한국 중부',
    'Korea South': '한국 남부',
    'Japan East': '일본 동부',
    'Japan West': '일본 서부',
    'Australia East': '오스트레일리아 동부',
    'Australia Southeast': '오스트레일리아 남동부',
    'Denmark East': '덴마크 동부',
    'Denmark West': '덴마크 서부',
    'East US': '미국 동부',
    'East US 2': '미국 동부 2',
    'West US': '미국 서부',
    'West US 2': '미국 서부 2',
    'West US 3': '미국 서부 3',
    'North Europe': '북유럽',
    'West Europe': '서유럽',
  },
};

const VENDOR_REGION_GUIDE = {
  aws: [
    'For AWS, prefer the Korean naming style used on AWS Korea pages, for example Asia Pacific (New Zealand) -> 아시아 태평양(뉴질랜드) 리전 and US East (Ohio) -> 미국 동부(오하이오) 리전.',
    'If the source says all AWS Regions, output regions as 모든 AWS 리전.',
  ],
  gcp: [
    'For Google Cloud, prefer natural Korean region names such as asia-northeast3 -> 서울 리전 and asia-northeast1 -> 도쿄 리전.',
    'If a region code appears in the source, you may mention the Korean region name in title/summary and should avoid awkward raw-code-only phrasing in user-facing copy.',
    'Use rough geographic labels only when the source itself uses multi-region labels such as us or eu, and write them as US 멀티 리전 or EU 멀티 리전.',
    'If the source says all regions or does not specify a region, output regions as 모든 리전. Do not invent abbreviations such as APNZ.',
  ],
  azure: [
    'For Azure, prefer the official Korean display names used on Microsoft Learn, for example New Zealand North -> 뉴질랜드 북부 and Korea South -> 한국 남부.',
    'If the source says all public Azure regions, output regions as 모든 Azure 퍼블릭 리전.',
  ],
};

const VENDOR_REGION_EXAMPLES = {
  aws: [
    'EXAMPLE: Source mentions "Asia Pacific (New Zealand)" -> title can use "아시아 태평양(뉴질랜드) 리전에서 사용 가능", regions should be "아시아 태평양(뉴질랜드) 리전".',
    'EXAMPLE: Source mentions "Asia Pacific (Seoul)" -> use "아시아 태평양(서울) 리전", not "AWS 아시아 태평양(서울) 리전".',
    'EXAMPLE: Source mentions "all AWS Regions" -> regions should be "모든 AWS 리전".',
  ],
  gcp: [
    'EXAMPLE: Source mentions "asia-northeast3" -> use "서울 리전".',
    'EXAMPLE: Source mentions "asia-northeast1" -> use "도쿄 리전".',
    'EXAMPLE: Source mentions "asia-southeast1" -> use "싱가포르 리전".',
    'EXAMPLE: Source mentions "australia-southeast1" -> use "시드니 리전".',
    'EXAMPLE: Source mentions "US and EU multi-regions" -> regions should be "US 멀티 리전, EU 멀티 리전".',
    'EXAMPLE: Source mentions "available in all regions" -> regions should be "모든 리전".',
  ],
  azure: [
    'EXAMPLE: Source mentions "New Zealand North" -> use the Korean display name "뉴질랜드 북부".',
    'EXAMPLE: Source mentions "Korea Central and Korea South" -> regions should be "한국 중부, 한국 남부".',
    'EXAMPLE: Source mentions "all public Azure regions" -> regions should be "모든 Azure 퍼블릭 리전".',
  ],
};

const TRANSLATION_JSON_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      title: { type: 'string' },
      summary: { type: 'string' },
      target: { type: 'string' },
      features: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 3 },
        ],
      },
      regions: {
        oneOf: [
          { type: 'string' },
          { type: 'array', items: { type: 'string' } },
        ],
      },
      status: {
        type: 'array',
        items: { type: 'string' },
      },
    },
    required: ['title', 'summary', 'target', 'features', 'regions', 'status'],
  },
};

const QUALITY_REVIEW_JSON_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      pass: { type: 'boolean' },
      reasons: {
        type: 'array',
        items: { type: 'string' },
      },
      suggested_title: { type: 'string' },
      suggested_summary: { type: 'string' },
    },
    required: ['pass', 'reasons', 'suggested_title', 'suggested_summary'],
  },
};

const QUALITY_REVIEW_PROMPT = `You are a Korean editor reviewing cloud release-note cards before they are shown to users.

GOAL:
- Catch broken or awkward Korean cards that would look untrustworthy in production.
- Focus on title completeness, natural Korean, and stray markdown or unfinished English fragments.
- Prefer the official Korean region naming style used by each vendor's Korean documentation.

FAIL if any of these are true:
- The title looks truncated, incomplete, or cuts a product/service name.
- The summary contains stray markdown/code tokens such as _workflow_, **, or backticks.
- The summary reads like literal machine translation and would look awkward to Korean engineers.
- The title is too vague, mirrors the English title too closely, or the summary mostly repeats the title.
- The summary is not exactly two Korean sentences.
- The regions field uses made-up shorthand or mixes inconsistent region naming styles.

EDITING RULES:
- Keep product names, service names, versions, region codes, dates, and numbers unchanged.
- Do not add new facts.
- Remove status labels like Preview/GA from the title unless they are essential; status belongs elsewhere.
- If a small copy edit can fix the card, provide suggested_title and/or suggested_summary.
- suggested_summary must still be exactly two sentences.
- If the card is already good, set pass=true and leave suggestions empty.

Return JSON only.`;

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function getEnvInt(env, key, fallback, min = 1, max = 200) {
  const value = parseInt(env[key] || '', 10);
  if (Number.isNaN(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}

function parseRSS(xml, csp) {
  const items = [];
  const isAtom = !xml.includes('<item>') && xml.includes('<entry>');
  const tag = isAtom ? 'entry' : 'item';
  const regex = new RegExp(`<${tag}>[\\s\\S]*?</${tag}>`, 'g');
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[0];
    const get = (t) => {
      const m = block.match(new RegExp(`<${t}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?</${t}>`));
      return m ? m[1].trim() : '';
    };
    const url = isAtom
      ? ((block.match(/<link[^>]*href="([^"]*)"/) || [])[1] || '')
      : (get('link') || get('guid'));
    const rawDate = get('pubDate') || get('updated') || get('published') || '';
    const pubDate = rawDate ? new Date(rawDate).toISOString() : '';
    const rawContent = isAtom ? get('content') : get('description');
    const rawTitle = decodeEntities(get('title').replace(/<[^>]+>/g, ''));

    // GCP: split by product title (<h2 class="release-note-product-title">)
    if (csp === 'gcp' && rawContent.includes('release-note-product-title')) {
      const sections = rawContent.split(/<h2[^>]*class="release-note-product-title"[^>]*>/);
      for (let i = 1; i < sections.length; i++) {
        const endH2 = sections[i].indexOf('</h2>');
        if (endH2 < 0) continue;
        const productName = decodeEntities(sections[i].slice(0, endH2).replace(/<[^>]+>/g, '').trim());
        const body = sections[i].slice(endH2 + 5).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1500);
        items.push({ csp, title: productName, description: body, url, pub_date: pubDate });
      }
    } else {
      items.push({
        csp,
        title: rawTitle,
        description: rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000),
        url,
        pub_date: pubDate,
      });
    }
  }
  return items;
}

async function fetchRSS(env) {
  let totalNew = 0;
  const jobs = [];
  for (const [csp, url] of Object.entries(RSS_FEEDS)) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'CloudWhatsNew/2.0' }, redirect: 'follow' });
      if (!resp.ok) continue;
      const xml = await resp.text();
      if (!xml.includes('<')) continue;
      const items = parseRSS(xml, csp).slice(0, 100);
      for (const item of items) {
        if (!item.url && !item.title) continue;
        // Insert into articles (source of truth)
        const r = await env.DB.prepare(
          'INSERT OR IGNORE INTO articles (csp, url, title_en, description_en, pub_date) VALUES (?,?,?,?,?)'
        ).bind(csp, item.url || '', item.title, item.description, item.pub_date).run();
        if (r.meta.changes > 0) totalNew++;
        // Always ensure English localized_content exists
        const row = await env.DB.prepare('SELECT id FROM articles WHERE csp=? AND url=? AND title_en=?').bind(csp, item.url || '', item.title).first();
        if (row) {
          if (r.meta.changes > 0) {
            jobs.push({ articleId: row.id, lang: DEFAULT_QUEUE_LANG, reason: 'new' });
          }
          await env.DB.prepare(
            'INSERT OR IGNORE INTO localized_content (article_id, csp, lang, url, pub_date, title, summary, status) VALUES (?,?,?,?,?,?,?,?)'
          ).bind(row.id, csp, 'en', item.url || '', item.pub_date, item.title, item.description, '').run();
        }
      }
    } catch (e) {
      console.error(`${csp} fetch error:`, e.message);
    }
  }
  const queued = await enqueueTranslationJobs(env, jobs);
  if (jobs.length > 0 && queued === 0) {
    console.error(`Failed to enqueue ${jobs.length} translation jobs`);
  }
  return { newArticles: totalNew, queued };
}

function safeParseJSON(text) {
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}') + 1;
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(clean.slice(start, end)); } catch { return null; }
}

function calculateRetryDelay(attempts, baseDelay = RETRY_BASE_DELAY_SECONDS, maxDelay = 300) {
  return Math.min(baseDelay * Math.max(1, attempts), maxDelay);
}

function parseAIResponse(aiResp) {
  if (!aiResp) return null;
  if (aiResp.response && typeof aiResp.response === 'object') return aiResp.response;
  if (typeof aiResp.response === 'string') return safeParseJSON(aiResp.response);
  if (typeof aiResp === 'string') return safeParseJSON(aiResp);
  return null;
}

function normalizeShortList(value, maxItems = 3) {
  const items = Array.isArray(value)
    ? value
    : String(value || '').split(',');
  return items
    .map(item => String(item || '').trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function mapRegionDisplayName(value, csp) {
  const text = String(value || '').trim();
  if (!text) return '';
  const vendorMap = REGION_DISPLAY_MAP[csp] || {};
  return vendorMap[text] || text;
}

function normalizeRegionsField(value, csp) {
  const items = normalizeShortList(value, 10).map(item => mapRegionDisplayName(item, csp));
  const joined = items.join(', ').trim();
  const lower = joined.toLowerCase();

  if (!joined || lower === 'all' || lower === 'global' || joined === '모든 리전') {
    if (csp === 'aws') return '모든 AWS 리전';
    if (csp === 'azure') return '모든 Azure 퍼블릭 리전';
    return '모든 리전';
  }

  if (/all aws regions|where .*aws/i.test(joined)) return '모든 AWS 리전';
  if (/all public azure regions|all azure regions/i.test(joined)) return '모든 Azure 퍼블릭 리전';
  if (/all regions/i.test(joined)) {
    if (csp === 'aws') return '모든 AWS 리전';
    if (csp === 'azure') return '모든 Azure 퍼블릭 리전';
    return '모든 리전';
  }

  return joined
    .replace(/\bAPNZ\b/g, csp === 'aws' ? '아시아 태평양(뉴질랜드) 리전' : '뉴질랜드 리전')
    .replace(/\s{2,}/g, ' ')
    .trim();
}


// Extract product names, versions, regions, dates from source text
function extractEntities(title, description) {
  const source = `${title} ${description}`;
  const entities = { products: [], versions: [], regions: [], dates: [] };

  // Product names: capitalized multi-word patterns (Amazon X, AWS X, Azure X, Google X, Cloud X)
  const productPatterns = source.match(/(?:Amazon|AWS|Azure|Google|Cloud|Microsoft)[\s]+[A-Z][A-Za-z0-9\s\-\.]+(?=[,\.\s]|$)/g) || [];
  entities.products = [...new Set(productPatterns.map(p => p.trim()))].slice(0, 5);

  // Also grab standalone product names from title
  const titleProducts = title.match(/[A-Z][A-Za-z0-9]+(?:\s+[A-Z][A-Za-z0-9]+)+/g) || [];
  for (const tp of titleProducts) {
    if (!entities.products.some(p => p.includes(tp))) entities.products.push(tp);
  }
  entities.products = entities.products.slice(0, 5);

  // Versions: X.Y or X.Y.Z patterns
  entities.versions = [...new Set((source.match(/\b\d+\.\d+(?:\.\d+)?\b/g) || []))].slice(0, 5);

  // Region names: "Asia Pacific (X)", "US East (X)", etc.
  entities.regions = [...new Set((source.match(/(?:Asia Pacific|US (?:East|West)|Europe|Canada|South America|Middle East|Africa|ap-|us-|eu-|ca-|sa-|me-|af-)[\w\s\(\)\-]*/g) || []).map(r => r.trim()))].slice(0, 5);

  // Dates
  entities.dates = [...new Set((source.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/g) || []))].slice(0, 3);

  return entities;
}

function buildVendorPromptHints(row) {
  const lines = [
    'REGION WRITING RULES:',
    '- Never invent abbreviations such as APNZ, USE1, EUW, or similar shorthand.',
    '- Keep actual region codes like us-east-1 or ap-northeast-2 unchanged only when the source explicitly uses region codes.',
    '- For marketing region names, use natural Korean display labels in titles and summaries.',
    '- In the regions field, use one clear convention: a vendor-wide all-region label or an exact comma-separated region list.',
  ];
  for (const hint of (VENDOR_REGION_GUIDE[row.csp] || [])) {
    lines.push(`- ${hint}`);
  }
  const examples = VENDOR_REGION_EXAMPLES[row.csp] || [];
  if (examples.length) {
    lines.push('REGION STYLE EXAMPLES:');
    for (const example of examples) {
      lines.push(`- ${example}`);
    }
  }
  const source = `${row.title_en || ''} ${(row.description_en || '').slice(0, 800)}`;
  const matched = Object.entries(REGION_DISPLAY_MAP[row.csp] || {})
    .filter(([name]) => source.includes(name))
    .slice(0, 6);
  if (matched.length) {
    lines.push('REGION DISPLAY HINTS:');
    for (const [name, ko] of matched) {
      lines.push(`- ${name} => ${ko}`);
    }
  }
  // Entity pinning
  const entities = extractEntities(row.title_en, (row.description_en || '').slice(0, 800));
  if (entities.products.length) {
    lines.push('MUST KEEP ENTITIES (reproduce exactly, never abbreviate or translate):');
    for (const p of entities.products) lines.push(`- Product: ${p}`);
    for (const v of entities.versions) lines.push(`- Version: ${v}`);
    for (const r of entities.regions) lines.push(`- Region: ${r}`);
    for (const d of entities.dates) lines.push(`- Date: ${d}`);
  }
  return lines.join('\n');
}

function countSentences(text) {
  return String(text || '')
    .split(/[.!?。]+/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function hasUnbalancedBrackets(text) {
  const pairs = [['(', ')'], ['[', ']']];
  return pairs.some(([open, close]) => {
    const opens = (text.match(new RegExp(`\\${open}`, 'g')) || []).length;
    const closes = (text.match(new RegExp(`\\${close}`, 'g')) || []).length;
    return opens !== closes;
  });
}

function hasMarkdownArtifacts(text) {
  return /_[A-Za-z0-9-]+_|\*\*|`/.test(String(text || ''));
}

function hasDanglingTitleFragment(title) {
  const value = String(title || '').trim();
  return /(?:\s|\/|-)[A-Za-z]$/.test(value)
    || /[(:\-\/]$/.test(value)
    || hasUnbalancedBrackets(value);
}


// Deterministic post-processing: fix common LLM issues without another AI call
function applyDeterministicFixes(record, row) {
  let { title, summary, target, features, regions, status } = record;
  const entities = extractEntities(row.title_en, (row.description_en || '').slice(0, 800));

  // Fix 1: Strip markdown artifacts
  const stripMd = (s) => s.replace(/[*#`_~]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/\s+/g, ' ').trim();
  title = stripMd(title);
  summary = stripMd(summary);

  // Fix 2: Entity preservation check — if product name truncated, use original
  for (const product of entities.products) {
    // Check if product name appears truncated in title
    const words = product.split(/\s+/);
    if (words.length >= 2) {
      const partial = words.slice(0, -1).join(' ');
      if (title.includes(partial) && !title.includes(product)) {
        title = title.replace(partial, product);
      }
    }
  }

  // Fix 3: Summary repeats title — remove first sentence if it's too similar
  const titleNorm = title.replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();
  const summaryFirst = summary.split(/[.。!]/)[0] || '';
  const summaryFirstNorm = summaryFirst.replace(/[^가-힣a-zA-Z0-9]/g, '').toLowerCase();
  if (titleNorm && summaryFirstNorm && titleNorm.length > 10) {
    // Jaccard similarity on character bigrams
    const bigrams = (s) => { const b = new Set(); for (let i = 0; i < s.length - 1; i++) b.add(s.slice(i, i+2)); return b; };
    const tb = bigrams(titleNorm), sb = bigrams(summaryFirstNorm);
    const intersection = [...tb].filter(x => sb.has(x)).length;
    const union = new Set([...tb, ...sb]).size;
    if (union > 0 && intersection / union > 0.6) {
      // Remove first sentence from summary
      const rest = summary.slice(summaryFirst.length).replace(/^[.。!\s]+/, '').trim();
      if (rest.length > 20) summary = rest;
    }
  }

  // Fix 4: Features — strip product-name-only items
  const featList = features.split(',').map(f => f.trim()).filter(f => {
    // Keep if it contains a Korean verb/action word or is longer than just a product name
    return f.length > 5 && !/^[A-Z][A-Za-z0-9\s\.\-]+$/.test(f);
  });
  if (featList.length >= 2) features = featList.slice(0, 3).join(', ');

  return { title, summary, target, features, regions, status };
}

function assessTranslationQuality(record, row) {
  const reasons = [];
  const title = String(record.title || '').trim();
  const summary = String(record.summary || '').trim();
  const target = String(record.target || '').trim();
  const features = normalizeShortList(record.features);

  if (!title || !summary) reasons.push('missing-core-fields');
  if (hasDanglingTitleFragment(title)) reasons.push('title-truncated');
  if (hasMarkdownArtifacts(title) || hasMarkdownArtifacts(summary)) reasons.push('markdown-artifact');
  if (title === row.title_en) reasons.push('title-not-translated');
  if (summary.length < 30) reasons.push('summary-too-short');
  if (countSentences(summary) !== 2) reasons.push('summary-not-two-sentences');
  if (summary.slice(0, 24) === title.slice(0, 24)) reasons.push('summary-repeats-title');
  if (!target || target === 'all') reasons.push('target-too-generic');
  if (features.length < 2) reasons.push('features-too-thin');

  return {
    pass: reasons.length === 0,
    reasons,
  };
}

function applyQualitySuggestions(record, review) {
  const next = { ...record };
  const suggestedTitle = String(review?.suggested_title || '').trim();
  const suggestedSummary = String(review?.suggested_summary || '').trim();

  if (suggestedTitle) {
    next.title = suggestedTitle
      .replace(/\s*[\[\(](?:Launched|Preview|Retired|In development|Generally Available|정식 출시|미리보기|베타|지원 종료|GA|출시)[\]\)]\s*/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (suggestedSummary) {
    next.summary = suggestedSummary.replace(/\s+/g, ' ').trim();
  }

  return next;
}

async function reviewTranslationQualityWithAI(env, row, record) {
  const reviewInput = JSON.stringify({
    original_title: row.title_en,
    original_description: String(row.description_en || '').slice(0, 1500),
    region_guidance: buildVendorPromptHints(row),
    translated: { title: record.title, summary: record.summary, target: record.target, features: record.features, regions: record.regions, status: record.status },
  });
  try {
    const aiResp = await env.AI.run(REVIEW_MODEL, {
      messages: [{ role: 'system', content: REVIEW_PROMPT }, { role: 'user', content: reviewInput }],
      max_tokens: 384, temperature: 0.1,
    });
    const parsed = parseAIResponse(aiResp);
    if (!parsed || parsed.pass === true) return { pass: true, reasons: [], record };
    const fixed = { ...record };
    if (parsed.title) fixed.title = parsed.title.replace(/\s*[\[\(](?:Launched|Preview|Retired|GA|정식 출시|미리보기|베타|지원 종료)[\]\)]\s*/gi, ' ').replace(/\s+/g, ' ').trim();
    if (parsed.status) fixed.status = JSON.stringify(Array.isArray(parsed.status) ? parsed.status : [parsed.status]);
    if (parsed.regions) fixed.regions = typeof parsed.regions === 'string' ? parsed.regions : normalizeRegionsField(parsed.regions, row.csp);
    if (parsed.target) fixed.target = parsed.target;
    if (parsed.features) fixed.features = normalizeShortList(parsed.features).join(', ');
    return { pass: true, reasons: ['reviewer-applied-edit'], record: fixed };
  } catch (e) {
    console.error('review error:', e.message);
    return { pass: true, reasons: ['review-error'], record };
  }
}

async function ensureTranslationJobStateTable(env) {
  if (translationJobStateReady) return;
  await env.DB.prepare(`
    CREATE TABLE IF NOT EXISTS translation_job_state (
      article_id INTEGER NOT NULL,
      lang TEXT NOT NULL,
      reason TEXT,
      updated_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (article_id, lang)
    )
  `).run();
  await env.DB.prepare(`
    CREATE INDEX IF NOT EXISTS idx_translation_job_state_updated_at
    ON translation_job_state(updated_at)
  `).run();
  translationJobStateReady = true;
}

async function claimTranslationJobs(env, jobs) {
  await ensureTranslationJobStateTable(env);
  const claimed = [];
  for (const job of jobs) {
    const alreadyLocalized = await hasLocalizedContent(env, job.articleId, job.lang);
    if (alreadyLocalized) continue;

    const result = await env.DB.prepare(`
      INSERT OR IGNORE INTO translation_job_state (article_id, lang, reason, updated_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(job.articleId, job.lang, job.reason || 'backlog').run();

    if (result.meta.changes > 0) {
      claimed.push(job);
    }
  }
  return claimed;
}

async function releaseTranslationJobs(env, jobs) {
  await ensureTranslationJobStateTable(env);
  for (const job of jobs) {
    await env.DB.prepare(`
      DELETE FROM translation_job_state
      WHERE article_id = ? AND lang = ?
    `).bind(job.articleId, job.lang).run();
  }
}

async function touchTranslationJob(env, articleId, lang, reason) {
  await ensureTranslationJobStateTable(env);
  await env.DB.prepare(`
    INSERT INTO translation_job_state (article_id, lang, reason, updated_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(article_id, lang) DO UPDATE SET
      reason = excluded.reason,
      updated_at = datetime('now')
  `).bind(articleId, lang, reason).run();
}

async function enqueueTranslationJobs(env, jobs, options = {}) {
  if (!env.TRANSLATION_QUEUE || !jobs.length) return 0;
  const skipClaim = !!options.skipClaim;
  const candidateJobs = skipClaim ? jobs : await claimTranslationJobs(env, jobs);
  let queued = 0;
  try {
    for (let i = 0; i < candidateJobs.length; i += 100) {
      const chunk = candidateJobs.slice(i, i + 100);
      const batch = chunk.map((job) => ({ body: job }));
      await env.TRANSLATION_QUEUE.sendBatch(batch);
      queued += batch.length;
    }
  } catch (e) {
    if (!skipClaim) {
      await releaseTranslationJobs(env, candidateJobs);
    }
    console.error(`Failed to enqueue translation jobs: ${e.message}`);
    throw e;
  }
  return queued;
}

async function enqueueArticleTranslations(env, articleIds, lang = DEFAULT_QUEUE_LANG, reason = 'backlog') {
  const jobs = articleIds
    .map((articleId) => ({ articleId, lang, reason }))
    .filter((job) => !!job.articleId);
  return enqueueTranslationJobs(env, jobs);
}

async function getArticleForTranslation(env, articleId) {
  return env.DB.prepare(`
    SELECT a.id, a.csp, a.url, a.pub_date, a.title_en, a.description_en
    FROM articles a
    WHERE a.id = ?
  `).bind(articleId).first();
}

async function hasLocalizedContent(env, articleId, lang) {
  const row = await env.DB.prepare(`
    SELECT 1 as found
    FROM localized_content
    WHERE article_id = ? AND lang = ?
    LIMIT 1
  `).bind(articleId, lang).first();
  return !!row?.found;
}

function getTranslationExecutionOptions(reason = 'backlog') {
  if (reason === 'quality_retry') {
    return { modelUsed: 'cf-qwen3-30b-reviewed', allowLowQuality: true, model: PRIMARY_MODEL };
  }
  if (reason === 'manual') {
    return { modelUsed: 'manual', allowLowQuality: false, model: PRIMARY_MODEL };
  }
  return { modelUsed: 'cf-qwen3-30b', allowLowQuality: false, model: PRIMARY_MODEL };
}

async function buildTranslationRecord(env, row, hint = '', model = PRIMARY_MODEL) {
  const titleForLLM = row.title_en.length < 20
    ? `${row.title_en}: ${(row.description_en || '').slice(0, 100)}`
    : row.title_en;
  const userMsg = `${buildVendorPromptHints(row)}\n\nTitle: ${titleForLLM}\nDescription: ${(row.description_en || '').slice(0, 1500)}`;
  const sysPrompt = hint ? `${SYSTEM_PROMPT}\n\n=== 용어 사전 ===\n${hint}` : SYSTEM_PROMPT;
  const aiResp = await env.AI.run(model, {
    messages: [{ role: 'system', content: sysPrompt }, ...FEW_SHOT, { role: 'user', content: userMsg }],
    response_format: TRANSLATION_JSON_SCHEMA,
    max_tokens: 768, temperature: 0.1,
  });
  const parsed = parseAIResponse(aiResp);
  if (!parsed || !parsed.title) return null;
  let cleanTitle = parsed.title
    .replace(/\s*[\[\(](?:Launched|Preview|Retired|In development|Generally Available|정식 출시|미리보기|베타|지원 종료|GA|출시)[\]\)]\s*/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const feat = normalizeShortList(parsed.features).join(', ');
  const reg = normalizeRegionsField(parsed.regions, row.csp);
  const VALID_STATUS = ['정식 출시', '미리보기', '베타', '지원 종료'];
  const rawStatus = Array.isArray(parsed.status) ? parsed.status : [parsed.status || ''];
  const cleanStatus = [...new Set(rawStatus.flatMap(s => {
    for (const v of VALID_STATUS) { if (s.includes(v)) return [v]; }
    return [];
  }))];
  const stat = JSON.stringify(cleanStatus.length ? cleanStatus : ['정식 출시']);
  const record = {
    title: cleanTitle,
    summary: parsed.summary || '',
    target: parsed.target || 'all',
    features: feat,
    regions: reg,
    status: stat,
  };
  return record;
}

async function validateTranslationRecord(env, row, record, options = {}) {
  const allowLowQuality = !!options.allowLowQuality;
  // Apply deterministic post-processing fixes
  const fixed = applyDeterministicFixes(record, row);
  const quality = assessTranslationQuality(fixed, row);
  if (!quality.pass && !allowLowQuality) {
    return { ok: false, needsRetry: true, reasons: quality.reasons, quality, record: fixed };
  }
  return { ok: true, quality, record: fixed };
}

async function persistTranslationRecord(env, row, record, modelUsed) {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO localized_content (article_id, csp, lang, url, pub_date, title, summary, target, features, regions, status, model_used) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(row.id, row.csp, 'ko', row.url, row.pub_date, record.title, record.summary,
         record.target, record.features, record.regions, record.status, modelUsed).run();
}

async function runTranslationPipeline(env, row, reason = 'backlog', hint = '') {
  const options = getTranslationExecutionOptions(reason);
  const record = await buildTranslationRecord(env, row, hint, options.model);
  if (!record) {
    return { ok: false, needsRetry: false };
  }
  // Deterministic fixes
  const fixed = applyDeterministicFixes(record, row);
  // AI review with different model — checks title, status, regions
  const reviewed = await reviewTranslationQualityWithAI(env, row, fixed);
  // Final quality gate
  const quality = assessTranslationQuality(reviewed.record, row);
  if (!quality.pass && !options.allowLowQuality) {
    return { ok: false, needsRetry: true, reasons: quality.reasons, quality, record: reviewed.record };
  }
  await persistTranslationRecord(env, row, reviewed.record, options.modelUsed);
  return { ok: true, quality };
}

async function queueArticleRetranslation(env, articleId, lang = DEFAULT_QUEUE_LANG, reason = 'manual', hint = '') {
  const row = await getArticleForTranslation(env, articleId);
  if (!row) return { found: false, queued: 0 };
  await releaseTranslationJobs(env, [{ articleId, lang }]);
  await env.DB.prepare('DELETE FROM localized_content WHERE article_id = ? AND lang = ?').bind(articleId, lang).run();
  const queued = await enqueueTranslationJobs(env, [{ articleId, lang, reason, hint }]);
  return { found: true, queued };
}

async function enqueueMissingTranslations(env, lang = DEFAULT_QUEUE_LANG, limit = 25) {
  const rows = await env.DB.prepare(`
    SELECT a.id
    FROM articles a
    WHERE NOT EXISTS (
      SELECT 1 FROM localized_content lc
      WHERE lc.article_id = a.id AND lc.lang = ?
    )
    ORDER BY a.created_at DESC
    LIMIT ?
  `).bind(lang, limit).all();
  const jobs = rows.results.map((row) => ({ articleId: row.id, lang, reason: 'backlog' }));
  return enqueueTranslationJobs(env, jobs);
}

async function getMissingTranslationCount(env, lang = 'ko') {
  const row = await env.DB.prepare(`
    SELECT count(*) as missing
    FROM articles a
    WHERE NOT EXISTS (
      SELECT 1 FROM localized_content lc
      WHERE lc.article_id = a.id AND lc.lang = ?
    )
  `).bind(lang).first();
  return row?.missing || 0;
}

export default {
  async scheduled(event, env, ctx) {
    await ensureTranslationJobStateTable(env);
    const backlogQueueBatchSize = getEnvInt(env, 'BACKLOG_QUEUE_BATCH_SIZE', 25);
    if (FETCH_CRONS.has(event.cron)) {
      // quarter-hour fetch RSS + cleanup
      const n = await fetchRSS(env);
      await env.DB.prepare("DELETE FROM localized_content WHERE article_id IN (SELECT id FROM articles WHERE pub_date < datetime('now', '-30 days'))").run();
      await env.DB.prepare("DELETE FROM articles WHERE pub_date < datetime('now', '-30 days')").run();
      await env.DB.prepare(`
        DELETE FROM translation_job_state
        WHERE updated_at < datetime('now', '-2 hours')
      `).run();
      const backlog = await getMissingTranslationCount(env, 'ko');
      console.log(`Fetch cron — ${n.newArticles} new articles, ${n.queued} queued immediately, ${backlog} waiting for ko`);
      // Alert on consecutive empty fetches
      const webhookUrl = env.ALERT_WEBHOOK_URL;
      if (webhookUrl && n.newArticles === 0) {
        const prev = await env.DB.prepare("SELECT count(*) as c FROM articles WHERE created_at > datetime('now', '-3 hours')").first();
        if (prev && prev.c === 0) {
          await fetch(webhookUrl, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: `⚠️ What's New: 3시간 연속 새 기사 없음. RSS 피드 확인 필요.` }),
          }).catch(() => {});
        }
      }
    } else {
      // queue backlog articles for translation
      const queued = await enqueueMissingTranslations(env, 'ko', backlogQueueBatchSize);
      // Backstop quality check for already-saved low quality translations (max 5 per run)
      const bad = await env.DB.prepare(`
        SELECT a.id, a.csp, a.url, a.pub_date, a.title_en, a.description_en FROM localized_content lc
        JOIN articles a ON lc.article_id = a.id
        WHERE lc.lang = 'ko' AND lc.model_used NOT IN ('manual', 'cf-qwen3-30b-reviewed') AND (
          lc.title LIKE '%.graphics%'
          
          OR lc.title GLOB '* [A-Za-z]'
          OR lc.title GLOB '*[(/-]'
          OR lc.title = a.title_en
          OR substr(lc.summary, 1, 20) = substr(lc.title, 1, 20)
          OR length(lc.summary) < 30
          OR lc.summary LIKE '%_workflow_%'
          OR lc.summary LIKE '%**%'
          OR lc.summary LIKE '%\`%'
          OR (lc.status LIKE '%정식 출시%' AND (lc.summary LIKE '%preview%' OR lc.summary LIKE '%미리보기%'))
          OR lc.title LIKE '%and 및%'
        ) LIMIT 5
      `).all();
      const retryIds = [];
      for (const row of bad.results) {
        await env.DB.prepare("DELETE FROM localized_content WHERE article_id = ? AND lang = 'ko'").bind(row.id).run();
        retryIds.push(row.id);
      }
      const retried = await enqueueArticleTranslations(env, retryIds, 'ko', 'quality_retry');
      const backlog = await getMissingTranslationCount(env, 'ko');
      console.log(`Cron — ${queued} queued for translation, ${retried} quality-retried, ${backlog} waiting for ko`);
    }
  },
  async queue(batch, env, ctx) {
    await ensureTranslationJobStateTable(env);
    for (const msg of batch.messages) {
      const articleId = msg.body?.articleId;
      const lang = msg.body?.lang || DEFAULT_QUEUE_LANG;
      const reason = msg.body?.reason || 'backlog';
      const hint = msg.body?.hint || '';

      if (!articleId || !lang) {
        msg.ack();
        continue;
      }

      try {
        await touchTranslationJob(env, articleId, lang, reason);
        if (await hasLocalizedContent(env, articleId, lang)) {
          await releaseTranslationJobs(env, [{ articleId, lang }]);
          msg.ack();
          continue;
        }

        const row = await getArticleForTranslation(env, articleId);
        if (!row) {
          await releaseTranslationJobs(env, [{ articleId, lang }]);
          msg.ack();
          continue;
        }

        const result = await runTranslationPipeline(env, row, reason, hint);
        if (result?.ok) {
          await releaseTranslationJobs(env, [{ articleId, lang }]);
          msg.ack();
          continue;
        }

        if (result?.needsRetry && reason !== 'quality_retry') {
          const qualityHint = (result.reasons || []).map(r => {
            if (r === 'summary-repeats-title') return '요약 첫 문장이 제목과 달라야 함';
            if (r === 'title-not-translated') return '제목을 한국어로 번역해야 함';
            if (r === 'title-truncated') return '제목이 잘리지 않게 완성해야 함';
            if (r === 'markdown-artifact') return '마크다운(** ` 등) 제거';
            if (r === 'summary-not-two-sentences') return '요약은 정확히 2문장';
            if (r === 'target-too-generic') return '대상을 구체적으로 작성';
            return r;
          }).join('. ');
          await touchTranslationJob(env, articleId, lang, 'quality_retry');
          await enqueueTranslationJobs(env, [{ articleId, lang, reason: 'quality_retry', hint: qualityHint }], { skipClaim: true });
          msg.ack();
          continue;
        }

        msg.retry({ delaySeconds: calculateRetryDelay(msg.attempts || 0) });
      } catch (e) {
        console.error(`queue translate error for article ${articleId}:`, e.message);
        msg.retry({ delaySeconds: calculateRetryDelay(msg.attempts || 0) });
      }
    }
  },
  async fetch(request, env) {
    await ensureTranslationJobStateTable(env);
    const backlogQueueBatchSize = getEnvInt(env, 'BACKLOG_QUEUE_BATCH_SIZE', 25);
    const url = new URL(request.url);
    const path = url.pathname;
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': 'https://whats-new.kr', 'Cache-Control': 'public, max-age=3600' };

    if (path === '/api/articles') {
      const csp = url.searchParams.get('csp');
      // Auto-detect language from Accept-Language, default ko
      const accept = request.headers.get('Accept-Language') || '';
      const defaultLang = accept.startsWith('ja') ? 'ja' : accept.startsWith('en') ? 'en' : 'ko';
      const lang = url.searchParams.get('lang') || defaultLang;
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

      // Include untranslated articles as English fallback
      let query, params;
      if (lang === 'en' || !csp) {
        query = `SELECT lc.*, a.title_en as original_title, 0 as is_fallback FROM localized_content lc JOIN articles a ON lc.article_id = a.id WHERE lc.lang = ?`;
        params = [lang];
        if (csp) { query += ' AND lc.csp = ?'; params.push(csp); }
      } else {
        query = `SELECT lc.*, a.title_en as original_title, 0 as is_fallback FROM localized_content lc JOIN articles a ON lc.article_id = a.id WHERE lc.lang = ? AND lc.csp = ?
          UNION ALL
          SELECT lc2.*, a2.title_en as original_title, 1 as is_fallback FROM localized_content lc2 JOIN articles a2 ON lc2.article_id = a2.id WHERE lc2.lang = 'en' AND lc2.csp = ? AND lc2.article_id NOT IN (SELECT article_id FROM localized_content WHERE lang = ? AND csp = ?)`;
        params = [lang, csp, csp, lang, csp];
      }
      query += ' ORDER BY pub_date DESC LIMIT ?';
      params.push(limit);
      const rows = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ items: rows.results, count: rows.results.length, lang }), { headers });
    }

    if (path === '/api/trigger' && request.method === 'POST') {
      const action = url.searchParams.get('action') || 'translate';
      if (action === 'fetch') {
        const n = await fetchRSS(env);
        const backlog = await getMissingTranslationCount(env, 'ko');
        return new Response(JSON.stringify({ newArticles: n.newArticles, queued: n.queued, backlog }), { headers });
      }
      const queued = await enqueueMissingTranslations(env, 'ko', backlogQueueBatchSize);
      const backlog = await getMissingTranslationCount(env, 'ko');
      return new Response(JSON.stringify({ queued, backlog }), { headers });
    }

    // POST /api/retranslate?id=123&hint=... — delete existing ko translation and enqueue retranslation
    if (path === '/api/retranslate' && request.method === 'POST') {
      const id = url.searchParams.get('id');
      if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers });
      const hint = url.searchParams.get('hint') || '';
      try {
        const result = await queueArticleRetranslation(env, Number(id), 'ko', 'manual', hint);
        if (!result.found) return new Response(JSON.stringify({ error: 'article not found' }), { status: 404, headers });
        return new Response(JSON.stringify({ queued: result.queued, articleId: Number(id), reason: 'manual', hint: hint || undefined }), { headers });
      } catch (e) { console.error(e); }
      return new Response(JSON.stringify({ queued: 0, error: 'translation failed' }), { headers });
    }

    // POST /api/retranslate-bad — bulk retranslate poor quality translations
    if (path === '/api/retranslate-bad' && request.method === 'POST') {
      const bad = await env.DB.prepare(`
        SELECT a.id, a.csp, a.url, a.pub_date, a.title_en, a.description_en FROM localized_content lc
        JOIN articles a ON lc.article_id = a.id
        WHERE lc.lang = 'ko' AND lc.model_used NOT IN ('manual', 'cf-qwen3-30b-reviewed') AND (
          lc.title LIKE '%.graphics%'
          
          OR lc.title GLOB '* [A-Za-z]'
          OR lc.title GLOB '*[(/-]'
          OR lc.title = a.title_en
          OR substr(lc.summary, 1, 20) = substr(lc.title, 1, 20)
          OR length(lc.summary) < 30
          OR lc.summary LIKE '%_workflow_%'
          OR lc.summary LIKE '%**%'
          OR lc.summary LIKE '%\`%'
          OR (lc.status LIKE '%정식 출시%' AND (lc.summary LIKE '%preview%' OR lc.summary LIKE '%미리보기%'))
          OR lc.title LIKE '%and 및%'
        ) LIMIT 25
      `).all();
      const retryIds = [];
      for (const row of bad.results) {
        await env.DB.prepare("DELETE FROM localized_content WHERE article_id = ? AND lang = 'ko'").bind(row.id).run();
        retryIds.push(row.id);
      }
      const retried = await enqueueArticleTranslations(env, retryIds, 'ko', 'quality_retry');
      return new Response(JSON.stringify({ found: bad.results.length, retried }), { headers });
    }

    if (path === '/api/stats') {
      const stats = await env.DB.prepare('SELECT csp, lang, count(*) as count FROM localized_content GROUP BY csp, lang').all();
      return new Response(JSON.stringify(stats.results), { headers });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
  },
};
