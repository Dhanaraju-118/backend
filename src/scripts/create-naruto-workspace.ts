import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { DatabaseManager } from '../config/database';
import { v4 as uuidv4 } from 'uuid';
import { AzureSearchService } from '../services/azureSearchService';

async function createNarutoWorkspace() {
  try {
    console.log('Creating Naruto workspace...');
    
    // Get database manager instance
    const dbManager = DatabaseManager.getInstance();
    const pool = await dbManager.getPool();
    
    // Check if Naruto workspace already exists
    const existingWorkspace = await pool.request()
      .input('name', 'Naruto')
      .query('SELECT id FROM Workspaces WHERE name = @name');
    
    if (existingWorkspace.recordset.length > 0) {
      console.log('Naruto workspace already exists with ID:', existingWorkspace.recordset[0].id);
      return existingWorkspace.recordset[0].id;
    }
    
    // Create a new Naruto workspace
    const workspaceId = `naruto-${uuidv4()}`;
    const ownerId = 'admin-user-id'; // This would normally be a real user ID
    
    // For demo purposes, we'll use a placeholder owner ID
    // In a real application, you'd get this from the authenticated user
    await pool.request()
      .input('id', workspaceId)
      .input('name', 'Naruto')
      .input('description', 'Naruto workspace for document analysis')
      .input('ownerId', ownerId)
      .query(`
        INSERT INTO Workspaces (id, name, description, ownerId) 
        VALUES (@id, @name, @description, @ownerId)
      `);
    
    console.log('✅ Created Naruto workspace with ID:', workspaceId);
    
    // Create workspace user assignment
    const workspaceUserId = uuidv4();
    await pool.request()
      .input('id', workspaceUserId)
      .input('workspaceId', workspaceId)
      .input('userId', ownerId)
      .input('accessLevel', 'owner')
      .input('assignedBy', ownerId)
      .query(`
        INSERT INTO WorkspaceUsers (id, workspaceId, userId, accessLevel, assignedBy) 
        VALUES (@id, @workspaceId, @userId, @accessLevel, @assignedBy)
      `);
    
    console.log('✅ Assigned workspace to user');
    
    // Initialize Azure Search index for this workspace
    console.log('Setting up Azure Search index for Naruto workspace...');
    const searchService = AzureSearchService.getInstance();
    
    // Create the search index for this workspace
    const indexCreated = await searchService.createWorkspaceIndex(workspaceId);
    if (indexCreated) {
      console.log('✅ Azure Search index created for Naruto workspace');
    } else {
      console.log('❌ Failed to create Azure Search index');
    }
    
    return workspaceId;
  } catch (error) {
    console.error('❌ Failed to create Naruto workspace:', error);
    throw error;
  }
}

createNarutoWorkspace()
  .then(workspaceId => {
    console.log('Naruto workspace setup completed with ID:', workspaceId);
  })
  .catch(error => {
    console.error('Failed to setup Naruto workspace:', error);
  });