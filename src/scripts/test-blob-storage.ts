import { StorageService } from '../services/storage';
import { logger } from '../utils/logger';

async function testBlobStorage() {
  try {
    console.log('Testing Azure Blob Storage functionality...');
    
    // Initialize storage service
    const storageService = StorageService.getInstance();
    await storageService.initialize();
    await storageService.initializeContainer();
    
    console.log('✅ Storage service initialized');
    
    // Test file upload
    const testContent = 'This is a test file for verifying blob storage functionality.';
    const buffer = Buffer.from(testContent, 'utf-8');
    
    const result = await storageService.uploadFile(
      buffer,
      'test-file.txt',
      'text/plain',
      'test-user-id'
    );
    
    console.log('✅ File upload test successful');
    console.log('Upload result:', result);
    
    // Test file retrieval
    try {
      const content = await storageService.getFileContent(result.fileName);
      console.log('✅ File retrieval test successful');
      console.log('Retrieved content:', content);
    } catch (error) {
      console.error('❌ File retrieval test failed:', error);
    }
    
    // Test file deletion
    try {
      await storageService.deleteFile(result.fileName);
      console.log('✅ File deletion test successful');
    } catch (error) {
      console.error('❌ File deletion test failed:', error);
    }
    
    console.log('🎉 All blob storage tests completed');
  } catch (error) {
    console.error('❌ Blob storage test failed:', error);
    process.exit(1);
  }
}

// Run the test
testBlobStorage().then(() => {
  console.log('Test completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});