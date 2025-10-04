import { SearchIndexClient, SearchClient, AzureKeyCredential, SearchIndex } from '@azure/search-documents';
import axios from 'axios';
import { logger } from '../utils/logger';

export class AzureSearchService {
  private static instance: AzureSearchService;
  private searchIndexClient: SearchIndexClient | null = null;
  private endpoint: string;
  private apiKey: string;

  private constructor() {
    this.endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
    this.apiKey = process.env.AZURE_AI_SEARCH_API_KEY || '';
    
    logger.info('Azure Search Service configuration:', {
      endpoint: this.endpoint,
      hasApiKey: !!this.apiKey,
      apiKeyLength: this.apiKey ? this.apiKey.length : 0
    });
    
    if (this.apiKey) {
      try {
        this.searchIndexClient = new SearchIndexClient(this.endpoint, new AzureKeyCredential(this.apiKey));
        logger.info('Azure Search Service initialized successfully with endpoint:', this.endpoint);
      } catch (error) {
        logger.error('Failed to initialize Azure Search Service:', error);
        this.searchIndexClient = null;
      }
    } else {
      logger.warn('Azure Search Service not initialized - missing API key');
    }
  }

  public static getInstance(): AzureSearchService {
    if (!AzureSearchService.instance) {
      AzureSearchService.instance = new AzureSearchService();
    }
    return AzureSearchService.instance;
  }

  /**
   * Creates a search index for a workspace with enhanced semantic search configuration
   * @param indexName - The name of the index (should be workspace folder name + "index")
   * @returns True if successful, false otherwise
   */
  public async createWorkspaceIndex(indexName: string): Promise<boolean> {
    try {
      if (!this.searchIndexClient) {
        logger.warn('Azure Search client not initialized');
        return false;
      }

      logger.info(`Creating Azure Search index with enhanced semantic search: ${indexName}`);
      
      // Use the format "search" + index_name for semantic configuration name
      const semanticConfigName = `search${indexName}`;
      
      // Define the complete index schema with semantic configuration using REST API
      const indexDefinition = {
        name: indexName,
        fields: [
          {
            name: "id",
            type: "Edm.String",
            key: true,
            searchable: false,
            filterable: true,
            sortable: true,
            facetable: false
          },
          {
            name: "content",
            type: "Edm.String",
            searchable: true,
            filterable: false,
            sortable: false,
            facetable: false
          },
          {
            name: "fileName",
            type: "Edm.String",
            searchable: true,
            filterable: true,
            sortable: true,
            facetable: false
          },
          {
            name: "fileType",
            type: "Edm.String",
            searchable: true,
            filterable: true,
            sortable: true,
            facetable: true
          },
          {
            name: "workspaceId",
            type: "Edm.String",
            searchable: false,
            filterable: true,
            sortable: false,
            facetable: false
          },
          {
            name: "workspaceName",
            type: "Edm.String",
            searchable: true,
            filterable: true,
            sortable: true,
            facetable: false
          },
          {
            name: "uploadedBy",
            type: "Edm.String",
            searchable: true,
            filterable: true,
            sortable: true,
            facetable: true
          },
          {
            name: "uploadedAt",
            type: "Edm.DateTimeOffset",
            searchable: false,
            filterable: true,
            sortable: true,
            facetable: false
          },
          {
            name: "summary",
            type: "Edm.String",
            searchable: true,
            filterable: false,
            sortable: false,
            facetable: false
          },
          {
            name: "keyPoints",
            type: "Collection(Edm.String)",
            searchable: true,
            filterable: false,
            sortable: false,
            facetable: false
          }
        ],
        semantic: {
          configurations: [
            {
              name: semanticConfigName,
              prioritizedFields: {
                titleField: {
                  fieldName: "fileName"
                },
                prioritizedContentFields: [
                  { fieldName: "content" },
                  { fieldName: "summary" }
                ],
                prioritizedKeywordsFields: [
                  { fieldName: "fileName" },
                  { fieldName: "workspaceName" },
                  { fieldName: "fileType" },
                  { fieldName: "keyPoints" }
                ]
              }
            }
          ]
        }
      };

      // Use REST API to create the index with semantic configuration
      const url = `${this.endpoint}/indexes?api-version=2023-07-01-Preview`;
      const headers = {
        'api-key': this.apiKey,
        'Content-Type': 'application/json'
      };

      await axios.post(url, indexDefinition, { headers });
      logger.info(`Successfully created Azure Search index with semantic configuration: ${indexName}`);
      
      return true;
    } catch (error: any) {
      logger.error(`Failed to create Azure Search index ${indexName}:`, {
        message: error.message,
        response: error.response?.data
      });
      return false;
    }
  }

