import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import { blobServiceClient } from './azure';
import { logger } from '../utils/logger';

export class WorkspaceStorageService {
  private static instance: WorkspaceStorageService;
  private static readonly MAIN_CONTAINER_NAME = process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files';
  private static readonly WORKSPACE_PARENT_FOLDER = 'workspace/'; // New parent folder

  private constructor() {}

  public static getInstance(): WorkspaceStorageService {
    if (!WorkspaceStorageService.instance) {
      WorkspaceStorageService.instance = new WorkspaceStorageService();
    }
    return WorkspaceStorageService.instance;
  }

  /**
   * Ensures the main workspace container exists
   * @returns True if successful, false otherwise
   */
  public async initializeMainContainer(): Promise<boolean> {
    try {
      if (!blobServiceClient) {
        logger.warn('Blob service client not initialized');
        return false;
      }

      const containerClient = blobServiceClient.getContainerClient(WorkspaceStorageService.MAIN_CONTAINER_NAME);
      await containerClient.createIfNotExists();
      
      // Create the workspace parent folder
      const workspaceFolderPlaceholder = containerClient.getBlockBlobClient(`${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}.placeholder`);
      await workspaceFolderPlaceholder.uploadData(Buffer.from('Workspace parent folder placeholder'), {
        blobHTTPHeaders: {
          blobContentType: 'text/plain'
        }
      });
      
      const exists = await containerClient.exists();
      if (exists) {
        logger.info(`Main workspace container verified: ${WorkspaceStorageService.MAIN_CONTAINER_NAME}`);
        return true;
      } else {
        logger.warn(`Failed to verify main workspace container: ${WorkspaceStorageService.MAIN_CONTAINER_NAME}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to initialize main workspace container:`, error);
      return false;
    }
  }

  /**
   * Creates a folder structure for a workspace within the main container
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @returns The folder path if successful, null otherwise
   */
  public async createWorkspaceFolder(workspaceId: string, workspaceName: string): Promise<string | null> {
    try {
      if (!blobServiceClient) {
        logger.warn('Blob service client not initialized, skipping folder creation');
        return null;
      }

      // Create a folder with the workspace name and ID for better identification
      // Format: workspace/{workspaceName}-{workspaceId(first 7 digits)}/
      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = workspaceId.substring(0, 7);
      const folderPath = `${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      
      logger.info(`Creating workspace folder: ${folderPath} for workspace: ${workspaceName}`);
      
      // Create a placeholder blob to represent the folder
      const containerClient = blobServiceClient.getContainerClient(WorkspaceStorageService.MAIN_CONTAINER_NAME);
      const folderPlaceholderBlob = containerClient.getBlockBlobClient(`${folderPath}.placeholder`);
      
      // Upload placeholder content
      await folderPlaceholderBlob.uploadData(Buffer.from('Workspace folder placeholder'), {
        blobHTTPHeaders: {
          blobContentType: 'text/plain'
        }
      });
      
      logger.info(`Successfully created workspace folder: ${folderPath}`);
      return folderPath;
    } catch (error) {
      logger.error(`Failed to create workspace folder for workspace ${workspaceName} (${workspaceId}):`, error);
      return null;
    }
  }

  /**
   * Deletes a workspace folder and all its contents
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @returns True if successful, false otherwise
   */
  public async deleteWorkspaceFolder(workspaceId: string, workspaceName: string): Promise<boolean> {
    try {
      if (!blobServiceClient) {
        logger.warn('Blob service client not initialized, skipping folder deletion');
        return false;
      }

      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = workspaceId.substring(0, 7);
      const folderPath = `${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      
      logger.info(`Deleting workspace folder: ${folderPath}`);
      
      const containerClient = blobServiceClient.getContainerClient(WorkspaceStorageService.MAIN_CONTAINER_NAME);
      
      // Delete all blobs within the folder
      const blobsToDelete = [];
      for await (const blob of containerClient.listBlobsFlat()) {
        if (blob.name.startsWith(folderPath)) {
          blobsToDelete.push(blob.name);
        }
      }
      
      // Delete all blobs in the folder
      for (const blobName of blobsToDelete) {
        const blobClient = containerClient.getBlobClient(blobName);
        await blobClient.deleteIfExists();
      }
      
      logger.info(`Successfully deleted workspace folder and contents: ${folderPath}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete workspace folder for workspace ${workspaceName} (${workspaceId}):`, error);
      return false;
    }
  }

  /**
   * Checks if a workspace folder exists
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @returns True if folder exists, false otherwise
   */
  public async folderExists(workspaceId: string, workspaceName: string): Promise<boolean> {
    try {
      if (!blobServiceClient) {
        logger.warn('Blob service client not initialized');
        return false;
      }

      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = workspaceId.substring(0, 7);
      const folderPath = `${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      
      const containerClient = blobServiceClient.getContainerClient(WorkspaceStorageService.MAIN_CONTAINER_NAME);
      
      // Check if any blobs exist with the folder prefix
      for await (const blob of containerClient.listBlobsFlat()) {
        if (blob.name.startsWith(folderPath)) {
          return true;
        }
      }
      
      return false;
    } catch (error) {
      logger.error(`Failed to check if folder exists for workspace ${workspaceName} (${workspaceId}):`, error);
      return false;
    }
  }

  /**
   * Lists all blobs in a workspace folder
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @returns Array of blob names
   */
  public async listWorkspaceBlobs(workspaceId: string, workspaceName: string): Promise<string[]> {
    try {
      if (!blobServiceClient) {
        logger.warn('Blob service client not initialized');
        return [];
      }

      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = workspaceId.substring(0, 7);
      const folderPath = `${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      
      const containerClient = blobServiceClient.getContainerClient(WorkspaceStorageService.MAIN_CONTAINER_NAME);
      
      const blobNames: string[] = [];
      for await (const blob of containerClient.listBlobsFlat()) {
        // Only include blobs that are in this workspace folder and exclude the placeholder
        if (blob.name.startsWith(folderPath) && !blob.name.endsWith('.placeholder')) {
          // Return just the filename part (without the folder path)
          const fileName = blob.name.substring(folderPath.length);
          blobNames.push(fileName);
        }
      }
      
      return blobNames;
    } catch (error) {
      logger.error(`Failed to list blobs for workspace ${workspaceName} (${workspaceId}):`, error);
      return [];
    }
  }

  /**
   * Gets the full blob URL for a file in a workspace folder
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @param fileName - The name of the file
   * @returns The full blob URL
   */
  public getBlobUrl(workspaceId: string, workspaceName: string, fileName: string): string {
    const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const shortWorkspaceId = workspaceId.substring(0, 7);
    const folderPath = `${WorkspaceStorageService.WORKSPACE_PARENT_FOLDER}${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
    return `${blobServiceClient?.accountName}/${WorkspaceStorageService.MAIN_CONTAINER_NAME}/${folderPath}${fileName}`;
  }
  
  /**
   * Gets the workspace folder name (used for Azure Search index name)
   * @param workspaceId - The unique ID of the workspace
   * @param workspaceName - The name of the workspace
   * @returns The workspace folder name
   */
  public getWorkspaceFolderName(workspaceId: string, workspaceName: string): string {
    const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
    const shortWorkspaceId = workspaceId.substring(0, 7);
    return `${sanitizedWorkspaceName}-${shortWorkspaceId}`;
  }
}