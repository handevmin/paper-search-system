'use client';
import React, { useState, useEffect, useCallback } from 'react';
import { Search, Save, BookOpen, FileText, Clock, Star, ExternalLink, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import _ from 'lodash';

interface Paper {
  id: string;
  pmid: string;
  title: string;
  authors: string;
  journal: string;
  year: string;
  abstract: string;
  pubDate: string;
  relevanceScore: number;
  summary: string;
  doi?: string;
  url?: string;
  citations?: string[];
  references?: string[];
  isExpanded?: boolean;
}

interface SearchConfig {
  maxResults: number;
  includeReferences: boolean;
  includeCitations: boolean;
}

const DEFAULT_MAX_RESULTS = 20;

const PaperSearchSystem = () => {
  const [discussionText, setDiscussionText] = useState('');
  const [papers, setPapers] = useState<Paper[]>([]);
  const [filteredPapers, setFilteredPapers] = useState<Paper[]>([]);
  const [searchTerms, setSearchTerms] = useState<string[]>([]);
  const [selectedPaper, setSelectedPaper] = useState<Paper | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    maxResults: DEFAULT_MAX_RESULTS,
    includeReferences: true,
    includeCitations: true,
  });
  const [filterText, setFilterText] = useState('');
  const [searchProgress, setSearchProgress] = useState({ current: 0, total: 0 });
  const [expandedAbstracts, setExpandedAbstracts] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState('all');

  // Function to copy text to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        // Show toast notification (you could add a toast component here)
        console.log('Text copied to clipboard');
      })
      .catch(err => {
        console.error('Could not copy text: ', err);
      });
  };

  // Function to generate search terms using Claude API
  const generateSearchTerms = async (text: string) => {
    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: `You are a scientific research assistant tasked with generating detailed PubMed search terms.

Given the following research discussion, generate 8-12 diverse and specific PubMed search terms. 
Include both specific concepts and broader related areas. Include terms for:
1. Main concepts directly mentioned
2. Related biological mechanisms or pathways
3. Key techniques or methodologies relevant to this research
4. Potential applications or clinical relevance
5. Consider including 1-2 authors if any prominent researchers are known in this field

Format each search term for optimal PubMed results using appropriate search operators.
Return only the search terms, one per line, with no additional text:

${text}`
        })
      });

      if (!response.ok) {
        throw new Error('Claude API request failed');
      }

      const data = await response.json();
      const searchTerms = data.content[0].text.trim().split('\n');
      return searchTerms.filter((term: string) => term.length > 0);
    } catch (error) {
      console.error('Error generating search terms:', error);
      return [text];
    }
  };

  // Function to analyze paper using Claude API
  const analyzePaperRelevance = async (paperContent: string, discussionContent: string) => {
    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: `Task: Analyze the relevance of a research paper to given discussion content.

Discussion content:
${discussionContent}

Paper content:
${paperContent}

Respond with a JSON object in this exact format (and nothing else):
{
  "relevanceScore": <number between 1 and 10>,
  "summary": "<three line summary with each line separated by \\n>"
}`
        })
      });

      if (!response.ok) {
        throw new Error('Claude API request failed');
      }

      const data = await response.json();
      const result = JSON.parse(data.content[0].text);
      return {
        relevanceScore: result.relevanceScore,
        summary: result.summary
      };
    } catch (error) {
      console.error('Error analyzing paper:', error);
      return {
        relevanceScore: 5,
        summary: "1. Error analyzing paper\n2. Please try again later\n3. Service temporarily unavailable"
      };
    }
  };

  // Function to parse XML data
  const parseXMLResponse = (xmlText: string) => {
    const parser = new DOMParser();
    return parser.parseFromString(xmlText, 'text/xml');
  };

  // Extract DOI from XML article
  const extractDOI = (article: Element): string | undefined => {
    const articleIds = article.querySelectorAll('ArticleId');
    for (let i = 0; i < articleIds.length; i++) {
      if (articleIds[i].getAttribute('IdType') === 'doi') {
        return articleIds[i].textContent || undefined;
      }
    }
    return undefined;
  };

  // Extract citations and references
  const extractReferences = (article: Element): string[] => {
    const references: string[] = [];
    const referenceList = article.querySelectorAll('Reference');

    for (let i = 0; i < referenceList.length; i++) {
      // 여러 유형의 ID 처리
      const pmid = referenceList[i].querySelector('ArticleId[IdType="pubmed"]');
      const doi = referenceList[i].querySelector('ArticleId[IdType="doi"]');
      const refArticleId = referenceList[i].querySelector('ArticleId');

      if (pmid && pmid.textContent) {
        references.push(pmid.textContent);
      } else if (doi && doi.textContent) {
        // DOI가 있지만 PMID가 없는 경우 처리 (필요시)
        console.log('Reference with DOI but no PMID:', doi.textContent);
      } else if (refArticleId && refArticleId.textContent) {
        references.push(refArticleId.textContent);
      }
    }

    return references;
  }

  // Function to search PubMed
  const searchPubMed = async (searchTerm: string, maxResults = DEFAULT_MAX_RESULTS) => {
    try {
      console.log('Searching for term:', searchTerm, 'max results:', maxResults);

      // First, search for IDs with increased retmax parameter
      const searchResponse = await fetch(`/api/pubmed?type=search&term=${encodeURIComponent(searchTerm)}&retmax=${maxResults}`);
      if (!searchResponse.ok) {
        throw new Error('PubMed search failed');
      }

      const searchData = await searchResponse.json();
      console.log('Search data:', searchData);

      const ids = searchData.esearchresult?.idlist || [];
      console.log('Found IDs:', ids);

      if (ids.length === 0) {
        return [];
      }

      // Process in batches to avoid overloading the API
      const batchSize = 5;
      const batches = [];
      for (let i = 0; i < ids.length; i += batchSize) {
        batches.push(ids.slice(i, i + batchSize));
      }

      let allPapers: Paper[] = [];

      for (let i = 0; i < batches.length; i++) {
        const batchIds = batches[i];
        // Update progress
        setSearchProgress({
          current: i * batchSize,
          total: ids.length
        });

        // Get summaries and full data for these IDs
        const summaryResponse = await fetch(`/api/pubmed?type=summary&term=${batchIds.join(',')}`);
        if (!summaryResponse.ok) {
          throw new Error('PubMed summary fetch failed');
        }

        const summaryData = await summaryResponse.json();

        // XML parsing
        const xmlDoc = parseXMLResponse(summaryData.full);
        const articles = xmlDoc.getElementsByTagName('PubmedArticle');

        // Process the papers data
        const summaryResult = summaryData.summary.result;
        const batchPapers = Object.entries(summaryResult || {})
          .filter(([key]) => key !== 'uids')
          .map(([_, paper]) => {
            const typedPaper = paper as {
              uid: string;
              title: string;
              authors: Array<{ name: string }>;
              source: string;
              pubdate: string;
            };

            // Get abstract and other data from XML
            const articleId = typedPaper.uid;
            let abstractText = 'No abstract available';
            let doi: string | undefined;
            let references: string[] = [];

            // Find the corresponding article in XML
            for (let i = 0; i < articles.length; i++) {
              const pmid = articles[i].querySelector('PMID')?.textContent;
              if (pmid === articleId) {
                // Extract abstract
                const abstractElement = articles[i].querySelector('Abstract AbstractText');
                if (abstractElement) {
                  abstractText = abstractElement.textContent || abstractText;
                }

                // Extract DOI
                doi = extractDOI(articles[i]);

                // Extract references
                references = extractReferences(articles[i]);

                break;
              }
            }

            // Construct paper URL
            const pmcId = doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${articleId}/`;

            return {
              id: typedPaper.uid,
              pmid: typedPaper.uid,
              title: typedPaper.title || 'No title available',
              authors: Array.isArray(typedPaper.authors)
                ? typedPaper.authors.map(author => author.name).join(', ')
                : 'Unknown authors',
              journal: typedPaper.source || 'Unknown journal',
              year: typedPaper.pubdate?.split(' ')[0] || 'Unknown year',
              abstract: abstractText,
              pubDate: typedPaper.pubdate || 'Unknown date',
              doi: doi,
              url: pmcId,
              references: references
            };
          });

        // Analyze each paper using Claude
        const analysisPromises = batchPapers.map(async paper => {
          const paperContent = `Title: ${paper.title}\nAbstract: ${paper.abstract}`;
          const analysis = await analyzePaperRelevance(paperContent, discussionText);
          return {
            ...paper,
            relevanceScore: analysis.relevanceScore,
            summary: analysis.summary
          };
        });

        const papersWithAnalysis = await Promise.all(analysisPromises);
        allPapers = [...allPapers, ...papersWithAnalysis];

        // Short pause to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log('All papers with analysis:', allPapers);
      return allPapers;
    } catch (error) {
      console.error('Error searching PubMed:', error);
      return [];
    }
  };

  // Function to find papers that cite a given PMID
  const findCitingPapers = async (pmid: string, maxResults = 10) => {
    try {
      const searchResponse = await fetch(`/api/pubmed?type=search&term=${pmid}[PMID]+AND+cited[sb]&retmax=${maxResults}`);
      if (!searchResponse.ok) {
        throw new Error('PubMed citation search failed');
      }

      const searchData = await searchResponse.json();
      const citationIds = searchData.esearchresult?.idlist || [];

      if (citationIds.length === 0) {
        return [];
      }

      // Use the same processing as the main search
      const summaryResponse = await fetch(`/api/pubmed?type=summary&term=${citationIds.join(',')}`);
      if (!summaryResponse.ok) {
        throw new Error('PubMed citation summary fetch failed');
      }

      const summaryData = await summaryResponse.json();
      const xmlDoc = parseXMLResponse(summaryData.full);
      const articles = xmlDoc.getElementsByTagName('PubmedArticle');
      const summaryResult = summaryData.summary.result;

      const citingPapers = Object.entries(summaryResult || {})
        .filter(([key]) => key !== 'uids')
        .map(([_, paper]) => {
          const typedPaper = paper as {
            uid: string;
            title: string;
            authors: Array<{ name: string }>;
            source: string;
            pubdate: string;
          };

          // Get abstract and other data from XML
          const articleId = typedPaper.uid;
          let abstractText = 'No abstract available';
          let doi: string | undefined;

          // Find the corresponding article in XML
          for (let i = 0; i < articles.length; i++) {
            const articlePmid = articles[i].querySelector('PMID')?.textContent;
            if (articlePmid === articleId) {
              const abstractElement = articles[i].querySelector('Abstract AbstractText');
              if (abstractElement) {
                abstractText = abstractElement.textContent || abstractText;
              }
              doi = extractDOI(articles[i]);
              break;
            }
          }

          const pmcId = doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${articleId}/`;

          return {
            id: typedPaper.uid,
            pmid: typedPaper.uid,
            title: typedPaper.title || 'No title available',
            authors: Array.isArray(typedPaper.authors)
              ? typedPaper.authors.map(author => author.name).join(', ')
              : 'Unknown authors',
            journal: typedPaper.source || 'Unknown journal',
            year: typedPaper.pubdate?.split(' ')[0] || 'Unknown year',
            abstract: abstractText,
            pubDate: typedPaper.pubdate || 'Unknown date',
            doi: doi,
            url: pmcId,
            relevanceScore: 7, // Default score for citing papers
            summary: "1. Paper cites the selected paper\n2. May contain relevant follow-up research\n3. Check for extensions or contradictions to the original work"
          };
        });

      return citingPapers;
    } catch (error) {
      console.error('Error finding citing papers:', error);
      return [];
    }
  };

  // 참고문헌 논문 가져오기 함수
  const findReferencedPapers = async (referenceIds: string[], maxResults = 100) => {
    try {
      if (!referenceIds || referenceIds.length === 0) {
        return [];
      }

      // 배치 크기를 작게 설정 (10개씩)
      const batchSize = 10;
      const allReferencedPapers = [];

      // 최대 결과 수 제한
      const idsToProcess = referenceIds.slice(0, maxResults);

      // 배치 단위로 처리
      for (let i = 0; i < idsToProcess.length; i += batchSize) {
        const batchIds = idsToProcess.slice(i, i + batchSize);

        // 로그 추가
        console.log(`Processing batch ${i / batchSize + 1}, IDs:`, batchIds);

        try {
          // 각 ID를 개별적으로 처리 (API 오류 방지)
          for (const id of batchIds) {
            try {
              const singleResponse = await fetch(`/api/pubmed?type=summary&term=${id}`);
              if (!singleResponse.ok) continue;

              const singleData = await singleResponse.json();
              if (!singleData || !singleData.summary || !singleData.summary.result) {
                console.log('Skipping invalid response for ID:', id);
                continue;
              }

              const xmlDoc = parseXMLResponse(singleData.full);
              const article = xmlDoc.querySelector('PubmedArticle');

              if (!article) continue;

              // 논문 정보 추출
              const pmid = article.querySelector('PMID')?.textContent;
              if (!pmid) continue;

              const paperData = singleData.summary.result[pmid];
              if (!paperData) continue;

              // 초록 추출
              let abstractText = 'No abstract available';
              const abstractElement = article.querySelector('Abstract AbstractText');
              if (abstractElement) {
                abstractText = abstractElement.textContent || abstractText;
              }

              // DOI 추출
              const doi = extractDOI(article);

              // URL 구성
              const pmcId = doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

              // 참고문헌 논문 정보 구성
              const paper = {
                id: pmid,
                pmid: pmid,
                title: paperData.title || 'No title available',
                authors: Array.isArray(paperData.authors)
                  ? paperData.authors.map((author: { name: string }) => author.name).join(', ')
                  : 'Unknown authors',
                journal: paperData.source || 'Unknown journal',
                year: paperData.pubdate?.split(' ')[0] || 'Unknown year',
                abstract: abstractText,
                pubDate: paperData.pubdate || 'Unknown date',
                doi: doi,
                url: pmcId,
                relevanceScore: 8, // 참고문헌은 관련성 높음
                summary: "1. Referenced in the main paper\n2. Provides important background research\n3. Essential for understanding the research context"
              };

              allReferencedPapers.push(paper);
            } catch (idError) {
              console.error(`Error processing reference ID ${id}:`, idError);
            }

            // API 제한 방지를 위한 지연
            await new Promise(resolve => setTimeout(resolve, 300));
          }
        } catch (batchError) {
          console.error(`Error processing batch starting at index ${i}:`, batchError);
        }
      }

      return allReferencedPapers;
    } catch (error) {
      console.error('Error finding referenced papers:', error);
      return [];
    }
  };

  const extractPMIDFromAbstract = (text: string): string | null => {
    const pmidMatch = text.match(/PMID:\s*(\d+)/i);
    return pmidMatch ? pmidMatch[1] : null;
  };

  interface PaperResponse {
    summary: {
      result: Record<string, {
        uid: string;
        title?: string;
        authors?: Array<{ name: string }>;
        source?: string;
        pubdate?: string;
      }>;
    };
    full: string;
  }

  const processPaperData = (paperData: PaperResponse): Paper => {
    try {
      // XML 파싱
      const xmlDoc = parseXMLResponse(paperData.full);
      const articles = xmlDoc.getElementsByTagName('PubmedArticle');

      // 결과 데이터 가져오기
      const summaryResult = paperData.summary.result;
      const pmid = Object.keys(summaryResult).find(key => key !== 'uids');

      if (!pmid) {
        throw new Error('No PMID found in paper data');
      }

      const paper = summaryResult[pmid];

      // 논문 정보 찾기
      let abstractText = 'No abstract available';
      let doi = undefined;
      const references: string[] = [];

      // XML에서 해당 논문 찾기
      for (let i = 0; i < articles.length; i++) {
        const articlePmid = articles[i].querySelector('PMID')?.textContent;
        if (articlePmid === pmid) {
          // 초록 추출
          const abstractElement = articles[i].querySelector('Abstract AbstractText');
          if (abstractElement) {
            abstractText = abstractElement.textContent || abstractText;
          }

          // DOI 추출
          doi = extractDOI(articles[i]);

          // 참고문헌 추출
          const refs = extractReferences(articles[i]);
          references.push(...refs);

          break;
        }
      }

      // URL 구성
      const pmcId = doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

      return {
        id: pmid,
        pmid: pmid,
        title: paper.title || 'No title available',
        authors: Array.isArray(paper.authors)
          ? paper.authors.map(author => author.name).join(', ')
          : 'Unknown authors',
        journal: paper.source || 'Unknown journal',
        year: paper.pubdate?.split(' ')[0] || 'Unknown year',
        abstract: abstractText,
        pubDate: paper.pubdate || 'Unknown date',
        doi: doi,
        url: pmcId,
        references: references,
        relevanceScore: 10, // 직접 검색된 논문은 높은 관련성 점수 부여
        summary: "1. This paper was directly searched by PMID\n2. Full content and references are available\n3. Central paper for the research topic"
      };
    } catch (error) {
      console.error('Error processing paper data:', error);
      return {
        id: 'unknown',
        pmid: 'unknown',
        title: 'Error loading paper',
        authors: 'Unknown',
        journal: 'Unknown',
        year: 'Unknown',
        abstract: 'An error occurred while loading this paper.',
        pubDate: 'Unknown',
        relevanceScore: 5,
        summary: "1. Error occurred while loading paper\n2. Try again later\n3. Check PMID format and try searching again"
      };
    }
  };

  interface ReferenceData {
    linksets?: Array<{
      linksetdbs?: Array<{
        linkname?: string;
        links?: Array<{ id: string } | string>;
      }>;
    }>;
  }

  // 참고문헌 ID 추출 함수
  const extractReferenceIds = (referencesData: ReferenceData): string[] => {
    try {
      if (referencesData && referencesData.linksets && referencesData.linksets.length > 0) {
        const linkset = referencesData.linksets[0];
        if (linkset.linksetdbs && linkset.linksetdbs.length > 0) {
          const linksetdb = linkset.linksetdbs.find(db => db.linkname === 'pubmed_pubmed_refs');
          if (linksetdb && linksetdb.links) {
            // 객체 배열이 아닌 ID 문자열 배열로 변환
            return linksetdb.links.map(link => typeof link === 'object' ? link.id : link);
          }
        }
      }
      return [];
    } catch (error) {
      console.error('Error extracting reference IDs:', error);
      return [];
    }
  };

  // Perplexity API를 사용하여 초록으로부터 논문의 PMID 찾기
  // Perplexity API를 사용하여 초록으로부터 논문의 PMID 찾기
  const findPMIDWithPerplexity = async (abstract: string): Promise<string | null> => {
    try {
      console.log('Searching with Perplexity API');

      const response = await fetch('/api/perplexity', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ abstract })
      });

      if (!response.ok) {
        throw new Error(`Perplexity API request failed with status ${response.status}`);
      }

      const data = await response.json();
      console.log('Perplexity API response:', data);

      // Perplexity 응답에서 PMID 추출
      if (data.choices && data.choices.length > 0) {
        const responseText = data.choices[0].message.content.trim();

        // PMID만 응답으로 받았는지 확인
        if (/^\d{8}$/.test(responseText)) {
          return responseText;
        }

        // 또는 응답 텍스트에서 PMID 패턴 추출
        const pmidMatch = responseText.match(/PMID:?\s*(\d{8})/i) ||
          responseText.match(/\b(\d{8})\b/);

        if (pmidMatch) {
          return pmidMatch[1];
        }

        //  NOT_FOUND인 경우 citations에서 PMID 추출 시도
        if (responseText === 'NOT_FOUND' && data.citations && data.citations.length > 0) {
          // citations에서 PMID 추출 시도
          for (const url of data.citations) {
            const pmidMatch = url.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/);
            if (pmidMatch) {
              console.log('Found PMID in citations:', pmidMatch[1]);
              return pmidMatch[1]; // 첫 번째 citation의 PMID 반환
            }
          }
        }
      }

      return null;
    } catch (error) {
      console.error('Error finding PMID with Perplexity API:', error);
      return null;
    }
  };

  const handleDiscussionSubmit = async () => {
    setLoading(true);
    setPapers([]);
    setFilteredPapers([]);
    setSelectedPaper(null);
    setActiveTab('all');

    try {
      // 초기 논문 결과 배열
      let allResults: Paper[] = [];

      // 1. 초록에서 PMID 직접 추출 시도
      let pmid = extractPMIDFromAbstract(discussionText);

      // PMID 추출 실패 시 Perplexity API 검색 시도
      if (!pmid) {
        console.log('PMID not found in abstract, trying Perplexity API search');
        pmid = await findPMIDWithPerplexity(discussionText);

        if (pmid) {
          console.log('PMID found via Perplexity API search:', pmid);
        }
      }

      // 2. PMID로 메인 논문과 참고문헌 가져오기 (존재하는 경우)
      if (pmid) {
        console.log('Using PMID for search:', pmid);

        // 2.1 메인 논문 정보 가져오기
        const paperResponse = await fetch(`/api/pubmed?type=summary&term=${pmid}`);
        if (paperResponse.ok) {
          const paperData = await paperResponse.json();
          const mainPaper = {
            ...processPaperData(paperData),
            isMainPaper: true  // 메인 논문 표시
          };

          // 2.2 참고문헌 가져오기
          const referencesResponse = await fetch(`/api/pubmed?type=references&term=${pmid}`);
          const referencesData = await referencesResponse.json();
          const refIds = extractReferenceIds(referencesData);

          // 2.3 참고문헌 정보 가져오기
          let referencesPapers: Paper[] = [];
          if (refIds.length > 0) {
            // 최대 결과 수에 따라 참고문헌 수 조정
            // searchConfig.maxResults의 80%를 참고문헌에 할당
            const maxReferencesToGet = Math.floor(searchConfig.maxResults * 0.8);
            referencesPapers = await findReferencedPapers(refIds, maxReferencesToGet);
          }

          // 2.4 메인 논문과 참고문헌 추가
          allResults = [mainPaper, ...referencesPapers];
        }
      }

      // 3. 키워드 기반 검색 (추가적인 관련 논문을 찾기 위해)
      const terms = await generateSearchTerms(discussionText);
      setSearchTerms(terms);
      console.log('Generated search terms for additional papers:', terms);

      // 각 키워드당 검색 결과를 합친 다음 관련성으로 정렬하여 상위 논문만 선택
      const allKeywordResults: Paper[] = [];

      // 각 검색어에 대해 더 많은 결과를 가져와서 나중에 필터링
      const keywordsToUse = terms.slice(0, 5); // 상위 5개 키워드만 사용

      // 남은 20%를 키워드 검색 결과에 할당
      const remainingSpots = Math.max(2, searchConfig.maxResults - allResults.length);
      // 키워드당 결과 수 계산 (최소 1개)
      const resultsPerKeyword = Math.max(1, Math.ceil(remainingSpots / keywordsToUse.length));

      for (const term of keywordsToUse) {
        console.log(`Searching for keyword: ${term}`);
        const results = await searchPubMed(term, resultsPerKeyword);
        allKeywordResults.push(...results);
        await new Promise(resolve => setTimeout(resolve, 1000)); // API 제한 방지
      }

      // 관련성 점수로 모든 키워드 검색 결과 정렬
      const sortedKeywordResults = _.orderBy(allKeywordResults, ['relevanceScore'], ['desc']);

      // 4. 중복 제거 및 상위 결과 선택
      // 이미 가져온 논문의 PMID 목록
      const existingPmids = allResults.map(paper => paper.pmid);

      // 중복되지 않는 키워드 검색 결과 중 관련성 높은 상위 6개만 선택
      const uniqueTopResults = [];
      let count = 0;
      // 최대 결과 수의 20%를 추가 논문에 할당 (최소 2개)
      const maxAdditionalPapers = Math.max(2, Math.floor(searchConfig.maxResults * 0.2));

      for (const paper of sortedKeywordResults) {
        if (!existingPmids.includes(paper.pmid)) {
          uniqueTopResults.push(paper);
          count++;
          if (count >= maxAdditionalPapers) break;
        }
      }

      console.log(`Selected ${uniqueTopResults.length} most relevant unique papers from keyword search`);

      // 5. 최종 결과 구성 (메인 논문, 참고문헌, 키워드 검색 결과)
      const finalResults = [...allResults, ...uniqueTopResults];

      // 메인 논문 우선, 그 다음 관련성 점수로 정렬
      const sortedResults = _.orderBy(finalResults, ['isMainPaper', 'relevanceScore'], ['desc', 'desc']);

      console.log('Final results count:', sortedResults.length,
        '(Main paper + references:', allResults.length,
        ', Additional papers:', uniqueTopResults.length, ')');

      setPapers(sortedResults);
      setFilteredPapers(sortedResults);
    } catch (error) {
      console.error('Error in search:', error);
    } finally {
      setLoading(false);
      setSearchProgress({ current: 0, total: 0 });
    }
  };
  const handlePaperSelect = async (paper: Paper) => {
    setSelectedPaper(paper);

    // If references or citations should be included and haven't been loaded yet
    if ((searchConfig.includeReferences || searchConfig.includeCitations) && !paper.citations) {
      try {
        const paperWithExtras = { ...paper };

        // Load citations if needed
        if (searchConfig.includeCitations) {
          const citingPapers = await findCitingPapers(paper.pmid);
          paperWithExtras.citations = citingPapers.map(p => p.id);

          // Add citations to papers array if not already present
          const newPapers = [...papers];
          citingPapers.forEach(citingPaper => {
            if (!newPapers.some(p => p.id === citingPaper.id)) {
              newPapers.push(citingPaper);
            }
          });
          setPapers(newPapers);
          setFilteredPapers(filterPapers(newPapers, filterText, activeTab));
        }

        // Load references if needed and not already loaded
        if (searchConfig.includeReferences && paper.references && paper.references.length > 0) {
          const referencedPapers = await findReferencedPapers(paper.references);

          // Add references to papers array if not already present
          const newPapers = [...papers];
          referencedPapers.forEach(refPaper => {
            if (!newPapers.some(p => p.id === refPaper.id)) {
              newPapers.push(refPaper);
            }
          });
          setPapers(newPapers);
          setFilteredPapers(filterPapers(newPapers, filterText, activeTab));
        }

        setSelectedPaper(paperWithExtras);
      } catch (error) {
        console.error('Error loading paper references/citations:', error);
      }
    }
  };

  const saveNote = (paperId: string, note: string) => {
    setNotes(prev => ({
      ...prev,
      [paperId]: note
    }));
  };

  const toggleAbstractExpansion = (paperId: string) => {
    setExpandedAbstracts(prev => ({
      ...prev,
      [paperId]: !prev[paperId]
    }));
  };

  // Filter papers based on search text and active tab
  const filterPapers = useCallback((allPapers: Paper[], searchText: string, tab: string) => {
    let filtered = allPapers;

    // Apply text filter
    if (searchText.trim() !== '') {
      const lowerSearchText = searchText.toLowerCase();
      filtered = filtered.filter(paper =>
        paper.title.toLowerCase().includes(lowerSearchText) ||
        paper.abstract.toLowerCase().includes(lowerSearchText) ||
        paper.authors.toLowerCase().includes(lowerSearchText) ||
        paper.journal.toLowerCase().includes(lowerSearchText)
      );
    }

    // Apply tab filter
    if (tab === 'recent') {
      filtered = _.orderBy(filtered, ['year', 'relevanceScore'], ['desc', 'desc']);
    } else if (tab === 'relevant') {
      filtered = _.orderBy(filtered, ['relevanceScore'], ['desc']);
    } else if (tab === 'citations' && selectedPaper) {
      filtered = filtered.filter(paper =>
        selectedPaper.citations?.includes(paper.id)
      );
    } else if (tab === 'references' && selectedPaper) {
      filtered = filtered.filter(paper =>
        selectedPaper.references?.includes(paper.id)
      );
    }

    return filtered;
  }, [selectedPaper]);

  // Handle filter change
  useEffect(() => {
    setFilteredPapers(filterPapers(papers, filterText, activeTab));
  }, [filterText, activeTab, filterPapers, papers]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Research Paper Search System</h1>
          <p className="mt-2 text-sm text-gray-600">Find comprehensive relevant papers with citations and references</p>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Input Section */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-lg">Research Discussion</CardTitle>
            <CardDescription>Enter your discussion content to find relevant papers</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={discussionText}
              onChange={(e) => setDiscussionText(e.target.value)}
              className="mb-4 h-40 resize-none"
              placeholder="Enter your research discussion content here..."
            />

            <div className="grid md:grid-cols-3 gap-4 mb-4">
              <div>
                <Label htmlFor="maxResults">Maximum Papers to Retrieve</Label>
                <Input
                  id="maxResults"
                  type="number"
                  min="10"
                  max="100"
                  value={searchConfig.maxResults}
                  onChange={(e) => setSearchConfig({
                    ...searchConfig,
                    maxResults: parseInt(e.target.value) || DEFAULT_MAX_RESULTS
                  })}
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeCitations"
                  checked={searchConfig.includeCitations}
                  onCheckedChange={(checked) =>
                    setSearchConfig({
                      ...searchConfig,
                      includeCitations: !!checked
                    })
                  }
                />
                <Label htmlFor="includeCitations">Include Citing Papers</Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeReferences"
                  checked={searchConfig.includeReferences}
                  onCheckedChange={(checked) =>
                    setSearchConfig({
                      ...searchConfig,
                      includeReferences: !!checked
                    })
                  }
                />
                <Label htmlFor="includeReferences">Include Referenced Papers</Label>
              </div>
            </div>

            <Button
              onClick={handleDiscussionSubmit}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {loading ? (
                <div className="flex items-center">
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-opacity-50 border-t-transparent rounded-full"></div>
                  Searching...
                </div>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search Papers
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Search Terms */}
        {searchTerms.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center space-x-2 text-sm text-gray-600">
              <FileText className="h-4 w-4" />
              <span className="font-medium">Search Terms:</span>
              <div className="flex flex-wrap gap-2">
                {searchTerms.map((term, index) => (
                  <span
                    key={index}
                    className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
                  >
                    {term}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Loading Progress Bar */}
        {loading && searchProgress.total > 0 && (
          <div className="mb-6">
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
              <div
                className="bg-blue-600 h-2.5 rounded-full"
                style={{ width: `${(searchProgress.current / searchProgress.total) * 100}%` }}
              ></div>
            </div>
            <p className="text-xs text-gray-600 text-right">
              Processing {searchProgress.current} of {searchProgress.total} papers
            </p>
          </div>
        )}

        {/* Results Section */}
        <div className="flex gap-6 flex-col lg:flex-row">
          {/* Paper List */}
          <div className="w-full lg:w-1/3">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Found Papers</CardTitle>
                  <Badge variant="outline">{filteredPapers.length} papers</Badge>
                </div>

                <div className="mt-2">
                  <Input
                    placeholder="Filter papers..."
                    value={filterText}
                    onChange={(e) => setFilterText(e.target.value)}
                    className="mb-2"
                  />

                  <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
                    <TabsList className="grid grid-cols-4">
                      <TabsTrigger value="all">All</TabsTrigger>
                      <TabsTrigger value="relevant">Relevant</TabsTrigger>
                      <TabsTrigger value="recent">Recent</TabsTrigger>
                      <TabsTrigger
                        value="citations"
                        disabled={!selectedPaper || !selectedPaper.citations}
                      >
                        Citations
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>
              </CardHeader>

              <ScrollArea className="h-[calc(100vh-400px)]">
                <div className="p-4 space-y-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-opacity-50 border-t-transparent rounded-full"></div>
                    </div>
                  ) : filteredPapers.length > 0 ? (
                    filteredPapers.map(paper => (
                      <div
                        key={paper.id}
                        className={`p-4 rounded-lg border transition-all cursor-pointer
                        ${selectedPaper?.id === paper.id
                            ? 'border-blue-600 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`}
                        onClick={() => handlePaperSelect(paper)}
                      >
                        <h3 className="font-medium text-sm line-clamp-2 mb-2">{paper.title}</h3>

                        <div className="flex flex-wrap gap-2 mb-2">
                          <Badge variant="outline" className="text-xs bg-gray-100">
                            <Clock className="h-3 w-3 mr-1" />
                            {paper.year}
                          </Badge>

                          <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
                            <Star className="h-3 w-3 mr-1" />
                            Score: {paper.relevanceScore}/10
                          </Badge>

                          <Badge variant="outline" className="text-xs">
                            PMID: {paper.pmid}
                          </Badge>
                        </div>

                        <div className="mt-2 text-xs text-gray-600 line-clamp-2">
                          {paper.authors}
                        </div>

                        <div className="mt-2">
                          <div className={`text-xs text-gray-700 ${expandedAbstracts[paper.id] ? '' : 'line-clamp-3'}`}>
                            <span className="font-medium">Abstract:</span> {paper.abstract}
                          </div>
                          {paper.abstract.length > 150 && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleAbstractExpansion(paper.id);
                              }}
                              className="text-xs text-blue-600 mt-1"
                            >
                              {expandedAbstracts[paper.id] ? 'Show less' : 'Show more'}
                            </button>
                          )}
                        </div>

                        <div className="flex justify-between items-center mt-2">
                          <div className="flex gap-2">
                            {paper.references && paper.references.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {paper.references.length} refs
                              </Badge>
                            )}
                            {paper.citations && paper.citations.length > 0 && (
                              <Badge variant="outline" className="text-xs">
                                {paper.citations.length} cites
                              </Badge>
                            )}
                          </div>

                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 text-gray-600 hover:text-blue-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                // Copy citation
                                copyToClipboard(`${paper.authors}. (${paper.year}). ${paper.title}. ${paper.journal}. PMID: ${paper.pmid}`);
                              }}
                              title="Copy citation"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>

                            {paper.url && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0 text-gray-600 hover:text-blue-600"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  window.open(paper.url, '_blank');
                                }}
                                title="Open paper"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No papers found
                    </div>
                  )}
                </div>
              </ScrollArea>
            </Card>
          </div>

          {/* Paper Details */}
          <div className="flex-1">
            <Card>
              <ScrollArea className="h-[calc(100vh-400px)]">
                {selectedPaper ? (
                  <div className="p-6">
                    <div className="flex justify-between items-start mb-4">
                      <h2 className="text-2xl font-bold">{selectedPaper.title}</h2>

                      <div className="flex gap-2">
                        {selectedPaper.url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => window.open(selectedPaper.url, '_blank')}
                            className="text-blue-600 border-blue-600 hover:bg-blue-50"
                          >
                            <ExternalLink className="mr-2 h-4 w-4" />
                            Open Paper
                          </Button>
                        )}

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copyToClipboard(`${selectedPaper.authors}. (${selectedPaper.year}). ${selectedPaper.title}. ${selectedPaper.journal}. PMID: ${selectedPaper.pmid}`)}
                          className="text-gray-600 border-gray-300 hover:bg-gray-50"
                        >
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Citation
                        </Button>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3 mb-6">
                      <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-200">
                        <Star className="h-4 w-4 mr-1" />
                        Relevance: {selectedPaper.relevanceScore}/10
                      </Badge>

                      <Badge variant="outline" className="hover:bg-gray-100">
                        PMID: {selectedPaper.pmid}
                      </Badge>

                      {selectedPaper.doi && (
                        <Badge variant="outline" className="hover:bg-gray-100">
                          DOI: {selectedPaper.doi}
                        </Badge>
                      )}

                      <Badge variant="outline" className="hover:bg-gray-100">
                        <Clock className="h-4 w-4 mr-1" />
                        {selectedPaper.pubDate}
                      </Badge>

                      <Badge variant="outline" className="hover:bg-gray-100">
                        <BookOpen className="h-4 w-4 mr-1" />
                        {selectedPaper.journal}
                      </Badge>
                    </div>

                    <div className="space-y-6">
                      {/* Authors */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm font-medium">Authors</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600">{selectedPaper.authors}</p>
                        </CardContent>
                      </Card>

                      {/* Abstract */}
                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                          <CardTitle className="text-sm font-medium">Abstract</CardTitle>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => copyToClipboard(selectedPaper.abstract)}
                            className="h-8 px-2 text-gray-500"
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            Copy
                          </Button>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600 leading-relaxed">{selectedPaper.abstract}</p>
                        </CardContent>
                      </Card>

                      {/* Summary */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm font-medium">Quick Summary</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600 whitespace-pre-line">{selectedPaper.summary}</p>
                        </CardContent>
                      </Card>

                      {/* Citations Tab */}
                      {selectedPaper.citations && selectedPaper.citations.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-sm font-medium">Papers Citing This Research</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-sm text-gray-600">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveTab('citations')}
                                className="w-full justify-start"
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                View {selectedPaper.citations.length} citing papers
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* References Tab */}
                      {selectedPaper.references && selectedPaper.references.length > 0 && (
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-sm font-medium">References</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="text-sm text-gray-600">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setActiveTab('references')}
                                className="w-full justify-start"
                              >
                                <FileText className="mr-2 h-4 w-4" />
                                View {selectedPaper.references.length} referenced papers
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      )}

                      {/* Notes */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm font-medium">Research Notes</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Textarea
                            placeholder="Add your research notes here..."
                            value={notes[selectedPaper.id] || ''}
                            onChange={(e) => saveNote(selectedPaper.id, e.target.value)}
                            className="h-32 mb-2"
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => saveNote(selectedPaper.id, notes[selectedPaper.id])}
                            className="text-blue-600 border-blue-600 hover:bg-blue-50"
                          >
                            <Save className="mr-2 h-4 w-4" />
                            Save Notes
                          </Button>
                        </CardContent>
                      </Card>
                    </div>
                  </div>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-gray-500 p-6">
                    <BookOpen className="h-12 w-12 mb-4" />
                    <p>Select a paper from the list to view details</p>
                  </div>
                )}
              </ScrollArea>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaperSearchSystem;