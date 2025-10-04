import dotenv from 'dotenv';
import path from 'path';
import { DatabaseManager } from '../config/database';
import sql from 'mssql';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env') });

async function verifyAdminUser() {
  try {
    console.log('Connecting to database...');
    const dbManager = DatabaseManager.getInstance();
    const pool = await dbManager.getPool();
    
    console.log('Checking if admin user exists...');
    const result = await pool.request()
      .input('email', sql.NVarChar, 'sudhenreddym@gmail.com')
      .query('SELECT id, email, role, firstName, lastName, isActive FROM Users WHERE email = @email');
    
    if (result.recordset.length > 0) {
      const user = result.recordset[0];
      console.log('✅ Admin user found:');
      console.log('  ID:', user.id);
      console.log('  Email:', user.email);
      console.log('  Role:', user.role);
      console.log('  Name:', user.firstName, user.lastName);
      console.log('  Active:', user.isActive ? 'Yes' : 'No');
      
      if (user.role !== 'admin') {
        console.log('⚠️  User exists but does not have admin role. Updating role to admin...');
        await pool.request()
          .input('email', sql.NVarChar, 'sudhenreddym@gmail.com')
          .input('role', sql.NVarChar, 'admin')
          .query('UPDATE Users SET role = @role WHERE email = @email');
        console.log('✅ User role updated to admin');
      } else {
        console.log('✅ User already has admin role');
      }
    } else {
      console.log('❌ Admin user not found in database');
      console.log('Creating admin user...');
      
      // Create the admin user
      const newUser = await pool.request()
        .input('firstName', sql.NVarChar, 'Sudhe')
        .input('lastName', sql.NVarChar, 'Reddy')
        .input('email', sql.NVarChar, 'sudhenreddym@gmail.com')
        .input('password', sql.NVarChar, 'Admin@123') // You should hash this in production
        .input('provider', sql.NVarChar, 'local')
        .input('role', sql.NVarChar, 'admin')
        .input('isActive', sql.Bit, 1)
        .query(`
          INSERT INTO Users (firstName, lastName, email, password, provider, role, isActive, createdAt, updatedAt)
          OUTPUT INSERTED.id, INSERTED.email, INSERTED.role
          VALUES (@firstName, @lastName, @email, @password, @provider, @role, @isActive, GETUTCDATE(), GETUTCDATE())
        `);
      
      console.log('✅ Admin user created successfully:');
      console.log('  ID:', newUser.recordset[0].id);
      console.log('  Email:', newUser.recordset[0].email);
      console.log('  Role:', newUser.recordset[0].role);
    }
    
    // Also check the ADMIN_EMAILS environment variable
    const adminEmails = process.env.ADMIN_EMAILS || '';
    console.log('\n📝 ADMIN_EMAILS environment variable:', adminEmails);
    
    await dbManager.disconnect();
  } catch (error) {
    console.error('❌ Error:', error);
  }
}

verifyAdminUser();