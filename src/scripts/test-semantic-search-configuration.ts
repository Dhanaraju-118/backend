import { v4 as uuidv4 } from 'uuid';
import { WorkspaceStorageService } from '../services/workspaceStorage';
import { AzureSearchService } from '../services/azureSearchService';
import axios from 'axios';
import { logger } from '../utils/logger';

async function testSemanticSearchConfiguration() {
  try {
    console.log('Testing semantic search configuration with proper naming format...');
    
    // Initialize services
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    const azureSearchService = AzureSearchService.getInstance();
    
    // Test workspace data
    const testWorkspaceId = uuidv4();
    const testWorkspaceName = 'Semantic Search Test Workspace';
    
    console.log(`Test workspace ID: ${testWorkspaceId}`);
    console.log(`Test workspace name: ${testWorkspaceName}`);
    
    // Get workspace folder name and index name
    const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(testWorkspaceId, testWorkspaceName);
    const indexName = `${workspaceFolderName}index`;
    const semanticConfigName = `search${indexName}`;
    
    console.log(`Workspace folder name: ${workspaceFolderName}`);
    console.log(`Index name: ${indexName}`);
    console.log(`Expected semantic config name: ${semanticConfigName}`);
    
    // Create Azure Search index
    console.log('Creating Azure Search index...');
    const indexCreated = await azureSearchService.createWorkspaceIndex(indexName);
    console.log(`Index creation result: ${indexCreated}`);
    
    if (indexCreated) {
      // Wait a moment for the index to be fully created
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Verify the semantic configuration was created properly
      console.log('Verifying semantic configuration...');
      const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
      const apiKey = process.env.AZURE_AI_SEARCH_API_KEY || '';
      
      if (!apiKey) {
        throw new Error('AZURE_AI_SEARCH_API_KEY is not set');
      }
      
      const url = `${endpoint}/indexes/${indexName}?api-version=2023-07-01-Preview`;
      const headers = {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      };
      
      try {
        const response = await axios.get(url, { headers });
        const indexDefinition = response.data;
        
        console.log('Index definition retrieved successfully');
        
        if (indexDefinition.semantic && indexDefinition.semantic.configurations) {
          console.log(`Found ${indexDefinition.semantic.configurations.length} semantic configurations`);
          
          const semanticConfig = indexDefinition.semantic.configurations.find(
            (config: any) => config.name === semanticConfigName
          );
          
          if (semanticConfig) {
            console.log('✓ Semantic configuration found with correct name format');
            console.log(`Configuration name: ${semanticConfig.name}`);
            console.log(`Title field: ${semanticConfig.prioritizedFields.titleField.fieldName}`);
            console.log(`Content fields: ${semanticConfig.prioritizedFields.prioritizedContentFields.map((f: any) => f.fieldName).join(', ')}`);
            console.log(`Keywords fields: ${semanticConfig.prioritizedFields.prioritizedKeywordsFields.map((f: any) => f.fieldName).join(', ')}`);
          } else {
            console.log('✗ Semantic configuration not found with expected name format');
            console.log('Available configurations:');
            indexDefinition.semantic.configurations.forEach((config: any) => {
              console.log(`  - ${config.name}`);
            });
          }
        } else {
          console.log('✗ No semantic configurations found in index definition');
        }
      } catch (error: any) {
        console.error('Failed to retrieve index definition:', error.message);
        if (error.response) {
          console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
      }
      
      // Test document to index
      const testDocument = {
        id: 'test-doc-1',
        content: 'This is a test document for semantic search capabilities. It contains sample text that should be searchable using Azure AI Search semantic features. The document discusses artificial intelligence, machine learning, and natural language processing technologies.',
        fileName: 'test-document.txt',
        fileType: 'text/plain',
        workspaceId: testWorkspaceId,
        workspaceName: testWorkspaceName,
        uploadedBy: 'test-user',
        uploadedAt: new Date().toISOString(),
        summary: 'Test document about AI and machine learning technologies',
        keyPoints: ['Artificial Intelligence', 'Machine Learning', 'Natural Language Processing']
      };
      
      // Index the document
      console.log('Indexing test document...');
      const indexResult = await azureSearchService.indexDocument(indexName, testDocument);
      console.log(`Document indexing result: ${indexResult}`);
      
      if (indexResult) {
        // Wait for indexing to complete
        console.log('Waiting for indexing to complete...');
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Test semantic search with the properly named configuration
        console.log('Testing semantic search with correct configuration name...');
        const searchResults = await azureSearchService.searchDocuments(indexName, 'What technologies are discussed in the document?');
        console.log(`Found ${searchResults.length} search results`);
        
        if (searchResults.length > 0) {
          console.log('✓ Semantic search working correctly');
          console.log('Top result:');
          const result = searchResults[0];
          console.log(`  File: ${result.fileName}`);
          console.log(`  Summary: ${result.summary}`);
          console.log(`  Content preview: ${result.content.substring(0, 100)}...`);
        } else {
          console.log('✗ No search results found');
        }
      }
    }
    
    // Clean up - delete the test index
    console.log('Cleaning up test index...');
    await azureSearchService.deleteWorkspaceIndex(indexName);
    
    console.log('Semantic search configuration test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testSemanticSearchConfiguration();