import { parse } from 'rss-to-json';
import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { getStore } from "@netlify/blobs";

const CACHE_KEY = 'aws-updates-v2';
const CACHE_TTL = 600; // 10분 캐시

// 클라이언트를 최상위 범위에서 생성
const bedrockClient = new BedrockRuntimeClient({
  region: process.env.CUSTOM_AWS_REGION,
  credentials: {
    accessKeyId: process.env.CUSTOM_AWS_ACCESS_KEY,
    secretAccessKey: process.env.CUSTOM_AWS_SECRET_KEY
  }
});


// Claude 모델을 사용한 요약 및 번역 함수
async function invokeClaudeSummarization(title, description) {
  const prompt = generateSystemPrompt(title, description);

  const params = {
    modelId: 'anthropic.claude-3-haiku-20240307-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      anthropic_version: "bedrock-2023-05-31",
      max_tokens: 1000,
      messages: [
        {
          role: "user",
          content: prompt
        }
      ]
    })
  };

  try {
    const command = new InvokeModelCommand(params);
    const response = await bedrockClient.send(command);
    const decodedResponseBody = new TextDecoder().decode(response.body);
    const parsedResponse = JSON.parse(decodedResponseBody);
    
    return parseClaudeResponse(parsedResponse.content[0].text);
  } catch (error) {
    console.error('Claude 모델 호출 중 오류:', error);
    throw error;
  }
}

// Claude 응답 파싱 함수
function parseClaudeResponse(responseText) {
  try {
    // 응답에서 내부 JSON 블록 찾기
    const jsonStart = responseText.indexOf('{', responseText.indexOf('"title"'));
    const jsonEnd = responseText.lastIndexOf('}');
    const jsonString = responseText.substring(jsonStart, jsonEnd + 1);

    // 불필요한 문자 정리
    const cleanedJson = jsonString
      .replace(/\\n/g, ' ')          // 줄바꿈 제거
      .replace(/\\t/g, ' ')          // 탭 제거
      .replace(/\s{2,}/g, ' ')       // 중복 공백 제거
      .replace(/\\\\"/g, '"')        // 이중 이스케이프된 따옴표 제거
      .replace(/\\'/g, "'")          // 이스케이프된 작은따옴표 제거
      .trim();

    // JSON 파싱
    const parsedResponse = JSON.parse(cleanedJson);

    // content 필드에 중첩된 JSON이 있다면 추가로 파싱 시도
    if (typeof parsedResponse.content === 'string' && parsedResponse.content.startsWith('{')) {
      try {
        parsedResponse.content = JSON.parse(parsedResponse.content);
      } catch (contentError) {
        console.warn('content 파싱 실패:', contentError);
      }
    }
    
    return {
      title: parsedResponse.title || '제목 없음',
      summary: parsedResponse.summary || '내용 없음',
      target: parsedResponse.target || "모든 AWS 사용자",
      features: parsedResponse.features || "자세한 내용은 원문을 참조하세요",
      regions: parsedResponse.regions || "지원 리전 정보 없음",
      status: parsedResponse.status || "알 수 없음"
    };
  } catch (error) {
    console.error('JSON 파싱 오류:', error);
    // 기본 폴백 응답
    return {
      title: '파싱 오류 발생',
      summary: responseText
    };
  }
}

// 시스템 프롬프트 생성 함수
function generateSystemPrompt(title, description) {
  return `
You are an expert in analyzing AWS service updates and providing concise, structured summaries for Korean-speaking AWS users.

Original Title: ${title}
Original Description: ${description}

Please provide a **single-line JSON-formatted response** with the following structure:
{
  "title": "한국어로 번역된 명확하고 간결한 제목",
  "summary": "3-4문장으로 주요 업데이트 내용을 한국어로 요약 (100자 이하)",
  "target": "이 업데이트의 주요 대상 사용자 그룹 (단일 문장)",
  "features": "주요 기능 또는 변경 사항 요약 (100자 이하)",
  "regions": "지원되는 AWS 리전 (알려진 경우, 없으면 '해당 없음')",
  "status": "현재 상태 (예: 일반 공개, 베타, 제한된 출시 등)"
}

**Important Guidelines:**
1. 응답은 **단일 줄**로 작성하고 줄바꿈이나 탭 문자를 사용하지 마십시오.
2. 각 필드 값은 평문 문자열로 작성하고 중첩된 JSON을 포함하지 마십시오.
3. 모든 필드는 JSON.parse()로 바로 파싱 가능해야 합니다.
4. 알 수 없는 정보는 "알 수 없음" 또는 "해당 없음"으로 작성하십시오.
5. 응답은 **최대 300자**를 넘지 않도록 간결하게 작성하십시오.

**Example JSON Response:**
{
  "title": "AWS Lambda 기능 개선 발표",
  "summary": "AWS Lambda가 새로운 메모리 옵션과 고급 모니터링 기능을 제공합니다.",
  "target": "서버리스 애플리케이션 개발자",
  "features": "메모리 옵션, 고급 모니터링",
  "regions": "모든 AWS 리전",
  "status": "일반 공개"
}
`;
}

export const handler = async () => {
  try {
    console.log('=== Function started ===');
    
    // 환경변수 체크
    const requiredEnvVars = [
      'CUSTOM_AWS_ACCESS_KEY', 
      'CUSTOM_AWS_SECRET_KEY', 
      'CUSTOM_AWS_REGION', 
      'NETLIFY_SITE_ID', 
      'NETLIFY_ACCESS_TOKEN'
    ];
    
    requiredEnvVars.forEach(varName => {
      if (!process.env[varName]) {
        throw new Error(`Required environment variable ${varName} is missing`);
      }
    });

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

    // 요약 및 번역 작업
    let processedItems;
    try {
      processedItems = await Promise.all(recentItems.map(async item => {
        console.log('처리 시작:', item.title.substring(0, 30) + '...');
        
        // Claude 요약 및 번역 요청
        const summaryResponse = await invokeClaudeSummarization(
          item.title, 
          item.description
        );

        console.log('처리 완료:', item.title.substring(0, 30) + '...');

        return {
          title: summaryResponse.title,
          date: new Date(item.published).toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }),
          content: summaryResponse.summary,
          target: summaryResponse.target || "모든 AWS 사용자",
          features: summaryResponse.features || "자세한 내용은 원문을 참조하세요",
          regions: summaryResponse.regions || "지원 리전 정보 없음",
          status: summaryResponse.status || "일반 공개",
          originalLink: item.link || ''
        };
      }));
    } catch (processError) {
      console.error('처리 실패:', processError.message);
      throw new Error('컨텐츠 처리 중 오류가 발생했습니다');
    }

    // 모든 작업이 성공한 경우에만 캐시 업데이트
    try {
      const cacheData = {
        timestamp: new Date().toISOString(),
        items: processedItems  // translatedItems 대신 processedItems 사용
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
        items: processedItems,  // translatedItems 대신 processedItems 사용
        meta: {
          isCached: false,
          lastUpdated: new Date().toISOString(),
          itemCount: processedItems.length  // translatedItems.length 대신 processedItems.length 사용
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
