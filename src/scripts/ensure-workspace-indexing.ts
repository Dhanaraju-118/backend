import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { DatabaseManager } from '../config/database';
import { FileAnalysisService } from '../services/fileAnalysisService';
import { AzureSearchService } from '../services/azureSearchService';
import { WorkspaceStorageService } from '../services/workspaceStorage';
import sql from 'mssql';

/**
 * Ensures all files in a workspace are properly indexed in Azure Search
 * This script can be triggered when the upload dialog is closed
 * @param workspaceId - The ID of the workspace to index
 */
export async function ensureWorkspaceIndexing(workspaceId: string): Promise<boolean> {
  try {
    console.log(`Ensuring workspace indexing for workspace: ${workspaceId}`);
    
    // Initialize services
    const dbManager = DatabaseManager.getInstance();
    const fileAnalysisService = FileAnalysisService.getInstance();
    const azureSearchService = AzureSearchService.getInstance();
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    
    const pool = await dbManager.getPool();
    
    // Get workspace details
    const workspaceResult = await pool.request()
      .input('id', workspaceId)
      .query('SELECT id, name FROM Workspaces WHERE id = @id');
    
    if (workspaceResult.recordset.length === 0) {
      console.log(`❌ Workspace ${workspaceId} not found`);
      return false;
    }
    
    const workspace = workspaceResult.recordset[0];
    const workspaceName = workspace.name;
    
    console.log(`Processing workspace: ${workspaceName}`);
    
    // Get all files from the workspace
    const fileResult = await pool.request()
      .input('workspaceId', workspaceId)
      .query('SELECT * FROM WorkspaceFiles WHERE workspaceId = @workspaceId ORDER BY createdAt DESC');
    
    console.log(`Found ${fileResult.recordset.length} files in workspace`);
    
    if (fileResult.recordset.length === 0) {
      console.log('No files to index');
      return true;
    }
    
    // Get workspace folder name and index name
    const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(workspaceId, workspaceName);
    const indexName = `${workspaceFolderName}index`;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'blob';
    
    console.log(`Using index: ${indexName}`);
    console.log(`Using container: ${containerName}`);
    
    // Check if the index exists, create it if it doesn't
    const indexExists = await azureSearchService.indexExists(indexName);
    if (!indexExists) {
      console.log(`Azure Search index ${indexName} does not exist, creating it now`);
      const indexCreated = await azureSearchService.createWorkspaceIndex(indexName);
      if (!indexCreated) {
        console.log(`❌ Failed to create Azure Search index ${indexName}`);
        return false;
      }
      console.log(`✅ Azure Search index created: ${indexName}`);
    }
    
    // Process files in batches for better performance
    const batchSize = 5;
    const documentsToIndex: any[] = [];
    
    // Process each file
    for (const file of fileResult.recordset) {
      try {
        console.log(`\nProcessing file: ${file.originalName}`);
        
        // Construct the correct blob path
        const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
        const shortWorkspaceId = workspaceId.substring(0, 7);
        const folderPath = `workspace/${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
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
          console.log(`  ⚠️  Failed to extract content (may be already indexed): ${fileContentResult.content}`);
          // Continue with existing content in the index if available
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
        
        documentsToIndex.push(documentToIndex);
      } catch (error: any) {
        console.log(`  ❌ Error processing file ${file.originalName}: ${error.message}`);
      }
    }
    
    // Index documents in batches
    if (documentsToIndex.length > 0) {
      console.log(`\nIndexing ${documentsToIndex.length} documents in batches of ${batchSize}`);
      
      for (let i = 0; i < documentsToIndex.length; i += batchSize) {
        const batch = documentsToIndex.slice(i, i + batchSize);
        console.log(`\nIndexing batch ${Math.floor(i/batchSize) + 1} of ${Math.ceil(documentsToIndex.length/batchSize)}`);
        
        const indexResult = await azureSearchService.indexDocuments(indexName, batch);
        if (indexResult) {
          console.log(`  ✅ Successfully indexed batch of ${batch.length} documents`);
        } else {
          console.log(`  ❌ Failed to index batch of ${batch.length} documents`);
        }
      }
    } else {
      console.log('No new documents to index');
    }
    
    console.log('\n🎉 Workspace indexing completed successfully!');
    return true;
    
  } catch (error) {
    console.error('Workspace indexing failed:', error);
    return false;
  }
}

// If run directly, accept workspace ID as command line argument
if (require.main === module) {
  const workspaceId = process.argv[2];
  
  if (!workspaceId) {
    console.log('Usage: node ensure-workspace-indexing.js <workspaceId>');
    process.exit(1);
  }
  
  ensureWorkspaceIndexing(workspaceId)
    .then(success => {
      if (success) {
        console.log('✅ Workspace indexing completed successfully');
        process.exit(0);
      } else {
        console.log('❌ Workspace indexing failed');
        process.exit(1);
      }
    })
    .catch(error => {
      console.error('❌ Workspace indexing failed with error:', error);
      process.exit(1);
    });
}