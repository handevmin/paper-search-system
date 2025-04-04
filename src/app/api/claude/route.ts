import { NextResponse } from 'next/server';

const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

export async function POST(request: Request) {
  try {
    const body = await request.json();
    
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: new Headers({
        'Content-Type': 'application/json',
        'x-api-key': CLAUDE_API_KEY || '',
        'anthropic-version': '2023-06-01'
      }),
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: body.prompt
        }]
      })
    });

    if (!response.ok) {
      throw new Error(`Claude API responded with status: ${response.status}`);
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error('Claude API error:', error);
    
    // error 타입을 체크하여 안전하게 처리
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    
    return NextResponse.json(
      { error: 'Failed to call Claude API', details: errorMessage },
      { status: 500 }
    );
  }
}