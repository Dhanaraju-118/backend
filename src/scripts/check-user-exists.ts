import axios from 'axios';

async function checkUserExists() {
  try {
    console.log('Checking if user exists...');
    
    // Test user credentials
    const testEmail = 'sudhenreddym@gmail.com';
    
    // Make a request to check if user exists
    const response = await axios.post('http://localhost:3001/api/auth/login', {
      email: testEmail,
      password: 'password123'
    });
    
    console.log('✅ User exists and login successful');
    console.log('User data:', response.data.user);
    
  } catch (error: any) {
    if (error.response) {
      console.log('Server response:', error.response.data);
      if (error.response.data.message === 'Invalid email or password') {
        console.log('❌ User does not exist or password is incorrect');
      }
    } else {
      console.error('❌ Error checking user:', error.message);
    }
  }
}

// Run the check
checkUserExists();