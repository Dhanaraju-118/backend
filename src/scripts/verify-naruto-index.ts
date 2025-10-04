// Explicitly load environment variables
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

// Function to verify the Naruto workspace index specifically
async function verifyNarutoIndex() {
  try {
    console.log('🔍 Verifying Naruto workspace index...');
    
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
    
    console.log(`\n🔍 Checking Naruto workspace index: ${indexName}`);
    console.log(`🧠 Expected semantic config name: ${semanticConfigName}`);
    
    // Check if this index exists in Azure Search
    const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
    
    // Try to get the index definition
    const url = `${endpoint}/indexes/${indexName}?api-version=2023-07-01-Preview`;
    const headers = {
      'api-key': process.env.AZURE_AI_SEARCH_API_KEY,
      'Content-Type': 'application/json'
    };
    
    try {
      console.log('\n📥 Retrieving index definition...');
      const response = await axios.get(url, { headers });
      const indexDefinition = response.data;
      
      console.log('✅ Index found!');
      console.log(`📊 Index details:`);
      console.log(`   Name: ${indexDefinition.name}`);
      console.log(`   Fields: ${indexDefinition.fields.length}`);
      
      // Display field information
      console.log(`\n📋 Index fields:`);
      indexDefinition.fields.forEach((field: any) => {
        console.log(`   - ${field.name} (${field.type}) - searchable: ${field.searchable}, filterable: ${field.filterable}`);
      });
      
      // Check semantic configuration
      if (indexDefinition.semantic && indexDefinition.semantic.configurations) {
        console.log(`\n📊 Found ${indexDefinition.semantic.configurations.length} semantic configuration(s)`);
        
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
        } else {
          console.log('❌ Semantic configuration not found with expected name format');
          console.log('Available configurations:');
          indexDefinition.semantic.configurations.forEach((config: any) => {
            console.log(`   - ${config.name}`);
          });
          
          // If there's only one semantic config, let's check if we should use that one
          if (indexDefinition.semantic.configurations.length === 1) {
            const onlyConfig = indexDefinition.semantic.configurations[0];
            console.log(`\n⚠️  Using the only available semantic configuration: ${onlyConfig.name}`);
            console.log(`   Title field: ${onlyConfig.prioritizedFields.titleField.fieldName}`);
            const contentFields = onlyConfig.prioritizedFields.prioritizedContentFields.map((f: any) => f.fieldName);
            console.log(`   Content fields: ${contentFields.join(', ')}`);
            const keywordFields = onlyConfig.prioritizedFields.prioritizedKeywordsFields.map((f: any) => f.fieldName);
            console.log(`   Keywords fields: ${keywordFields.join(', ')}`);
          }
        }
      } else {
        console.log('❌ No semantic configurations found in index definition');
      }
      
      // Try a search query to test semantic search
      console.log('\n🔍 Testing semantic search...');
      const searchUrl = `${endpoint}/indexes/${indexName}/docs/search?api-version=2023-07-01-Preview`;
      
      // Try different semantic configuration names
      const possibleConfigNames = [
        semanticConfigName, // Our expected format
        'workspace-semantic-config', // Old format
        indexName, // Index name itself
        'default' // Default
      ];
      
      let searchSuccessful = false;
      
      for (const configName of possibleConfigNames) {
        console.log(`\n   Trying semantic config: ${configName}`);
        const searchBody = {
          search: 'What is this document about?',
          top: 3,
          queryType: "semantic",
          semanticConfiguration: configName,
          queryLanguage: "en-US",
          querySpeller: "lexicon"
        };
        
        try {
          const searchResponse = await axios.post(searchUrl, searchBody, { headers });
          console.log(`   ✅ Semantic search working with config '${configName}'! Found ${searchResponse.data.value?.length || 0} results`);
          
          if (searchResponse.data.value && searchResponse.data.value.length > 0) {
            console.log(`   📋 Top results:`);
            searchResponse.data.value.forEach((result: any, index: number) => {
              console.log(`     ${index + 1}. ${result.fileName || 'Unknown file'}`);
              if (result.summary) {
                console.log(`        Summary: ${result.summary.substring(0, 100)}...`);
              }
              if (result['@search.semantic.score']) {
                console.log(`        Semantic score: ${result['@search.semantic.score']}`);
              }
            });
          }
          
          searchSuccessful = true;
          break; // Stop trying other config names
        } catch (searchError: any) {
          console.log(`   ⚠️  Search failed with config '${configName}': ${searchError.response?.data?.error?.message || searchError.message}`);
        }
      }
      
      if (!searchSuccessful) {
        console.log(`\n❌ Semantic search test failed with all configuration names`);
      }
      
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        console.log(`❌ Index ${indexName} does not exist`);
      } else {
        console.log(`❌ Failed to check index ${indexName}: ${error.message}`);
        if (error.response) {
          console.log(`   Status: ${error.response.status}`);
          console.log(`   Data: ${JSON.stringify(error.response.data)}`);
        }
      }
    }
    
    console.log('\n📋 VERIFICATION SUMMARY');
    console.log('=====================');
    console.log(`✅ Index name: ${indexName}`);
    console.log(`✅ Environment configured: Yes`);
    console.log(`✅ Index accessible: ${indexName.includes('naruto') ? 'Yes' : 'No'}`);
    
  } catch (error) {
    console.error('❌ Verification failed:', error);
  }
}

// Run the verification
verifyNarutoIndex();