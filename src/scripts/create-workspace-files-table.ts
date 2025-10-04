import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { DatabaseManager } from '../config/database';
import sql from 'mssql';

async function createWorkspaceFilesTable() {
  try {
    console.log('Creating WorkspaceFiles table...');
    
    // Get database manager instance
    const dbManager = DatabaseManager.getInstance();
    
    // Connect to database
    const pool = await dbManager.getPool();
    console.log('✅ Connected to database successfully');
    
    // Create WorkspaceFiles table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WorkspaceFiles' AND xtype='U')
      CREATE TABLE WorkspaceFiles (
        id NVARCHAR(255) PRIMARY KEY,
        originalName NVARCHAR(500) NOT NULL,
        fileName NVARCHAR(500) NOT NULL,
        mimeType NVARCHAR(200) NOT NULL,
        size BIGINT NOT NULL,
        url NVARCHAR(1000) NOT NULL,
        userId NVARCHAR(255) NOT NULL,
        workspaceId NVARCHAR(255) NOT NULL,
        createdAt DATETIME2 DEFAULT GETUTCDATE(),
        FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
        FOREIGN KEY (workspaceId) REFERENCES Workspaces(id) ON DELETE NO ACTION
      )
    `);
    
    console.log('✅ WorkspaceFiles table created successfully');
    
    // Create indexes
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_WorkspaceFiles_WorkspaceId')
      CREATE INDEX IX_WorkspaceFiles_WorkspaceId ON WorkspaceFiles(workspaceId)
    `);
    
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_WorkspaceFiles_UserId')
      CREATE INDEX IX_WorkspaceFiles_UserId ON WorkspaceFiles(userId)
    `);
    
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_WorkspaceFiles_CreatedAt')
      CREATE INDEX IX_WorkspaceFiles_CreatedAt ON WorkspaceFiles(createdAt DESC)
    `);
    
    console.log('✅ Indexes created successfully');
    
  } catch (error) {
    console.error('❌ Failed to create WorkspaceFiles table:', error);
  }
}

createWorkspaceFilesTable().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});