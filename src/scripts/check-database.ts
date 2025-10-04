import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { DatabaseManager } from '../config/database';
import sql from 'mssql';

async function checkDatabase() {
  try {
    console.log('Checking database contents...');
    
    // Get database manager instance
    const dbManager = DatabaseManager.getInstance();
    
    // Connect to database
    const pool = await dbManager.getPool();
    console.log('✅ Connected to database successfully');
    
    // Check users
    const userResult = await pool.request().query('SELECT COUNT(*) as count FROM Users');
    const userCount = userResult.recordset[0].count;
    console.log(`Users: ${userCount}`);
    
    if (userCount > 0) {
      const users = await pool.request().query('SELECT id, email, firstName, lastName FROM Users');
      console.log('User details:');
      users.recordset.forEach(user => {
        console.log(`  - ${user.firstName} ${user.lastName} (${user.email}) - ID: ${user.id}`);
      });
    }
    
    // Check workspaces
    const workspaceResult = await pool.request().query('SELECT COUNT(*) as count FROM Workspaces');
    const workspaceCount = workspaceResult.recordset[0].count;
    console.log(`Workspaces: ${workspaceCount}`);
    
    if (workspaceCount > 0) {
      const workspaces = await pool.request().query('SELECT id, name, ownerId FROM Workspaces');
      console.log('Workspace details:');
      workspaces.recordset.forEach(workspace => {
        console.log(`  - ${workspace.name} - ID: ${workspace.id}, Owner: ${workspace.ownerId}`);
      });
    }
    
    // Check workspace users
    const workspaceUserResult = await pool.request().query('SELECT COUNT(*) as count FROM WorkspaceUsers');
    const workspaceUserCount = workspaceUserResult.recordset[0].count;
    console.log(`Workspace Users: ${workspaceUserCount}`);
    
    if (workspaceUserCount > 0) {
      const workspaceUsers = await pool.request().query('SELECT id, workspaceId, userId, accessLevel FROM WorkspaceUsers');
      console.log('Workspace User details:');
      workspaceUsers.recordset.forEach(wu => {
        console.log(`  - Workspace: ${wu.workspaceId}, User: ${wu.userId}, Access: ${wu.accessLevel}`);
      });
    }
    
    // Check chats
    const chatResult = await pool.request().query('SELECT COUNT(*) as count FROM Chats');
    const chatCount = chatResult.recordset[0].count;
    console.log(`Chats: ${chatCount}`);
    
    // Check messages
    const messageResult = await pool.request().query('SELECT COUNT(*) as count FROM Messages');
    const messageCount = messageResult.recordset[0].count;
    console.log(`Messages: ${messageCount}`);
    
    // Check message actions
    const actionResult = await pool.request().query('SELECT COUNT(*) as count FROM MessageActions');
    const actionCount = actionResult.recordset[0].count;
    console.log(`Message Actions: ${actionCount}`);
    
  } catch (error) {
    console.error('❌ Database check failed:', error);
  }
}

checkDatabase();