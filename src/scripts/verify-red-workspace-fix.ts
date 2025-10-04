import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { AzureSearchService } from '../services/azureSearchService';

async function verifyRedWorkspaceFix() {
  try {
    console.log('Verifying red workspace fix...');
    
    // Initialize services
    const azureSearchService = AzureSearchService.getInstance();
    
    // Test the red workspace index
    const indexName = 'red-8f04af2index';
    
    console.log(`Testing index: ${indexName}`);
    
    // Test a search to verify the fix
    console.log('\nTesting search for "privacy policy"...');
    const searchResults = await azureSearchService.searchDocuments(indexName, 'privacy policy');
    console.log(`Found ${searchResults.length} results for "privacy policy" search`);
    
    if (searchResults.length > 0) {
      console.log('\nSearch results:');
      searchResults.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.fileName}`);
        console.log(`     Summary: ${result.summary || 'No summary'}`);
        console.log(`     Content preview: ${result.content ? result.content.substring(0, 100) + '...' : 'No content'}`);
        console.log(`     Error in content: ${result.content && result.content.includes('Failed to download file') ? 'YES' : 'NO'}`);
      });
    } else {
      console.log('No results found');
    }
    
    // Test another search
    console.log('\nTesting search for "employment contract"...');
    const searchResults2 = await azureSearchService.searchDocuments(indexName, 'employment contract');
    console.log(`Found ${searchResults2.length} results for "employment contract" search`);
    
    if (searchResults2.length > 0) {
      console.log('\nSearch results:');
      searchResults2.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.fileName}`);
        console.log(`     Summary: ${result.summary || 'No summary'}`);
        console.log(`     Content preview: ${result.content ? result.content.substring(0, 100) + '...' : 'No content'}`);
        console.log(`     Error in content: ${result.content && result.content.includes('Failed to download file') ? 'YES' : 'NO'}`);
      });
    } else {
      console.log('No results found');
    }
    
    console.log('\n🎉 Verification completed!');
    
  } catch (error) {
    console.error('Verification failed:', error);
  }
}

// Run the verification
verifyRedWorkspaceFix();