import { NextResponse } from 'next/server';

const PUBMED_API_KEY = process.env.PUBMED_API_KEY;
const DELAY = 1000; // 1 second delay

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const term = searchParams.get('term');
    const type = searchParams.get('type') || 'search';
    const retmax = searchParams.get('retmax') || '20'; // Default to 20 results

    await sleep(DELAY);

    if (type === 'search') {
      // The esearch endpoint to get PMIDs
      const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term || '')}&apikey=${PUBMED_API_KEY}&retmax=${retmax}&retmode=json`;
      const response = await fetch(searchUrl);
      const data = await response.json();

      if (data.error) {
        console.error('PubMed API error, retrying:', data.error);
        await sleep(DELAY * 2);
        const retryResponse = await fetch(searchUrl);
        return NextResponse.json(await retryResponse.json());
      }

      return NextResponse.json(data);
    } 
    else if (type === 'summary') {
      const ids = term?.split(',');
      
      // First get basic summary using esummary
      const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids?.join(',')}&apikey=${PUBMED_API_KEY}&retmode=json&version=2.0`;
      const summaryResponse = await fetch(summaryUrl);
      const summaryData = await summaryResponse.json();

      if (summaryData.error) {
        console.error('PubMed summary API error, retrying:', summaryData.error);
        await sleep(DELAY * 2);
        const retryResponse = await fetch(summaryUrl);
        return NextResponse.json(await retryResponse.json());
      }

      // Then get full article data including abstract using efetch
      const fetchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${ids?.join(',')}&apikey=${PUBMED_API_KEY}&retmode=xml&linkname=pubmed_pubmed_refs`;
      const fetchResponse = await fetch(fetchUrl);
      const fetchData = await fetchResponse.text();

      // Combine the data
      return NextResponse.json({
        summary: summaryData,
        full: fetchData
      });
    }
    else if (type === 'citations') {
      // Get papers that cite the given PMID using elink
      const citationUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&db=pubmed&id=${term}&cmd=neighbor_score&linkname=pubmed_pubmed_citedin&apikey=${PUBMED_API_KEY}&retmode=json`;
      const citationResponse = await fetch(citationUrl);
      const citationData = await citationResponse.json();

      if (citationData.error) {
        console.error('PubMed citation API error, retrying:', citationData.error);
        await sleep(DELAY * 2);
        const retryResponse = await fetch(citationUrl);
        return NextResponse.json(await retryResponse.json());
      }

      return NextResponse.json(citationData);
    }
    else if (type === 'references') {
      // Get papers referenced by the given PMID using elink
      const referencesUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/elink.fcgi?dbfrom=pubmed&db=pubmed&id=${term}&cmd=neighbor_score&linkname=pubmed_pubmed_refs&apikey=${PUBMED_API_KEY}&retmode=json`;
      const referencesResponse = await fetch(referencesUrl);
      const referencesData = await referencesResponse.json();

      if (referencesData.error) {
        console.error('PubMed references API error, retrying:', referencesData.error);
        await sleep(DELAY * 2);
        const retryResponse = await fetch(referencesUrl);
        return NextResponse.json(await retryResponse.json());
      }

      return NextResponse.json(referencesData);
    }

    return NextResponse.json({ error: 'Invalid request type' }, { status: 400 });
  } catch (error) {
    console.error('PubMed API error:', error);
    
    // Check error type for safer error handling
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    
    return NextResponse.json({ 
      error: 'Failed to fetch from PubMed',
      details: errorMessage 
    }, { status: 500 });
  }
}