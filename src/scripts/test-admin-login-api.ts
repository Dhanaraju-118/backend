import axios from 'axios';

async function testAdminLogin() {
  try {
    console.log('Testing admin login API...');
    
    // Test user credentials
    const testEmail = 'sudhenreddym@gmail.com';
    const testPassword = 'password123';
    
    // Make API call to login endpoint
    const response = await axios.post('http://localhost:3001/api/auth/login', {
      email: testEmail,
      password: testPassword
    });
    
    console.log('✅ Login API response:', response.data);
    
    if (response.data.user.role === 'admin') {
      console.log('✅ User has admin role');
      console.log('✅ Admin login test passed');
    } else {
      console.log('❌ User does not have admin role');
    }
    
  } catch (error: any) {
    console.error('❌ Admin login test failed:', error.response?.data || error.message);
  }
}

// Run the test
testAdminLogin();