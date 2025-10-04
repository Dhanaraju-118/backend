import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

console.log('Azure Storage Configuration:');
console.log('AZURE_STORAGE_ACCOUNT_NAME:', process.env.AZURE_STORAGE_ACCOUNT_NAME || 'NOT SET');
console.log('AZURE_STORAGE_CONTAINER_NAME:', process.env.AZURE_STORAGE_CONTAINER_NAME || 'NOT SET (defaulting to aiva-files)');
console.log('AZURE_STORAGE_CONNECTION_STRING:', process.env.AZURE_STORAGE_CONNECTION_STRING ? 'SET' : 'NOT SET');
console.log('MOCK_STORAGE:', process.env.MOCK_STORAGE || 'NOT SET (defaulting to false)');

// Check what's in the database for the files
import { DatabaseManager } from '../config/database';
import sql from 'mssql';

async function checkDatabaseFiles() {
  try {
    console.log('\nChecking database for file information...');
    
    const dbManager = DatabaseManager.getInstance();
    const pool = await dbManager.getPool();
    
    // Get files from the red workspace
    const fileResult = await pool.request()
      .input('workspaceId', '8f04af2e-472f-4a7f-97fc-9b1915b008fc')
      .query('SELECT * FROM WorkspaceFiles WHERE workspaceId = @workspaceId');
    
    console.log(`Found ${fileResult.recordset.length} files in the red workspace:`);
    fileResult.recordset.forEach((file: any) => {
      console.log(`  - ${file.originalName}`);
      console.log(`    ID: ${file.id}`);
      console.log(`    File Name: ${file.fileName}`);
      console.log(`    URL: ${file.url}`);
      console.log(`    Size: ${file.size} bytes`);
    });
    
  } catch (error) {
    console.error('Database check failed:', error);
  }
}

checkDatabaseFiles();