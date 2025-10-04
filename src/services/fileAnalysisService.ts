import { StorageService } from './storage';
import { OpenAIService, ChatMessage } from './openai';
import { logger } from '../utils/logger';
// Add imports for document processing libraries
// Use require to bypass TypeScript type checking issues
const pdfParse: any = require('pdf-parse');
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';

export interface FileAnalysisResult {
  fileName: string;
  fileSize: number;
  fileType: string;
  summary: string;
  keyPoints: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  language: string;
  tokensUsed: number;
  processingTime: number;
}

export interface FileContentResult {
  fileName: string;
  originalName: string;
  content: string;
  size: number;
}

export class FileAnalysisService {
  private static instance: FileAnalysisService;
  private storageService: StorageService;
  private openAIService: OpenAIService;

  private constructor() {
    this.storageService = StorageService.getInstance();
    this.openAIService = OpenAIService.getInstance();
    logger.info('✅ File Analysis service initialized');
  }

  public static getInstance(): FileAnalysisService {
    if (!FileAnalysisService.instance) {
      FileAnalysisService.instance = new FileAnalysisService();
    }
    return FileAnalysisService.instance;
  }

  /**
   * Analyze a file's content using Azure OpenAI
   */
  public async analyzeFile(fileName: string, fileType: string = 'text', containerName?: string): Promise<FileAnalysisResult> {
    const startTime = Date.now();
    
    try {
      logger.info(`Analyzing file: ${fileName}`);
      
      // Step 1: Extract file content using our enhanced method
      const fileContentResult = await this.extractFileContent(fileName, fileName.split('/').pop() || fileName, containerName);
      const fileContent = fileContentResult.content;
      
      // Step 2: Truncate content if too large for AI processing
      const maxTokens = 10000; // Adjust based on your model's token limit
      const truncatedContent = this.truncateContentForTokens(fileContent, maxTokens);
      
      // Step 3: Analyze content with Azure OpenAI
      const analysis = await this.analyzeContentWithAI(truncatedContent, fileName);
      
      const processingTime = Date.now() - startTime;
      
      return {
        fileName,
        fileSize: fileContent.length,
        fileType,
        summary: analysis.summary,
        keyPoints: analysis.keyPoints,
        sentiment: analysis.sentiment,
        language: analysis.language,
        tokensUsed: analysis.tokensUsed,
        processingTime
      };
      
    } catch (error) {
      logger.error(`Failed to analyze file ${fileName}:`, error);
      throw new Error(`Failed to analyze file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze multiple files and compare them
   */
  public async compareFiles(fileNames: string[]): Promise<any> {
    try {
      logger.info(`Comparing ${fileNames.length} files`);
      
      // Analyze each file
      const analyses = await Promise.all(
        fileNames.map(async (fileName) => {
          return await this.analyzeFile(fileName);
        })
      );
      
      // Compare files using AI
      const comparison = await this.compareFilesWithAI(analyses);
      
      return {
        files: analyses,
        comparison
      };
      
    } catch (error) {
      logger.error('Failed to compare files:', error);
      throw new Error(`Failed to compare files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract specific information from a file using AI
   */
  public async extractInformation(fileName: string, extractionPrompt: string): Promise<string> {
    try {
      logger.info(`Extracting information from file: ${fileName}`);
      
      // Read file content
      const fileContent = await this.storageService.getFileContent(fileName);
      
      // Truncate if necessary
      const maxTokens = 8000;
      const truncatedContent = this.truncateContentForTokens(fileContent, maxTokens);
      
      // Extract information using AI
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are an expert at extracting specific information from documents. 
          Focus only on the requested information and provide concise, accurate responses.`
        },
        {
          role: 'user',
          content: `Document content:
${truncatedContent}

Requested extraction: ${extractionPrompt}

Please extract only the requested information from the document above.`
        }
      ];
      
      const response = await this.openAIService.getChatCompletion(messages, {
        maxTokens: 500,
        temperature: 0.3 // Low temperature for factual extraction
      });
      
      return response.content;
      
    } catch (error) {
      logger.error(`Failed to extract information from file ${fileName}:`, error);
      throw new Error(`Failed to extract information: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract raw file content with proper text extraction for different file types
   * Updated to work with folder-based storage approach
   */
  public async extractFileContent(fileName: string, originalName: string, containerName?: string): Promise<FileContentResult> {
    try {
      logger.info(`Extracting content from file: ${fileName}`);
      
      // Get file stream from storage
      let fileStream: NodeJS.ReadableStream;
      
      // Check if this is a workspace file (contains workspace/ path)
      if (fileName.startsWith('workspace/')) {
        // This is already a full path, use it directly with the main container
        logger.info(`Using workspace file path: ${fileName}`);
        const mainContainerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files';
        fileStream = await this.storageService.getFileStreamFromContainer(fileName, mainContainerName);
      } else if (containerName && containerName.startsWith('workspace-')) {
        // If containerName is provided and it's a workspace container, 
        // we need to extract the folder path from it and use the main container
        logger.info(`Using workspace folder approach with container: ${containerName}`);
        
        // Extract the folder path from the container name
        // Format was: workspace-{workspaceName}-{workspaceId}
        // New format should be: {workspaceName}-{workspaceId(first 7 digits)}/
        const parts = containerName.split('-');
        if (parts.length >= 3) {
          const workspaceId = parts[parts.length - 1]; // Last part is the workspace ID
          const workspaceNameParts = parts.slice(1, parts.length - 1); // Everything between 'workspace' and ID
          const workspaceName = workspaceNameParts.join('-');
          
          // Create the folder path format
          const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
          const shortWorkspaceId = workspaceId.substring(0, 7);
          const folderPath = `${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
          
          // Construct the full blob name with folder path
          const fullBlobName = `${folderPath}${fileName}`;
          
          // Use the main container
          const mainContainerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files';
          fileStream = await this.storageService.getFileStreamFromContainer(fullBlobName, mainContainerName);
        } else {
          // Fallback to default approach
          fileStream = await this.storageService.getFileStreamFromContainer(fileName, containerName);
        }
      } else if (containerName) {
        // If containerName is provided but not a workspace container, use it directly
        logger.info(`Using specific container: ${containerName}`);
        fileStream = await this.storageService.getFileStreamFromContainer(fileName, containerName);
      } else {
        // Use default container
        fileStream = await this.storageService.getFileStream(fileName);
      }
      const buffer = await this.streamToBuffer(fileStream);
      
      // Determine file type from extension
      const fileExtension = originalName.split('.').pop()?.toLowerCase() || '';
      let extractedContent = '';
      
      // Extract content based on file type
      switch (fileExtension) {
        case 'pdf':
          extractedContent = await this.extractPdfContent(buffer);
          break;
        case 'docx':
          extractedContent = await this.extractDocxContent(buffer);
          break;
        case 'doc':
          extractedContent = `[Content extraction not supported for .doc files. Please convert to .docx format.]`;
          break;
        case 'xlsx':
        case 'xls':
          extractedContent = await this.extractExcelContent(buffer);
          break;
        case 'txt':
        case 'md':
        case 'csv':
          extractedContent = buffer.toString('utf-8');
          break;
        case 'json':
          try {
            const jsonContent = JSON.parse(buffer.toString('utf-8'));
            extractedContent = JSON.stringify(jsonContent, null, 2);
          } catch (e) {
            extractedContent = buffer.toString('utf-8');
          }
          break;
        case 'html':
        case 'htm':
          // Simple HTML text extraction
          extractedContent = buffer.toString('utf-8')
            .replace(/<[^>]*>/g, ' ') // Remove HTML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
          break;
        case 'xml':
          // Simple XML text extraction
          extractedContent = buffer.toString('utf-8')
            .replace(/<[^>]*>/g, ' ') // Remove XML tags
            .replace(/\s+/g, ' ') // Normalize whitespace
            .trim();
          break;
        default:
          // For other file types, try to read as text
          try {
            extractedContent = buffer.toString('utf-8');
          } catch (error) {
            logger.warn(`Failed to read ${fileExtension} file as text, returning placeholder:`, error);
            extractedContent = `[Content extraction not supported for .${fileExtension} files]`;
          }
      }
      
      // If content is still empty or just whitespace, try to get more info
      if (!extractedContent || extractedContent.trim().length === 0) {
        extractedContent = `[File content is empty or could not be extracted from ${originalName}]`;
      }
      
      // Truncate if necessary (roughly 10000 tokens to allow for more content)
      const truncatedContent = this.truncateContentForTokens(extractedContent, 10000);
      
      return {
        fileName,
        originalName,
        content: truncatedContent,
        size: buffer.length
      };
      
    } catch (error) {
      logger.error(`Failed to extract content from file ${fileName}:`, error);
      // Return a fallback content instead of throwing an error
      return {
        fileName,
        originalName,
        content: `[Content not available for file: ${originalName}. Error: ${error instanceof Error ? error.message : 'Unknown error'}]`,
        size: 0
      };
    }
  }

  /**
   * Analyze content with Azure OpenAI
   */
  private async analyzeContentWithAI(content: string, fileName: string): Promise<any> {
    try {
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are an expert document analyzer. Analyze the provided document and provide:
1. A concise summary (2-3 sentences)
2. 3-5 key points from the document
3. Overall sentiment (positive, negative, or neutral)
4. Detected language

Format your response as JSON:
{
  "summary": "Concise summary here",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "sentiment": "positive|negative|neutral",
  "language": "English"
}`
        },
        {
          role: 'user',
          content: `Document: ${fileName}

Content:
${content}

Please analyze this document and respond in the specified JSON format.`
        }
      ];
      
      const response = await this.openAIService.getChatCompletion(messages, {
        maxTokens: 800,
        temperature: 0.5
      });
      
      // Try to parse JSON response
      try {
        const analysis = JSON.parse(response.content);
        return {
          ...analysis,
          tokensUsed: response.tokens
        };
      } catch (parseError) {
        // If JSON parsing fails, extract information from text response
        return this.extractAnalysisFromText(response.content, response.tokens);
      }
      
    } catch (error) {
      logger.error('AI analysis failed:', error);
      throw error;
    }
  }

  /**
   * Compare files using AI
   */
  private async compareFilesWithAI(analyses: FileAnalysisResult[]): Promise<any> {
    try {
      const fileSummaries = analyses.map(analysis => 
        `${analysis.fileName}: ${analysis.summary}`
      ).join('\n\n');
      
      const messages: ChatMessage[] = [
        {
          role: 'system',
          content: `You are an expert at comparing documents. Analyze the provided document summaries and provide:
1. Similarities between the documents
2. Key differences between the documents
3. Which document seems most comprehensive
4. Any notable patterns or trends

Be concise and focus on the most important comparisons.`
        },
        {
          role: 'user',
          content: `Document Summaries:
${fileSummaries}

Please compare these documents and provide your analysis.`
        }
      ];
      
      const response = await this.openAIService.getChatCompletion(messages, {
        maxTokens: 600,
        temperature: 0.7
      });
      
      return response.content;
      
    } catch (error) {
      logger.error('AI comparison failed:', error);
      throw error;
    }
  }

  /**
   * Extract analysis from text response (fallback method)
   */
  private extractAnalysisFromText(text: string, tokens: number): any {
    // Simple extraction logic - in practice, you might want more sophisticated parsing
    return {
      summary: text.substring(0, 200) + '...',
      keyPoints: ['Analysis completed successfully'],
      sentiment: 'neutral',
      language: 'English',
      tokensUsed: tokens
    };
  }

  /**
   * Truncate content to fit within token limits
   */
  private truncateContentForTokens(content: string, maxTokens: number): string {
    // Rough approximation: 1 token ≈ 4 characters
    const maxChars = maxTokens * 4;
    
    if (content.length <= maxChars) {
      return content;
    }
    
    logger.warn(`Content truncated from ${content.length} to ${maxChars} characters`);
    return content.substring(0, maxChars);
  }

  /**
   * Convert stream to string
   */
  private async streamToString(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    });
  }

  /**
   * Extract text content from PDF files
   */
  private async extractPdfContent(buffer: Buffer): Promise<string> {
    try {
      const data = await pdfParse(buffer);
      return data.text;
    } catch (error) {
      logger.error('PDF extraction error:', error);
      return '[Failed to extract text from PDF file]';
    }
  }

  /**
   * Extract text content from DOCX files
   */
  private async extractDocxContent(buffer: Buffer): Promise<string> {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value;
    } catch (error) {
      logger.error('DOCX extraction error:', error);
      return '[Failed to extract text from DOCX file]';
    }
  }

  /**
   * Extract content from Excel files
   */
  private async extractExcelContent(buffer: Buffer): Promise<string> {
    try {
      // Read the Excel file
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      
      // Extract content from all sheets
      let excelContent = '';
      
      workbook.SheetNames.forEach(sheetName => {
        const worksheet = workbook.Sheets[sheetName];
        // Convert sheet to CSV format for easier processing
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        excelContent += `\n\nSheet: ${sheetName}\n${csv}`;
      });
      
      return excelContent;
    } catch (error) {
      logger.error('Excel extraction error:', error);
      return '[Failed to extract content from Excel file]';
    }
  }

  /**
   * Convert stream to buffer
   */
  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}