  /**
   * Deletes a search index for a workspace
   * @param indexName - The name of the index to delete
   * @returns True if successful, false otherwise
   */
  public async deleteWorkspaceIndex(indexName: string): Promise<boolean> {
    try {
      if (!this.searchIndexClient) {
        logger.warn('Azure Search client not initialized');
        return false;
      }

      await this.searchIndexClient.deleteIndex(indexName);
      logger.info(`Successfully deleted Azure Search index: ${indexName}`);
      return true;
    } catch (error) {
      logger.error(`Failed to delete Azure Search index ${indexName}:`, error);
      return false;
    }
  }

  /**
   * Checks if a search index exists
   * @param indexName - The name of the index to check
   * @returns True if index exists, false otherwise
   */
  public async indexExists(indexName: string): Promise<boolean> {
    try {
      if (!this.searchIndexClient) {
        logger.warn('Azure Search client not initialized');
        return false;
      }

      const indexes = await this.searchIndexClient.listIndexes();
      for await (const index of indexes) {
        if (index.name === indexName) {
          return true;
        }
      }
      return false;
    } catch (error) {
      logger.error(`Failed to check if Azure Search index ${indexName} exists:`, error);
      return false;
    }
  }

  /**
   * Indexes a document (file content) in the search index
   * @param indexName - The name of the index
   * @param document - The document to index
   * @returns True if successful, false otherwise
   */
  public async indexDocument(indexName: string, document: any): Promise<boolean> {
    try {
      if (!this.searchIndexClient) {
        logger.warn('Azure Search client not initialized');
        return false;
      }

      const searchClient = new SearchClient(this.endpoint, indexName, new AzureKeyCredential(this.apiKey));
      const result = await searchClient.uploadDocuments([document]);
      
      if (result.results && result.results.length > 0 && result.results[0].succeeded) {
        logger.info(`Successfully indexed document in index: ${indexName}`);
        return true;
      } else {
        logger.warn(`Failed to index document in index: ${indexName}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to index document in index ${indexName}:`, error);
      return false;
    }
  }

  /**
   * Indexes multiple documents in the search index
   * @param indexName - The name of the index
   * @param documents - Array of documents to index
   * @returns True if successful, false otherwise
   */
  public async indexDocuments(indexName: string, documents: any[]): Promise<boolean> {
    try {
      if (!this.searchIndexClient) {
        logger.warn('Azure Search client not initialized');
        return false;
      }

      const searchClient = new SearchClient(this.endpoint, indexName, new AzureKeyCredential(this.apiKey));
      const result = await searchClient.uploadDocuments(documents);
      
      let successCount = 0;
      let failureCount = 0;
      
      if (result.results) {
        for (const item of result.results) {
          if (item.succeeded) {
            successCount++;
          } else {
            failureCount++;
            logger.warn(`Failed to index document: ${item.errorMessage}`);
          }
        }
      }
      
      logger.info(`Indexed documents in index ${indexName}: ${successCount} succeeded, ${failureCount} failed`);
      
      return successCount > 0;
    } catch (error) {
      logger.error(`Failed to index documents in index ${indexName}:`, error);
      return false;
    }
  }

  /**
   * Searches for documents in a workspace index with semantic search
   * @param indexName - The name of the index
   * @param searchText - The text to search for
   * @param filter - Optional filter expression
   * @returns Search results
   */
  public async searchDocuments(indexName: string, searchText: string, filter?: string): Promise<any[]> {
    try {
      if (!this.searchIndexClient) {
        logger.warn('Azure Search client not initialized');
        return [];
      }

      // Use the format "search" + index_name for semantic configuration name
      const semanticConfigName = `search${indexName}`;

      // Use REST API for semantic search
      const url = `${this.endpoint}/indexes/${indexName}/docs/search?api-version=2023-07-01-Preview`;
      const headers = {
        'api-key': this.apiKey,
        'Content-Type': 'application/json'
      };

      const searchBody: any = {
        search: searchText,
        top: 10,
        queryType: "semantic",
        semanticConfiguration: semanticConfigName,
        queryLanguage: "en-US"
        // Removed querySpeller as it's not supported in this API version
      };
      
      if (filter) {
        searchBody.filter = filter;
      }

      const response = await axios.post(url, searchBody, { headers });
      const results: any[] = [];
      
      if (response.data.value) {
        for (const result of response.data.value) {
          results.push(result);
        }
      }
      
      return results;
    } catch (error: any) {
      logger.error(`Failed to search documents in index ${indexName}:`, {
        message: error.message,
        response: error.response?.data
      });
      return [];
    }
  }
}
