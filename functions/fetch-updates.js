import { parse } from 'rss-to-json';
import axios from 'axios';
import { getStore } from "@netlify/blobs";

const CACHE_KEY = 'aws-updates-v2';
const CACHE_TTL = 600; // 10분 캐시

export const handler = async () => {
  try {
    console.log('=== Function started ===');
    
    // 필수 환경변수 체크
    if (!process.env.DEEPL_API_KEY) {
      throw new Error('Required environment variable DEEPL_API_KEY is missing');
    }
    if (!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_ACCESS_TOKEN) {
      throw new Error('Required Netlify Blobs environment variables are missing');
    }
    console.log('환경변수 확인 완료');

    // Blob 스토어 초기화
    const store = getStore({
      name: "aws-updates-store",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN
    });

    // 캐시된 데이터 확인
    try {
      const cachedData = await store.get(CACHE_KEY);
      if (cachedData) {
        console.log('캐시된 데이터 반환');
        const parsedData = JSON.parse(cachedData);
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify({
            items: parsedData.items,
            meta: {
              isCached: true,
              lastUpdated: parsedData.timestamp,
              itemCount: parsedData.items.length
            }
          })
        };
      }
    } catch (cacheError) {
      console.error('캐시 조회 실패:', cacheError.message);
      // 캐시 조회 실패는 무시하고 새로운 데이터 가져오기 시도
    }

    // RSS 피드 가져오기
    let rss;
    try {
      rss = await parse('https://aws.amazon.com/about-aws/whats-new/recent/feed/');
      console.log('전체 RSS 항목 수:', rss.items.length);
    } catch (rssError) {
      console.error('RSS 피드 가져오기 실패:', rssError.message);
      throw new Error('AWS 업데이트 정보를 가져오는데 실패했습니다');
    }

    // 일주일 이내 항목 필터링
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const recentItems = rss.items.filter(item => {
      const itemDate = new Date(item.published);
      return itemDate >= oneWeekAgo;
    });
    console.log('일주일 이내 항목 수:', recentItems.length);

    // 번역 작업
    let translatedItems;
    try {
      translatedItems = await Promise.all(recentItems.map(async item => {
        console.log('번역 시작:', item.title.substring(0, 30) + '...');
        const [translatedTitle, translatedContent] = await Promise.all([
          translateText(item.title),
          translateText(item.description)
        ]);
        console.log('번역 완료:', translatedTitle.substring(0, 30) + '...');

        return {
          title: translatedTitle,
          date: new Date(item.published).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          content: translatedContent
            .replace(/<a\b[^>]*>|<\/a>|aws\.amazon\.com[^"'\s<>]*|https?:\/\/[^"'\s<>]*/gi, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/\s+/g, ' ')
            .replace(/\s*에서 확인하시기 바랍니다\.*/, '.')
            .replace(/자세한 내용은\s*\./, '')
            .trim(),
          target: "모든 AWS 사용자",
          features: "자세한 내용은 원문을 참조하세요",
          regions: "지원 리전 정보 없음",
          status: "일반 공개",
          originalLink: item.link || ''
        };
      }));
    } catch (translationError) {
      console.error('번역 실패:', translationError.message);
      throw new Error('컨텐츠 번역 중 오류가 발생했습니다');
    }

    // 모든 작업이 성공한 경우에만 캐시 업데이트
    try {
      const cacheData = {
        timestamp: new Date().toISOString(),
        items: translatedItems
      };
      await store.set(CACHE_KEY, JSON.stringify(cacheData), {
        ttl: CACHE_TTL
      });
      console.log('데이터 캐시 성공');
    } catch (cacheError) {
      // 캐시 저장 실패는 무시하고 계속 진행
      console.error('캐시 저장 실패:', cacheError.message);
    }

    console.log('=== Function completed ===');
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        items: translatedItems,
        meta: {
          isCached: false,
          lastUpdated: new Date().toISOString(),
          itemCount: translatedItems.length
        }
      })
    };

  } catch (error) {
    console.error('Function error:', error.message);
    console.error('Error stack:', error.stack);
    
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: '서버 오류가 발생했습니다',
        details: error.message 
      })
    };
  }
};

async function translateText(text) {
  try {
    const response = await axios.post(
      `https://api.deepl.com/v2/translate`,
      `text=${encodeURIComponent(text)}&target_lang=KO`,
      {
        headers: {
          'Authorization': `DeepL-Auth-Key ${process.env.DEEPL_API_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );
    return response.data.translations[0].text;
  } catch (error) {
    console.error('Translation error:', error);
    throw error;
  }
}
