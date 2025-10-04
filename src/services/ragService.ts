import { AzureSearchService } from './azureSearchService';
import { logger } from '../utils/logger';
import { WorkspaceStorageService } from './workspaceStorage';

export class RAGService {
  private static instance: RAGService;
  private azureSearchService: AzureSearchService;

  private constructor() {
    this.azureSearchService = AzureSearchService.getInstance();
  }

  public static getInstance(): RAGService {
    if (!RAGService.instance) {
      RAGService.instance = new RAGService();
    }
    return RAGService.instance;
  }

  /**
   * Retrieves relevant documents from Azure Search based on user query and workspace
   * @param query - User's question
   * @param workspaceId - Workspace ID (can be null for general queries)
   * @param workspaceName - Workspace name (required if workspaceId is provided)
   * @returns Relevant documents or empty array
   */
  public async getRelevantDocuments(query: string, workspaceId: string | null, workspaceName?: string): Promise<any[]> {
    try {
      // If no workspace is selected, return empty array for general queries
      if (!workspaceId) {
        logger.info('No workspace selected, using general OpenAI mode');
        return [];
      }

      // Get the workspace folder name and index name
      const workspaceStorageService = WorkspaceStorageService.getInstance();
      const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(workspaceId, workspaceName || '');
      const indexName = `${workspaceFolderName}index`;

      // Check if the index exists
      const indexExists = await this.azureSearchService.indexExists(indexName);
      if (!indexExists) {
        logger.warn(`Azure Search index ${indexName} does not exist`);
        return [];
      }

      // Search for relevant documents using semantic search
      const results = await this.azureSearchService.searchDocuments(indexName, query);
      logger.info(`Found ${results.length} relevant documents for query: ${query}`);
      
      return results;
    } catch (error) {
      logger.error('Error retrieving relevant documents:', error);
      return [];
    }
  }

  /**
   * Formats retrieved documents into a context string for the AI
   * @param documents - Documents retrieved from search
   * @returns Formatted context string
   */
  public formatDocumentsContext(documents: any[]): string {
    if (!documents || documents.length === 0) {
      return '';
    }

    let context = 'Relevant documents from the workspace:\n\n';
    
    documents.forEach((doc, index) => {
      context += `Document ${index + 1}:\n`;
      context += `File Name: ${doc.fileName || 'Unknown'}\n`;
      context += `File Type: ${doc.fileType || 'Unknown'}\n`;
      if (doc.summary) {
        context += `Summary: ${doc.summary}\n`;
      }
      context += `Content:\n${doc.content || 'No content available'}\n\n`;
    });

    return context;
  }
}