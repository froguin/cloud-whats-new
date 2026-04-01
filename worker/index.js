const RSS_FEEDS = {
  aws: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/',
  gcp: 'https://docs.cloud.google.com/feeds/gcp-release-notes.xml',
  azure: 'https://www.microsoft.com/releasecommunications/api/v2/azure/rss',
};

const SYSTEM_PROMPT = `You are a Korean cloud technology translator. Translate cloud service updates to Korean JSON.

RULES:
- Keep ALL product/service names in English (AWS Lambda, Google Cloud Run, Azure Functions, etc.)
- Keep region codes in English (us-east-1, ap-northeast-2, etc.)
- Write like a Korean tech blog, NOT machine translation
- Output ONLY valid JSON, no markdown
- NEVER change geographic names, dates, numbers, or region codes from the original
- Title: 제품명은 절대 자르지 말 것. 간결한 헤드라인 형태로, 핵심 변화만 포함

OUTPUT FORMAT (JSON):
{"title":"한국어로 자연스럽게 다듬기. 제품명 영문 유지. 제목만으로 무슨 변화인지 알 수 있어야 함 — 너무 짧거나 모호한 제목 금지. 제품명은 절대 자르거나 축약하지 말 것. 제품명+핵심 변화 한 가지만 간결하게. 설명이나 배경은 summary에 쓸 것. 예: Azure SQL 업데이트(X) → Azure SQL에서 코드 분석 규칙 설정 및 Fabric 연동 지원(O). 제목에 포함된 상태 표기([Launched] (Preview) 등)는 제거하고 status에만 반영. GCP 날짜형은 YYYY년 M월 D일: 핵심제품 외 N건","summary":"정확히 2문장. 첫 문장: 제목 절대 반복 금지 — 무엇이 가능해졌는지 곧바로 서술. 둘째 문장: 실무에서 왜 중요한지. GCP 다제품: 임팩트 큰 1-2개에 집중하고 나머지는 외 N개 서비스 업데이트 포함으로 마무리","target":"이 변경을 지금 검토해야 할 사람을 역할+구체적 맥락으로 1줄. 개발자/엔지니어 단독 사용 금지. 예: GKE에서 멀티테넌트 클러스터를 운영하는 플랫폼 엔지니어","features":"정확히 3개, 쉼표 구분. 각 항목 15자 이내로 짧게. 동사형 효과 중심. 제품명 나열 금지","regions":"원문에 명시된 리전 그대로. 없으면 모든 리전","status":["상태값만 배열로. 제품명 포함 금지. 유효값: 정식 출시, 미리보기, 베타, 지원 종료"]}`;

