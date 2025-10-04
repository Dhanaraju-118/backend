import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { StorageService } from '../services/storage';
import { blobServiceClient } from '../services/azure';

async function listAllBlobs() {
  try {
    console.log('Listing all blobs in container...');
    
    const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files';
    console.log(`Using container: ${containerName}`);
    
    if (!blobServiceClient) {
      console.log('❌ Blob service client not initialized');
      return;
    }
    
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
listAllBlobs();