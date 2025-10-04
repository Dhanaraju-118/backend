import dotenv from 'dotenv';
import path from 'path';
import { DatabaseManager } from '../config/database';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import sql from 'mssql';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function createSpecificAdminUser() {
  try {
    console.log('Creating specific admin user...');
    
    // Get database manager instance
    const dbManager = DatabaseManager.getInstance();
    
    // Connect to database
    const pool = await dbManager.getPool();
    console.log('✅ Database connected successfully');
    
    // Specific admin user data
    const adminUser = {
      email: 'sudhenreddym@gmail.com',
      password: 'password123',
      firstName: 'Sudhen',
      lastName: 'Reddy',
      role: 'admin'
    };
    
    // Check if user already exists
    const existingUser = await pool.request()
      .input('email', sql.NVarChar, adminUser.email)
      .query('SELECT * FROM Users WHERE email = @email');
    
    if (existingUser.recordset.length > 0) {
      console.log(`ℹ️  User already exists: ${adminUser.email}`);
      console.log('User details:', existingUser.recordset[0]);
      
      // Update role to admin if not already
      if (existingUser.recordset[0].role !== 'admin') {
        await pool.request()
          .input('email', sql.NVarChar, adminUser.email)
          .input('role', sql.NVarChar, 'admin')
          .query('UPDATE Users SET role = @role WHERE email = @email');
        console.log(`✅ Updated user ${adminUser.email} to admin role`);
      }
    } else {
      // Create new admin user
      const hashedPassword = await bcrypt.hash(adminUser.password, 12);
      const userId = uuidv4();
      
      await pool.request()
        .input('id', sql.NVarChar, userId)
        .input('firstName', sql.NVarChar, adminUser.firstName)
        .input('lastName', sql.NVarChar, adminUser.lastName)
        .input('email', sql.NVarChar, adminUser.email)
        .input('password', sql.NVarChar, hashedPassword)
        .input('provider', sql.NVarChar, 'local')
        .input('role', sql.NVarChar, adminUser.role)
        .query(`
          INSERT INTO Users (id, firstName, lastName, email, password, provider, role, isActive)
          VALUES (@id, @firstName, @lastName, @email, @password, @provider, @role, 1)
        `);
      
      console.log(`✅ Created admin user: ${adminUser.email}`);
    }
    
    // List all admin users
    console.log('\n📋 Admin users in database:');
    const adminUsers = await pool.request().query("SELECT id, firstName, lastName, email, provider, role, isActive, createdAt FROM Users WHERE role = 'admin'");
    console.table(adminUsers.recordset);
    
    console.log('\n✅ Specific admin user creation completed successfully');
    
  } catch (error) {
    console.error('❌ Admin user creation failed:', error);
    process.exit(1);
  }
}

// Run the script
createSpecificAdminUser();