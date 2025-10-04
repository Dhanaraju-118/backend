import axios from 'axios';
import jwt from 'jsonwebtoken';

// Generate a test JWT token for the admin user
const token = jwt.sign(
  { 
    userId: 'test-admin-id', 
    email: 'sudhenreddym@gmail.com', 
    role: 'admin' 
  },
  'your-super-secret-jwt-key-change-this-in-production',
  { expiresIn: '1h' }
);

async function testUserManagement() {
  try {
    console.log('Testing User Management API...');
    
    // Make API call to get users
    const response = await axios.get('http://localhost:3001/api/admin/users', {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    console.log('✅ User Management API response:', response.data);
    
    if (response.data.users && Array.isArray(response.data.users)) {
      console.log(`✅ Successfully fetched ${response.data.users.length} users from database`);
      console.log('✅ User Management is working correctly');
    } else {
      console.log('❌ Unexpected response structure');
    }
    
  } catch (error: any) {
    console.error('❌ User Management test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

// Run the test
testUserManagement();