const FEW_SHOT = [
  { role: 'user', content: 'Title: AWS Lambda now supports Python 3.13 runtime\nDescription: Customers can now create and update Lambda functions using Python 3.13. Python 3.13 includes improved error messages, a new REPL, and performance improvements. Available in all AWS Regions where Lambda is available.' },
  { role: 'assistant', content: '{"title":"AWS Lambda에서 Python 3.13 런타임 지원 시작","summary":"Lambda 함수에서 개선된 오류 메시지와 새로운 REPL, 성능 향상 등 Python 3.13의 주요 기능을 바로 활용할 수 있게 되었습니다. 기존 Python 3.12 함수를 운영 중이라면 런타임 업그레이드를 검토할 시점입니다.","target":"Lambda 기반 서버리스 백엔드를 Python으로 운영하는 백엔드 개발자","features":"함수 생성·업데이트 시 Python 3.13 런타임 선택 가능, 디버깅 시 더 명확한 오류 메시지 확인 가능, 런타임 수준의 성능 개선으로 콜드스타트 단축 기대","regions":"Lambda가 제공되는 모든 AWS 리전","status":["정식 출시"]}' },
  { role: 'user', content: 'Title: Cloud Run now supports GPU acceleration (Preview)\nDescription: You can now attach NVIDIA L4 GPUs to your Cloud Run services for AI/ML inference workloads. GPU-enabled services are available in us-central1 and europe-west4.' },
  { role: 'assistant', content: '{"title":"Cloud Run에서 GPU 가속 지원 (Preview)","summary":"별도 인프라 구성 없이 Cloud Run 서비스에 NVIDIA L4 GPU를 연결해 AI/ML 추론을 실행할 수 있게 되었습니다. 서버리스 환경에서 GPU 워크로드를 처리하려는 팀에게 인프라 관리 부담을 크게 줄여줍니다.","target":"Cloud Run에서 ML 모델 서빙을 검토 중인 ML 엔지니어","features":"컨테이너에 NVIDIA L4 GPU 직접 연결 가능, 서버리스 환경에서 AI 추론 파이프라인 구축 가능, 기존 Cloud Run 배포 워크플로 그대로 GPU 서비스 배포 가능","regions":"us-central1, europe-west4","status":["미리보기"]}' },
  { role: 'user', content: 'Title: March 27, 2026\nDescription: Cloud Composer: Cloud Composer 2 environments can no longer be created in Melbourne (australia-southeast2). Compute Engine: A vulnerability (CVE-2026-23268) has been addressed. Document AI: New OCR model available in Preview.' },
  { role: 'assistant', content: '{"title":"2026년 3월 27일: Cloud Composer 외 2건","summary":"Cloud Composer 2가 Melbourne 리전에서 더 이상 생성할 수 없게 되면서 해당 리전 사용자는 Cloud Composer 3으로 전환이 필요합니다. 이 외에도 Compute Engine 보안 패치와 Document AI OCR 모델 프리뷰 등 업데이트가 포함되어 있습니다.","target":"australia-southeast2 리전에서 Cloud Composer 환경을 운영 중인 데이터 엔지니어","features":"Melbourne 리전 Cloud Composer 2 신규 생성 중단으로 마이그레이션 필요, Compute Engine CVE-2026-23268 보안 취약점 패치 적용, Document AI에서 새로운 OCR 모델 프리뷰 사용 가능","regions":"australia-southeast2 (Cloud Composer), 모든 리전 (Compute Engine, Document AI)","status":["정식 출시","미리보기"]}' },
  { role: 'user', content: 'Title: Azure Kubernetes Service (AKS) now supports Kubernetes 1.31\nDescription: This update brings improved sidecar container support, enhanced pod lifecycle management, and new scheduling features. Available in all public Azure regions. Generally available.' },
  { role: 'assistant', content: '{"title":"AKS에서 Kubernetes 1.31 지원","summary":"사이드카 컨테이너 관리가 개선되고 Pod 라이프사이클 제어가 세밀해져 복잡한 마이크로서비스 배포가 한결 수월해집니다. 스케줄링 기능 강화로 노드 리소스 활용 효율도 높아질 것으로 기대됩니다.","target":"AKS에서 프로덕션 마이크로서비스를 운영하며 업그레이드 주기를 관리하는 플랫폼 엔지니어","features":"사이드카 컨테이너를 Pod과 독립적으로 관리 가능, Pod 종료·재시작 흐름을 더 세밀하게 제어 가능, 새로운 스케줄링 규칙으로 노드 자원 배치 최적화 가능","regions":"모든 Azure 퍼블릭 리전","status":["정식 출시"]}' },
];

const DEFAULT_QUEUE_LANG = 'ko';
const RETRY_BASE_DELAY_SECONDS = 30;
const FETCH_CRONS = new Set(['0,15,30,45 * * * *']);
let translationJobStateReady = false;

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

FAIL if any of these are true:
- The title looks truncated, incomplete, or cuts a product/service name.
- The summary contains stray markdown/code tokens such as _workflow_, **, or backticks.
- The summary reads like literal machine translation and would look awkward to Korean engineers.
- The title is too vague, mirrors the English title too closely, or the summary mostly repeats the title.
- The summary is not exactly two Korean sentences.

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
  const reviewInput = {
    original_title: row.title_en,
    original_description: String(row.description_en || '').slice(0, 1500),
    translated_title: record.title,
    translated_summary: record.summary,
    translated_target: record.target,
    translated_features: record.features,
    translated_regions: record.regions,
  };

  try {
    const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
      messages: [
        { role: 'system', content: QUALITY_REVIEW_PROMPT },
        { role: 'user', content: JSON.stringify(reviewInput) },
      ],
      response_format: QUALITY_REVIEW_JSON_SCHEMA,
      max_tokens: 384,
      temperature: 0.1,
    });
    const parsed = parseAIResponse(aiResp);
    if (!parsed || typeof parsed.pass !== 'boolean') {
      return { pass: true, reasons: ['review-unavailable'], record };
    }

    const suggestedRecord = applyQualitySuggestions(record, parsed);
    const suggestedQuality = assessTranslationQuality(suggestedRecord, row);
    const hasSuggestion =
      suggestedRecord.title !== record.title || suggestedRecord.summary !== record.summary;

    if (!parsed.pass && hasSuggestion && suggestedQuality.pass) {
      return {
        pass: true,
        reasons: [...(parsed.reasons || []), 'reviewer-applied-edit'],
        record: suggestedRecord,
      };
    }

    return {
      pass: !!parsed.pass,
      reasons: Array.isArray(parsed.reasons) ? parsed.reasons : [],
      record,
    };
  } catch (error) {
    console.error('quality review error:', error.message);
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
    return { modelUsed: 'retried', allowLowQuality: true };
  }
  if (reason === 'manual') {
    return { modelUsed: 'manual', allowLowQuality: false };
  }
  return { modelUsed: 'cf-llama-3.1-8b', allowLowQuality: false };
}

async function buildTranslationRecord(env, row) {
  const titleForLLM = row.title_en.length < 20
    ? `${row.title_en}: ${(row.description_en || '').slice(0, 100)}`
    : row.title_en;
  const userMsg = `Title: ${titleForLLM}\nDescription: ${(row.description_en || '').slice(0, 1500)}`;
  const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...FEW_SHOT, { role: 'user', content: userMsg }],
    response_format: TRANSLATION_JSON_SCHEMA,
    max_tokens: 768, temperature: 0.1,
  });
  const parsed = parseAIResponse(aiResp);
  if (!parsed || !parsed.title) return null;
  let cleanTitle = parsed.title
    .replace(/\s*[\[\(](?:Launched|Preview|Retired|In development|Generally Available|정식 출시|미리보기|베타|지원 종료|GA|출시)[\]\)]\s*/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  const feat = normalizeShortList(parsed.features).join(', ');
  const reg = normalizeShortList(parsed.regions, 10).join(', ') || '모든 리전';
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
  const quality = assessTranslationQuality(record, row);
  if (!quality.pass && !allowLowQuality) {
    return { ok: false, needsRetry: true, reasons: quality.reasons, quality, record };
  }
  let finalRecord = record;
  let finalQuality = quality;
  if (!allowLowQuality) {
    const reviewed = await reviewTranslationQualityWithAI(env, row, record);
    if (!reviewed.pass) {
      return { ok: false, needsRetry: true, reasons: reviewed.reasons, quality, record };
    }
    finalRecord = reviewed.record || record;
    finalQuality = assessTranslationQuality(finalRecord, row);
    if (!finalQuality.pass) {
      return { ok: false, needsRetry: true, reasons: finalQuality.reasons, quality: finalQuality, record: finalRecord };
    }
  }
  return { ok: true, quality: finalQuality, record: finalRecord };
}

async function persistTranslationRecord(env, row, record, modelUsed) {
  await env.DB.prepare(
    'INSERT OR REPLACE INTO localized_content (article_id, csp, lang, url, pub_date, title, summary, target, features, regions, status, model_used) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
  ).bind(row.id, row.csp, 'ko', row.url, row.pub_date, record.title, record.summary,
         record.target, record.features, record.regions, record.status, modelUsed).run();
}

