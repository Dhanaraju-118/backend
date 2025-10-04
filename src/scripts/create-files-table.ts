import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { DatabaseManager } from '../config/database';
import sql from 'mssql';

async function createFilesTable() {
  try {
    console.log('Creating Files table...');
    
    // Get database manager instance
    const dbManager = DatabaseManager.getInstance();
    
    // Connect to database
    const pool = await dbManager.getPool();
    console.log('✅ Connected to database successfully');
    
    // Create Files table
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Files' AND xtype='U')
      CREATE TABLE Files (
        id NVARCHAR(255) PRIMARY KEY,
        originalName NVARCHAR(500) NOT NULL,
        fileName NVARCHAR(500) NOT NULL,
        mimeType NVARCHAR(200) NOT NULL,
        size BIGINT NOT NULL,
        url NVARCHAR(1000) NOT NULL,
        userId NVARCHAR(255) NOT NULL,
        chatId NVARCHAR(255),
        messageId NVARCHAR(255),
        createdAt DATETIME2 DEFAULT GETUTCDATE(),
        FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
        FOREIGN KEY (chatId) REFERENCES Chats(id) ON DELETE SET NULL,
        FOREIGN KEY (messageId) REFERENCES Messages(id) ON DELETE SET NULL
      )
    `);
    
    console.log('✅ Files table created successfully');
    
    // Create indexes
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Files_UserId')
      CREATE INDEX IX_Files_UserId ON Files(userId)
    `);
    
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Files_ChatId')
      CREATE INDEX IX_Files_ChatId ON Files(chatId)
    `);
    
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_Files_CreatedAt')
      CREATE INDEX IX_Files_CreatedAt ON Files(createdAt DESC)
    `);
    
    console.log('✅ Indexes created successfully');
    
  } catch (error) {
    console.error('❌ Failed to create Files table:', error);
  }
}

createFilesTable().then(() => {
  console.log('Script completed');
  process.exit(0);
}).catch((error) => {
  console.error('Script failed:', error);
  process.exit(1);
});