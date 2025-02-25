'use client';
import React, { useState, useEffect } from 'react';
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
      const refArticleId = referenceList[i].querySelector('ArticleId');
      if (refArticleId && refArticleId.textContent) {
        references.push(refArticleId.textContent);
      }
    }
    
    return references;
  };

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

  // Function to find papers referenced by a given paper
  const findReferencedPapers = async (referenceIds: string[], maxResults = 10) => {
    try {
      if (referenceIds.length === 0) {
        return [];
      }

      // Limit to max number of references
      const limitedRefs = referenceIds.slice(0, maxResults);
      
      // Get data for reference IDs
      const summaryResponse = await fetch(`/api/pubmed?type=summary&term=${limitedRefs.join(',')}`);
      if (!summaryResponse.ok) {
        throw new Error('PubMed reference summary fetch failed');
      }

      const summaryData = await summaryResponse.json();
      const xmlDoc = parseXMLResponse(summaryData.full);
      const articles = xmlDoc.getElementsByTagName('PubmedArticle');
      const summaryResult = summaryData.summary.result;

      const referencedPapers = Object.entries(summaryResult || {})
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
            relevanceScore: 6, // Default score for referenced papers
            summary: "1. Referenced in the selected paper\n2. Provides foundational background research\n3. Important for understanding the context of the selected work"
          };
        });

      return referencedPapers;
    } catch (error) {
      console.error('Error finding referenced papers:', error);
      return [];
    }
  };

  const handleDiscussionSubmit = async () => {
    setLoading(true);
    setPapers([]);
    setFilteredPapers([]);
    setSelectedPaper(null);
    setActiveTab('all');
    
    try {
      // Generate search terms
      const terms = await generateSearchTerms(discussionText);
      setSearchTerms(terms);
      console.log('Generated search terms:', terms);

      // Search for each term sequentially
      const allResults = [];
      
      // Calculate how many results to get per term to reach the desired total
      const resultsPerTerm = Math.ceil(searchConfig.maxResults / terms.length);
      
      for (const term of terms) {
        const results = await searchPubMed(term, resultsPerTerm);
        allResults.push(results);
        await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
      }

      // Combine and sort results
      const combinedResults = _.uniqBy(allResults.flat(), 'id');
      console.log('Combined results:', combinedResults);

      const sortedResults = _.orderBy(combinedResults, ['relevanceScore'], ['desc']);
      console.log('Sorted results:', sortedResults);

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
  const filterPapers = (allPapers: Paper[], searchText: string, tab: string) => {
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
  };

  // Handle filter change
  useEffect(() => {
    setFilteredPapers(filterPapers(papers, filterText, activeTab));
  }, [filterText, activeTab]);

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