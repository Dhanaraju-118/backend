import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { DatabaseManager } from '../config/database';

async function checkNarutoWorkspace() {
  try {
    console.log('Checking for Naruto workspace...');
    
    // Get database manager instance
    const dbManager = DatabaseManager.getInstance();
    const pool = await dbManager.getPool();
    
    // Check if Naruto workspace exists
    const existingWorkspace = await pool.request()
      .input('name', 'Naruto')
      .query('SELECT id, name, description, ownerId FROM Workspaces WHERE name = @name');
    
    if (existingWorkspace.recordset.length > 0) {
      console.log('✅ Naruto workspace found:');
      console.log('  ID:', existingWorkspace.recordset[0].id);
      console.log('  Name:', existingWorkspace.recordset[0].name);
      console.log('  Description:', existingWorkspace.recordset[0].description);
      console.log('  Owner ID:', existingWorkspace.recordset[0].ownerId);
      return existingWorkspace.recordset[0].id;
    } else {
      console.log('❌ Naruto workspace not found');
      return null;
    }
  } catch (error) {
    console.error('❌ Failed to check Naruto workspace:', error);
    throw error;
  }
}

checkNarutoWorkspace()
  .then(workspaceId => {
    if (workspaceId) {
      console.log('Naruto workspace ID:', workspaceId);
    } else {
      console.log('Naruto workspace does not exist');
    }
  })
  .catch(error => {
    console.error('Failed to check Naruto workspace:', error);
  });