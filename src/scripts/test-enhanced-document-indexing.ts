import { v4 as uuidv4 } from 'uuid';
import { WorkspaceStorageService } from '../services/workspaceStorage';
import { AzureSearchService } from '../services/azureSearchService';
import { FileAnalysisService } from '../services/fileAnalysisService';
import { logger } from '../utils/logger';

async function testEnhancedDocumentIndexing() {
  try {
    console.log('Testing enhanced document indexing with semantic search...');
    
    // Initialize services
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    const azureSearchService = AzureSearchService.getInstance();
    const fileAnalysisService = FileAnalysisService.getInstance();
    
    // Test workspace data
    const testWorkspaceId = uuidv4();
    const testWorkspaceName = 'Enhanced Document Indexing Test Workspace';
    
    console.log(`Test workspace ID: ${testWorkspaceId}`);
    console.log(`Test workspace name: ${testWorkspaceName}`);
    
    // Create workspace folder
    console.log('Creating workspace folder...');
    const folderPath = await workspaceStorageService.createWorkspaceFolder(testWorkspaceId, testWorkspaceName);
    console.log(`Workspace folder created: ${folderPath}`);
    
    // Get workspace folder name and index name
    const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(testWorkspaceId, testWorkspaceName);
    const indexName = `${workspaceFolderName}index`;
    
    console.log(`Workspace folder name: ${workspaceFolderName}`);
    console.log(`Index name: ${indexName}`);
    
    // Create Azure Search index
    console.log('Creating Azure Search index with enhanced fields...');
    const indexCreated = await azureSearchService.createWorkspaceIndex(indexName);
    console.log(`Index creation result: ${indexCreated}`);
    
    if (indexCreated) {
      // Test document data with rich content
      const testFileId = uuidv4();
      const testFileName = 'sample-document.txt';
      
      // Rich document content to index
      const documentContent = `
        # Project Overview: AI-Powered Document Analysis System
        
        ## Introduction
        This document outlines the architecture and implementation details of our AI-powered document analysis system. 
        The system leverages advanced natural language processing techniques to extract meaningful insights from various 
        document formats including PDF, DOCX, and plain text files.
        
        ## Key Features
        1. **Multi-format Support**: Processes PDF, DOCX, TXT, and other common document formats
        2. **Semantic Search**: Utilizes Azure Cognitive Search with semantic ranking for improved relevance
        3. **Content Analysis**: Automatically generates summaries and key points for each document
        4. **Workspace Isolation**: Maintains data segregation between different workspaces
        5. **Scalable Architecture**: Built on cloud-native principles for horizontal scaling
        
        ## Technical Architecture
        The system is composed of several microservices:
        - Document Ingestion Service: Handles file uploads and initial processing
        - Content Extraction Service: Uses libraries like pdf-parse and mammoth for text extraction
        - Analysis Engine: Leverages Azure OpenAI for content summarization and insight generation
        - Search Indexer: Integrates with Azure Cognitive Search for semantic search capabilities
        - API Gateway: Provides RESTful endpoints for client applications
        
        ## Implementation Details
        ### File Processing Pipeline
        1. Files are uploaded to Azure Blob Storage within workspace-specific folders
        2. Content is extracted using appropriate parsing libraries
        3. Extracted text is analyzed by Azure OpenAI to generate summaries and key points
        4. Structured data is indexed in Azure Cognitive Search with semantic configuration
        5. Search queries leverage semantic ranking for improved result relevance
        
        ### Semantic Search Configuration
        The Azure Search index is configured with:
        - Content field as the primary searchable field
        - FileName field as the title field for semantic ranking
        - Summary and KeyPoints fields as additional content fields
        - FileType and WorkspaceName as keyword fields for filtering
        
        ## Benefits
        - Improved search relevance through semantic understanding
        - Automatic content analysis reduces manual effort
        - Workspace isolation ensures data privacy and security
        - Scalable architecture supports growing document collections
      `;
      
      // Analyze the content
      console.log('Analyzing document content...');
      let summary = '';
      let keyPoints: string[] = [];
      
      try {
        // Mock the file analysis service response for testing
        summary = 'This document outlines the architecture and implementation details of an AI-powered document analysis system with semantic search capabilities.';
        keyPoints = [
          'Multi-format document processing support',
          'Semantic search with Azure Cognitive Search',
          'Automatic content analysis and summarization',
          'Workspace isolation for data privacy',
          'Scalable cloud-native architecture'
        ];
      } catch (analysisError) {
        console.warn('Failed to analyze content, using fallback:', analysisError);
        summary = documentContent.substring(0, 500) + '...';
        keyPoints = [];
      }
      
      // Create document for indexing
      const documentToIndex = {
        id: testFileId,
        content: documentContent,
        fileName: testFileName,
        fileType: 'text/plain',
        workspaceId: testWorkspaceId,
        workspaceName: testWorkspaceName,
        uploadedBy: 'test-user',
        uploadedAt: new Date().toISOString(),
        summary: summary,
        keyPoints: keyPoints
      };
      
      // Index the document
      console.log('Indexing enhanced document...');
      const indexResult = await azureSearchService.indexDocument(indexName, documentToIndex);
      console.log(`Document indexing result: ${indexResult}`);
      
      if (indexResult) {
        // Wait for indexing to complete
        console.log('Waiting for indexing to complete...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Test semantic search
        console.log('Testing semantic search...');
        const searchResults = await azureSearchService.searchDocuments(indexName, 'How does semantic search work in this system?');
        console.log(`Found ${searchResults.length} search results`);
        
        if (searchResults.length > 0) {
          console.log('Top search result:');
          const result = searchResults[0];
          console.log(`File: ${result.fileName}`);
          console.log(`Summary: ${result.summary}`);
          console.log(`Content preview: ${result.content.substring(0, 200)}...`);
          if (result.keyPoints && result.keyPoints.length > 0) {
            console.log(`Key Points: ${result.keyPoints.join(', ')}`);
          }
        }
        
        // Test another search query
        console.log('Testing search for technical architecture...');
        const searchResults2 = await azureSearchService.searchDocuments(indexName, 'technical architecture and implementation details');
        console.log(`Found ${searchResults2.length} search results for technical architecture`);
        
        if (searchResults2.length > 0) {
          console.log('Top result for technical architecture:');
          const result = searchResults2[0];
          console.log(`File: ${result.fileName}`);
          console.log(`Summary: ${result.summary}`);
          console.log(`Content preview: ${result.content.substring(0, 200)}...`);
        }
      }
    }
    
    // Clean up
    console.log('Cleaning up test resources...');
    await azureSearchService.deleteWorkspaceIndex(indexName);
    await workspaceStorageService.deleteWorkspaceFolder(testWorkspaceId, testWorkspaceName);
    
    console.log('Enhanced document indexing test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testEnhancedDocumentIndexing();