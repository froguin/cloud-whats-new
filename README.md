# ☁️ What's New 한국어 요약

Amazon Web Services · Google Cloud · Microsoft Azure 클라우드 최신 업데이트를 한국어로 요약합니다.

**Live**: https://whats-new.kr

## 아키텍처

```
Cloudflare Workers (Cron 5-15분)
  → 3 CSP RSS 수집 (AWS 100 / GCP 100 / Azure 100)
  → D1 저장 (영문 원본 + 한국어 번역)
  → Cloudflare Queues에 번역 작업 적재
  → Queue consumer가 Workers AI (Llama 3.1 8B) 번역 처리
  → 15분마다 수집 + 즉시 enqueue + 5분 오프셋 backlog/품질 체크

Cloudflare Pages (Astro SSR)
  → /           통합 대시보드 (3단 컬럼)
  → /aws        AWS Cloudscape 테마
  → /gcp        Google Cloud Material 테마
  → /azure      Microsoft Azure Fluent 테마
```

## 비용: $0

| 서비스 | 무료 한도 | 예상 사용량 |
|--------|----------|------------|
| Workers | 100K req/일 | ~500/일 |
| Workers AI | 10K neurons/일 | ~3K/일 |
| D1 | 5GB / 5M reads/일 | ~5MB / ~5K reads |
| Pages | 무제한 대역폭 | - |

## RSS 소스

| CSP | 피드 | 형식 |
|-----|------|------|
| AWS | https://aws.amazon.com/about-aws/whats-new/recent/feed/ | RSS 2.0 |
| GCP | https://docs.cloud.google.com/feeds/gcp-release-notes.xml | Atom |
| Azure | https://www.microsoft.com/releasecommunications/api/v2/azure/rss | RSS 2.0 |

## 번역 품질 관리

- **즉시 처리**: 15분마다 수집 직후 새 기사를 Queue에 바로 적재
- **비동기 번역**: Queue consumer가 배치로 한국어 번역 처리
- **처리량 조절**: `BACKLOG_QUEUE_BATCH_SIZE`로 backlog enqueue 양 조정
- **권장 운영 주기**: 수집은 `0,15,30,45분`, backlog/품질 체크는 그 사이 5분 오프셋
- **자동**: 15분마다 품질 체크 (제목 길이, 이상 문자, 요약 반복, 엔티티 변경)
- **자동 재번역**: 기준 미달 시 1회 재시도 (`model_used='retried'`)
- **수동 개별**: `POST /api/retranslate?id=N`
- **수동 일괄**: `POST /api/retranslate-bad` (10건/회)
- **30일 자동 삭제**: 오래된 기사 자동 정리

## API

| 엔드포인트 | 설명 |
|-----------|------|
| `GET /api/articles?csp=aws&lang=ko&limit=100` | 기사 조회 |
| `GET /api/stats` | CSP/언어별 통계 |
| `POST /api/trigger` | 수동 수집+번역 |
| `POST /api/retranslate?id=N` | 개별 재번역 |
| `POST /api/retranslate-bad` | 품질 미달 일괄 재번역 |

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
1. Workers 배포 (`wrangler deploy`)
2. Pages 빌드+배포 (`npm run build` → `wrangler pages deploy`)

필요 시크릿: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`

## 디자인 시스템

| 페이지 | 테마 | 폰트 | 특징 |
|--------|------|------|------|
| Home | 중립 인디고 | Pretendard | 3단 대시보드 |
| /aws | Cloudscape | Open Sans | 다크 네이비 nav, 좌측 파랑 보더 |
| /gcp | Material 3 | Roboto Flex | 4색 nav, 플로팅 섀도우 |
| /azure | Fluent UI 2 | Inter | 파랑 상단 라인, 넓은 공백 |
