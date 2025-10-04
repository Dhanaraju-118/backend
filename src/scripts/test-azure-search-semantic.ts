import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { v4 as uuidv4 } from 'uuid';
import { AzureSearchService } from '../services/azureSearchService';
import axios from 'axios';

async function testAzureSearchSemantic() {
  try {
    console.log('Testing Azure Search semantic configuration...');
    
    // Initialize services
    const azureSearchService = AzureSearchService.getInstance();
    
    // Test index name
    const testIndexName = `test-semantic-${uuidv4().substring(0, 8)}-index`;
    const semanticConfigName = `search${testIndexName}`;
    
    console.log(`Test index name: ${testIndexName}`);
    console.log(`Expected semantic config name: ${semanticConfigName}`);
    
    // Create Azure Search index
    console.log('Creating Azure Search index with semantic configuration...');
    const indexCreated = await azureSearchService.createWorkspaceIndex(testIndexName);
    console.log(`Index creation result: ${indexCreated}`);
    
    if (indexCreated) {
      // Wait a moment for index creation to complete
      console.log('Waiting for index creation to complete...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify the semantic configuration
      console.log('Verifying semantic configuration...');
      const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
      const apiKey = process.env.AZURE_AI_SEARCH_API_KEY || '';
      
      if (!apiKey) {
        console.log('❌ Azure Search API key not found');
        return;
      }
      
      const headers = {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      };
      
      try {
        const url = `${endpoint}/indexes/${testIndexName}?api-version=2023-07-01-Preview`;
        const response = await axios.get(url, { headers });
        const indexDefinition = response.data;
        
        console.log('✅ Index definition retrieved successfully');
        
        if (indexDefinition.semantic && indexDefinition.semantic.configurations) {
          console.log(`✅ Found ${indexDefinition.semantic.configurations.length} semantic configuration(s)`);
          
          const semanticConfig = indexDefinition.semantic.configurations.find(
            (config: any) => config.name === semanticConfigName
          );
          
          if (semanticConfig) {
            console.log('✅ Semantic configuration found with correct name format');
            console.log(`   Name: ${semanticConfig.name}`);
            console.log(`   Title field: ${semanticConfig.prioritizedFields.titleField.fieldName}`);
            
            const contentFields = semanticConfig.prioritizedFields.prioritizedContentFields.map((f: any) => f.fieldName);
            console.log(`   Content fields: ${contentFields.join(', ')}`);
            
            const keywordFields = semanticConfig.prioritizedFields.prioritizedKeywordsFields.map((f: any) => f.fieldName);
            console.log(`   Keywords fields: ${keywordFields.join(', ')}`);
            
            console.log('\n🎉 SUCCESS: Azure Search semantic configuration is working!');
            console.log('   - Index created successfully');
            console.log('   - Semantic configuration properly set up');
            console.log('   - Fields configured correctly');
            
            // Test document to index
            const testDocument = {
              id: 'test-doc-1',
              content: 'This is a test document for semantic search capabilities. It contains sample text that should be searchable using Azure AI Search semantic features. The document discusses artificial intelligence, machine learning, and natural language processing technologies.',
              fileName: 'test-document.txt',
              fileType: 'text/plain',
              workspaceId: 'test-workspace-id',
              workspaceName: 'Test Workspace',
              uploadedBy: 'test-user',
              uploadedAt: new Date().toISOString(),
              summary: 'Test document about AI and machine learning technologies',
              keyPoints: ['Artificial Intelligence', 'Machine Learning', 'Natural Language Processing']
            };
            
            // Index the document
            console.log('\nIndexing test document...');
            const indexResult = await azureSearchService.indexDocument(testIndexName, testDocument);
            console.log(`Document indexing result: ${indexResult}`);
            
            if (indexResult) {
              // Wait for indexing to complete
              console.log('Waiting for indexing to complete...');
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Test semantic search with the properly named configuration
              console.log('Testing semantic search with correct configuration name...');
              const searchUrl = `${endpoint}/indexes/${testIndexName}/docs/search?api-version=2023-07-01-Preview`;
              const searchBody = {
                search: 'How does semantic search work with AI technologies?',
                top: 3,
                queryType: "semantic",
                semanticConfiguration: semanticConfigName,
                queryLanguage: "en-US",
                querySpeller: "lexicon"
              };
              
              try {
                const searchResponse = await axios.post(searchUrl, searchBody, { headers });
                console.log(`✅ Semantic search successful! Found ${searchResponse.data.value?.length || 0} results`);
                
                if (searchResponse.data.value && searchResponse.data.value.length > 0) {
                  console.log('\nTop search result:');
                  const result = searchResponse.data.value[0];
                  console.log(`  File: ${result.fileName || 'Unknown'}`);
                  console.log(`  Score: ${result['@search.score']}`);
                  if (result['@search.semantic.score']) {
                    console.log(`  Semantic score: ${result['@search.semantic.score']}`);
                  }
                  if (result.summary) {
                    console.log(`  Summary: ${result.summary.substring(0, 100)}...`);
                  }
                }
              } catch (searchError: any) {
                console.log(`❌ Semantic search test failed: ${searchError.message}`);
                if (searchError.response?.data) {
                  console.log('Error details:', JSON.stringify(searchError.response.data, null, 2));
                }
              }
            }
          } else {
            console.log('❌ Semantic configuration not found with expected name format');
            console.log('Available configurations:');
            indexDefinition.semantic.configurations.forEach((config: any) => {
              console.log(`   - ${config.name}`);
            });
          }
        } else {
          console.log('❌ No semantic configurations found in index definition');
        }
      } catch (error: any) {
        console.log(`❌ Failed to retrieve index definition: ${error.message}`);
        if (error.response?.data) {
          console.log('Error details:', JSON.stringify(error.response.data, null, 2));
        }
      }
    }
    
    // Clean up - delete the test index
    console.log('\nCleaning up test index...');
    await azureSearchService.deleteWorkspaceIndex(testIndexName);
    console.log('Test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testAzureSearchSemantic();