import { WorkspaceStorageService } from '../services/workspaceStorage';
import axios from 'axios';

// Function to check if a workspace index exists and is properly configured
async function checkNarutoIndex() {
  try {
    console.log('🔍 Checking Naruto workspace index...');
    
    // Initialize workspace storage service
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    
    // For Naruto workspace, we need to know the ID and name
    // Since we can't access the database, we'll try to construct the likely names
    
    // Common Naruto workspace naming patterns
    const possibleNames = [
      'Naruto', 'naruto', 'Naruto Workspace', 'naruto-workspace',
      'Naruto Project', 'naruto-project'
    ];
    
    const workspaceId = 'test-id-for-checking'; // Placeholder ID for testing naming
    
    console.log('\nTrying common Naruto workspace naming patterns...');
    
    for (const name of possibleNames) {
      try {
        console.log(`\nChecking workspace: ${name}`);
        
        // Get workspace folder name and index name
        const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(workspaceId, name);
        const indexName = `${workspaceFolderName}index`;
        const semanticConfigName = `search${indexName}`;
        
        console.log(`  📁 Workspace folder name: ${workspaceFolderName}`);
        console.log(`  📋 Index name: ${indexName}`);
        console.log(`  🧠 Semantic config name: ${semanticConfigName}`);
        
        // Check if this index exists in Azure Search
        const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
        const apiKey = process.env.AZURE_AI_SEARCH_API_KEY || '';
        
        if (!apiKey) {
          console.log('  ❌ AZURE_AI_SEARCH_API_KEY is not set');
          continue;
        }
        
        // Try to get the index definition
        const url = `${endpoint}/indexes/${indexName}?api-version=2023-07-01-Preview`;
        const headers = {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        };
        
        try {
          const response = await axios.get(url, { headers });
          const indexDefinition = response.data;
          
          console.log('  ✅ Index found!');
          
          // Check semantic configuration
          if (indexDefinition.semantic && indexDefinition.semantic.configurations) {
            console.log(`  📊 Found ${indexDefinition.semantic.configurations.length} semantic configuration(s)`);
            
            const semanticConfig = indexDefinition.semantic.configurations.find(
              (config: any) => config.name === semanticConfigName
            );
            
            if (semanticConfig) {
              console.log('  ✅ Semantic configuration found with correct name format');
              console.log(`     Name: ${semanticConfig.name}`);
              console.log(`     Title field: ${semanticConfig.prioritizedFields.titleField.fieldName}`);
              
              const contentFields = semanticConfig.prioritizedFields.prioritizedContentFields.map((f: any) => f.fieldName);
              console.log(`     Content fields: ${contentFields.join(', ')}`);
              
              const keywordFields = semanticConfig.prioritizedFields.prioritizedKeywordsFields.map((f: any) => f.fieldName);
              console.log(`     Keywords fields: ${keywordFields.join(', ')}`);
              
              // Try a search query to test semantic search
              console.log('\n  🔍 Testing semantic search...');
              const searchUrl = `${endpoint}/indexes/${indexName}/docs/search?api-version=2023-07-01-Preview`;
              const searchBody = {
                search: 'What is this about?',
                top: 1,
                queryType: "semantic",
                semanticConfiguration: semanticConfigName,
                queryLanguage: "en-US",
                querySpeller: "lexicon"
              };
              
              try {
                const searchResponse = await axios.post(searchUrl, searchBody, { headers });
                console.log(`  ✅ Semantic search working! Found ${searchResponse.data.value?.length || 0} results`);
                
                if (searchResponse.data.value && searchResponse.data.value.length > 0) {
                  const result = searchResponse.data.value[0];
                  console.log(`     Top result file: ${result.fileName || 'Unknown'}`);
                  if (result['@search.semantic.score']) {
                    console.log(`     Semantic score: ${result['@search.semantic.score']}`);
                  }
                }
              } catch (searchError: any) {
                console.log(`  ⚠️  Search test failed: ${searchError.message}`);
              }
              
              // We found a matching index, no need to check others
              return;
            } else {
              console.log('  ⚠️  Semantic configuration not found with expected name format');
              console.log('  Available configurations:');
              indexDefinition.semantic.configurations.forEach((config: any) => {
                console.log(`     - ${config.name}`);
              });
            }
          } else {
            console.log('  ⚠️  No semantic configurations found in index definition');
          }
        } catch (error: any) {
          if (error.response && error.response.status === 404) {
            console.log(`  ℹ️  Index ${indexName} does not exist`);
          } else {
            console.log(`  ❌ Failed to check index ${indexName}: ${error.message}`);
          }
        }
      } catch (error) {
        console.log(`  ❌ Error checking workspace ${name}:`, error);
      }
    }
    
    console.log('\n🔍 Checking all available indexes...');
    try {
      const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
      const apiKey = process.env.AZURE_AI_SEARCH_API_KEY || '';
      
      if (apiKey) {
        const url = `${endpoint}/indexes?api-version=2023-07-01-Preview`;
        const headers = {
          'api-key': apiKey,
          'Content-Type': 'application/json'
        };
        
        const response = await axios.get(url, { headers });
        const indexes = response.data.value;
        
        console.log(`  📋 Found ${indexes.length} total indexes:`);
        indexes.forEach((index: any) => {
          console.log(`     - ${index.name}`);
          
          // Check if any index name contains "naruto"
          if (index.name.toLowerCase().includes('naruto')) {
            console.log(`       🎯 This might be the Naruto workspace index!`);
          }
        });
      }
    } catch (error: any) {
      console.log(`  ❌ Failed to list indexes: ${error.message}`);
    }
    
    console.log('\n📋 CHECK SUMMARY');
    console.log('================');
    console.log('If you know the exact workspace name and ID, you can provide them for a more specific check.');
    console.log('Otherwise, check the list of indexes above to identify the correct one.');
    
  } catch (error) {
    console.error('❌ Check failed:', error);
  }
}

// Run the check
checkNarutoIndex();