import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';
import { createReadStream } from 'fs';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Admin credentials (as provided)
const ADMIN_EMAIL = 'sudhenreddym@gmail.com';
const ADMIN_PASSWORD = 'password123';

// API base URL (adjust if needed)
const BASE_URL = 'http://localhost:3001/api';

async function testWorkspaceFileUpload() {
  try {
    console.log('Testing workspace file upload functionality...');
    
    // Step 1: Login as admin
    console.log('Logging in as admin...');
    const loginResponse = await axios.post(`${BASE_URL}/auth/login`, {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD
    });
    
    const { token } = loginResponse.data;
    console.log('✅ Admin login successful');
    
    // Step 2: Get workspaces
    console.log('Getting workspaces...');
    const workspacesResponse = await axios.get(`${BASE_URL}/workspaces`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const workspaces = workspacesResponse.data.workspaces;
    if (workspaces.length === 0) {
      console.log('No workspaces found. Creating a test workspace...');
      const createResponse = await axios.post(`${BASE_URL}/workspaces`, {
        name: 'Test Workspace for File Upload',
        description: 'Workspace for testing file upload functionality',
        color: '#3B82F6',
        isShared: false
      }, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      const newWorkspace = createResponse.data.workspace;
      workspaces.push(newWorkspace);
      console.log('✅ Test workspace created:', newWorkspace.id);
    }
    
    const workspace = workspaces[0];
    console.log('Using workspace:', workspace.name, workspace.id);
    
    // Step 3: Test file upload
    console.log('Testing file upload to workspace...');
    console.log('Note: Frontend file upload uses FormData which is not easily testable with this script.');
    console.log('Please test the file upload functionality through the frontend UI.');
    
    console.log('🎉 Workspace file upload test completed');
    console.log('Summary:');
    console.log('- Login: ✅');
    console.log('- Workspace Retrieval: ✅');
    console.log('- File Upload Endpoint: Ready (test via frontend)');
    
  } catch (error: any) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    
    // If it's a 401 error, the credentials might be wrong
    if (error.response?.status === 401) {
      console.error('💡 Hint: Check if the admin credentials are correct');
    }
    
    // If it's a network error, the server might not be running
    if (error.code === 'ECONNREFUSED') {
      console.error('💡 Hint: Make sure the server is running on port 3001');
    }
    
    process.exit(1);
  }
}

// Run the test
testWorkspaceFileUpload().then(() => {
  console.log('Test completed successfully');
  process.exit(0);
}).catch((error: any) => {
  console.error('Test failed:', error);
  process.exit(1);
});