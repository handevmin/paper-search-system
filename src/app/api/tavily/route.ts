import { NextResponse } from 'next/server';
import { tavily } from '@tavily/core';

// 환경 변수 로그
const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
console.log('API Route - TAVILY_API_KEY exists:', !!TAVILY_API_KEY);

export async function POST(request: Request) {
  console.log('API Route - Tavily POST request received');
  try {
    // API 키 확인
    if (!TAVILY_API_KEY) {
      console.error('API Route - Tavily API key is missing');
      return NextResponse.json(
        { error: 'Tavily API key is not configured' },
        { status: 500 }
      );
    }
    
    const body = await request.json();
    const { query } = body;
    
    console.log('API Route - Tavily query:', query);
    
    const tvly = tavily({ apiKey: TAVILY_API_KEY });
    // options 객체 추가
    const results = await tvly.search(query, {
      searchDepth: "advanced",
      maxResults: 5,
      includeAnswer: true,
      includeRawContent: false,
      includeImages: false
    });
    
    return NextResponse.json(results);
  } catch (error) {
    console.error('API Route - Tavily search error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    
    return NextResponse.json(
      { error: 'Failed to search with Tavily', details: errorMessage },
      { status: 500 }
    );
  }
}