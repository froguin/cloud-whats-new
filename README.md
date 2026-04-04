# ☁️ What's New 한국어 요약

Amazon Web Services · Google Cloud · Microsoft Azure 클라우드 최신 업데이트를 한국어로 요약합니다.

**Live**: https://whats-new.kr

## 아키텍처

```
Cloudflare Workers (Cron 매분)
  → 3 CSP RSS 수집 (AWS / GCP / Azure, 15분마다)
  → D1 저장 (영문 원본 + 한국어 번역)
  → Cloudflare Queues 번역 작업 적재 (backlog 매분 확인)
  → Queue consumer: 번역 (70B) → 검수 (8B) → 저장

Cloudflare Pages (Astro SSR)
  → /           통합 대시보드 (3단 컬럼)
  → /aws        AWS Cloudscape 테마
  → /gcp        Google Cloud Material 테마
  → /azure      Microsoft Azure Fluent 테마
```

## 번역 파이프라인

1. **번역**: Llama 3.3 70B — 본문 요약 → 제목 도출 → 상태/대상/기능/리전 추출
2. **검수**: Llama 3.1 8B — 제목/상태/리전 등 필드별 교차 검증, 오류 시 수정
3. **품질 게이트**: CJK 오염, 마크다운 잔재, 제목 잘림 등 자동 감지 → 재시도

## 비용: $0

| 서비스 | 무료 한도 | 예상 사용량 |
|--------|----------|------------|
| Workers | 100K req/일 | ~500/일 |
| Workers AI | 10K neurons/일 | ~5K/일 |
| D1 | 5GB / 5M reads/일 | ~10MB / ~5K reads |
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
| `GET /api/articles?csp=aws&lang=ko&limit=100` | 기사 조회 |
| `GET /api/stats` | 번역/검수/큐 상태 모니터링 |
| `POST /api/trigger` | 미번역 건 큐잉 |
| `POST /api/trigger?action=fetch` | RSS 수동 수집 |
| `POST /api/trigger?action=review&limit=N` | 미검수 건 일괄 검수 |
| `POST /api/retranslate?id=N` | 개별 재번역 |
| `POST /api/retranslate?id=N&hint=...` | 힌트 포함 재번역 |
| `POST /api/retranslate?id=N&action=review&hint=...` | 검수만 재실행 + 힌트 |
| `POST /api/retranslate-bad` | 품질 미달 일괄 재번역 |

## 디자인 시스템

| 페이지 | 테마 | 영문 폰트 | 한글 폰트 |
|--------|------|----------|----------|
| Home | 중립 인디고 | 벤더별 브랜드 폰트 | Pretendard |
| /aws | Cloudscape | Amazon Ember | Noto Sans KR |
| /gcp | Material 3 | Google Sans | Noto Sans KR |
| /azure | Fluent UI 2 | Segoe UI | Noto Sans KR |

## 개발

```bash
# Worker 로컬 실행
npx wrangler dev worker/index.js

# Pages 로컬 실행
npm run dev

# 배포 (git push 시 자동)
git push origin main
```

## CI/CD

GitHub Actions (`push → main`):
- `worker/` 변경 → Workers 배포
- `src/` 변경 → Pages 빌드+배포

필요 시크릿: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
