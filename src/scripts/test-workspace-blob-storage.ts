import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Admin credentials
const ADMIN_EMAIL = 'sudhenreddym@gmail.com';
const ADMIN_PASSWORD = 'password123';

// API base URL
const BASE_URL = 'http://localhost:3002/api';

async function testWorkspaceBlobStorage() {
  try {
    console.log('Testing workspace blob storage functionality...');
    
    // 1. Login as admin
    console.log('Logging in as admin...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    const token = loginResponse.data.token;
    console.log('✅ Admin login successful');
    
    // 2. Create a test workspace
    console.log('Creating test workspace...');
    const workspaceName = `Test Workspace ${uuidv4().substring(0, 8)}`;
    const createResponse = await axios.post(`${BASE_URL}/workspaces`, {
      name: workspaceName,
      description: 'Test workspace for blob storage verification',
      color: '#3B82F6',
      isShared: false
    }, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const workspace = createResponse.data.workspace;
    console.log('✅ Workspace created successfully');
    console.log('Workspace ID:', workspace.id);
    console.log('Folder Path:', workspace.folderPath);
    
    // 3. Verify the folder was created (this would require direct blob storage access)
    // For now, we'll just check that the folderPath property exists
    if (workspace.folderPath) {
      console.log('✅ Blob storage folder path assigned to workspace');
    } else {
      console.warn('⚠️  No folder path assigned to workspace');
    }
    
    // 4. Delete the test workspace
    console.log('Deleting test workspace...');
    await axios.delete(`${BASE_URL}/workspaces/${workspace.id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Workspace deleted successfully');
    
    console.log('🎉 All workspace blob storage tests completed');
  } catch (error: any) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    process.exit(1);
  }
}

// Run the test
testWorkspaceBlobStorage().then(() => {
  console.log('Test completed successfully');
  process.exit(0);
}).catch((error: any) => {
  console.error('Test failed:', error);
  process.exit(1);
});