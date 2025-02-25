# Research Paper Search System

An advanced system for finding, analyzing, and managing academic research papers using AI-powered search and relevance analysis.

## Features

### Comprehensive Search

- **Enhanced Search Capacity**: Search up to 100 papers per query, all sorted by relevance to your research
- **Intelligent Term Generation**: AI generates diverse, specific search terms from your research discussion
- **Citation Network Support**: Discover papers that cite your selected paper and explore references

### Detailed Paper Information

- **Complete Metadata**: View PMID, DOI, journal information, and publication dates
- **Full Abstracts**: Read complete abstracts with expandable views in both list and detail views
- **Direct Access**: Open papers directly via PubMed or DOI links
- **Relevance Analysis**: AI-generated relevance scores and summaries for each paper

### Research Management

- **Save Notes**: Add and save research notes for each paper
- **Copy Citations**: Easily copy formatted citations for use in your research
- **Smart Filtering**: Filter papers by relevance, recency, citations, or references
- **Visual Indicators**: See citation and reference counts at a glance

## Getting Started

### Prerequisites

- Node.js (v14.0.0 or higher)
- NPM or Yarn

### Installation

1. Clone the repository
```bash
git clone https://github.com/handevmin/research-paper-search.git
cd research-paper-search
```

2. Install dependencies
```bash
npm install
# or
yarn install
```

3. Create a `.env.local` file in the root directory with your API keys:
```
PUBMED_API_KEY=pubmed_api_key
CLAUDE_API_KEY=claude_api_key
```

4. Start the development server
```bash
npm run dev
# or
yarn dev
```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage Guide

### Searching for Papers

1. Enter your research discussion or query in the text area
2. Adjust search settings if needed:
   - Maximum number of papers to retrieve (10-100)
   - Toggle citation network features on/off
3. Click "Search Papers" to begin
4. View generated search terms and results sorted by relevance

### Exploring Papers

- Click on any paper in the list to view detailed information
- Use tabs to filter papers by relevance, recency, or connections
- Expand abstracts in the list view for quick scanning
- Navigate through citations and references with dedicated views

### Managing Your Research

- Add notes to papers for future reference
- Copy formatted citations with a single click
- Open paper links directly in PubMed or via DOI
- Filter papers to find exactly what you need

## Technical Details

### Architecture

- **Next.js**: React framework with server-side rendering
- **Tailwind CSS**: Utility-first CSS framework for UI components
- **Anthropic Claude API**: AI-powered search term generation and relevance analysis
- **PubMed API**: Access to the comprehensive biomedical literature database

### Key Components

- **PaperSearchSystem.tsx**: Main component handling the search and display logic
- **API Routes**: Server-side API endpoints for PubMed and Claude integration
- **UI Components**: Reusable components for consistent interface

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.

## Acknowledgments

- NCBI and PubMed for providing the research database API
- Anthropic for the Claude AI API integration