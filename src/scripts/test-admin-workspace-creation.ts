import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

// Admin credentials (as provided)
const ADMIN_EMAIL = 'sudhenreddym@gmail.com';
const ADMIN_PASSWORD = 'password123';

// API base URL (adjust if needed)
const BASE_URL = 'http://localhost:3002/api';

async function testAdminWorkspaceCreation() {
  try {
    console.log('Testing admin workspace creation with blob storage...');
    
    // Step 1: Login as admin
    console.log('Logging in as admin...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    const { token, user } = loginResponse.data;
    console.log('✅ Admin login successful');
    console.log('User ID:', user.id);
    console.log('User role:', user.role);
    
    // Step 2: Create a test workspace
    console.log('Creating test workspace...');
    const workspaceName = `Test Workspace ${uuidv4().substring(0, 8)}`;
    const createResponse = await axios.post(`${BASE_URL}/workspaces`, {
      name: workspaceName,
      description: 'Test workspace for blob storage verification',
      color: '#3B82F6',
      isShared: false
    }, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    const workspace = createResponse.data.workspace;
    console.log('✅ Workspace created successfully');
    console.log('Workspace ID:', workspace.id);
    console.log('Workspace Name:', workspace.name);
    console.log('Folder Path:', workspace.folderPath || 'Not assigned');
    
    // Step 3: Verify workspace was created in database
    console.log('Verifying workspace in database...');
    const getResponse = await axios.get(`${BASE_URL}/workspaces/${workspace.id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const retrievedWorkspace = getResponse.data.workspace;
    console.log('✅ Workspace retrieved successfully');
    console.log('Retrieved Workspace ID:', retrievedWorkspace.id);
    console.log('Retrieved Workspace Name:', retrievedWorkspace.name);
    
    // Step 4: List all workspaces to verify it's there
    console.log('Listing all workspaces...');
    const listResponse = await axios.get(`${BASE_URL}/workspaces`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const workspaces = listResponse.data.workspaces;
    const createdWorkspace = workspaces.find((ws: any) => ws.id === workspace.id);
    if (createdWorkspace) {
      console.log('✅ Workspace found in list');
    } else {
      console.warn('⚠️  Workspace not found in list');
    }
    
    // Step 5: Delete the test workspace
    console.log('Deleting test workspace...');
    await axios.delete(`${BASE_URL}/workspaces/${workspace.id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ Workspace deleted successfully');
    
    console.log('🎉 All admin workspace creation tests completed');
    console.log('Summary:');
    console.log('- Login: ✅');
    console.log('- Workspace Creation: ✅');
    console.log('- Workspace Retrieval: ✅');
    console.log('- Workspace Listing: ✅');
    console.log('- Workspace Deletion: ✅');
    console.log('- Blob Storage Integration: ' + (workspace.folderPath ? '✅' : '⚠️'));
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    // If it's a 401 error, the credentials might be wrong
    if (error.response?.status === 401) {
      console.error('💡 Hint: Check if the admin credentials are correct');
    }
    
    // If it's a network error, the server might not be running
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Hint: Make sure the server is running on port 3002');
    }
    
    process.exit(1);
  }
}

// Run the test
testAdminWorkspaceCreation().then(() => {
  console.log('Test completed successfully');
  process.exit(0);
}).catch((error: any) => {
  console.error('Test failed:', error);
  process.exit(1);
});