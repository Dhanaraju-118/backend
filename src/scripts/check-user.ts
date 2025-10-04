import dotenv from 'dotenv';
import path from 'path';
import { DatabaseManager } from '../config/database';
import sql from 'mssql';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function checkUser() {
  try {
    console.log('Connecting to database...');
    const dbManager = DatabaseManager.getInstance();
    const pool = await dbManager.getPool();
    
    console.log('Checking if user exists...');
    const result = await pool.request()
      .input('email', sql.NVarChar, 'sudhenreddym@gmail.com')
      .query('SELECT id, email, role, firstName, lastName, isActive FROM Users WHERE email = @email');
    
    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      console.log('✅ User found:');
      console.log('  ID:', user.id);
      console.log('  Email:', user.email);
      console.log('  Role:', user.role);
      console.log('  Name:', user.firstName, user.lastName);
      console.log('  Active:', user.isActive ? 'Yes' : 'No');
    } else {
      console.log('❌ User not found in database');
    }
    
    await dbManager.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkUser();