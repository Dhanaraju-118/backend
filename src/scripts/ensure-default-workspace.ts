import { DatabaseManager } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import * as sql from 'mssql';

async function ensureDefaultWorkspace() {
  try {
    const dbManager = DatabaseManager.getInstance();
    const pool = await dbManager.getPool();
    
    // Check if any workspaces exist
    const workspaceCheck = await pool.request()
      .query('SELECT COUNT(*) as count FROM Workspaces');
    
    const workspaceCount = workspaceCheck.recordset[0].count;
    
    if (workspaceCount === 0) {
      // Create a default workspace
      const defaultWorkspaceId = uuidv4();
      
      // First, get a user to assign as owner (use the first user found)
      const userResult = await pool.request()
        .query('SELECT TOP 1 id FROM Users ORDER BY createdAt ASC');
      
      if (userResult.recordset.length > 0) {
        const ownerId = userResult.recordset[0].id;
        
        await pool.request()
          .input('id', sql.NVarChar, defaultWorkspaceId)
          .input('name', sql.NVarChar, 'Personal Projects')
          .input('description', sql.NVarChar, 'Default workspace for personal projects')
          .input('ownerId', sql.NVarChar, ownerId)
          .input('color', sql.NVarChar, '#3B82F6')
          .query(`
            INSERT INTO Workspaces (id, name, description, ownerId, color)
            VALUES (@id, @name, @description, @ownerId, @color)
          `);
        
        console.log('✅ Default workspace created successfully');
        console.log(`Workspace ID: ${defaultWorkspaceId}`);
        console.log(`Owner ID: ${ownerId}`);
      } else {
        console.log('⚠️ No users found in database. Cannot create default workspace.');
      }
    } else {
      console.log('✅ Workspaces already exist in database');
    }
  } catch (error) {
    console.error('❌ Error ensuring default workspace:', error);
  }
}

// Run the function
ensureDefaultWorkspace().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});