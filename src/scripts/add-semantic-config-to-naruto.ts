// Explicitly load environment variables
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

// Function to add semantic configuration to the Naruto workspace index
async function addSemanticConfigToNarutoIndex() {
  try {
    console.log('🔧 Adding semantic configuration to Naruto workspace index...');
    
    // Check if environment variables are loaded
    console.log(`\nEnvironment check:`);
    console.log(`  AZURE_AI_SEARCH_ENDPOINT: ${process.env.AZURE_AI_SEARCH_ENDPOINT || 'NOT SET'}`);
    console.log(`  AZURE_AI_SEARCH_API_KEY length: ${process.env.AZURE_AI_SEARCH_API_KEY ? process.env.AZURE_AI_SEARCH_API_KEY.length : 'NOT SET'}`);
    
    if (!process.env.AZURE_AI_SEARCH_API_KEY) {
      console.log('❌ AZURE_AI_SEARCH_API_KEY is not set in environment');
      return;
    }
    
    // Specific Naruto workspace index details
    const indexName = 'naruto-4999302index';
    const semanticConfigName = `search${indexName}`;
    
    console.log(`\n🔧 Target index: ${indexName}`);
    console.log(`🧠 Semantic config name to add: ${semanticConfigName}`);
    
    // Check if this index exists in Azure Search
    const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
    
    // Define the semantic configuration to add
    const semanticConfig = {
      name: semanticConfigName,
      prioritizedFields: {
        titleField: {
          fieldName: "fileName"
        },
        prioritizedContentFields: [
          { fieldName: "content" },
          { fieldName: "summary" }
        ],
        prioritizedKeywordsFields: [
          { fieldName: "fileName" },
          { fieldName: "workspaceName" },
          { fieldName: "fileType" },
          { fieldName: "keyPoints" }
        ]
      }
    };
    
    console.log(`\n📋 Semantic configuration to add:`);
    console.log(JSON.stringify(semanticConfig, null, 2));
    
    // Use REST API to update the index with semantic configuration
    const url = `${endpoint}/indexes/${indexName}?api-version=2023-07-01-Preview`;
    const headers = {
      'api-key': process.env.AZURE_AI_SEARCH_API_KEY,
      'Content-Type': 'application/json'
    };
    
    const indexUpdate = {
      semantic: {
        configurations: [semanticConfig]
      }
    };
    
    console.log(`\n📤 Updating index with semantic configuration...`);
    try {
      const response = await axios.patch(url, indexUpdate, { headers });
      console.log('✅ Successfully added semantic configuration to index!');
      console.log(`   Response status: ${response.status}`);
      
      // Verify the configuration was added
      console.log(`\n🔍 Verifying semantic configuration was added...`);
      try {
        const verifyResponse = await axios.get(url, { headers });
        const indexDefinition = verifyResponse.data;
        
        if (indexDefinition.semantic && indexDefinition.semantic.configurations) {
          const addedConfig = indexDefinition.semantic.configurations.find(
            (config: any) => config.name === semanticConfigName
          );
          
          if (addedConfig) {
            console.log('✅ Semantic configuration verified in index!');
            console.log(`   Name: ${addedConfig.name}`);
            console.log(`   Title field: ${addedConfig.prioritizedFields.titleField.fieldName}`);
            
            const contentFields = addedConfig.prioritizedFields.prioritizedContentFields.map((f: any) => f.fieldName);
            console.log(`   Content fields: ${contentFields.join(', ')}`);
            
            const keywordFields = addedConfig.prioritizedFields.prioritizedKeywordsFields.map((f: any) => f.fieldName);
            console.log(`   Keywords fields: ${keywordFields.join(', ')}`);
          } else {
            console.log('❌ Semantic configuration not found in verification');
          }
        } else {
          console.log('❌ No semantic configurations found in verified index');
        }
      } catch (verifyError: any) {
        console.log(`❌ Failed to verify semantic configuration: ${verifyError.message}`);
      }
      
      // Test semantic search
      console.log(`\n🔍 Testing semantic search with new configuration...`);
      const searchUrl = `${endpoint}/indexes/${indexName}/docs/search?api-version=2023-07-01-Preview`;
      const searchBody = {
        search: 'What is this document about?',
        top: 3,
        queryType: "semantic",
        semanticConfiguration: semanticConfigName,
        queryLanguage: "en-US"
        // Removed querySpeller as it was causing issues
      };
      
      try {
        const searchResponse = await axios.post(searchUrl, searchBody, { headers });
        console.log(`✅ Semantic search working with new config! Found ${searchResponse.data.value?.length || 0} results`);
        
        if (searchResponse.data.value && searchResponse.data.value.length > 0) {
          console.log(`📋 Top results:`);
          searchResponse.data.value.forEach((result: any, index: number) => {
            console.log(`   ${index + 1}. ${result.fileName || 'Unknown file'}`);
            if (result.summary) {
              console.log(`      Summary: ${result.summary.substring(0, 100)}...`);
            }
            if (result['@search.semantic.score']) {
              console.log(`      Semantic score: ${result['@search.semantic.score']}`);
            }
          });
        }
      } catch (searchError: any) {
        console.log(`❌ Semantic search test failed: ${searchError.response?.data?.error?.message || searchError.message}`);
      }
      
    } catch (error: any) {
      console.log(`❌ Failed to add semantic configuration: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data)}`);
      }
    }
    
    console.log('\n📋 CONFIGURATION SUMMARY');
    console.log('=====================');
    console.log(`✅ Index name: ${indexName}`);
    console.log(`✅ Semantic config name: ${semanticConfigName}`);
    console.log(`✅ Configuration added: Attempted`);
    
  } catch (error) {
    console.error('❌ Configuration failed:', error);
  }
}

// Run the configuration
addSemanticConfigToNarutoIndex();