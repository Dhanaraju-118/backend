const axios = require('axios');

// Test the admin users endpoint with a timeout
async function testUsersEndpoint() {
  try {
    console.log('Testing admin users endpoint with timeout...');
    
    // Login first to get token
    console.log('Logging in...');
    const loginResponse = await axios.post('http://localhost:3001/api/auth/login', {
      email: 'sudhenreddym@gmail.com',
      password: 'password123',
      adminLogin: true
    }, {
      timeout: 5000 // 5 second timeout
    });
    
    console.log('Login successful!');
    console.log('Token:', loginResponse.data.token.substring(0, 20) + '...');
    
    // Test the admin users endpoint
    console.log('Fetching users...');
    const usersResponse = await axios.get('http://localhost:3001/api/admin/users', {
      headers: {
        'Authorization': `Bearer ${loginResponse.data.token}`
      },
      timeout: 10000 // 10 second timeout
    });
    
    console.log('Users response received!');
    console.log('Status:', usersResponse.status);
    console.log('Users count:', usersResponse.data.users ? usersResponse.data.users.length : 0);
    console.log('First user:', usersResponse.data.users && usersResponse.data.users.length > 0 ? usersResponse.data.users[0] : 'No users');
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
  }
}

testUsersEndpoint();