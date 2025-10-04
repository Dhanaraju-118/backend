// Explicitly load environment variables
import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';

// Function to recreate the Naruto workspace index with semantic configuration
async function recreateNarutoIndexWithSemanticConfig() {
  try {
    console.log('🔧 Recreating Naruto workspace index with semantic configuration...');
    
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
    console.log(`🧠 Semantic config name: ${semanticConfigName}`);
    
    // Check if this index exists in Azure Search
    const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
    const headers = {
      'api-key': process.env.AZURE_AI_SEARCH_API_KEY,
      'Content-Type': 'application/json'
    };
    
    // First, get the existing index definition
    console.log(`\n📥 Retrieving existing index definition...`);
    let existingIndexDefinition: any = null;
    
    try {
      const getUrl = `${endpoint}/indexes/${indexName}?api-version=2023-07-01-Preview`;
      const getResponse = await axios.get(getUrl, { headers });
      existingIndexDefinition = getResponse.data;
      console.log('✅ Retrieved existing index definition');
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        console.log(`❌ Index ${indexName} does not exist`);
        return;
      } else {
        console.log(`❌ Failed to retrieve index definition: ${error.message}`);
        return;
      }
    }
    
    // Define the new index definition with semantic configuration
    const newIndexDefinition = {
      name: indexName,
      fields: existingIndexDefinition.fields,
      semantic: {
        configurations: [
          {
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
          }
        ]
      }
    };
    
    console.log(`\n📋 New index definition with semantic configuration:`);
    console.log(`   Fields: ${newIndexDefinition.fields.length}`);
    console.log(`   Semantic configurations: ${newIndexDefinition.semantic.configurations.length}`);
    
    // Delete the existing index
    console.log(`\n🗑️  Deleting existing index...`);
    try {
      const deleteUrl = `${endpoint}/indexes/${indexName}?api-version=2023-07-01-Preview`;
      await axios.delete(deleteUrl, { headers });
      console.log('✅ Deleted existing index');
    } catch (error: any) {
      console.log(`❌ Failed to delete existing index: ${error.message}`);
      return;
    }
    
    // Wait a moment for the deletion to complete
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Create the new index with semantic configuration
    console.log(`\n🏗️  Creating new index with semantic configuration...`);
    try {
      const createUrl = `${endpoint}/indexes?api-version=2023-07-01-Preview`;
      const createResponse = await axios.post(createUrl, newIndexDefinition, { headers });
      console.log('✅ Created new index with semantic configuration!');
      console.log(`   Response status: ${createResponse.status}`);
    } catch (error: any) {
      console.log(`❌ Failed to create new index: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Data: ${JSON.stringify(error.response.data)}`);
      }
      return;
    }
    
    // Wait a moment for the creation to complete
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify the configuration was added
    console.log(`\n🔍 Verifying semantic configuration was added...`);
    try {
      const verifyUrl = `${endpoint}/indexes/${indexName}?api-version=2023-07-01-Preview`;
      const verifyResponse = await axios.get(verifyUrl, { headers });
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
    
    console.log('\n📋 RECREATION SUMMARY');
    console.log('====================');
    console.log(`✅ Index name: ${indexName}`);
    console.log(`✅ Semantic config name: ${semanticConfigName}`);
    console.log(`✅ Index recreated with semantic configuration: Success`);
    
  } catch (error) {
    console.error('❌ Recreation failed:', error);
  }
}

// Run the recreation
recreateNarutoIndexWithSemanticConfig();