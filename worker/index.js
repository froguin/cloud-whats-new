const RSS_FEEDS = {
  aws: 'https://aws.amazon.com/about-aws/whats-new/recent/feed/',
  gcp: 'https://cloud.google.com/feeds/gcp-release-notes.xml',
  azure: 'https://azurecomcdn.azureedge.net/en-us/updates/feed/',
};

const TRANSLATE_PROMPT = `You are an expert cloud service analyst. Translate and summarize this cloud service update for Korean-speaking professionals.

Title: {title}
Description: {description}

Respond in a single JSON object:
{"title":"한국어 제목","summary":"3-4문장 한국어 요약 (250자 이하)","target":"대상 사용자","features":"주요 기능 (100자 이하)","regions":"지원 리전","status":"정식 출시/미리보기"}

Rules:
- Product names (AWS Lambda, Azure Functions, etc.) keep original English
- Respond ONLY with the JSON object, no markdown`;

// Parse RSS XML to items
function parseRSS(xml, csp) {
  const items = [];
  const regex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?(.*?)(?:\\]\\]>)?</${tag}>`, 's'));
      return m ? m[1].trim() : '';
    };
    items.push({
      csp,
      title: get('title'),
      description: get('description').replace(/<[^>]+>/g, '').slice(0, 2000),
      url: get('link') || get('guid'),
      pub_date: get('pubDate') || get('updated') || get('published'),
    });
  }
  return items;
}

// Fetch and store new articles
async function fetchRSS(env) {
  let totalNew = 0;
  for (const [csp, url] of Object.entries(RSS_FEEDS)) {
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': 'CloudWhatsNew/2.0' } });
      if (!resp.ok) continue;
      const xml = await resp.text();
      const items = parseRSS(xml, csp).slice(0, 30);

      for (const item of items) {
        if (!item.url) continue;
        const r = await env.DB.prepare(
          'INSERT OR IGNORE INTO articles (csp, title, description, url, pub_date) VALUES (?,?,?,?,?)'
        ).bind(item.csp, item.title, item.description, item.url, item.pub_date).run();
        if (r.meta.changes > 0) totalNew++;
      }
    } catch (e) {
      console.error(`${csp} fetch error:`, e.message);
    }
  }
  return totalNew;
}

// Translate untranslated articles
async function translateNew(env, lang = 'ko', limit = 10) {
  const rows = await env.DB.prepare(`
    SELECT a.id, a.title, a.description FROM articles a
    LEFT JOIN translations t ON a.id = t.article_id AND t.lang = ?
    WHERE t.id IS NULL
    ORDER BY a.created_at DESC LIMIT ?
  `).bind(lang, limit).all();

  let translated = 0;
  for (const row of rows.results) {
    try {
      const prompt = TRANSLATE_PROMPT
        .replace('{title}', row.title)
        .replace('{description}', (row.description || '').slice(0, 1000));

      const aiResp = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 512,
      });

      const text = aiResp.response || '';
      const jsonStart = text.indexOf('{');
      const jsonEnd = text.lastIndexOf('}') + 1;
      if (jsonStart < 0) continue;
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd));

      await env.DB.prepare(
        'INSERT OR REPLACE INTO translations (article_id, lang, title, summary, target, features, regions, status, model_used) VALUES (?,?,?,?,?,?,?,?,?)'
      ).bind(row.id, lang, parsed.title || '', parsed.summary || '', parsed.target || '',
             parsed.features || '', parsed.regions || '', parsed.status || '', 'cf-llama-3.1-8b').run();
      translated++;
    } catch (e) {
      console.error(`translate error for article ${row.id}:`, e.message);
    }
  }
  return translated;
}

export default {
  // Cron trigger: fetch RSS + translate
  async scheduled(event, env, ctx) {
    const newArticles = await fetchRSS(env);
    const translated = await translateNew(env, 'ko', 15);
    console.log(`Cron: ${newArticles} new articles, ${translated} translated`);
  },

  // HTTP API for the frontend and external consumers
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers
    const headers = {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
    };

    // GET /api/articles?csp=aws&lang=ko&limit=30
    if (path === '/api/articles') {
      const csp = url.searchParams.get('csp');
      const lang = url.searchParams.get('lang') || 'ko';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '30'), 100);

      let query = `
        SELECT a.id, a.csp, a.url, a.pub_date,
               COALESCE(t.title, a.title) as title,
               COALESCE(t.summary, a.description) as summary,
               t.target, t.features, t.regions, t.status
        FROM articles a
        LEFT JOIN translations t ON a.id = t.article_id AND t.lang = ?
        WHERE a.pub_date > datetime('now', '-30 days')
      `;
      const params = [lang];

      if (csp) {
        query += ' AND a.csp = ?';
        params.push(csp);
      }
      query += ' ORDER BY a.pub_date DESC LIMIT ?';
      params.push(limit);

      const rows = await env.DB.prepare(query).bind(...params).all();
      return new Response(JSON.stringify({ items: rows.results, count: rows.results.length }), { headers });
    }

    // GET /api/stats
    if (path === '/api/stats') {
      const stats = await env.DB.prepare(`
        SELECT csp, count(*) as count FROM articles
        WHERE pub_date > datetime('now', '-30 days')
        GROUP BY csp
      `).all();
      return new Response(JSON.stringify(stats.results), { headers });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
  },
};
