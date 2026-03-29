const RSS_FEEDS = {
  aws: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/',
  gcp: 'https://docs.cloud.google.com/feeds/gcp-release-notes.xml',
  azure: 'https://www.microsoft.com/releasecommunications/api/v2/azure/rss',
};

const SYSTEM_PROMPT = `You are a Korean cloud technology translator. Translate cloud service updates to Korean JSON.

RULES:
- Keep ALL product/service names in English (AWS Lambda, Google Cloud Run, Azure Functions, Amazon S3, etc.)
- Keep region codes in English (us-east-1, asia-northeast3, etc.)
- Summary: exactly 3-4 sentences in Korean, concise and complete
- Output ONLY valid JSON, no markdown, no explanation

OUTPUT FORMAT:
{"title":"Korean title (product names stay English). For GCP date-based entries, format as 'YYYY년 M월 D일: 제품1, 제품2 업데이트' (colon after date is mandatory)","summary":"3-4 sentence Korean summary","target":"이 업데이트가 도움이 되는 대상을 한국어 문장으로 설명","features":"key features in Korean, comma separated","regions":"원문에 리전이 명시되어 있으면 그대로 나열. 명시되지 않았으면 모든 리전","status":["ONLY pure status values, NEVER include product names. Valid: 정식 출시, 미리보기, 베타, 지원 종료. WRONG: Cloud Run: 미리보기. RIGHT: 미리보기"]}`;
const FEW_SHOT = [
  { role: 'user', content: 'Title: AWS Lambda now supports Python 3.13 runtime\nDescription: Customers can now create and update Lambda functions using Python 3.13. Python 3.13 includes improved error messages, a new REPL, and performance improvements. Available in all AWS Regions where Lambda is available.' },
  { role: 'assistant', content: '{"title":"AWS Lambda에서 Python 3.13 런타임 지원 시작","summary":"AWS Lambda가 Python 3.13 런타임을 공식 지원합니다. 개선된 오류 메시지, 새로운 REPL, 성능 향상 등 Python 3.13의 주요 기능을 Lambda 함수에서 활용할 수 있습니다. Lambda가 제공되는 모든 AWS 리전에서 즉시 사용 가능합니다.","target":"서버리스 애플리케이션을 Python으로 개발하는 백엔드 개발자","features":"Python 3.13 런타임, 개선된 오류 메시지, 새로운 REPL, 성능 향상","regions":"Lambda가 제공되는 모든 AWS 리전","status":["정식 출시"]}' },
  { role: 'user', content: 'Title: Cloud Run now supports GPU acceleration (Preview)\nDescription: You can now attach NVIDIA L4 GPUs to your Cloud Run services for AI/ML inference workloads. GPU-enabled services are available in us-central1 and europe-west4.' },
  { role: 'assistant', content: '{"title":"Cloud Run에서 GPU 가속 지원 (Preview)","summary":"Cloud Run 서비스에 NVIDIA L4 GPU를 연결하여 AI/ML 추론 워크로드를 실행할 수 있습니다. GPU 지원을 통해 Cloud Run에서 직접 머신러닝 모델을 서빙할 수 있게 되었습니다. 현재 us-central1과 europe-west4 리전에서 Preview로 제공됩니다.","target":"Cloud Run에서 AI/ML 추론 워크로드를 실행하려는 ML 엔지니어 및 백엔드 개발자","features":"NVIDIA L4 GPU 연결, AI/ML 추론 워크로드 지원","regions":"us-central1, europe-west4","status":["미리보기"]}' },
  { role: 'user', content: 'Title: Azure Kubernetes Service (AKS) now supports Kubernetes 1.31\nDescription: This update brings improved sidecar container support, enhanced pod lifecycle management, and new scheduling features. Available in all public Azure regions. Generally available.' },
  { role: 'assistant', content: '{"title":"Azure Kubernetes Service (AKS)에서 Kubernetes 1.31 지원","summary":"Azure Kubernetes Service (AKS)가 Kubernetes 1.31을 정식 지원합니다. 사이드카 컨테이너 지원 개선, 향상된 Pod 라이프사이클 관리, 새로운 스케줄링 기능이 포함되었습니다. 모든 Azure 퍼블릭 리전에서 정식 제공됩니다.","target":"AKS에서 컨테이너 워크로드를 운영하는 DevOps 엔지니어 및 플랫폼 팀","features":"Kubernetes 1.31, 사이드카 컨테이너 개선, Pod 라이프사이클 관리, 스케줄링 기능","regions":"모든 Azure 퍼블릭 리전","status":["정식 출시"]}' },
];

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
    const pubDate = get('pubDate') || get('updated') || get('published') || '';
    const rawContent = isAtom ? get('content') : get('description');
    const rawTitle = get('title').replace(/<[^>]+>/g, '');

    // GCP: split by product title (<h2 class="release-note-product-title">)
    if (csp === 'gcp' && rawContent.includes('release-note-product-title')) {
      const sections = rawContent.split(/<h2[^>]*class="release-note-product-title"[^>]*>/);
      for (let i = 1; i < sections.length; i++) {
        const endH2 = sections[i].indexOf('</h2>');
        if (endH2 < 0) continue;
        const productName = sections[i].slice(0, endH2).replace(/<[^>]+>/g, '').trim();
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
  for (const [csp, url] of Object.entries(RSS_FEEDS)) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'CloudWhatsNew/2.0' }, redirect: 'follow' });
      if (!resp.ok) continue;
      const xml = await resp.text();
      if (!xml.includes('<')) continue;
      const items = parseRSS(xml, csp).slice(0, 30);
      for (const item of items) {
        if (!item.url && !item.title) continue;
        // Insert into articles (source of truth)
        const r = await env.DB.prepare(
          'INSERT OR IGNORE INTO articles (csp, url, title_en, description_en, pub_date) VALUES (?,?,?,?,?)'
        ).bind(csp, item.url || '', item.title, item.description, item.pub_date).run();
        if (r.meta.changes > 0) {
          // Also insert English as lang='en' into localized_content
          const row = await env.DB.prepare('SELECT id FROM articles WHERE csp=? AND url=?').bind(csp, item.url || '').first();
          if (row) {
            await env.DB.prepare(
              'INSERT OR IGNORE INTO localized_content (article_id, csp, lang, url, pub_date, title, summary, status) VALUES (?,?,?,?,?,?,?,?)'
            ).bind(row.id, csp, 'en', item.url || '', item.pub_date, item.title, item.description, '').run();
          }
          totalNew++;
        }
      }
    } catch (e) {
      console.error(`${csp} fetch error:`, e.message);
    }
  }
  return totalNew;
}

