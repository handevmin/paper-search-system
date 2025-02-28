import { NextResponse } from 'next/server';
import { getJson } from 'serpapi';

const SERP_API_KEY = process.env.SERP_API_KEY;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = body;

    console.log('SERP API - Search query:', query);

    if (!SERP_API_KEY) {
      console.error('SERP API key not configured');
      return NextResponse.json({
        error: 'SERP API key is not configured'
      }, { status: 500 });
    }

    const params = {
      engine: "google_scholar",
      q: query,
      api_key: SERP_API_KEY,
      num: 10
    };

    const response = await getJson(params);
    
    return NextResponse.json(response);
  } catch (error) {
    console.error('SERP API error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    
    return NextResponse.json({
      error: 'Failed to search with SERP API',
      details: errorMessage
    }, { status: 500 });
  }
}