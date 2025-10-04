import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { FileAnalysisService } from '../services/fileAnalysisService';
import { StorageService } from '../services/storage';

async function testWorkspaceFileAccess() {
  try {
    console.log('Testing workspace file access...');
    
    // Initialize services
    const storageService = StorageService.getInstance();
    await storageService.initialize();
    
    const fileAnalysisService = FileAnalysisService.getInstance();
    
    // Test accessing one of the files from the red workspace
    // Based on our diagnostic, the file path should be workspace/red-8f04af2/
    const testFilePath = 'workspace/red-8f04af2/Alyasra_Privacy_Policy.pdf';
    const originalName = 'Alyasra_Privacy_Policy.pdf';
    
    console.log(`Testing access to file: ${testFilePath}`);
    
    try {
      // Try to get file stream directly
      const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files';
      console.log(`Using container: ${containerName}`);
      
      const fileStream = await storageService.getFileStreamFromContainer(testFilePath, containerName);
      console.log('✅ Successfully accessed file stream');
      
      // Try to extract content
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
      }
      
    } catch (error: any) {
      console.log(`❌ Failed to access file: ${error.message}`);
      
      // Let's try to list files in the container to see what's actually there
      console.log('Listing files in container to diagnose...');
      try {
        const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files';
        const containerClient = (storageService as any).blobServiceClient.getContainerClient(containerName);
        
        console.log('Files in container:');
        let fileCount = 0;
        for await (const blob of containerClient.listBlobsFlat()) {
          console.log(`  - ${blob.name}`);
          fileCount++;
          if (fileCount > 10) {
            console.log('  ... (more files)');
            break;
          }
        }
      } catch (listError: any) {
        console.log(`Failed to list files: ${listError.message}`);
      }
    }
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testWorkspaceFileAccess();