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

OUTPUT FORMAT (JSON):
{"title":"한국어로 자연스럽게 다듬기. 제품명 영문 유지. 제목만으로 무슨 변화인지 알 수 있어야 함 — 너무 짧거나 모호한 제목 금지. 예: Azure SQL 업데이트(X) → Azure SQL에서 코드 분석 규칙 설정 및 Fabric 연동 지원(O). 제목에 포함된 상태 표기([Launched] (Preview) 등)는 제거하고 status에만 반영. GCP 날짜형은 YYYY년 M월 D일: 핵심제품 외 N건","summary":"정확히 2문장. 첫 문장: 제목 절대 반복 금지 — 무엇이 가능해졌는지 곧바로 서술. 둘째 문장: 실무에서 왜 중요한지. GCP 다제품: 임팩트 큰 1-2개에 집중하고 나머지는 외 N개 서비스 업데이트 포함으로 마무리","target":"이 변경을 지금 검토해야 할 사람을 역할+구체적 맥락으로 1줄. 개발자/엔지니어 단독 사용 금지. 예: GKE에서 멀티테넌트 클러스터를 운영하는 플랫폼 엔지니어","features":"정확히 3개, 쉼표 구분. 각 항목 15자 이내로 짧게. 동사형 효과 중심. 제품명 나열 금지","regions":"원문에 명시된 리전 그대로. 없으면 모든 리전","status":["상태값만 배열로. 제품명 포함 금지. 유효값: 정식 출시, 미리보기, 베타, 지원 종료"]}`;

const FEW_SHOT = [
  { role: 'user', content: 'Title: AWS Lambda now supports Python 3.13 runtime\nDescription: Customers can now create and update Lambda functions using Python 3.13. Python 3.13 includes improved error messages, a new REPL, and performance improvements. Available in all AWS Regions where Lambda is available.' },
  { role: 'assistant', content: '{"title":"AWS Lambda에서 Python 3.13 런타임 지원 시작","summary":"Lambda 함수에서 개선된 오류 메시지와 새로운 REPL, 성능 향상 등 Python 3.13의 주요 기능을 바로 활용할 수 있게 되었습니다. 기존 Python 3.12 함수를 운영 중이라면 런타임 업그레이드를 검토할 시점입니다.","target":"Lambda 기반 서버리스 백엔드를 Python으로 운영하는 백엔드 개발자","features":"함수 생성·업데이트 시 Python 3.13 런타임 선택 가능, 디버깅 시 더 명확한 오류 메시지 확인 가능, 런타임 수준의 성능 개선으로 콜드스타트 단축 기대","regions":"Lambda가 제공되는 모든 AWS 리전","status":["정식 출시"]}' },
  { role: 'user', content: 'Title: Cloud Run now supports GPU acceleration (Preview)\nDescription: You can now attach NVIDIA L4 GPUs to your Cloud Run services for AI/ML inference workloads. GPU-enabled services are available in us-central1 and europe-west4.' },
  { role: 'assistant', content: '{"title":"Cloud Run에서 GPU 가속 지원 (Preview)","summary":"별도 인프라 구성 없이 Cloud Run 서비스에 NVIDIA L4 GPU를 연결해 AI/ML 추론을 실행할 수 있게 되었습니다. 서버리스 환경에서 GPU 워크로드를 처리하려는 팀에게 인프라 관리 부담을 크게 줄여줍니다.","target":"Cloud Run에서 ML 모델 서빙을 검토 중인 ML 엔지니어","features":"컨테이너에 NVIDIA L4 GPU 직접 연결 가능, 서버리스 환경에서 AI 추론 파이프라인 구축 가능, 기존 Cloud Run 배포 워크플로 그대로 GPU 서비스 배포 가능","regions":"us-central1, europe-west4","status":["미리보기"]}' },
  { role: 'user', content: 'Title: March 27, 2026\nDescription: Cloud Composer: Cloud Composer 2 environments can no longer be created in Melbourne (australia-southeast2). Compute Engine: A vulnerability (CVE-2026-23268) has been addressed. Document AI: New OCR model available in Preview.' },
  { role: 'assistant', content: '{"title":"2026년 3월 27일: Cloud Composer 리전 제한 외 2건","summary":"Cloud Composer 2가 Melbourne 리전에서 더 이상 생성할 수 없게 되면서 해당 리전 사용자는 Cloud Composer 3으로 전환이 필요합니다. 이 외에도 Compute Engine 보안 패치와 Document AI OCR 모델 프리뷰 등 업데이트가 포함되어 있습니다.","target":"australia-southeast2 리전에서 Cloud Composer 환경을 운영 중인 데이터 엔지니어","features":"Melbourne 리전 Cloud Composer 2 신규 생성 중단으로 마이그레이션 필요, Compute Engine CVE-2026-23268 보안 취약점 패치 적용, Document AI에서 새로운 OCR 모델 프리뷰 사용 가능","regions":"australia-southeast2 (Cloud Composer), 모든 리전 (Compute Engine, Document AI)","status":["정식 출시","미리보기"]}' },
  { role: 'user', content: 'Title: Azure Kubernetes Service (AKS) now supports Kubernetes 1.31\nDescription: This update brings improved sidecar container support, enhanced pod lifecycle management, and new scheduling features. Available in all public Azure regions. Generally available.' },
  { role: 'assistant', content: '{"title":"Azure Kubernetes Service (AKS)에서 Kubernetes 1.31 지원","summary":"사이드카 컨테이너 관리가 개선되고 Pod 라이프사이클 제어가 세밀해져 복잡한 마이크로서비스 배포가 한결 수월해집니다. 스케줄링 기능 강화로 노드 리소스 활용 효율도 높아질 것으로 기대됩니다.","target":"AKS에서 프로덕션 마이크로서비스를 운영하며 업그레이드 주기를 관리하는 플랫폼 엔지니어","features":"사이드카 컨테이너를 Pod과 독립적으로 관리 가능, Pod 종료·재시작 흐름을 더 세밀하게 제어 가능, 새로운 스케줄링 규칙으로 노드 자원 배치 최적화 가능","regions":"모든 Azure 퍼블릭 리전","status":["정식 출시"]}' },
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
          await env.DB.prepare(
            'INSERT OR IGNORE INTO localized_content (article_id, csp, lang, url, pub_date, title, summary, status) VALUES (?,?,?,?,?,?,?,?)'
          ).bind(row.id, csp, 'en', item.url || '', item.pub_date, item.title, item.description, '').run();
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
      // If title is just a product name, prepend description hint
      const titleForLLM = row.title_en.length < 20
        ? `${row.title_en}: ${(row.description_en || '').slice(0, 100)}`
        : row.title_en;
      const userMsg = `Title: ${titleForLLM}\nDescription: ${(row.description_en || '').slice(0, 800)}`;
      const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...FEW_SHOT, { role: 'user', content: userMsg }],
        max_tokens: 768, temperature: 0.1,
      });
      const parsed = safeParseJSON(aiResp.response || '');
      if (!parsed || !parsed.title) continue;
      // Strip status markers from translated title
      let cleanTitle = parsed.title
        .replace(/\s*[\[\(](?:Launched|Preview|Retired|In development|Generally Available|정식 출시|미리보기|베타|지원 종료|GA|출시)[\]\)]\s*/gi, ' ')
        .replace(/\s+/g, ' ').trim();
      // If title is too short/vague, enrich from summary
      if (cleanTitle.length < 25 && parsed.summary) {
        const firstSentence = parsed.summary.split(/[.。!]/).filter(s => s.trim())[0]?.trim() || '';
        if (firstSentence.length > cleanTitle.length) cleanTitle = cleanTitle + ': ' + firstSentence;
      }
      const feat = Array.isArray(parsed.features) ? parsed.features.join(', ') : (parsed.features || '');
      const reg = Array.isArray(parsed.regions) ? parsed.regions.join(', ') : (parsed.regions || '');
      // Force-normalize status: only allow known values
      const VALID_STATUS = ['정식 출시', '미리보기', '베타', '지원 종료'];
      let rawStatus = Array.isArray(parsed.status) ? parsed.status : [parsed.status || ''];
      const cleanStatus = [...new Set(rawStatus.flatMap(s => {
        // Extract valid status from strings like "Vertex AI: 정식 출시"
        for (const v of VALID_STATUS) { if (s.includes(v)) return [v]; }
        return [];
      }))];
      const stat = JSON.stringify(cleanStatus.length ? cleanStatus : ['정식 출시']);
      await env.DB.prepare(
        'INSERT OR REPLACE INTO localized_content (article_id, csp, lang, url, pub_date, title, summary, target, features, regions, status, model_used) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)'
      ).bind(row.id, row.csp, lang, row.url, row.pub_date, cleanTitle, parsed.summary || '',
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
    const t = await translateNew(env, 'ko', 25);
    // Cleanup: delete articles older than 30 days
    await env.DB.prepare("DELETE FROM localized_content WHERE article_id IN (SELECT id FROM articles WHERE pub_date < datetime('now', '-30 days'))").run();
    await env.DB.prepare("DELETE FROM articles WHERE pub_date < datetime('now', '-30 days')").run();
    console.log(`Cron: ${n} new, ${t} translated`);
    // Alert on consecutive empty fetches
    const webhookUrl = env.ALERT_WEBHOOK_URL;
    if (webhookUrl && n === 0) {
      const prev = await env.DB.prepare("SELECT count(*) as c FROM articles WHERE created_at > datetime('now', '-3 hours')").first();
      if (prev && prev.c === 0) {
        await fetch(webhookUrl, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: `⚠️ What's New: 3시간 연속 새 기사 없음. RSS 피드 확인 필요.` }),
        }).catch(() => {});
      }
    }
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
      const n = await fetchRSS(env);
      const t = await translateNew(env, 'ko', 25);
      return new Response(JSON.stringify({ newArticles: n, translated: t }), { headers });
    }

    // POST /api/retranslate?id=123 — delete existing ko translation and re-translate
    if (path === '/api/retranslate' && request.method === 'POST') {
      const id = url.searchParams.get('id');
      if (!id) return new Response(JSON.stringify({ error: 'id required' }), { status: 400, headers });
      await env.DB.prepare("DELETE FROM localized_content WHERE article_id = ? AND lang = 'ko'").bind(id).run();
      const t = await translateNew(env, 'ko', 1);
      return new Response(JSON.stringify({ retranslated: t, article_id: id }), { headers });
    }

    if (path === '/api/stats') {
      const stats = await env.DB.prepare('SELECT csp, lang, count(*) as count FROM localized_content GROUP BY csp, lang').all();
      return new Response(JSON.stringify(stats.results), { headers });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
  },
};
