import { AzureSearchService } from '../services/azureSearchService';
import { WorkspaceStorageService } from '../services/workspaceStorage';
import { logger } from '../utils/logger';

async function testDocumentIndexing() {
  try {
    console.log('Testing document indexing...');
    
    // Initialize services
    const azureSearchService = AzureSearchService.getInstance();
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    
    // Test workspace data
    const testWorkspaceId = 'test-workspace-123';
    const testWorkspaceName = 'Test Workspace';
    
    // Get workspace folder name
    const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(testWorkspaceId, testWorkspaceName);
    const indexName = `${workspaceFolderName}index`;
    
    console.log(`Workspace folder name: ${workspaceFolderName}`);
    console.log(`Index name: ${indexName}`);
    
    // Create workspace index
    console.log('Creating workspace index...');
    const indexCreated = await azureSearchService.createWorkspaceIndex(indexName);
    console.log(`Index creation result: ${indexCreated}`);
    
    if (indexCreated) {
      // Test document to index
      const testDocument = {
        id: 'test-doc-1',
        content: 'This is a test document for semantic search capabilities. It contains sample text that should be searchable using Azure AI Search semantic features.',
        fileName: 'test-document.txt',
        fileType: 'text/plain',
        workspaceId: testWorkspaceId,
        workspaceName: testWorkspaceName,
        uploadedBy: 'test-user',
        uploadedAt: new Date().toISOString()
      };
      
      // Index the document
      console.log('Indexing test document...');
      const indexResult = await azureSearchService.indexDocument(indexName, testDocument);
      console.log(`Document indexing result: ${indexResult}`);
      
      if (indexResult) {
        // Wait a moment for indexing to complete
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Search for the document
        console.log('Searching for test document...');
        const searchResults = await azureSearchService.searchDocuments(indexName, 'test document semantic search');
        console.log(`Search results: ${JSON.stringify(searchResults, null, 2)}`);
      }
    }
    
    // Clean up - delete the test index
    console.log('Cleaning up test index...');
    await azureSearchService.deleteWorkspaceIndex(indexName);
    console.log('Test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testDocumentIndexing();