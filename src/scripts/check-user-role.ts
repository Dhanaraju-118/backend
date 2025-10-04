import { DatabaseManager } from '../config/database';
import sql from 'mssql';

async function checkUserRole() {
  try {
    console.log('Checking user role...');
    
    // Get database manager instance
    const dbManager = DatabaseManager.getInstance();
    
    // Connect to database
    const pool = await dbManager.getPool();
    console.log('✅ Database connected successfully');
    
    // Check if user exists and has admin role
    const userResult = await pool.request()
      .input('email', sql.NVarChar, 'sudhenreddym@gmail.com')
      .query('SELECT * FROM Users WHERE email = @email');
    
    if (userResult.recordset.length === 0) {
      console.log('❌ User not found in database');
      return;
    }
    
    const user = userResult.recordset[0];
    console.log('✅ User found:', user.email);
    console.log('User role:', user.role);
    console.log('User ID:', user.id);
    
    if (user.role === 'admin') {
      console.log('✅ User has admin role');
    } else {
      console.log('❌ User does not have admin role');
    }
    
  } catch (error) {
    console.error('❌ Error checking user role:', error);
  }
}

// Run the check
checkUserRole();