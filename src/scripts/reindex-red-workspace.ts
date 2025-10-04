import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { DatabaseManager } from '../config/database';
import { FileAnalysisService } from '../services/fileAnalysisService';
import { AzureSearchService } from '../services/azureSearchService';
import { StorageService } from '../services/storage';
import sql from 'mssql';

async function reindexRedWorkspace() {
  try {
    console.log('Re-indexing red workspace documents...');
    
    // Initialize services
    const dbManager = DatabaseManager.getInstance();
    const fileAnalysisService = FileAnalysisService.getInstance();
    const azureSearchService = AzureSearchService.getInstance();
    const storageService = StorageService.getInstance();
    await storageService.initialize();
    
    const pool = await dbManager.getPool();
    
    // Get all files from the red workspace (workspaceId: 8f04af2e-472f-4a7f-97fc-9b1915b008fc)
    const workspaceId = '8f04af2e-472f-4a7f-97fc-9b1915b008fc';
    const workspaceName = 'red';
    
    const fileResult = await pool.request()
      .input('workspaceId', workspaceId)
      .query('SELECT * FROM WorkspaceFiles WHERE workspaceId = @workspaceId');
    
    console.log(`Found ${fileResult.recordset.length} files in the red workspace`);
    
    // Get workspace folder name and index name
    const indexName = 'red-8f04af2index';
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'blob';
    
    console.log(`Using index: ${indexName}`);
    console.log(`Using container: ${containerName}`);
    
    // Process each file
    for (const file of fileResult.recordset) {
      try {
        console.log(`\nProcessing file: ${file.originalName}`);
        
        // Construct the correct blob path
        const folderPath = `workspace/red-8f04af2/`;
        const fullBlobName = `${folderPath}${file.fileName}`;
        
        console.log(`  Blob path: ${fullBlobName}`);
        
        // Extract content from the file
        console.log('  Extracting file content...');
        const fileContentResult = await fileAnalysisService.extractFileContent(
          fullBlobName, 
          file.originalName,
          containerName
        );
        
        // Check if content extraction was successful
        if (fileContentResult.content.startsWith('[Content not available')) {
          console.log(`  ❌ Failed to extract content: ${fileContentResult.content}`);
          continue;
        }
        
        console.log(`  ✅ Content extracted (${fileContentResult.content.length} characters)`);
        
        // Analyze the content to get summary and key points
        let summary = '';
        let keyPoints: string[] = [];
        
        try {
          console.log('  Analyzing content...');
          const analysisResult = await fileAnalysisService.analyzeFile(
            fullBlobName, 
            file.mimeType,
            containerName
          );
          summary = analysisResult.summary || '';
          keyPoints = analysisResult.keyPoints || [];
          console.log('  ✅ Content analysis completed');
        } catch (analysisError: any) {
          console.log('  ⚠️  Content analysis failed, using raw content for summary');
          // Use first 500 characters as summary if analysis fails
          summary = fileContentResult.content.substring(0, 500) + (fileContentResult.content.length > 500 ? '...' : '');
          keyPoints = [];
        }
        
        // Create document for indexing with enhanced fields
        const documentToIndex = {
          id: file.id,
          content: fileContentResult.content,
          fileName: file.originalName,
          fileType: file.mimeType,
          workspaceId: workspaceId,
          workspaceName: workspaceName,
          uploadedBy: file.userId,
          uploadedAt: file.createdAt.toISOString(),
          summary: summary,
          keyPoints: keyPoints
        };
        
        // Index the document
        console.log('  Indexing document...');
        const indexResult = await azureSearchService.indexDocument(indexName, documentToIndex);
        if (indexResult) {
          console.log(`  ✅ Successfully indexed document ${file.id}`);
        } else {
          console.log(`  ❌ Failed to index document ${file.id}`);
        }
      } catch (error: any) {
        console.log(`  ❌ Error processing file ${file.originalName}: ${error.message}`);
      }
    }
    
    console.log('\n🎉 Re-indexing completed!');
    
    // Test a search to verify the fix
    console.log('\nTesting search...');
    const searchResults = await azureSearchService.searchDocuments(indexName, 'privacy policy');
    console.log(`Found ${searchResults.length} results for "privacy policy" search`);
    
    if (searchResults.length > 0) {
      console.log('\nSample search result:');
      const result = searchResults[0];
      console.log(`  File: ${result.fileName}`);
      console.log(`  Summary: ${result.summary.substring(0, 100)}...`);
      console.log(`  Content preview: ${result.content.substring(0, 100)}...`);
    }
    
  } catch (error) {
    console.error('Re-indexing failed:', error);
  }
}

// Run the re-indexing
reindexRedWorkspace();