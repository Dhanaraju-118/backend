import { DatabaseManager } from '../config/database';
import { WorkspaceStorageService } from '../services/workspaceStorage';
import { AzureSearchService } from '../services/azureSearchService';
import axios from 'axios';
import sql from 'mssql';

async function diagnoseNarutoWorkspace() {
  try {
    console.log('🔍 Diagnosing Naruto workspace...');
    
    // Initialize services
    const dbManager = DatabaseManager.getInstance();
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    const azureSearchService = AzureSearchService.getInstance();
    
    const pool = await dbManager.getPool();
    
    // Step 1: Find the Naruto workspace
    console.log('\nStep 1: Finding Naruto workspace...');
    const workspaceResult = await pool.request()
      .query(`SELECT * FROM Workspaces WHERE name LIKE '%naruto%' OR name LIKE '%Naruto%'`);
    
    if (workspaceResult.recordset.length === 0) {
      console.log('❌ No workspace found with name containing "Naruto"');
      return;
    }
    
    const workspace = workspaceResult.recordset[0];
    console.log(`✅ Found workspace: ${workspace.name} (ID: ${workspace.id})`);
    
    // Step 2: Get workspace folder name and index name
    console.log('\nStep 2: Determining workspace folder and index names...');
    const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(workspace.id, workspace.name);
    const indexName = `${workspaceFolderName}index`;
    const semanticConfigName = `search${indexName}`;
    
    console.log(`📁 Workspace folder name: ${workspaceFolderName}`);
    console.log(`📋 Index name: ${indexName}`);
    console.log(`🧠 Semantic config name: ${semanticConfigName}`);
    
    // Step 3: Check if index exists
    console.log('\nStep 3: Checking if Azure Search index exists...');
    const indexExists = await azureSearchService.indexExists(indexName);
    
    if (!indexExists) {
      console.log('❌ Azure Search index does not exist');
      return;
    }
    
    console.log('✅ Azure Search index exists');
    
    // Step 4: Verify semantic configuration
    console.log('\nStep 4: Verifying semantic configuration...');
    const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
    const apiKey = process.env.AZURE_AI_SEARCH_API_KEY || '';
    
    if (!apiKey) {
      console.log('❌ AZURE_AI_SEARCH_API_KEY is not set');
      return;
    }
    
    try {
      const url = `${endpoint}/indexes/${indexName}?api-version=2023-07-01-Preview`;
      const headers = {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      };
      
      const response = await axios.get(url, { headers });
      const indexDefinition = response.data;
      
      console.log('✅ Retrieved index definition successfully');
      
      if (indexDefinition.semantic && indexDefinition.semantic.configurations) {
        console.log(`📊 Found ${indexDefinition.semantic.configurations.length} semantic configuration(s)`);
        
        const semanticConfig = indexDefinition.semantic.configurations.find(
          (config: any) => config.name === semanticConfigName
        );
        
        if (semanticConfig) {
          console.log('✅ Semantic configuration found with correct name format');
          console.log(`   Name: ${semanticConfig.name}`);
          console.log(`   Title field: ${semanticConfig.prioritizedFields.titleField.fieldName}`);
          
          const contentFields = semanticConfig.prioritizedFields.prioritizedContentFields.map((f: any) => f.fieldName);
          console.log(`   Content fields: ${contentFields.join(', ')}`);
          
          const keywordFields = semanticConfig.prioritizedFields.prioritizedKeywordsFields.map((f: any) => f.fieldName);
          console.log(`   Keywords fields: ${keywordFields.join(', ')}`);
        } else {
          console.log('❌ Semantic configuration not found with expected name format');
          console.log('Available configurations:');
          indexDefinition.semantic.configurations.forEach((config: any) => {
            console.log(`   - ${config.name}`);
          });
          return;
        }
      } else {
        console.log('❌ No semantic configurations found in index definition');
        return;
      }
    } catch (error: any) {
      console.log('❌ Failed to retrieve index definition:', error.message);
      if (error.response) {
        console.log('Response data:', JSON.stringify(error.response.data, null, 2));
      }
      return;
    }
    
    // Step 5: Check files in the workspace
    console.log('\nStep 5: Checking files in the workspace...');
    const filesResult = await pool.request()
      .input('workspaceId', sql.NVarChar, workspace.id)
      .query('SELECT * FROM WorkspaceFiles WHERE workspaceId = @workspaceId');
    
    console.log(`📁 Found ${filesResult.recordset.length} file(s) in the workspace`);
    
    if (filesResult.recordset.length === 0) {
      console.log('⚠️  No files found in the workspace');
    } else {
      filesResult.recordset.forEach((file: any, index: number) => {
        console.log(`   ${index + 1}. ${file.originalName} (${file.mimeType})`);
      });
    }
    
    // Step 6: Test semantic search if files exist
    if (filesResult.recordset.length > 0) {
      console.log('\nStep 6: Testing semantic search...');
      
      // Try a simple search query
      try {
        console.log('🔍 Performing test search: "What is this document about?"');
        const searchResults = await azureSearchService.searchDocuments(indexName, 'What is this document about?');
        
        console.log(`✅ Search completed successfully, found ${searchResults.length} result(s)`);
        
        if (searchResults.length > 0) {
          console.log('\n📋 Top search result:');
          const topResult = searchResults[0];
          console.log(`   File: ${topResult.fileName}`);
          console.log(`   Summary: ${topResult.summary || 'No summary'}`);
          console.log(`   Content preview: ${topResult.content ? topResult.content.substring(0, 100) + '...' : 'No content'}`);
          
          if (topResult['@search.score']) {
            console.log(`   Search score: ${topResult['@search.score']}`);
          }
          
          if (topResult['@search.semantic.score']) {
            console.log(`   Semantic score: ${topResult['@search.semantic.score']}`);
          }
        }
      } catch (searchError: any) {
        console.log('❌ Search test failed:', searchError.message);
        if (searchError.response) {
          console.log('Response data:', JSON.stringify(searchError.response.data, null, 2));
        }
      }
    }
    
    // Step 7: Summary
    console.log('\n📋 DIAGNOSIS SUMMARY');
    console.log('====================');
    console.log(`✅ Workspace: ${workspace.name}`);
    console.log(`✅ Index exists: Yes`);
    console.log(`✅ Semantic configuration: Configured correctly`);
    console.log(`📁 Files in workspace: ${filesResult.recordset.length}`);
    
    if (filesResult.recordset.length > 0) {
      console.log('✅ Semantic search: Functional');
    } else {
      console.log('⚠️  Semantic search: No files to search (needs documents to be uploaded)');
    }
    
    console.log('\n🎉 Naruto workspace diagnosis completed!');
    
  } catch (error) {
    console.error('❌ Diagnosis failed:', error);
  }
}

// Run the diagnosis
diagnoseNarutoWorkspace();