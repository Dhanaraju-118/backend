import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import axios from 'axios';

async function diagnoseWorkspaceFiles() {
  try {
    console.log('Diagnosing workspace files in Azure Search...');
    
    // Check the red workspace index that was mentioned in the error
    const indexName = 'red-8f04af2index';
    
    const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
    const apiKey = process.env.AZURE_AI_SEARCH_API_KEY || '';
    
    if (!apiKey) {
      console.log('❌ Azure Search API key not found');
      return;
    }
    
    console.log(`Checking index: ${indexName}`);
    
    // Get the index definition
    const headers = {
      'api-key': apiKey,
      'Content-Type': 'application/json'
    };
    
    try {
      const url = `${endpoint}/indexes/${indexName}?api-version=2023-07-01-Preview`;
      const response = await axios.get(url, { headers });
      const indexDefinition = response.data;
      
      console.log('✅ Index exists');
      console.log(`Index name: ${indexDefinition.name}`);
      
      // List fields
      console.log('\nIndex fields:');
      if (indexDefinition.fields) {
        indexDefinition.fields.forEach((field: any) => {
          console.log(`  - ${field.name} (${field.type})`);
        });
      }
      
      // Check semantic configuration
      if (indexDefinition.semantic && indexDefinition.semantic.configurations) {
        console.log('\nSemantic configurations:');
        indexDefinition.semantic.configurations.forEach((config: any) => {
          console.log(`  - ${config.name}`);
        });
      }
      
      // Search for all documents
      console.log('\nSearching for documents...');
      const searchUrl = `${endpoint}/indexes/${indexName}/docs?api-version=2023-07-01-Preview&search=*&$count=true`;
      const searchResponse = await axios.get(searchUrl, { headers });
      
      console.log(`Found ${searchResponse.data['@odata.count']} documents`);
      
      if (searchResponse.data.value && searchResponse.data.value.length > 0) {
        console.log('\nDocument details:');
        searchResponse.data.value.forEach((doc: any, index: number) => {
          console.log(`  ${index + 1}. ${doc.fileName}`);
          console.log(`     ID: ${doc.id}`);
          console.log(`     Content preview: ${doc.content ? doc.content.substring(0, 100) + '...' : 'No content'}`);
          console.log(`     Summary: ${doc.summary || 'No summary'}`);
          console.log(`     Error: ${doc.content && doc.content.includes('Failed to download file') ? 'YES' : 'NO'}`);
        });
      }
      
    } catch (error: any) {
      if (error.response && error.response.status === 404) {
        console.log(`❌ Index ${indexName} not found`);
      } else {
        console.log(`❌ Failed to check index: ${error.message}`);
        if (error.response?.data) {
          console.log('Error details:', JSON.stringify(error.response.data, null, 2));
        }
      }
    }
    
  } catch (error) {
    console.error('Diagnosis failed:', error);
  }
}

// Run the diagnosis
diagnoseWorkspaceFiles();