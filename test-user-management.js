const axios = require('axios');
const jwt = require('jsonwebtoken');

// Use the correct JWT secret from environment
const JWT_SECRET = 'aiva-secure-jwt-secret-key-change-in-production';

// Generate a test JWT token for the admin user
const token = jwt.sign(
  { 
    userId: '7FC8F24A-5494-426C-93F2-61471A72D6AD', 
    email: 'sudhenreddym@gmail.com', 
    role: 'admin' 
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

console.log('Generated token:', token);

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
    
  } catch (error) {
    console.error('❌ User Management test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
      console.error('Response status:', error.response.status);
    }
  }
}

// Run the test
testUserManagement();