import { OpenAIClient, AzureKeyCredential } from '@azure/openai';
import { logger } from '../utils/logger';

// Explicitly load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Set default timeout for Azure OpenAI requests
const DEFAULT_TIMEOUT_MS = 30000; // 30 seconds

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface RAGContext {
  documents: any[];
  workspaceId: string | null;
  workspaceName?: string;
}

export interface ChatCompletionOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stream?: boolean;
}

export class OpenAIService {
  private static instance: OpenAIService | null = null;
  private client!: OpenAIClient;
  private deploymentName: string = '';

  private constructor() {
    this.initializeClient();
    logger.info('✅ OpenAI service initialized');
  }

  private initializeClient(): void {
    // Explicitly load environment variables
    require('dotenv').config();
    
    // Clean up the endpoint URL if it ends with "/models" or contains full path
    let endpoint = process.env.AZURE_OPENAI_ENDPOINT || '';
    if (endpoint.endsWith('/models')) {
      endpoint = endpoint.substring(0, endpoint.length - '/models'.length);
      logger.warn('Cleaned up endpoint URL by removing "/models" suffix');
    }
    // Handle full path endpoints by extracting just the base URL
    if (endpoint.includes('/openai/deployments/')) {
      try {
        const url = new URL(endpoint);
        endpoint = `${url.protocol}//${url.hostname}`;
        logger.info(`Extracted base endpoint: ${endpoint}`);
      } catch (e) {
        logger.error('Failed to parse endpoint URL', e);
      }
    }
    
    // Ensure endpoint doesn't end with trailing slash
    if (endpoint.endsWith('/')) {
      endpoint = endpoint.slice(0, -1);
    }
    
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    this.deploymentName = process.env.AZURE_OPENAI_DEPLOYMENT_NAME || 'gpt-4';
    const mockOpenAI = process.env.MOCK_OPENAI === 'true';

    logger.info('OpenAI Service Configuration:');
    logger.info(`- endpoint: ${endpoint ? 'SET' : 'NOT SET'}`);
    logger.info(`- apiKey: ${apiKey ? 'SET' : 'NOT SET'}`);
    logger.info(`- deploymentName: ${this.deploymentName}`);
    logger.info(`- mockOpenAI: ${mockOpenAI}`);

    // Use mock client only if explicitly requested
    if (mockOpenAI) {
      logger.warn('MOCK_OPENAI is set to true. Using mock client.');
      
      // Create a mock client with the necessary methods
      this.client = {
        getChatCompletions: async () => ({
          choices: [{
            message: {
              role: 'assistant',
              content: 'This is a mock response from the OpenAI service.'
            },
            finishReason: 'stop'
          }],
          usage: {
            totalTokens: 50
          }
        }),
        getModels: async () => ({
          models: [{
            id: 'gpt-4',
            object: 'model',
            created: Date.now(),
            ownedBy: 'mock'
          }]
        }),
        streamChatCompletions: async function* () {
          yield {
            choices: [{
              delta: {
                content: 'This is a mock streaming response from the OpenAI service.'
              }
            }]
          };
        }
      } as unknown as OpenAIClient;
      return;
    }

    // Use real Azure OpenAI client
    if (!endpoint || !apiKey) {
      throw new Error('Azure OpenAI configuration is required but missing. Please check your environment variables.');
    }

    try {
      logger.info('Initializing Azure OpenAI client with endpoint:', endpoint);
      const credential = new AzureKeyCredential(apiKey);
      
      // Initialize the OpenAI client without additional options
      this.client = new OpenAIClient(endpoint, credential);
      logger.info('Azure OpenAI client initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Azure OpenAI client:', error);
      throw new Error(`Azure OpenAI client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public static getInstance(): OpenAIService {
    if (!OpenAIService.instance) {
      OpenAIService.instance = new OpenAIService();
    }
    return OpenAIService.instance;
  }

  public static resetInstance(): void {
    OpenAIService.instance = null;
  }

  public reconfigure(): void {
    try {
      this.initializeClient();
      logger.info('✅ OpenAI service reconfigured successfully');
    } catch (error) {
      logger.error('Failed to reconfigure OpenAI service:', error);
      throw error;
    }
  }

  public async getChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<{ content: string; tokens: number }> {
    try {
      const {
        maxTokens = 1000,
        temperature = 0.7,
        topP = 1,
        frequencyPenalty = 0,
        presencePenalty = 0
      } = options;

      // Check if we're using the mock client
      if (!this.client.getChatCompletions || typeof this.client.getChatCompletions !== 'function') {
        // This is a mock client, return mock response
        logger.info('Using mock OpenAI response');
        return {
          content: 'This is a mock response from the OpenAI service. In a production environment, this would be a response from Azure OpenAI.',
          tokens: 25
        };
      }

      logger.info(`Sending request to Azure OpenAI (${this.deploymentName})`);
      
      // Add timeout promise to handle hanging requests
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Request to Azure OpenAI timed out'));
        }, DEFAULT_TIMEOUT_MS + 5000); // Add 5s buffer to client timeout
      });
      
      // Create the actual request promise
      const requestPromise = this.client.getChatCompletions(
        this.deploymentName,
        messages,
        {
          maxTokens,
          temperature,
          topP,
          frequencyPenalty,
          presencePenalty
        }
      );
      
      // Race the request against the timeout
      const response = await Promise.race([requestPromise, timeoutPromise]);

      const choice = response.choices[0];
      if (!choice?.message?.content) {
        logger.warn('Empty or invalid response received from Azure OpenAI');
        throw new Error('No response content received from OpenAI');
      }

      logger.info(`Received response from Azure OpenAI (${response.usage?.totalTokens || 'unknown'} tokens)`);
      return {
        content: choice.message.content,
        tokens: response.usage?.totalTokens || 0
      };
    } catch (error) {
      logger.error('Azure OpenAI API error:', error);
      
      // Check if this is a timeout or network error
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out') || errorMessage.includes('network')) {
          logger.error('Azure OpenAI request timed out');
          throw new Error('The AI service is taking too long to respond. Please try again.');
        }
        
        if (errorMessage.includes('429') || errorMessage.includes('too many requests') || errorMessage.includes('rate limit')) {
          logger.error('Azure OpenAI rate limit exceeded');
          throw new Error('The AI service is currently overloaded. Please wait a moment and try again.');
        }
        
        if (errorMessage.includes('401') || errorMessage.includes('unauthorized') || errorMessage.includes('authentication')) {
          logger.error('Azure OpenAI authentication failed');
          throw new Error('AI service authentication failed. Please contact support.');
        }
        
        if (errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('deployment')) {
          logger.error(`Azure OpenAI deployment '${this.deploymentName}' not found`);
          throw new Error('The AI model configuration is incorrect. Please contact support.');
        }
      }
      
      // Generic error message
      throw new Error('Failed to get AI response. Please try again.');
    }
  }

  public async getStreamingChatCompletion(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<AsyncIterable<string>> {
    try {
      const {
        maxTokens = 1000,
        temperature = 0.7,
        topP = 1,
        frequencyPenalty = 0,
        presencePenalty = 0
      } = options;

      // Check if we're using the mock client
      if (!this.client.streamChatCompletions || typeof this.client.streamChatCompletions !== 'function') {
        // This is a mock client, return mock response
        logger.info('Using mock OpenAI streaming response');
        // Return a mock async generator to simulate streaming
        return (async function* mockStream() {
          yield 'This is a mock streaming ';
          await new Promise(resolve => setTimeout(resolve, 300));
          yield 'response from the OpenAI service. ';
          await new Promise(resolve => setTimeout(resolve, 300));
          yield 'In a production environment, this would be a streaming response from Azure OpenAI.';
        })();
      }

      logger.info(`Sending streaming request to Azure OpenAI (${this.deploymentName})`);
      
      // Add timeout promise to handle hanging requests
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Streaming request to Azure OpenAI timed out'));
        }, DEFAULT_TIMEOUT_MS + 5000); // Add 5s buffer to client timeout
      });
      
      // Create the actual request promise
      const requestPromise = this.client.streamChatCompletions(
        this.deploymentName,
        messages,
        {
          maxTokens,
          temperature,
          topP,
          frequencyPenalty,
          presencePenalty
        }
      );
      
      // Race the request against the timeout
      const response = await Promise.race([requestPromise, timeoutPromise]);

      logger.info('Started streaming response from Azure OpenAI');
      return this.processStreamingResponse(response);
    } catch (error) {
      logger.error('Azure OpenAI streaming API error:', error);
      
      // Check if this is a timeout or network error
      if (error instanceof Error) {
        const errorMessage = error.message.toLowerCase();
        
        if (errorMessage.includes('timeout') || errorMessage.includes('timed out') || errorMessage.includes('network')) {
          logger.error('Azure OpenAI streaming request timed out');
          throw new Error('The AI service is taking too long to respond. Please try again.');
        }
        
        if (errorMessage.includes('429') || errorMessage.includes('too many requests') || errorMessage.includes('rate limit')) {
          logger.error('Azure OpenAI rate limit exceeded');
          throw new Error('The AI service is currently overloaded. Please wait a moment and try again.');
        }
        
        if (errorMessage.includes('401') || errorMessage.includes('unauthorized') || errorMessage.includes('authentication')) {
          logger.error('Azure OpenAI authentication failed');
          throw new Error('AI service authentication failed. Please contact support.');
        }
        
        if (errorMessage.includes('404') || errorMessage.includes('not found') || errorMessage.includes('deployment')) {
          logger.error(`Azure OpenAI deployment '${this.deploymentName}' not found`);
          throw new Error('The AI model configuration is incorrect. Please contact support.');
        }
      }
      
      throw new Error('Failed to get streaming AI response. Please try again.');
    }
  }

  private async* processStreamingResponse(
    response: AsyncIterable<any>
  ): AsyncIterable<string> {
    try {
      let chunkCount = 0;
      for await (const chunk of response) {
        chunkCount++;
        const choice = chunk.choices[0];
        if (choice?.delta?.content) {
          yield choice.delta.content;
        }
      }
      logger.info(`Completed streaming response from Azure OpenAI (${chunkCount} chunks)`);
    } catch (error) {
      logger.error('Error processing streaming response:', error);
      throw new Error('Error processing AI response stream. Please try again.');
    }
  }

  public async moderateContent(content: string): Promise<boolean> {
    try {
      // Note: Azure OpenAI might not have moderation endpoint
      // Implement basic content filtering here or use Azure Content Safety
      const flaggedWords = ['spam', 'abuse', 'harmful'];
      const lowerContent = content.toLowerCase();
      
      return flaggedWords.some(word => lowerContent.includes(word));
    } catch (error) {
      logger.error('Content moderation error:', error);
      return false; // Allow content if moderation fails
    }
  }

  public getSystemPrompt(ragContext?: RAGContext): string {
    let prompt = `You are AIVA (Alyasra Intelligent Virtual Assistant), a helpful AI assistant designed to help with business analytics, data insights, and decision-making. 

Key guidelines:
- Provide accurate, helpful, and professional responses
- Focus on business intelligence and data analysis when relevant
- Be concise but thorough in your explanations
- If you're unsure about something, acknowledge it
- Maintain a professional yet friendly tone
- Respect user privacy and data security

Current date: ${new Date().toISOString().split('T')[0]}`;

    // If we have RAG context with a workspace, add instructions for using workspace documents
    if (ragContext && ragContext.workspaceId) {
      prompt += `

You have access to documents from a specific workspace. When answering questions, prioritize information from these documents. 
If a question cannot be answered using the provided documents, clearly state that the information is not available in the workspace documents 
and provide a general response based on your knowledge.`;
    } else {
      prompt += `

You are operating in general mode without access to specific workspace documents. Provide general assistance and knowledge like a standard AI assistant.`;
    }

    return prompt;
  }
}