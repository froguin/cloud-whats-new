const { parse } = require('rss-to-json');
const axios = require('axios');

exports.handler = async function(event, context) {
  try {
    const rss = await parse('https://aws.amazon.com/about-aws/whats-new/recent/feed/');
    const translatedItems = await Promise.all(rss.items.slice(0, 10).map(async item => {
      const [translatedTitle, translatedDescription] = await Promise.all([
        translateText(item.title),
        translateText(item.description)
      ]);

      return {
        title: translatedTitle,
        category: getCategoryFromDescription(item.description),
        description: translatedDescription,
        target: "모든 AWS 사용자",
        features: "자세한 내용은 원문을 참조하세요.",
        regions: "지원 리전 정보 없음",
        status: "일반 공개",
        date: new Date(item.published).toLocaleDateString('ko-KR')
      };
    }));

    return {
      statusCode: 200,
      body: JSON.stringify(translatedItems)
    };
  } catch (error) {
    return { statusCode: 500, body: error.toString() };
  }
}

async function translateText(text) {
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
}

function getCategoryFromDescription(description) {
  // 간단한 카테고리 추출 로직 (실제로는 더 복잡할 수 있음)
  if (description.includes('EC2')) return '컴퓨팅';
  if (description.includes('S3')) return '스토리지';
  if (description.includes('Lambda')) return '서버리스';
  return '기타';
}
