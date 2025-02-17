'use client';
import React, { useState } from 'react';
import { Search, Save, BookOpen, FileText, Clock, Star, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import _ from 'lodash';

const PaperSearchSystem = () => {
  const [discussionText, setDiscussionText] = useState('');
  const [papers, setPapers] = useState([]);
  const [searchTerms, setSearchTerms] = useState([]);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [notes, setNotes] = useState({});
  const [loading, setLoading] = useState(false);

  // Function to generate search terms using Claude API
  const generateSearchTerms = async (text: string) => {
    try {
      const response = await fetch('/api/claude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: `Generate 3-5 relevant PubMed search terms based on this discussion content. Return only the search terms, one per line, with no additional text or formatting:

${text}`
        })
      });

      if (!response.ok) {
        throw new Error('Claude API request failed');
      }

      const data = await response.json();
      const searchTerms = data.content[0].text.trim().split('\n');
      return searchTerms.filter(term => term.length > 0);
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
  "relevanceScore": <number between 1 and 9>,
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

  // Function to search PubMed
  const searchPubMed = async (searchTerm: string) => {
    try {
      console.log('Searching for term:', searchTerm);
      
      // First, search for IDs
      const searchResponse = await fetch(`/api/pubmed?type=search&term=${encodeURIComponent(searchTerm)}`);
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
  
      // Then, get summaries and full data for these IDs
      const summaryResponse = await fetch(`/api/pubmed?type=summary&term=${ids.join(',')}`);
      if (!summaryResponse.ok) {
        throw new Error('PubMed summary fetch failed');
      }
      
      const summaryData = await summaryResponse.json();
      console.log('Summary data:', summaryData);
  
      // XML 파싱 수정
      const xmlDoc = parseXMLResponse(summaryData.full);
      const articles = xmlDoc.getElementsByTagName('PubmedArticle');
      
      // Process the papers data
      const summaryResult = summaryData.summary.result;
      const papers = Object.entries(summaryResult || {})
        .filter(([key]) => key !== 'uids')
        .map(([_, paper]: [string, Record<string, unknown>]) => {
          // Get abstract from XML data
          const articleId = paper.uid;
          let abstractText = 'No abstract available';
          
          // XML에서 해당 논문의 초록 찾기
          for (let i = 0; i < articles.length; i++) {
            const pmid = articles[i].querySelector('PMID')?.textContent;
            if (pmid === articleId) {
              const abstractElement = articles[i].querySelector('Abstract AbstractText');
              if (abstractElement) {
                abstractText = abstractElement.textContent || abstractText;
              }
              break;
            }
          }
  
          return {
            id: paper.uid,
            title: paper.title || 'No title available',
            authors: Array.isArray(paper.authors) 
              ? paper.authors.map(author => author.name).join(', ')
              : 'Unknown authors',
            journal: paper.source || 'Unknown journal',
            year: paper.pubdate?.split(' ')[0] || 'Unknown year',
            abstract: abstractText,
            pubDate: paper.pubdate || 'Unknown date'
          };
        });
  
      console.log('Processed papers:', papers);
  
      // Analyze each paper using Claude
      const papersWithAnalysis = await Promise.all(
        papers.map(async paper => {
          const paperContent = `Title: ${paper.title}\nAbstract: ${paper.abstract}`;
          const analysis = await analyzePaperRelevance(paperContent, discussionText);
          return {
            ...paper,
            relevanceScore: analysis.relevanceScore,
            summary: analysis.summary
          };
        })
      );
  
      console.log('Papers with analysis:', papersWithAnalysis);
      return papersWithAnalysis;
    } catch (error) {
      console.error('Error searching PubMed:', error);
      return [];
    }
  };

  const handleDiscussionSubmit = async () => {
    setLoading(true);
    try {
      // Generate search terms
      const terms = await generateSearchTerms(discussionText);
      setSearchTerms(terms);
      console.log('Generated search terms:', terms);

      // Search for each term sequentially
      const allResults = [];
      for (const term of terms) {
        const results = await searchPubMed(term);
        allResults.push(results);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1초 딜레이
      }

      // Combine and sort results
      const combinedResults = _.uniqBy(allResults.flat(), 'id');
      console.log('Combined results:', combinedResults);
      
      const sortedResults = _.orderBy(combinedResults, ['relevanceScore'], ['desc']);
      console.log('Sorted results:', sortedResults);
      
      setPapers(sortedResults);
    } catch (error) {
      console.error('Error in search:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveNote = (paperId: string, note: string) => {
    setNotes(prev => ({
      ...prev,
      [paperId]: note
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold text-gray-900">Research Paper Search System</h1>
          <p className="mt-2 text-sm text-gray-600">Find relevant papers for your research discussion</p>
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
              className="mb-4 resize-none"
              placeholder="Enter your research discussion content here..."
            />
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

        {/* Results Section */}
        <div className="flex gap-6">
          {/* Paper List */}
          <div className="w-1/3">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Found Papers</CardTitle>
                <CardDescription>{papers.length} papers found</CardDescription>
              </CardHeader>
              <ScrollArea className="h-[calc(100vh-400px)]">
                <div className="p-4 space-y-4">
                  {loading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-opacity-50 border-t-transparent rounded-full"></div>
                    </div>
                  ) : papers.length > 0 ? (
                    papers.map(paper => (
                      <div
                        key={paper.id}
                        className={`p-4 rounded-lg border transition-all cursor-pointer
                          ${selectedPaper?.id === paper.id 
                            ? 'border-blue-600 bg-blue-50' 
                            : 'border-gray-200 hover:border-blue-400 hover:bg-gray-50'}`}
                        onClick={() => setSelectedPaper(paper)}
                      >
                        <h3 className="font-medium text-sm line-clamp-2 mb-2">{paper.title}</h3>
                        <div className="flex items-center text-xs text-gray-600 mb-2">
                          <Clock className="h-3 w-3 mr-1" />
                          <span>{paper.year}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            <Star className="h-3 w-3 mr-1" />
                            Score: {paper.relevanceScore}/9
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-gray-600 hover:text-blue-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Add download functionality
                            }}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
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
                    <h2 className="text-2xl font-bold mb-2">{selectedPaper.title}</h2>
                    <div className="flex items-center text-sm text-gray-600 mb-6 space-x-4">
                      <div className="flex items-center">
                        <BookOpen className="h-4 w-4 mr-1" />
                        {selectedPaper.journal}
                      </div>
                      <div>{selectedPaper.pubDate}</div>
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
                        <CardHeader>
                          <CardTitle className="text-sm font-medium">Abstract</CardTitle>
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