function safeParseJSON(text) {
  const clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}') + 1;
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(clean.slice(start, end)); } catch { return null; }
}

async function translateNew(env, lang = 'ko', limit = 10) {
  // Find articles that have 'en' but not target lang
  const rows = await env.DB.prepare(`
    SELECT a.id, a.csp, a.url, a.pub_date, a.title_en, a.description_en
    FROM articles a
    WHERE NOT EXISTS (SELECT 1 FROM localized_content lc WHERE lc.article_id = a.id AND lc.lang = ?)
    ORDER BY a.created_at DESC LIMIT ?
  `).bind(lang, limit).all();

  let translated = 0;
  for (const row of rows.results) {
    try {
      const userMsg = `Title: ${row.title_en}\nDescription: ${(row.description_en || '').slice(0, 800)}`;
      const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...FEW_SHOT, { role: 'user', content: userMsg }],
        max_tokens: 768, temperature: 0.1,
      });
      const parsed = safeParseJSON(aiResp.response || '');
      if (!parsed || !parsed.title) continue;
      const feat = Array.isArray(parsed.features) ? parsed.features.join(', ') : (parsed.features || '');
      const reg = Array.isArray(parsed.regions) ? parsed.regions.join(', ') : (parsed.regions || '');
      const stat = Array.isArray(parsed.status) ? JSON.stringify(parsed.status) : JSON.stringify([parsed.status || '정식 출시']);
      await env.DB.prepare(
        'INSERT OR REPLACE INTO localized_content (article_id, csp, lang, url, pub_date, title, summary, target, features, regions, status, model_used) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(row.id, row.csp, lang, row.url, row.pub_date, parsed.title, parsed.summary || '',
             parsed.target || 'all', feat, reg, stat, 'cf-llama-3.1-8b').run();
      translated++;
    } catch (e) {
      console.error(`translate error for article ${row.id}:`, e.message);
    }
  }
  return translated;
}

export default {
  async scheduled(event, env, ctx) {
    const n = await fetchRSS(env);
    const t = await translateNew(env, 'ko', 15);
    console.log(`Cron: ${n} new, ${t} translated`);
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=3600' };

    if (path === '/api/articles') {
      const csp = url.searchParams.get('csp');
      // Auto-detect language from Accept-Language, default ko
      const accept = request.headers.get('Accept-Language') || '';
      const defaultLang = accept.startsWith('ja') ? 'ja' : accept.startsWith('en') ? 'en' : 'ko';
      const lang = url.searchParams.get('lang') || defaultLang;
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);

      let query = 'SELECT * FROM localized_content WHERE lang = ?';
      const params = [lang];
      if (csp) { query += ' AND csp = ?'; params.push(csp); }
      query += ' ORDER BY pub_date DESC LIMIT ?';
      params.push(limit);
      const rows = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ items: rows.results, count: rows.results.length, lang }), { headers });
    }

    if (path === '/api/trigger' && request.method === 'POST') {
      const n = await fetchRSS(env);
      const t = await translateNew(env, 'ko', 15);
      return new Response(JSON.stringify({ newArticles: n, translated: t }), { headers });
    }

    if (path === '/api/stats') {
      const stats = await env.DB.prepare('SELECT csp, lang, count(*) as count FROM localized_content GROUP BY csp, lang').all();
      return new Response(JSON.stringify(stats.results), { headers });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
  },
};
