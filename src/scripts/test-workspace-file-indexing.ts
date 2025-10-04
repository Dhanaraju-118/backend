import { v4 as uuidv4 } from 'uuid';
import { WorkspaceStorageService } from '../services/workspaceStorage';
import { AzureSearchService } from '../services/azureSearchService';
import { logger } from '../utils/logger';

async function testWorkspaceFileIndexing() {
  try {
    console.log('Testing workspace file indexing flow...');
    
    // Initialize services
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    const azureSearchService = AzureSearchService.getInstance();
    
    // Test workspace data
    const testWorkspaceId = uuidv4();
    const testWorkspaceName = 'Document Indexing Test Workspace';
    
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
    console.log('Creating Azure Search index...');
    const indexCreated = await azureSearchService.createWorkspaceIndex(indexName);
    console.log(`Index creation result: ${indexCreated}`);
    
    if (indexCreated) {
      // Test document data (simulating a file upload)
      const testFileId = uuidv4();
      const testFileName = 'sample-document.txt';
      
      // Document content to index
      const documentContent = `
        This is a comprehensive sample document for testing Azure Search semantic capabilities.
        The document contains various topics including:
        - Artificial Intelligence and Machine Learning
        - Natural Language Processing
        - Search Technologies
        - Data Analysis and Insights
        - Cloud Computing Platforms
        
        This content should be properly indexed and searchable using semantic search features.
      `;
      
      // Create document for indexing
      const documentToIndex = {
        id: testFileId,
        content: documentContent,
        fileName: testFileName,
        fileType: 'text/plain',
        workspaceId: testWorkspaceId,
        workspaceName: testWorkspaceName,
        uploadedBy: 'test-user',
        uploadedAt: new Date().toISOString()
      };
      
      // Index the document
      console.log('Indexing document...');
      const indexResult = await azureSearchService.indexDocument(indexName, documentToIndex);
      console.log(`Document indexing result: ${indexResult}`);
      
      if (indexResult) {
        // Wait for indexing to complete
        console.log('Waiting for indexing to complete...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Test semantic search
        console.log('Testing semantic search...');
        const searchResults = await azureSearchService.searchDocuments(indexName, 'AI and machine learning technologies');
        console.log(`Found ${searchResults.length} search results`);
        
        if (searchResults.length > 0) {
          console.log('Search results:');
          searchResults.forEach((result, index) => {
            console.log(`${index + 1}. ${result.fileName}: ${result.content.substring(0, 100)}...`);
          });
        }
        
        // Test another search query
        console.log('Testing another search query...');
        const searchResults2 = await azureSearchService.searchDocuments(indexName, 'cloud computing platforms');
        console.log(`Found ${searchResults2.length} search results for cloud computing`);
        
        if (searchResults2.length > 0) {
          console.log('Search results for cloud computing:');
          searchResults2.forEach((result, index) => {
            console.log(`${index + 1}. ${result.fileName}: ${result.content.substring(0, 100)}...`);
          });
        }
      }
    }
    
    // Clean up
    console.log('Cleaning up test resources...');
    await azureSearchService.deleteWorkspaceIndex(indexName);
    await workspaceStorageService.deleteWorkspaceFolder(testWorkspaceId, testWorkspaceName);
    
    console.log('Workspace file indexing test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testWorkspaceFileIndexing();