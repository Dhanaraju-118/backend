import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { BlobServiceClient } from '@azure/storage-blob';

async function findWorkspaceFiles() {
  try {
    console.log('Looking for workspace files...');
    
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'blob';
    
    if (!connectionString) {
      console.log('❌ Azure Storage connection string not found');
      return;
    }
    
    console.log(`Using container: ${containerName}`);
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    console.log('Looking for workspace folder files:');
    let fileCount = 0;
    for await (const blob of containerClient.listBlobsFlat()) {
      if (blob.name.startsWith('workspace/')) {
        console.log(`  - ${blob.name} (${blob.properties.contentLength} bytes)`);
        fileCount++;
      }
    }
    
    if (fileCount === 0) {
      console.log('No workspace folder files found.');
      
      // Let's check if there are any files that might be in a workspace-like structure
      console.log('\nLooking for potential workspace files:');
      for await (const blob of containerClient.listBlobsFlat()) {
        if (blob.name.includes('red-8f04af2') || blob.name.includes('Alyasra')) {
          console.log(`  - ${blob.name} (${blob.properties.contentLength} bytes)`);
        }
      }
    }
    
    console.log(`\nTotal workspace files found: ${fileCount}`);
    
  } catch (error) {
    console.error('Failed to list blobs:', error);
  }
}

// Run the script
findWorkspaceFiles();