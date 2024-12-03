import { parse } from 'rss-to-json';
import axios from 'axios';
import { getStore } from "@netlify/blobs";

const CACHE_KEY = 'aws-updates';
const CACHE_TTL = 600; // 10분 캐시

export const handler = async () => {
  try {
    console.log('Function started');
    
    if (!process.env.DEEPL_API_KEY) {
      console.error('DEEPL_API_KEY is not set');
      throw new Error('Required environment variable DEEPL_API_KEY is missing');
    }

    if (!process.env.NETLIFY_SITE_ID || !process.env.NETLIFY_ACCESS_TOKEN) {
      console.error('Netlify Blobs 환경 변수가 설정되지 않았습니다');
      throw new Error('Required Netlify Blobs environment variables are missing');
    }

    const store = getStore({
      name: "aws-updates-store",
      siteID: process.env.NETLIFY_SITE_ID,
      token: process.env.NETLIFY_ACCESS_TOKEN
    });
    
    try {
      // 캐시된 데이터 확인
      const cachedData = await store.get(CACHE_KEY);
      if (cachedData) {
        console.log('캐시된 데이터 반환');
        const parsedData = JSON.parse(cachedData);
        console.log('마지막 업데이트:', new Date(parsedData.timestamp).toLocaleString('ko-KR'));
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(parsedData.items)
        };
      }
    } catch (error) {
      console.log('캐시 데이터 조회 실패:', error);
      // 캐시 조회 실패시 새로운 데이터를 가져오도록 진행
    }

    // 새로운 데이터 가져오기
    const rss = await parse('https://aws.amazon.com/about-aws/whats-new/recent/feed/');
    console.log('전체 RSS 항목 수:', rss.items.length);
    
    // 일주일 전 날짜 계산
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    // 일주일 이내의 항목만 필터링
    const recentItems = rss.items.filter(item => {
      const itemDate = new Date(item.published);
      return itemDate >= oneWeekAgo;
    });
    console.log('일주일 이내 항목 수:', recentItems.length);

    const translatedItems = await Promise.all(recentItems.map(async item => {
      const [translatedTitle, translatedContent] = await Promise.all([
        translateText(item.title),
        translateText(item.description)
      ]);

      return {
        title: translatedTitle,
        date: new Date(item.published).toLocaleDateString('ko-KR', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        content: translatedContent
          .replace(/<a\b[^>]*>/gi, '') // 링크 태그 제거
          .replace(/<\/a>/gi, '')      // 링크 닫는 태그 제거
          .replace(/&nbsp;/g, ' ')     // &nbsp; 를 일반 공백으로 변경
          .replace(/\s+/g, ' ')        // 연속된 공백을 하나로
          .trim(),                     // 앞뒤 공백 제거
        target: "모든 AWS 사용자",
        features: "자세한 내용은 원문을 참조하세요",
        regions: "지원 리전 정보 없음",
        status: "일반 공개",
        originalLink: item.link || ''
      };
    }));

    // 데이터 캐싱
    const cacheData = {
      timestamp: new Date().toISOString(),
      items: translatedItems
    };

    try {
      await store.set(CACHE_KEY, JSON.stringify(cacheData), {
        ttl: CACHE_TTL
      });
      console.log('데이터 캐시 성공 -', new Date().toLocaleString('ko-KR'));
    } catch (error) {
      console.error('데이터 캐시 실패:', error);
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(translatedItems)
    };
  } catch (error) {
    console.error('Function error:', error);
    
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
      `https://api-free.deepl.com/v2/translate`,
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
