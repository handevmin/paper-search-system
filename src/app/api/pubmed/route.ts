import { NextResponse } from 'next/server';

const PUBMED_API_KEY = process.env.PUBMED_API_KEY;
const DELAY = 1000; // 1초 딜레이

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const term = searchParams.get('term');
    const type = searchParams.get('type') || 'search';

    await sleep(DELAY);

    if (type === 'search') {
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term || '')}&apikey=${PUBMED_API_KEY}&retmax=5&retmode=json`;
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.error) {
        await sleep(DELAY * 2);
        const retryResponse = await fetch(searchUrl);
        return NextResponse.json(await retryResponse.json());
      }

      return NextResponse.json(data);
    } 
    else if (type === 'summary') {
      const ids = term?.split(',');
      // First get basic summary
      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids?.join(',')}&apikey=${PUBMED_API_KEY}&retmode=json&version=2.0`;
      const summaryResponse = await fetch(summaryUrl);
      const summaryData = await summaryResponse.json();

      if (summaryData.error) {
        await sleep(DELAY * 2);
        const retryResponse = await fetch(summaryUrl);
        return NextResponse.json(await retryResponse.json());
      }

      // Then get full article data including abstract
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids?.join(',')}&apikey=${PUBMED_API_KEY}&retmode=xml`;
      const fetchResponse = await fetch(fetchUrl);
      const fetchData = await fetchResponse.text();

      // Combine the data
      return NextResponse.json({
        summary: summaryData,
        full: fetchData
      });
    }

    return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
  } catch (error) {
    console.error('PubMed API error:', error);
    return NextResponse.json({ 
      error: 'Failed to fetch from PubMed',
      details: error.message 
    }, { status: 500 });
  }
}