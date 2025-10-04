import { DatabaseManager } from '../config/database';
import sql from 'mssql';
import { v4 as uuidv4 } from 'uuid';

async function createDefaultWorkspace() {
  try {
    console.log('Creating default workspace...');
    
    // Get database manager instance
    const dbManager = DatabaseManager.getInstance();
    
    // Connect to database
    const pool = await dbManager.getPool();
    console.log('✅ Connected to database successfully');
    
    // Check if any workspaces exist
    const workspaceCheck = await pool.request().query('SELECT COUNT(*) as count FROM Workspaces');
    const workspaceCount = workspaceCheck.recordset[0].count;
    
    console.log(`Found ${workspaceCount} workspaces in database`);
    
    if (workspaceCount === 0) {
      // Get the first user as the owner
      const userResult = await pool.request().query('SELECT TOP 1 id FROM Users ORDER BY createdAt');
      
      if (userResult.recordset.length > 0) {
        const userId = userResult.recordset[0].id;
        console.log(`Using user ${userId} as workspace owner`);
        
        // Create default workspace
        const workspaceId = uuidv4();
        const defaultWorkspace = {
          id: workspaceId,
          name: 'Personal Projects',
          description: 'Default workspace for personal projects',
          ownerId: userId,
          color: '#3B82F6'
        };
        
        await pool.request()
          .input('id', sql.NVarChar, defaultWorkspace.id)
          .input('name', sql.NVarChar, defaultWorkspace.name)
          .input('description', sql.NVarChar, defaultWorkspace.description)
          .input('ownerId', sql.NVarChar, defaultWorkspace.ownerId)
          .input('color', sql.NVarChar, defaultWorkspace.color)
          .query(`
            INSERT INTO Workspaces (id, name, description, ownerId, color)
            VALUES (@id, @name, @description, @ownerId, @color)
          `);
        
        console.log('✅ Default workspace created successfully');
        console.log('Workspace ID:', workspaceId);
      } else {
        console.log('❌ No users found in database. Please create a user first.');
      }
    } else {
      console.log('ℹ️  Workspaces already exist. Skipping default workspace creation.');
    }
    
  } catch (error) {
    console.error('❌ Failed to create default workspace:', error);
  }
}

createDefaultWorkspace();