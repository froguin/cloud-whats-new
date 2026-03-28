# Cloud What's New — v2

3대 CSP(AWS, GCP, Azure)의 최신 업데이트를 한국어로 요약하여 제공합니다.

## 아키텍처

```
Cloudflare Workers (Cron, 6시간)
  → 3 CSP RSS 스크래핑
  → D1: articles (영문 원본)
  → Workers AI (Llama 3.1 8B): 한국어 번역
  → D1: translations

Cloudflare Pages (Astro SSR)
  → /           통합 뷰 (전체 CSP)
  → /aws        AWS 업데이트
  → /gcp        GCP 업데이트
  → /azure      Azure 업데이트
  → Workers API에서 데이터 fetch
```

## 비용: $0

| 서비스 | 무료 한도 | 예상 사용량 |
|--------|----------|------------|
| Workers | 100K req/일 | ~200/일 |
| D1 | 5GB, 5M reads/일 | ~50MB, ~1K reads/일 |
| Workers AI | 10K neurons/일 | ~5K/일 |
| Pages | 무제한 대역폭 | - |

## 개발

```bash
# Worker 로컬 실행
npx wrangler dev worker/index.js

# D1 스키마 적용
npx wrangler d1 execute cloud-whats-new --file=schema.sql

# 배포
npx wrangler deploy worker/index.js
npx wrangler pages deploy dist
```

## 향후 계획

- [ ] 일본어/중국어 번역 추가
- [ ] 백오피스 (번역 품질 관리, 재번역)
- [ ] 에이전트 시스템 연동 (Content_Planner → D1 API)
- [ ] OCI/IBM Cloud 추가 (HTML 스크래핑)
