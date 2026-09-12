# ☁️ What's New 한국어 요약

Amazon Web Services · Google Cloud · Microsoft Azure 클라우드 최신 업데이트를 한국어로 요약합니다.

**Live**: https://whats-new.kr

## 아키텍처

```
Cloudflare Workers (Cron)
  → 매분: 미번역 backlog 큐잉
  → 5분마다: 미검수 건 큐잉 (backlog 없을 때)
  → 15분마다: 3 CSP RSS 수집 + 30일 지난 기사 삭제 + stale job 정리
  → Queue consumer: 번역 (70B) → 품질 검수 (8B) → 저장
  → 3시간 연속 무수집 시 Alert webhook (Discord/Slack)

Cloudflare Pages (Astro SSR)
  → /           통합 대시보드 (3단 컬럼)
  → /aws        AWS Cloudscape 테마
  → /gcp        Google Cloud Material 테마
  → /azure      Microsoft Azure Fluent 테마
```

## 번역 파이프라인

1. **번역**: GLM-4.7-Flash — 본문 요약 → 제목 도출 → 상태/대상/기능/리전 추출
2. **검수**: Llama 3.1 8B fp8 — 제목/상태/리전 등 필드별 교차 검증, 오류 시 수정
3. **품질 게이트**: CJK 오염, 마크다운 잔재, 제목 잘림 등 자동 감지 → 재시도
4. **AI 품질 리뷰**: 제목 완성도, 자연스러운 한국어, 리전 표기 일관성 등 최종 검수

## 비용: $0

| 서비스 | 무료 한도 | 예상 사용량 |
|--------|----------|------------|
| Workers | 100K req/일 | ~500/일 |
| Workers AI | 10K neurons/일 | ~5K/일 |
| D1 | 5GB / 5M reads/일 | ~10MB / ~5K reads |
| Queues | 1M msg/월 | ~5K/월 |
| Pages | 무제한 대역폭 | - |

## RSS 소스

| CSP | 피드 | 형식 |
|-----|------|------|
| AWS | https://aws.amazon.com/about-aws/whats-new/recent/feed/ | RSS 2.0 |
| GCP | https://docs.cloud.google.com/feeds/gcp-release-notes.xml | Atom |
| Azure | https://www.microsoft.com/releasecommunications/api/v2/azure/rss | RSS 2.0 |

## API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/articles` | 기사 조회 — whats-new.kr SSR 전용 (`csp`, `lang`, `limit` 파라미터, Accept-Language 자동 감지) |
| `GET /api/stats` | 번역/검수/큐 상태 모니터링 |
| `POST /api/pipeline?action=fetch` | RSS 수집 및 신규 기사 큐잉 |
| `POST /api/pipeline?action=translate` | 미번역 기사 일괄 큐잉 (백로그 처리) |
| `POST /api/pipeline?action=review` | 미검수 기사 일괄 검수 큐잉 |
| `POST /api/pipeline?action=retranslate&id=N` | 특정 기사 재번역 (`&mode=review`로 검수만, `&hint=...` 지원) |
| `POST /api/pipeline?action=fix-bad` | 품질 미달 기사 일괄 재번역 |
| `POST /api/pipeline?action=refresh-ko` | 어색한 한국어를 영문 원본 기준으로 재번역 (`limit` 최대 25, 기존 카드는 성공 시에만 덮어씀) |
| `POST /mcp` | MCP JSON-RPC 엔드포인트 |

### MCP 도구

| 도구 | 설명 |
|------|------|
| `search_releases` | 키워드·CSP·기간으로 릴리스 노트 검색 (ko 요약, 다국어 확장 예정) |
| `get_release` | article ID로 개별 릴리스 노트 조회 |
| `get_stats` | 번역/검수 파이프라인 현황 |

### 인증

- POST API는 `Authorization: Bearer <token>` 헤더 사용
- `GET /api/articles`는 whats-new.kr 자체 SSR(`site` 타입 토큰)만 허용 — 프로그램/에이전트 접근은 `POST /mcp` 사용. 배포 전환기라 `SITE_API_ENFORCEMENT`가 `warn`(기본, 로그만)일 때는 아직 막지 않고, SSR 쪽이 토큰을 정상적으로 보내는 게 로그로 확인되면 `on`으로 전환
- `retranslate` 계열은 허용된 관리자 IP(`ALLOWED_ADMIN_IPS`)에서만 처리
- `/mcp`는 요약 조회(기본 동작)엔 인증이 필요 없습니다

## 디자인 시스템

| 페이지 | 테마 | 영문 폰트 | 한글 폰트 |
|--------|------|----------|----------|
| Home | 중립 인디고 | Pretendard Variable | Pretendard Variable |
| /aws | Cloudscape | Amazon Ember | Noto Sans KR |
| /gcp | Material 3 | Google Sans | Noto Sans KR |
| /azure | Fluent UI 2 | Segoe UI | Noto Sans KR |

- 다크모드 지원 (시스템 설정 연동 + 수동 토글)
- CSP별 페이지: 상태 필터 (정식 출시/미리보기/베타/지원 종료), 텍스트 검색, 카드 하이라이트
- 카드 우클릭/롱프레스: 퍼머링크·ID 복사
- OG image (PNG 1200×630), JSON-LD 구조화 데이터
- 동적 sitemap (`lastmod` API 연동)

## 개발

```bash
# D1 스키마 초기화
npm run db:init

# Worker 로컬 실행
npm run worker:dev

# Pages 로컬 실행
npm run dev

# 배포 (git push 시 자동)
git push origin main
```

## CI/CD

GitHub Actions (`deploy.yml`, `push → main`):
- `worker/`, `wrangler.toml`, `schema.sql` 변경 → Workers 배포
- `src/`, `public/`, `package*`, `astro.config*` 변경 → Pages 빌드+배포+오래된 배포 정리

필요 시크릿: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

운영 시 추가 시크릿:
- `API_KEY_RING`: 서비스/MCP/사이트용 Bearer 토큰 목록 JSON
- Pages 프로젝트(`cloud-whats-new`)에 `SITE_API_TOKEN` (`wrangler pages secret put SITE_API_TOKEN`) — `API_KEY_RING`의 `type: "site"` 토큰과 같은 값. Astro SSR(`index.astro`, `[csp].astro`, `sitemap.xml.ts`)이 `/api/articles` 호출 시 이 값을 `Authorization: Bearer`로 보냄

운영 변수: `AUTH_ENFORCEMENT`, `SITE_API_ENFORCEMENT`, `ALLOWED_ADMIN_IPS`, `BACKLOG_QUEUE_BATCH_SIZE`, `ALERT_WEBHOOK_URL`

`API_KEY_RING` 예시:
```json
[
  { "id": "service-current", "type": "service", "token": "wnk_srv_..." },
  { "id": "service-next", "type": "service", "token": "wnk_srv_..." },
  { "id": "mcp-primary", "type": "mcp", "token": "wnk_mcp_..." },
  { "id": "site-internal", "type": "site", "token": "wnk_site_..." }
]
```
