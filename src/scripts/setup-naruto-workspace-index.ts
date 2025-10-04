// Explicitly load environment variables
import dotenv from 'dotenv';
dotenv.config();

import { DatabaseManager } from '../config/database';
import { WorkspaceStorageService } from '../services/workspaceStorage';
import { AzureSearchService } from '../services/azureSearchService';
import sql from 'mssql';
import axios from 'axios';

// Function to set up the Naruto workspace index
async function setupNarutoWorkspaceIndex() {
  try {
    console.log('🔧 Setting up Naruto workspace index...');
    
    // Check if environment variables are loaded
    console.log(`\nEnvironment check:`);
    console.log(`  AZURE_AI_SEARCH_ENDPOINT: ${process.env.AZURE_AI_SEARCH_ENDPOINT || 'NOT SET'}`);
    console.log(`  AZURE_AI_SEARCH_API_KEY length: ${process.env.AZURE_AI_SEARCH_API_KEY ? process.env.AZURE_AI_SEARCH_API_KEY.length : 'NOT SET'}`);
    console.log(`  SQL_SERVER: ${process.env.SQL_SERVER || 'NOT SET'}`);
    
    if (!process.env.AZURE_AI_SEARCH_API_KEY) {
      console.log('❌ AZURE_AI_SEARCH_API_KEY is not set in environment');
      return;
    }
    
    // Initialize services
    console.log('\nInitializing services...');
    const dbManager = DatabaseManager.getInstance();
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    const azureSearchService = AzureSearchService.getInstance();
    
    // Try to connect to the database
    console.log('\nConnecting to database...');
    const pool = await dbManager.getPool();
    console.log('✅ Database connection established');
    
    // Find the Naruto workspace
    console.log('\nSearching for Naruto workspace...');
    const workspaceResult = await pool.request()
      .query(`SELECT * FROM Workspaces WHERE name LIKE '%naruto%' OR name LIKE '%Naruto%'`);
    
    if (workspaceResult.recordset.length === 0) {
      console.log('❌ No workspace found with name containing "Naruto"');
      
      // List all workspaces for reference
      console.log('\nAvailable workspaces:');
      const allWorkspaces = await pool.request().query('SELECT id, name FROM Workspaces');
      allWorkspaces.recordset.forEach((ws: any) => {
        console.log(`  - ${ws.name} (${ws.id})`);
      });
      
      return;
    }
    
    const workspace = workspaceResult.recordset[0];
    console.log(`✅ Found Naruto workspace: ${workspace.name} (ID: ${workspace.id})`);
    
    // Get workspace folder name and index name
    console.log('\nDetermining workspace folder and index names...');
    const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(workspace.id, workspace.name);
    const indexName = `${workspaceFolderName}index`;
    const semanticConfigName = `search${indexName}`;
    
    console.log(`📁 Workspace folder name: ${workspaceFolderName}`);
    console.log(`📋 Index name: ${indexName}`);
    console.log(`🧠 Semantic config name: ${semanticConfigName}`);
    
    // Create the Azure Search index with semantic configuration
    console.log('\n🏗️  Creating Azure Search index with semantic configuration...');
    const indexCreated = await azureSearchService.createWorkspaceIndex(indexName);
    
    if (indexCreated) {
      console.log('✅ Azure Search index created successfully with semantic configuration!');
      
      // Verify the semantic configuration
      console.log('\n🔍 Verifying semantic configuration...');
      const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
      const headers = {
        'api-key': process.env.AZURE_AI_SEARCH_API_KEY,
        'Content-Type': 'application/json'
      };
      
      try {
        const url = `${endpoint}/indexes/${indexName}?api-version=2023-07-01-Preview`;
        const response = await axios.get(url, { headers });
        const indexDefinition = response.data;
        
        if (indexDefinition.semantic && indexDefinition.semantic.configurations) {
          const semanticConfig = indexDefinition.semantic.configurations.find(
            (config: any) => config.name === semanticConfigName
          );
          
          if (semanticConfig) {
            console.log('✅ Semantic configuration verified!');
            console.log(`   Name: ${semanticConfig.name}`);
            console.log(`   Title field: ${semanticConfig.prioritizedFields.titleField.fieldName}`);
            
            const contentFields = semanticConfig.prioritizedFields.prioritizedContentFields.map((f: any) => f.fieldName);
            console.log(`   Content fields: ${contentFields.join(', ')}`);
            
            const keywordFields = semanticConfig.prioritizedFields.prioritizedKeywordsFields.map((f: any) => f.fieldName);
            console.log(`   Keywords fields: ${keywordFields.join(', ')}`);
          } else {
            console.log('❌ Semantic configuration not found in verification');
          }
        } else {
          console.log('❌ No semantic configurations found in verified index');
        }
      } catch (verifyError: any) {
        console.log(`❌ Failed to verify semantic configuration: ${verifyError.message}`);
      }
      
      // Check if there are files in this workspace that need to be indexed
      console.log('\n📂 Checking for files in workspace...');
      const filesResult = await pool.request()
        .input('workspaceId', sql.NVarChar, workspace.id)
        .query('SELECT * FROM WorkspaceFiles WHERE workspaceId = @workspaceId');
      
      console.log(`📁 Found ${filesResult.recordset.length} file(s) in the workspace`);
      
      if (filesResult.recordset.length > 0) {
        console.log('\n⚠️  Note: This script only creates the index structure.');
        console.log('   To index the existing files, you would need to re-upload them or');
        console.log('   create a separate script to extract their content and index them.');
      }
      
    } else {
      console.log('❌ Failed to create Azure Search index');
    }
    
    console.log('\n📋 SETUP SUMMARY');
    console.log('===============');
    console.log(`✅ Workspace: ${workspace.name} (${workspace.id})`);
    console.log(`✅ Index name: ${indexName}`);
    console.log(`✅ Semantic config name: ${semanticConfigName}`);
    console.log(`✅ Index creation: ${indexCreated ? 'Success' : 'Failed'}`);
    
  } catch (error: any) {
    console.error('❌ Setup failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
  }
}

// Run the setup
setupNarutoWorkspaceIndex();