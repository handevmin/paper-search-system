import { NextResponse } from 'next/server';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { textContent } = body;
    
    console.log('Perplexity API - Text query:', textContent.substring(0, 100) + '...');
    
    if (!PERPLEXITY_API_KEY) {
      console.error('Perplexity API key not configured');
      return NextResponse.json({
        error: 'Perplexity API key is not configured'
      }, { status: 500 });
    }
    
    const options = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${PERPLEXITY_API_KEY}`,
        'Content-Type': 'application/json'
      },
      // API 요청 본문 수정
      body: JSON.stringify({
        model: "sonar-deep-research",
        messages: [
          {
            role: "system",
            content: "You are a helpful AI research assistant that specializes in finding academic papers and their identifiers."
          },
          {
            role: "user",
            content: `${textContent}\n\n해당 논문의 pubmed id 알려줘`
          }
        ],
        max_tokens: 500,
        temperature: 0.1,
        top_p: 0.9
      })
    };
    
    const response = await fetch('https://api.perplexity.ai/chat/completions', options);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('Perplexity API error response:', errorText);
      throw new Error(`Perplexity API request failed with status ${response.status}`);
    }
    
    const data = await response.json();
    console.log('Perplexity API response:', data);
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Perplexity API error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    
    return NextResponse.json({
      error: 'Failed to search with Perplexity API',
      details: errorMessage
    }, { status: 500 });
  }
}