import { NextResponse } from 'next/server';

const PERPLEXITY_API_KEY = process.env.PERPLEXITY_API_KEY;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { abstract } = body;
    
    console.log('Perplexity API - Abstract query:', abstract.substring(0, 100) + '...');
    
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
      body: JSON.stringify({
        model: "sonar-pro",
        messages: [
          {
            role: "system",
            content: "You are a research assistant specialized in identifying PubMed papers. Return ONLY the PMID number without any additional text. If you can't find a PMID, respond with 'NOT_FOUND'."
          },
          {
            role: "user",
            content: `Find the exact PMID (PubMed ID) number for the medical research paper with this abstract: "${abstract}"`
          }
        ],
        max_tokens: 50,
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