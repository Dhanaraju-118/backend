import { AIDataService } from './aiDataService';
import { FabricDataAgentService } from './fabricDataAgent';
import { logger } from '../utils/logger';

export interface AdminDataQuery {
  question: string;
  userId: string;
  datasetId?: string;
  connectionId?: string;
  workspaceId?: string;
  queryType?: 'dax' | 'sql';
  includeVisualization?: boolean;
}

export interface AdminDataResult {
  answer: string;
  data?: any;
  query: string;
  queryType: 'dax' | 'sql';
  visualization?: any;
  confidence: number;
  executionTime: number;
  tokens?: number;
}

export class AdminDataService {
  private static instance: AdminDataService;
  private aiDataService: AIDataService;
  private fabricService: FabricDataAgentService;

  private constructor() {
    this.aiDataService = AIDataService.getInstance();
    this.fabricService = FabricDataAgentService.getInstance();
    logger.info('✅ Admin Data Service initialized');
  }

  public static getInstance(): AdminDataService {
    if (!AdminDataService.instance) {
      AdminDataService.instance = new AdminDataService();
    }
    return AdminDataService.instance;
  }

  /**
   * Process admin data question with elevated privileges
   */
  public async processAdminDataQuestion(params: AdminDataQuery): Promise<AdminDataResult> {
    try {
      if (!params.question || params.question.trim() === '') {
        throw new Error('Question cannot be empty');
      }

      if (!params.userId) {
        throw new Error('User ID is required');
      }

      logger.info(`Admin data question from user ${params.userId}: ${params.question}`);

      // Use the existing AI data service with admin context
      const result = await this.aiDataService.processDataQuestion({
        ...params
        // adminContext flag removed as it's not in the DataInsightRequest interface
      });

      if (!result || !result.answer) {
        throw new Error('No valid response received from AI data service');
      }

      // Ensure the result matches AdminDataResult type
      const adminResult: AdminDataResult = {
        answer: result.answer,
        data: result.data,
        query: result.query || '', // Ensure query is always a string
        queryType: result.queryType || 'dax',
        visualization: result.visualization,
        confidence: result.confidence,
        executionTime: result.executionTime,
        tokens: result.tokens
      };

      logger.info(`Admin data question processed successfully for user ${params.userId}`);
      return adminResult;

    } catch (error) {
      logger.error('Admin data question processing error:', error);
      
      // Handle specific error types
      if (error instanceof Error) {
        if (error.message.includes('timeout') || error.message.includes('timed out')) {
          throw new Error('The data service is taking too long to respond. Please try again.');
        }
        
        if (error.message.includes('dataset') || error.message.includes('schema')) {
          throw new Error('There was an issue accessing the requested dataset. Please verify the dataset exists and try again.');
        }

        if (error.message.includes('AI') || error.message.includes('OpenAI')) {
          throw new Error('The AI service encountered an error. Please try again later.');
        }
      }
      
      throw new Error(`Failed to process admin data question: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute admin query with elevated privileges
   */
  public async executeAdminQuery(
    query: string,
    queryType: 'dax' | 'sql',
    options: {
      datasetId?: string;
      connectionId?: string;
      workspaceId?: string;
      userId: string;
    }
  ): Promise<any> {
    try {
      // Validate inputs
      if (!query || query.trim() === '') {
        throw new Error('Query cannot be empty');
      }

      if (!options.userId) {
        throw new Error('User ID is required');
      }

      // Log the query attempt with sanitized query text
      const sanitizedQuery = query.length > 100 ? `${query.substring(0, 100)}...` : query;
      logger.info(`Admin direct query execution from user ${options.userId}: ${queryType.toUpperCase()} - ${sanitizedQuery}`);

      // Security check for potentially harmful queries
      const securityLevel = this.assessSecurityLevel(query);
      if (securityLevel === 'high') {
        logger.warn(`High security risk query attempted by user ${options.userId}: ${sanitizedQuery}`);
      }

      let result;
      if (queryType === 'dax') {
        if (!options.datasetId) {
          throw new Error('Dataset ID required for DAX queries');
        }
        result = await this.fabricService.executeDaxQuery(
          options.datasetId, 
          query, 
          options.workspaceId
        );
      } else {
        if (!options.connectionId && queryType === 'sql') {
          throw new Error('Connection ID required for SQL queries');
        }
        result = await this.fabricService.executeSqlQuery(
          query, 
          options.workspaceId, 
          options.connectionId
        );
      }

      // Validate result
      if (!result) {
        throw new Error('No result returned from query execution');
      }

      logger.info(`Admin query executed successfully for user ${options.userId}`);
      return result;

    } catch (error) {
      logger.error('Admin query execution error:', error);
      
      // Handle specific error types
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          throw new Error('The query is taking too long to execute. Please optimize your query and try again.');
        }
        
        if (errorMessage.includes('dataset') || errorMessage.includes('not found')) {
          throw new Error('The specified dataset or connection was not found. Please verify and try again.');
        }

        if (errorMessage.includes('permission') || errorMessage.includes('access') || errorMessage.includes('unauthorized')) {
          throw new Error('You do not have permission to execute this query. Please contact an administrator.');
        }

        if (errorMessage.includes('syntax') || errorMessage.includes('invalid')) {
          throw new Error(`Query syntax error: ${error.message}`);
        }
      }
      
      throw new Error(`Failed to execute admin query: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get all available datasets for admin
   */
  public async getAdminDatasets(workspaceId?: string): Promise<any[]> {
    try {
      logger.info('Getting admin datasets' + (workspaceId ? ` for workspace ${workspaceId}` : ''));
      
      const datasets = await this.aiDataService.getAvailableDatasets(workspaceId);
      
      if (!datasets || !Array.isArray(datasets)) {
        throw new Error('Invalid dataset response format');
      }
      
      logger.info(`Retrieved ${datasets.length} admin datasets successfully`);
      return datasets;
    } catch (error) {
      logger.error('Get admin datasets error:', error);
      
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('workspace') || errorMessage.includes('not found')) {
          throw new Error('The specified workspace was not found. Please verify the workspace ID and try again.');
        }
        
        if (errorMessage.includes('permission') || errorMessage.includes('access') || errorMessage.includes('unauthorized')) {
          throw new Error('You do not have permission to access these datasets. Please contact an administrator.');
        }
        
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          throw new Error('The request timed out while retrieving datasets. Please try again later.');
        }
      }
      
      throw new Error(`Failed to retrieve admin datasets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get dataset schema for admin
   */
  public async getAdminDatasetSchema(datasetId: string, workspaceId?: string): Promise<any> {
    try {
      if (!datasetId || datasetId.trim() === '') {
        throw new Error('Dataset ID is required');
      }
      
      logger.info(`Getting admin dataset schema for ${datasetId}` + (workspaceId ? ` in workspace ${workspaceId}` : ''));
      
      const schema = await this.aiDataService.getDatasetSchema(datasetId, workspaceId);
      
      if (!schema) {
        throw new Error(`No schema found for dataset ${datasetId}`);
      }
      
      logger.info(`Retrieved schema for dataset ${datasetId} successfully`);
      return schema;
    } catch (error) {
      logger.error('Get admin dataset schema error:', error);
      
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('dataset') || errorMessage.includes('not found')) {
          throw new Error(`Dataset ${datasetId} was not found. Please verify the dataset ID and try again.`);
        }
        
        if (errorMessage.includes('workspace')) {
          throw new Error('The specified workspace was not found. Please verify the workspace ID and try again.');
        }
        
        if (errorMessage.includes('permission') || errorMessage.includes('access') || errorMessage.includes('unauthorized')) {
          throw new Error('You do not have permission to access this dataset schema. Please contact an administrator.');
        }
        
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          throw new Error('The request timed out while retrieving the dataset schema. Please try again later.');
        }
      }
      
      throw new Error(`Failed to retrieve admin dataset schema: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze question for admin with additional insights
   */
  public async analyzeAdminQuestion(question: string): Promise<any> {
    try {
      if (!question || question.trim() === '') {
        throw new Error('Question cannot be empty');
      }
      
      // Sanitize question for logging
      const sanitizedQuestion = question.length > 100 ? `${question.substring(0, 100)}...` : question;
      logger.info(`Analyzing admin question: ${sanitizedQuestion}`);
      
      const analysis = await this.fabricService.analyzeQuestion(question);
      
      if (!analysis) {
        throw new Error('Failed to analyze question - no analysis returned');
      }
      
      // Add admin-specific analysis
      const result = {
        ...analysis,
        adminInsights: {
          securityLevel: this.assessSecurityLevel(question),
          performanceImpact: this.assessPerformanceImpact(question),
          dataAccessLevel: 'admin'
        }
      };
      
      logger.info(`Successfully analyzed admin question with security level: ${result.adminInsights.securityLevel}`);
      return result;
    } catch (error) {
      logger.error('Admin question analysis error:', error);
      
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
          throw new Error('The request timed out while analyzing the question. Please try again later.');
        }
        
        if (errorMessage.includes('invalid') || errorMessage.includes('format')) {
          throw new Error('The question format is invalid. Please rephrase your question and try again.');
        }
      }
      
      throw new Error(`Failed to analyze admin question: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Assess security level of the query
   */
  private assessSecurityLevel(question: string): 'low' | 'medium' | 'high' {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('delete') || lowerQuestion.includes('drop') || lowerQuestion.includes('truncate')) {
      return 'high';
    }
    
    if (lowerQuestion.includes('update') || lowerQuestion.includes('insert') || lowerQuestion.includes('alter')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Assess performance impact of the query
   */
  private assessPerformanceImpact(question: string): 'low' | 'medium' | 'high' {
    const lowerQuestion = question.toLowerCase();
    
    if (lowerQuestion.includes('all') || lowerQuestion.includes('entire') || lowerQuestion.includes('complete')) {
      return 'high';
    }
    
    if (lowerQuestion.includes('large') || lowerQuestion.includes('many') || lowerQuestion.includes('bulk')) {
      return 'medium';
    }
    
    return 'low';
  }
}