const axios = require('axios');
const jwt = require('jsonwebtoken');

// First, let's login to get a valid token
async function loginAndGetToken() {
  try {
    console.log('Logging in to get token...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'sudhenreddym@gmail.com',
      password: 'password123',
      adminLogin: true
    });
    
    console.log('Login successful!');
    console.log('Token:', loginResponse.data.token);
    
    // Verify the token
    const decoded = jwt.verify(loginResponse.data.token, 'aiva-secure-jwt-secret-key-change-in-production');
    console.log('Decoded token:', decoded);
    
    // Test the admin users endpoint with this token
    console.log('\nTesting admin users endpoint...');
    const usersResponse = await axios.get('http://localhost:3001/api/admin/users', {
      headers: {
        'Authorization': `Bearer ${loginResponse.data.token}`
      }
    });
    
    console.log('Users response:', usersResponse.data);
    
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

loginAndGetToken();