async function runTranslationPipeline(env, row, reason = 'backlog') {
  const options = getTranslationExecutionOptions(reason);
  const record = await buildTranslationRecord(env, row);
  if (!record) {
    return { ok: false, needsRetry: false };
  }
  const validated = await validateTranslationRecord(env, row, record, options);
  if (!validated.ok) {
    return validated;
  }
  await persistTranslationRecord(env, row, validated.record, options.modelUsed);
  return { ok: true, quality: validated.quality };
}

async function queueArticleRetranslation(env, articleId, lang = DEFAULT_QUEUE_LANG, reason = 'manual') {
  const row = await getArticleForTranslation(env, articleId);
  if (!row) return { found: false, queued: 0 };
  await releaseTranslationJobs(env, [{ articleId, lang }]);
  await env.DB.prepare('DELETE FROM localized_content WHERE article_id = ? AND lang = ?').bind(articleId, lang).run();
  const queued = await enqueueTranslationJobs(env, [{ articleId, lang, reason }]);
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
        WHERE lc.lang = 'ko' AND lc.model_used != 'manual' AND lc.model_used != 'retried' AND (
          lc.title LIKE '%.graphics%'
          
          OR lc.title GLOB '* [A-Za-z]'
          OR lc.title GLOB '*[(/-]'
          OR lc.title = a.title_en
          OR substr(lc.summary, 1, 20) = substr(lc.title, 1, 20)
          OR length(lc.summary) < 30
          OR lc.summary LIKE '%_workflow_%'
          OR lc.summary LIKE '%**%'
          OR lc.summary LIKE '%\`%'
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

        const result = await runTranslationPipeline(env, row, reason);
        if (result?.ok) {
          await releaseTranslationJobs(env, [{ articleId, lang }]);
          msg.ack();
          continue;
        }

        if (result?.needsRetry && reason !== 'quality_retry') {
          await touchTranslationJob(env, articleId, lang, 'quality_retry');
          await enqueueTranslationJobs(env, [{ articleId, lang, reason: 'quality_retry' }], { skipClaim: true });
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
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 200);

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

    // POST /api/retranslate?id=123 — delete existing ko translation and enqueue retranslation
    if (path === '/api/retranslate' && request.method === 'POST') {
      const id = url.searchParams.get('id');
      if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers });
      try {
        const result = await queueArticleRetranslation(env, Number(id), 'ko', 'manual');
        if (!result.found) return new Response(JSON.stringify({ error: 'article not found' }), { status: 404, headers });
        return new Response(JSON.stringify({ queued: result.queued, articleId: Number(id), reason: 'manual' }), { headers });
      } catch (e) { console.error(e); }
      return new Response(JSON.stringify({ queued: 0, error: 'translation failed' }), { headers });
    }

    // POST /api/retranslate-bad — bulk retranslate poor quality translations
    if (path === '/api/retranslate-bad' && request.method === 'POST') {
      const bad = await env.DB.prepare(`
        SELECT a.id, a.csp, a.url, a.pub_date, a.title_en, a.description_en FROM localized_content lc
        JOIN articles a ON lc.article_id = a.id
        WHERE lc.lang = 'ko' AND lc.model_used != 'manual' AND lc.model_used != 'retried' AND (
          lc.title LIKE '%.graphics%'
          
          OR lc.title GLOB '* [A-Za-z]'
          OR lc.title GLOB '*[(/-]'
          OR lc.title = a.title_en
          OR substr(lc.summary, 1, 20) = substr(lc.title, 1, 20)
          OR length(lc.summary) < 30
          OR lc.summary LIKE '%_workflow_%'
          OR lc.summary LIKE '%**%'
          OR lc.summary LIKE '%\`%'
        ) LIMIT 10
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
