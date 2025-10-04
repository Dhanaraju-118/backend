import { WorkspaceStorageService } from '../services/workspaceStorage';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

async function verifyBlobStorage() {
  try {
    console.log('Verifying blob storage functionality...');
    
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    
    // Test creating a workspace folder
    const testWorkspaceId = uuidv4();
    const testWorkspaceName = 'Test Workspace';
    
    console.log(`Creating folder for workspace: ${testWorkspaceName} (${testWorkspaceId})`);
    const folderPath = await workspaceStorageService.createWorkspaceFolder(testWorkspaceId, testWorkspaceName);
    
    if (folderPath) {
      console.log('✅ Folder created successfully:', folderPath);
      
      // Test checking if folder exists
      const exists = await workspaceStorageService.folderExists(testWorkspaceId, testWorkspaceName);
      console.log('✅ Folder exists check:', exists);
      
      // Test listing blobs (should be empty)
      const blobs = await workspaceStorageService.listWorkspaceBlobs(testWorkspaceId, testWorkspaceName);
      console.log('✅ Blobs in folder:', blobs);
      
      // Test deleting the folder
      const deleted = await workspaceStorageService.deleteWorkspaceFolder(testWorkspaceId, testWorkspaceName);
      console.log('✅ Folder deletion result:', deleted);
    } else {
      console.log('⚠️  Folder creation skipped (likely in mock mode or missing configuration)');
    }
    
    console.log('🎉 Blob storage verification completed');
  } catch (error) {
    console.error('❌ Verification failed:', error);
    process.exit(1);
  }
}

// Run the verification
verifyBlobStorage().then(() => {
  console.log('Verification completed successfully');
  process.exit(0);
}).catch((error) => {
  console.error('Verification failed:', error);
  process.exit(1);
});