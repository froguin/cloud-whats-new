import { parse } from 'rss-to-json';
import axios from 'axios';
import { getStore } from "@netlify/blobs";

const CACHE_KEY = 'aws-updates';
const CACHE_TTL = 3600; // 1시간 캐시

export const handler = async () => {
  try {
    console.log('Function started');
    
    if (!process.env.DEEPL_API_KEY) {
      console.error('DEEPL_API_KEY is not set');
      throw new Error('Required environment variable DEEPL_API_KEY is missing');
    }

    const store = getStore();
    
    try {
      // 캐시된 데이터 확인
      const cachedData = await store.get(CACHE_KEY);
      if (cachedData) {
        console.log('캐시된 데이터 반환');
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
          },
          body: JSON.stringify(cachedData)
        };
      }
    } catch (error) {
      console.log('캐시 데이터 조회 실패:', error);
      // 캐시 조회 실패시 새로운 데이터를 가져오도록 진행
    }

    // 새로운 데이터 가져오기
    const rss = await parse('https://aws.amazon.com/about-aws/whats-new/recent/feed/');
    const translatedItems = await Promise.all(rss.items.slice(0, 10).map(async item => {
      const [translatedTitle, translatedContent] = await Promise.all([
        translateText(item.title),
        translateText(item.description)
      ]);

      return {
        title: translatedTitle,
        date: new Date(item.published).toLocaleDateString('ko-KR'),
        content: translatedContent,
        target: "모든 AWS 사용자",
        features: "자세한 내용은 원문을 참조하세요",
        regions: "지원 리전 정보 없음",
        status: "일반 공개",
        originalLink: item.link || ''
      };
    }));

    // 데이터 캐싱
    try {
      await store.set(CACHE_KEY, translatedItems, {
        ttl: CACHE_TTL // 1시간 후 만료
      });
      console.log('데이터 캐시 성공');
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

function getCategoryFromDescription(description) {
  if (description.includes('EC2')) return '컴퓨팅';
  if (description.includes('S3')) return '스토리지';
  if (description.includes('Lambda')) return '서버리스';
  return '기타';
}
