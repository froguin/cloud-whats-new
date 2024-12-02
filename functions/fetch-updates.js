import { parse } from 'rss-to-json';
import axios from 'axios';

export const handler = async (event) => {
  try {
    const rss = await parse('https://aws.amazon.com/about-aws/whats-new/recent/feed/');
    const translatedItems = await Promise.all(rss.items.slice(0, 10).map(async item => {
      const [translatedTitle, translatedContent] = await Promise.all([
        translateText(item.title),
        translateText(item.description)
      ]);

      return {
        title: translatedTitle,
        date: new Date(item.published).toLocaleDateString('ko-KR'),
        content: translatedContent
      };
    }));

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(translatedItems)
    };
  } catch (error) {
    console.error('Error:', error);
    return { 
      statusCode: 500, 
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: error.message }) 
    };
  }
};

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
  if (description.includes('EC2')) return '컴퓨팅';
  if (description.includes('S3')) return '스토리지';
  if (description.includes('Lambda')) return '서버리스';
  return '기타';
}
