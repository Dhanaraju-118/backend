import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { BlobServiceClient } from '@azure/storage-blob';

async function listBlobContainer() {
  try {
    console.log('Listing blobs in container...');
    
    const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'blob';
    
    if (!connectionString) {
      console.log('❌ Azure Storage connection string not found');
      return;
    }
    
    console.log(`Using container: ${containerName}`);
    
    const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
    const containerClient = blobServiceClient.getContainerClient(containerName);
    
    console.log('Files in container:');
    let fileCount = 0;
    for await (const blob of containerClient.listBlobsFlat()) {
      console.log(`  - ${blob.name} (${blob.properties.contentLength} bytes)`);
      fileCount++;
      if (fileCount > 50) {
        console.log('  ... (more files)');
        break;
      }
    }
    
    console.log(`\nTotal files listed: ${fileCount > 50 ? '50+' : fileCount}`);
    
  } catch (error) {
    console.error('Failed to list blobs:', error);
  }
}

// Run the script
listBlobContainer();