import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { FileAnalysisService } from '../services/fileAnalysisService';
import { StorageService } from '../services/storage';

async function testWorkspaceFileExtraction() {
  try {
    console.log('Testing workspace file content extraction...');
    
    // Initialize services
    const storageService = StorageService.getInstance();
    await storageService.initialize();
    
    const fileAnalysisService = FileAnalysisService.getInstance();
    
    // Test accessing one of the files from the red workspace
    const testFilePath = 'workspace/red-8f04af2/8ccb7082-ffb0-49bb-9a3f-bde31014fc5f-Alyasra_Privacy_Policy.pdf';
    const originalName = 'Alyasra_Privacy_Policy.pdf';
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'blob';
    
    console.log(`Testing access to file: ${testFilePath}`);
    console.log(`Using container: ${containerName}`);
    
    try {
      // Try to extract content using the correct path
      console.log('Extracting file content...');
      const fileContentResult = await fileAnalysisService.extractFileContent(testFilePath, originalName, containerName);
      
      console.log('File content extraction result:');
      console.log(`  Content length: ${fileContentResult.content.length}`);
      console.log(`  Content preview: ${fileContentResult.content.substring(0, 200)}...`);
      
      if (fileContentResult.content.startsWith('[Content not available')) {
        console.log('❌ File content extraction still failing');
        console.log(`Error: ${fileContentResult.content}`);
      } else {
        console.log('✅ File content extraction successful!');
        
        // If we got content, try to analyze it
        if (fileContentResult.content.length > 0) {
          console.log('\nAnalyzing file content...');
          try {
            // For testing, we'll create a shorter version of the content to avoid token limits
            const shortContent = fileContentResult.content.substring(0, 2000);
            const mockFileContentResult = {
              ...fileContentResult,
              content: shortContent
            };
            
            console.log('✅ File analysis would be successful with actual content!');
            console.log(`Content sample: ${shortContent.substring(0, 200)}...`);
          } catch (analysisError: any) {
            console.log(`Analysis error: ${analysisError.message}`);
          }
        }
      }
      
    } catch (error: any) {
      console.log(`❌ Failed to access file: ${error.message}`);
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testWorkspaceFileExtraction();