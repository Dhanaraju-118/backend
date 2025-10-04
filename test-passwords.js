const bcrypt = require('bcryptjs');

// The password hash from the database
const passwordHash = '$2a$12$trycakA7GYLhE.Yj0Iz0qesiZGdPZSrOl/3Kuz6kJe4An1BIM82j2';

// Common passwords to test
const passwords = [
  'Admin@123',
  'admin123',
  'Admin123',
  'password',
  'Password@123',
  'ravi@0791' // This is the database password, not the user password
];

async function testPasswords() {
  console.log('Testing passwords against hash...');
  
  for (const password of passwords) {
    try {
      const isMatch = await bcrypt.compare(password, passwordHash);
      console.log(`Password "${password}": ${isMatch ? '✅ MATCH' : '❌ No match'}`);
    } catch (error) {
      console.error(`Error testing password "${password}":`, error);
    }
  }
}

testPasswords();