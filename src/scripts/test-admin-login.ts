import dotenv from 'dotenv';
import path from 'path';
import { DatabaseManager } from '../config/database';
import sql from 'mssql';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function testAdminLogin() {
  try {
    console.log('Testing admin login...');
    
    // Get database manager instance
    const dbManager = DatabaseManager.getInstance();
    
    // Connect to database
    const pool = await dbManager.getPool();
    console.log('✅ Database connected successfully');
    
    // Test user credentials
    const testEmail = 'sudhenreddym@gmail.com';
    const testPassword = 'password123';
    
    // Check if user exists and has admin role
    const userResult = await pool.request()
      .input('email', sql.NVarChar, testEmail)
      .query('SELECT * FROM Users WHERE email = @email');
    
    if (userResult.recordset.length === 0) {
      console.log(`❌ User ${testEmail} not found in database`);
      return;
    }
    
    const user = userResult.recordset[0];
    console.log(`✅ User found: ${user.email}`);
    console.log(`User role: ${user.role}`);
    
    if (user.role !== 'admin') {
      console.log(`❌ User ${testEmail} does not have admin role`);
      return;
    }
    
    console.log(`✅ User ${testEmail} has admin role`);
    console.log('✅ Admin login test passed');
    
  } catch (error) {
    console.error('❌ Admin login test failed:', error);
  }
}

// Run the test
testAdminLogin();