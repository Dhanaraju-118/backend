import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken } from '../middleware/auth';
import { AIDataService } from '../services/aiDataService';
import { validate, schemas } from '../middleware/validation';
import { chatLimiter, aiLimiter } from '../middleware/rateLimiter';
import { DatabaseManager } from '../config/database';
import { OpenAIService } from '../services/openai';
import { CacheService } from '../services/cache';
import { logger } from '../utils/logger';
import sql from 'mssql';

const router = express.Router();
const dbManager = DatabaseManager.getInstance();

// Apply authentication to all chat routes
router.use(authenticateToken);

// Get services
const openAIService = OpenAIService.getInstance();
const cacheService = CacheService.getInstance();
let aiDataService: AIDataService | null = null;

// Get user's chats
router.get('/', validate(schemas.pagination), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { page = 1, limit = 20, sortBy = 'updatedAt', sortOrder = 'desc' } = req.query;
    
    const pool = await dbManager.getPool();
    const offset = (Number(page) - 1) * Number(limit);
    
    const result = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .input('limit', sql.Int, Number(limit))
      .input('offset', sql.Int, offset)
      .query(`
        SELECT 
          c.*,
          w.name as workspaceName,
          w.color as workspaceColor,
          (SELECT COUNT(*) FROM Messages WHERE chatId = c.id) as messageCount
        FROM Chats c
        LEFT JOIN Workspaces w ON c.workspaceId = w.id
        WHERE c.userId = @userId AND c.isArchived = 0
        ORDER BY c.${sortBy} ${sortOrder}
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);
    
    const countResult = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .query('SELECT COUNT(*) as total FROM Chats WHERE userId = @userId AND isArchived = 0');
    
    const total = countResult.recordset[0].total;

    res.json({
      message: 'Chats retrieved successfully',
      chats: result.recordset,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.error('Get chats error:', error);
    res.status(500).json({
      error: 'Failed to retrieve chats'
    });
  }
});

// Create new chat
router.post('/', validate(schemas.createChat), async (req, res) => {
  try {
    const { title, description, workspaceId } = req.body;
    const userId = req.user.userId;
    const chatId = uuidv4();

    const pool = await dbManager.getPool();
    
    // In development mode with bypass auth, we might need to create the user
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
      // Check if user exists
      const userCheck = await pool.request()
        .input('userId', sql.NVarChar, userId)
        .query('SELECT id FROM Users WHERE id = @userId');
      
      if (userCheck.recordset.length === 0) {
        // Check if a user with the same email already exists
        const emailCheck = await pool.request()
          .input('email', sql.NVarChar, `${userId}@example.com`)
          .query('SELECT id FROM Users WHERE email = @email');
        
        if (emailCheck.recordset.length === 0) {
          // Create the mock user only if no user with this email exists
          await pool.request()
            .input('id', sql.NVarChar, userId)
            .input('firstName', sql.NVarChar, 'Test')
            .input('lastName', sql.NVarChar, 'User')
            .input('email', sql.NVarChar, `${userId}@example.com`)
            .input('role', sql.NVarChar, req.user.role || 'user')
            .query(`
              INSERT INTO Users (id, firstName, lastName, email, role, isActive, createdAt, updatedAt)
              VALUES (@id, @firstName, @lastName, @email, @role, 1, GETUTCDATE(), GETUTCDATE())
            `);
        } else {
          // If user with email exists, update the user ID
          await pool.request()
            .input('id', sql.NVarChar, userId)
            .input('email', sql.NVarChar, `${userId}@example.com`)
            .query(`
              UPDATE Users SET id = @id WHERE email = @email
            `);
        }
      }
    }
    
    let finalWorkspaceId = workspaceId;
    
    // If no workspaceId provided, create a default workspace
    if (!finalWorkspaceId) {
      // Check if user has any workspaces (either owned or assigned)
      const workspaceCheck = await pool.request()
        .input('userId', sql.NVarChar, userId)
        .query(`
          SELECT TOP 1 w.id 
          FROM Workspaces w 
          LEFT JOIN WorkspaceUsers wu ON w.id = wu.workspaceId
          WHERE w.ownerId = @userId OR wu.userId = @userId
        `);
      
      if (workspaceCheck.recordset.length > 0) {
        // Use existing workspace
        finalWorkspaceId = workspaceCheck.recordset[0].id;
      } else {
        // Create a default workspace for the user
        const defaultWorkspaceId = uuidv4();
        const workspaceResult = await pool.request()
          .input('id', sql.NVarChar, defaultWorkspaceId)
          .input('name', sql.NVarChar, 'Default Workspace')
          .input('description', sql.NVarChar, 'Auto-created default workspace')
          .input('color', sql.NVarChar, '#3B82F6')
          .input('ownerId', sql.NVarChar, userId)
          .query(`
            INSERT INTO Workspaces (id, name, description, color, ownerId, createdAt, updatedAt)
            OUTPUT INSERTED.id
            VALUES (@id, @name, @description, @color, @ownerId, GETUTCDATE(), GETUTCDATE())
          `);
        
        // Also assign the owner to their own workspace
        const assignmentId = uuidv4();
        await pool.request()
          .input('id', sql.NVarChar, assignmentId)
          .input('workspaceId', sql.NVarChar, defaultWorkspaceId)
          .input('userId', sql.NVarChar, userId)
          .input('accessLevel', sql.NVarChar, 'owner')
          .input('assignedBy', sql.NVarChar, userId)
          .query(`
            INSERT INTO WorkspaceUsers (id, workspaceId, userId, accessLevel, assignedBy)
            VALUES (@id, @workspaceId, @userId, @accessLevel, @assignedBy)
          `);
        
        finalWorkspaceId = workspaceResult.recordset[0].id;
        logger.info(`Created default workspace ${finalWorkspaceId} for user ${userId}`);
      }
    } else {
      // Verify workspace belongs to user or user is assigned to shared workspace
      const workspaceCheck = await pool.request()
        .input('workspaceId', sql.NVarChar, finalWorkspaceId)
        .input('userId', sql.NVarChar, userId)
        .query(`
          SELECT w.id 
          FROM Workspaces w 
          LEFT JOIN WorkspaceUsers wu ON w.id = wu.workspaceId AND wu.userId = @userId
          WHERE w.id = @workspaceId AND (w.ownerId = @userId OR (w.isShared = 1 AND wu.userId = @userId))
        `);
      
      if (workspaceCheck.recordset.length === 0) {
        // Check if workspace exists but doesn't belong to user
        const workspaceExists = await pool.request()
          .input('workspaceId', sql.NVarChar, finalWorkspaceId)
          .query('SELECT id, ownerId, isShared FROM Workspaces WHERE id = @workspaceId');
        
        if (workspaceExists.recordset.length > 0) {
          const workspace = workspaceExists.recordset[0];
          // Workspace exists but user doesn't have access
          logger.warn(`User ${userId} does not have access to workspace ${finalWorkspaceId}. Owner: ${workspace.ownerId}, Shared: ${workspace.isShared}`);
          return res.status(403).json({
            error: 'Access denied',
            message: 'You do not have access to this workspace.'
          });
        } else {
          // Workspace doesn't exist, create a default one
          const defaultWorkspaceId = uuidv4();
          const workspaceResult = await pool.request()
            .input('id', sql.NVarChar, defaultWorkspaceId)
            .input('name', sql.NVarChar, 'Default Workspace')
            .input('description', sql.NVarChar, 'Auto-created default workspace')
            .input('color', sql.NVarChar, '#3B82F6')
            .input('ownerId', sql.NVarChar, userId)
            .query(`
              INSERT INTO Workspaces (id, name, description, color, ownerId, createdAt, updatedAt)
              OUTPUT INSERTED.id
              VALUES (@id, @name, @description, @color, @ownerId, GETUTCDATE(), GETUTCDATE())
            `);
          
          // Also assign the owner to their own workspace
          const assignmentId = uuidv4();
          await pool.request()
            .input('id', sql.NVarChar, assignmentId)
            .input('workspaceId', sql.NVarChar, defaultWorkspaceId)
            .input('userId', sql.NVarChar, userId)
            .input('accessLevel', sql.NVarChar, 'owner')
            .input('assignedBy', sql.NVarChar, userId)
            .query(`
              INSERT INTO WorkspaceUsers (id, workspaceId, userId, accessLevel, assignedBy)
              VALUES (@id, @workspaceId, @userId, @accessLevel, @assignedBy)
            `);
          
          finalWorkspaceId = workspaceResult.recordset[0].id;
          logger.info(`Created default workspace ${finalWorkspaceId} for user ${userId} as fallback`);
        }
      }
    }
    
    // Ensure user exists before creating chat
    const userCheck = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .query('SELECT id FROM Users WHERE id = @userId');
    
    if (userCheck.recordset.length === 0) {
      // Create user if not exists
      if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
        // Check if a user with the same email already exists
        const emailCheck = await pool.request()
          .input('email', sql.NVarChar, `${userId}@example.com`)
          .query('SELECT id FROM Users WHERE email = @email');
        
        if (emailCheck.recordset.length === 0) {
          // Create user if not exists in development mode with bypass auth
          await pool.request()
            .input('id', sql.NVarChar, userId)
            .input('firstName', sql.NVarChar, 'Test')
            .input('lastName', sql.NVarChar, 'User')
            .input('email', sql.NVarChar, `${userId}@example.com`)
            .input('role', sql.NVarChar, req.user.role || 'user')
            .query(`
              INSERT INTO Users (id, firstName, lastName, email, role, isActive, createdAt, updatedAt)
              VALUES (@id, @firstName, @lastName, @email, @role, 1, GETUTCDATE(), GETUTCDATE())
            `);
        } else {
          // If user with email exists, update the user ID
          await pool.request()
            .input('id', sql.NVarChar, userId)
            .input('email', sql.NVarChar, `${userId}@example.com`)
            .query(`
              UPDATE Users SET id = @id WHERE email = @email
            `);
        }
      } else {
        // In production, try to get user by email and create if needed
        // This handles cases where local users might not be properly created
        const emailCheck = await pool.request()
          .input('email', sql.NVarChar, req.user.email || `${userId}@example.com`)
          .query('SELECT id FROM Users WHERE email = @email');
        
        if (emailCheck.recordset.length === 0) {
          // Create the user only if no user with this email exists
          await pool.request()
            .input('id', sql.NVarChar, userId)
            .input('firstName', sql.NVarChar, req.user.email ? req.user.email.split('@')[0] : 'User')
            .input('lastName', sql.NVarChar, '')
            .input('email', sql.NVarChar, req.user.email || `${userId}@example.com`)
            .input('role', sql.NVarChar, req.user.role || 'user')
            .query(`
              INSERT INTO Users (id, firstName, lastName, email, role, isActive, createdAt, updatedAt)
              VALUES (@id, @firstName, @lastName, @email, @role, 1, GETUTCDATE(), GETUTCDATE())
            `);
          logger.info(`Created missing user record for user ${userId}`);
        } else {
          // If user with email exists, update the user ID to match our expected ID
          await pool.request()
            .input('id', sql.NVarChar, userId)
            .input('email', sql.NVarChar, req.user.email || `${userId}@example.com`)
            .query(`
              UPDATE Users SET id = @id WHERE email = @email
            `);
          logger.info(`Updated user ID for user with email ${req.user.email || `${userId}@example.com`}`);
        }
      }
    }
    
    const result = await pool.request()
      .input('id', sql.NVarChar, chatId)
      .input('title', sql.NVarChar, title)
      .input('description', sql.NVarChar, description || '')
      .input('userId', sql.NVarChar, userId)
      .input('workspaceId', sql.NVarChar, finalWorkspaceId)
      .query(`
        INSERT INTO Chats (id, title, description, userId, workspaceId, createdAt, updatedAt)
        OUTPUT INSERTED.*
        VALUES (@id, @title, @description, @userId, @workspaceId, GETUTCDATE(), GETUTCDATE())
      `);
    
    const chat = result.recordset[0];

    res.status(201).json({
      message: 'Chat created successfully',
      chat
    });

    logger.info(`Chat created: ${chatId} for user: ${userId} in workspace: ${finalWorkspaceId}`);
  } catch (error) {
    logger.error('Create chat error:', error);
    res.status(500).json({
      error: 'Failed to create chat',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Send message and get AI response
router.post('/message', validate(schemas.sendMessage), async (req, res) => {
  try {
    // Log the entire request body for debugging
    logger.info('Received message request body:', JSON.stringify(req.body, null, 2));
    logger.info('Request headers:', JSON.stringify(req.headers, null, 2));
    
    const { message, chatId, parentMessageId, useDataAgent, datasetId, workspaceId, files } = req.body;
    const userId = req.user.userId;

    // Validate message content or files
    if ((!message || message.trim().length === 0) && (!files || files.length === 0)) {
      return res.status(400).json({
        error: 'Message content or files are required',
        message: 'Please provide a message or attach files to send'
      });
    }

    // Validate files array structure if present
    if (files && files.length > 0) {
      logger.info(`Processing ${files.length} files`);
      for (const [index, file] of files.entries()) {
        logger.info(`File ${index}:`, JSON.stringify(file, null, 2));
        
        // Check required properties
        if (!file.originalName) {
          logger.error(`File at index ${index} missing originalName:`, JSON.stringify(file));
          return res.status(400).json({
            error: 'Invalid file format',
            message: `File at index ${index} missing originalName property`
          });
        }
        
        if (!file.url) {
          logger.error(`File at index ${index} missing url:`, JSON.stringify(file));
          return res.status(400).json({
            error: 'Invalid file format',
            message: `File at index ${index} missing url property`
          });
        }
        
        // Check if fileName property exists
        if (!file.fileName) {
          logger.warn(`File at index ${index} missing fileName property, will try to extract from URL`);
        }
      }
    }

    // Set a default title for file-only messages
    let defaultTitle = 'New Chat';
    if (!message || message.trim().length === 0) {
      if (files && files.length > 0) {
        defaultTitle = `File: ${files[0].originalName}`;
        if (files.length > 1) {
          defaultTitle += ` and ${files.length - 1} more`;
        }
      }
    }

    const pool = await dbManager.getPool();
    
    // Ensure user exists in database before proceeding
    const userCheck = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .query('SELECT id FROM Users WHERE id = @userId');
    
    if (userCheck.recordset.length === 0) {
      // Create user if not exists
      if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
        // First check if a user with the same email already exists
        const emailCheck = await pool.request()
          .input('email', sql.NVarChar, `${userId}@example.com`)
          .query('SELECT id FROM Users WHERE email = @email');
        
        if (emailCheck.recordset.length === 0) {
          // Create the user only if no user with this email exists
          await pool.request()
            .input('id', sql.NVarChar, userId)
            .input('firstName', sql.NVarChar, 'Test')
            .input('lastName', sql.NVarChar, 'User')
            .input('email', sql.NVarChar, `${userId}@example.com`)
            .input('role', sql.NVarChar, req.user.role || 'user')
            .query(`
              INSERT INTO Users (id, firstName, lastName, email, role, isActive, createdAt, updatedAt)
              VALUES (@id, @firstName, @lastName, @email, @role, 1, GETUTCDATE(), GETUTCDATE())
            `);
        } else {
          // If user with email exists, update the user ID to match our expected ID
          await pool.request()
            .input('id', sql.NVarChar, userId)
            .input('email', sql.NVarChar, `${userId}@example.com`)
            .query(`
              UPDATE Users SET id = @id WHERE email = @email
            `);
        }
      } else {
        // In production, try to get user by email and create if needed
        // This handles cases where local users might not be properly created
        const emailCheck = await pool.request()
          .input('email', sql.NVarChar, req.user.email || `${userId}@example.com`)
          .query('SELECT id FROM Users WHERE email = @email');
        
        if (emailCheck.recordset.length === 0) {
          // Create the user only if no user with this email exists
          await pool.request()
            .input('id', sql.NVarChar, userId)
            .input('firstName', sql.NVarChar, req.user.email ? req.user.email.split('@')[0] : 'User')
            .input('lastName', sql.NVarChar, '')
            .input('email', sql.NVarChar, req.user.email || `${userId}@example.com`)
            .input('role', sql.NVarChar, req.user.role || 'user')
            .query(`
              INSERT INTO Users (id, firstName, lastName, email, role, isActive, createdAt, updatedAt)
              VALUES (@id, @firstName, @lastName, @email, @role, 1, GETUTCDATE(), GETUTCDATE())
            `);
          logger.info(`Created missing user record for user ${userId}`);
        } else {
          // If user with email exists, update the user ID to match our expected ID
          await pool.request()
            .input('id', sql.NVarChar, userId)
            .input('email', sql.NVarChar, req.user.email || `${userId}@example.com`)
            .query(`
              UPDATE Users SET id = @id WHERE email = @email
            `);
          logger.info(`Updated user ID for user with email ${req.user.email || `${userId}@example.com`}`);
        }
      }
    }
    
    // Get or create workspace - handle invalid workspaceId gracefully
    let actualWorkspaceId = workspaceId;
    
    // Validate workspaceId format if provided
    if (actualWorkspaceId) {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(actualWorkspaceId)) {
        logger.warn(`Invalid workspaceId format: ${actualWorkspaceId}, ignoring it`);
        actualWorkspaceId = null;
      }
    }
    
    // Only proceed if workspaceId is valid or create a default one
    if (!actualWorkspaceId) {
      // Check if user has any workspaces (either owned or assigned)
      const workspaceCheck = await pool.request()
        .input('userId', sql.NVarChar, userId)
        .query(`
          SELECT TOP 1 w.id 
          FROM Workspaces w 
          LEFT JOIN WorkspaceUsers wu ON w.id = wu.workspaceId
          WHERE w.ownerId = @userId OR wu.userId = @userId
        `);
      
      if (workspaceCheck.recordset.length > 0) {
        // Use existing workspace
        actualWorkspaceId = workspaceCheck.recordset[0].id;
      } else {
        // Create a default workspace for the user
        const defaultWorkspaceId = uuidv4();
        const workspaceResult = await pool.request()
          .input('id', sql.NVarChar, defaultWorkspaceId)
          .input('name', sql.NVarChar, 'Default Workspace')
          .input('description', sql.NVarChar, 'Auto-created default workspace')
          .input('color', sql.NVarChar, '#3B82F6')
          .input('ownerId', sql.NVarChar, userId)
          .query(`
            INSERT INTO Workspaces (id, name, description, color, ownerId, createdAt, updatedAt)
            OUTPUT INSERTED.id
            VALUES (@id, @name, @description, @color, @ownerId, GETUTCDATE(), GETUTCDATE())
          `);
        
        actualWorkspaceId = workspaceResult.recordset[0].id;
        logger.info(`Created default workspace ${actualWorkspaceId} for user ${userId}`);
      }
    } else {
      // Verify workspace exists and user has access (either owner or assigned to shared workspace)
      const workspaceCheck = await pool.request()
        .input('workspaceId', sql.NVarChar, actualWorkspaceId)
        .input('userId', sql.NVarChar, userId)
        .query(`
          SELECT w.id 
          FROM Workspaces w 
          LEFT JOIN WorkspaceUsers wu ON w.id = wu.workspaceId AND wu.userId = @userId
          WHERE w.id = @workspaceId AND (w.ownerId = @userId OR (w.isShared = 1 AND wu.userId = @userId))
        `);
      
      if (workspaceCheck.recordset.length === 0) {
        logger.warn(`Workspace ${actualWorkspaceId} does not exist or doesn't belong to user ${userId}`);
        // Create a default workspace instead
        const defaultWorkspaceId = uuidv4();
        const workspaceResult = await pool.request()
          .input('id', sql.NVarChar, defaultWorkspaceId)
          .input('name', sql.NVarChar, 'Default Workspace')
          .input('description', sql.NVarChar, 'Auto-created default workspace')
          .input('color', sql.NVarChar, '#3B82F6')
          .input('ownerId', sql.NVarChar, userId)
          .query(`
            INSERT INTO Workspaces (id, name, description, color, ownerId, createdAt, updatedAt)
            OUTPUT INSERTED.id
            VALUES (@id, @name, @description, @color, @ownerId, GETUTCDATE(), GETUTCDATE())
          `);
        
        // Also assign the owner to their own workspace
        const assignmentId = uuidv4();
        await pool.request()
          .input('id', sql.NVarChar, assignmentId)
          .input('workspaceId', sql.NVarChar, defaultWorkspaceId)
          .input('userId', sql.NVarChar, userId)
          .input('accessLevel', sql.NVarChar, 'owner')
          .input('assignedBy', sql.NVarChar, userId)
          .query(`
            INSERT INTO WorkspaceUsers (id, workspaceId, userId, accessLevel, assignedBy)
            VALUES (@id, @workspaceId, @userId, @accessLevel, @assignedBy)
          `);
        
        actualWorkspaceId = workspaceResult.recordset[0].id;
        logger.info(`Created default workspace ${actualWorkspaceId} for user ${userId} as fallback`);
      }
    }

    // Get or create chat
    let actualChatId = chatId;
    let chatTitle = 'New Chat';
    if (!actualChatId) {
      // Create new chat
      actualChatId = uuidv4();
      chatTitle = message ? message.substring(0, 100) : defaultTitle; // Use first 100 chars of message as title or default for files
      
      await pool.request()
        .input('id', sql.NVarChar, actualChatId)
        .input('userId', sql.NVarChar, userId)
        .input('workspaceId', sql.NVarChar, actualWorkspaceId)
        .input('title', sql.NVarChar, chatTitle)
        .input('description', sql.NVarChar, 'Auto-generated chat')
        .query(`
          INSERT INTO Chats (id, userId, workspaceId, title, description, messageCount, createdAt, updatedAt)
          VALUES (@id, @userId, @workspaceId, @title, @description, 0, GETUTCDATE(), GETUTCDATE())
        `);
    } else {
      // Verify existing chat exists and belongs to user
      const chatResult = await pool.request()
        .input('id', sql.NVarChar, actualChatId)
        .input('userId', sql.NVarChar, userId)
        .query('SELECT title FROM Chats WHERE id = @id AND userId = @userId');
      
      if (chatResult.recordset.length === 0) {
        logger.error(`Chat ${actualChatId} not found for user ${userId}`);
        return res.status(404).json({
          error: 'Chat not found',
          message: 'The specified chat was not found or does not belong to you.'
        });
      }
      
      chatTitle = chatResult.recordset[0].title;
    }

    // Prepare user message content
    let userMessageContent = message ? message.trim() : '';
    
    // Validate files array if present
    if (files && !Array.isArray(files)) {
      logger.error('Files property is not an array:', files);
      return res.status(400).json({
        error: 'Invalid files format',
        message: 'Files must be an array of file objects'
      });
    }
    
    // Add file information to the message content if files were sent
    if (files && files.length > 0) {
      try {
        // Import FileAnalysisService to read file content
        const { FileAnalysisService } = require('../services/fileAnalysisService');
        const fileAnalysisService = FileAnalysisService.getInstance();
        
        // Extract file contents for AI analysis
        const fileContents = [];
        for (const file of files) {
          try {
            // Validate that file is an object
            if (!file || typeof file !== 'object') {
              logger.error('Invalid file object in files array:', file);
              throw new Error('Invalid file object');
            }
            
            // Validate required file properties
            if (!file.originalName) {
              logger.error(`File missing originalName property: ${JSON.stringify(file)}`);
              throw new Error('File originalName is missing');
            }
            
            // Log the file object to see what properties it has
            logger.info(`Processing file: ${JSON.stringify(file)}`);
            
            // Check if this is a workspace file
            let isWorkspaceFile = false;
            let workspaceId = null;
            
            // Check if file object has workspaceId property
            if (file.workspaceId) {
              isWorkspaceFile = true;
              workspaceId = file.workspaceId;
              logger.info(`Identified workspace file by property: ${file.originalName} in workspace: ${workspaceId}`);
            } 
            // If not explicitly marked as workspace file, check the URL structure
            else if (file.url) {
              try {
                const url = new URL(file.url);
                const pathParts = url.pathname.split('/');
                // Check if any part of the path indicates a workspace container
                const workspaceContainerIndex = pathParts.findIndex(part => part.startsWith('workspace-'));
                if (workspaceContainerIndex !== -1) {
                  isWorkspaceFile = true;
                  // Extract workspace ID from container name (format: workspace-{name}-{id})
                  const containerName = pathParts[workspaceContainerIndex];
                  const containerParts = containerName.split('-');
                  if (containerParts.length >= 3) {
                    workspaceId = containerParts[containerParts.length - 1];
                    logger.info(`Identified workspace file by URL: ${file.originalName} in workspace: ${workspaceId}`);
                  }
                }
              } catch (urlError) {
                logger.warn('Failed to parse file URL for workspace detection:', urlError);
              }
            }
            
            // Extract the blob name - check for various possible property names
            let blobName = file.fileName || file.name || file.blobName;
            
            // If we still don't have a blobName, try to extract it from the URL
            if (!blobName && file.url) {
              try {
                const url = new URL(file.url);
                // Extract the blob name from the URL path
                // For Azure Blob Storage URLs, we need the path after the container name
                const pathParts = url.pathname.split('/');
                
                if (isWorkspaceFile && workspaceId) {
                  // For workspace files, find the workspace container
                  const containerIndex = pathParts.findIndex(part => part.startsWith('workspace-'));
                  if (containerIndex !== -1 && containerIndex < pathParts.length - 1) {
                    // Take all parts after the container name
                    blobName = pathParts.slice(containerIndex + 1).join('/');
                  } else {
                    // Fallback to the last part of the path
                    blobName = pathParts[pathParts.length - 1];
                  }
                } else {
                  // For regular files, find the regular container name index
                  const containerIndex = pathParts.findIndex(part => part === (process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files'));
                  if (containerIndex !== -1 && containerIndex < pathParts.length - 1) {
                    // Take all parts after the container name
                    blobName = pathParts.slice(containerIndex + 1).join('/');
                  } else {
                    // Fallback to the last part of the path
                    blobName = pathParts[pathParts.length - 1];
                  }
                }
                logger.info(`Extracted blobName from URL: ${blobName}`);
              } catch (urlError) {
                logger.warn('Failed to parse file URL:', urlError);
              }
            }
            
            // Check if blobName is valid
            if (!blobName) {
              logger.warn(`Could not determine blobName for file, using originalName as fallback: ${file.originalName}`);
              // Use the originalName as fallback - try to get from storage first
              try {
                // Try to get file content from storage using the original name structure
                const content = await fileAnalysisService.extractFileContent(file.originalName, file.originalName);
                fileContents.push({
                  name: file.originalName,
                  content: content.content
                });
              } catch (contentError) {
                logger.error(`Failed to extract content for ${file.originalName}:`, contentError);
                // Add a placeholder if content extraction fails
                fileContents.push({
                  name: file.originalName,
                  content: `[Content not available for file: ${file.originalName}]`
                });
              }
              continue;
            }
            
            // Get file content
            try {
              // If this is a workspace file, we need to get the workspace name for the container
              if (isWorkspaceFile && workspaceId) {
                // Get workspace name from database
                const workspaceResult = await pool.request()
                  .input('id', sql.NVarChar, workspaceId)
                  .query('SELECT name FROM Workspaces WHERE id = @id');
                
                if (workspaceResult.recordset.length > 0) {
                  const workspaceName = workspaceResult.recordset[0].name;
                  // For workspace files, we need to use the workspace-specific container
                  const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
                  const containerName = `workspace-${sanitizedWorkspaceName}-${workspaceId}`;
                  
                  // Create a temporary file object with workspace container info for the file analysis service
                  const workspaceFileRef = {
                    blobName: blobName,
                    containerName: containerName,
                    originalName: file.originalName
                  };
                  
                  // TODO: Modify fileAnalysisService to handle workspace files properly
                  // For now, we'll try the regular approach but log the workspace info
                  logger.info(`Processing workspace file from container ${containerName}: ${blobName}`);
                } else {
                  logger.warn(`Workspace ${workspaceId} not found for file ${file.originalName}`);
                }
              }
              
              // If this is a workspace file, pass the container name
              let containerName = undefined;
              if (isWorkspaceFile && workspaceId) {
                // Get workspace name from database
                const workspaceResult = await pool.request()
                  .input('id', sql.NVarChar, workspaceId)
                  .query('SELECT name FROM Workspaces WHERE id = @id');
                
                if (workspaceResult.recordset.length > 0) {
                  const workspaceName = workspaceResult.recordset[0].name;
                  // For workspace files, we need to use the workspace-specific container
                  const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
                  containerName = `workspace-${sanitizedWorkspaceName}-${workspaceId}`;
                  logger.info(`Using workspace container for file extraction: ${containerName}`);
                } else {
                  // If we can't find the workspace, try to extract container name from URL
                  logger.warn(`Workspace ${workspaceId} not found for file ${file.originalName}, trying to extract container from URL`);
                  if (file.url) {
                    try {
                      const url = new URL(file.url);
                      const pathParts = url.pathname.split('/');
                      const containerIndex = pathParts.findIndex(part => part.startsWith('workspace-'));
                      if (containerIndex !== -1) {
                        containerName = pathParts[containerIndex];
                        logger.info(`Extracted container name from URL: ${containerName}`);
                      }
                    } catch (urlError) {
                      logger.warn('Failed to extract container from URL:', urlError);
                    }
                  }
                  
                  if (!containerName) {
                    logger.warn(`Workspace ${workspaceId} not found and could not extract container from URL for file ${file.originalName}`);
                  }
                }
              }
              
              const content = await fileAnalysisService.extractFileContent(blobName, file.originalName, containerName);
              fileContents.push({
                name: file.originalName,
                content: content.content
              });
            } catch (contentError) {
              logger.error(`Failed to extract content for ${file.originalName} with blobName ${blobName}:`, contentError);
              // Add a placeholder if content extraction fails
              fileContents.push({
                name: file.originalName,
                content: `[Content not available for file: ${file.originalName}]`
              });
            }
          } catch (error) {
            logger.warn(`Failed to read content for file ${file.originalName || 'unknown'}:`, error);
            fileContents.push({
              name: file.originalName || 'Unknown File',
              content: `[Content not available: ${error instanceof Error ? error.message : 'Unknown error'}]`
            });
            continue;
          }
        }
        
        // Format file contents for the AI
        const fileContentSection = fileContents.map((f: any) => 
          `File: ${f.name}
Content:
${f.content}
---
`
        ).join('\n');
        
        if (userMessageContent) {
          userMessageContent += `\n\nAttached Files:\n${fileContentSection}`;
        } else {
          userMessageContent = `Analyze the following files:\n\n${fileContentSection}`;
        }
      } catch (fileProcessingError) {
        logger.error('Error processing files:', fileProcessingError);
        // Continue with the message even if file processing fails
        if (!userMessageContent) {
          userMessageContent = 'User sent files but there was an error processing them.';
        }
      }
    }
    
    // If no message content and no files, return an error
    if (!userMessageContent) {
      return res.status(400).json({
        error: 'Message content or files are required',
        message: 'Please provide a message or attach files to send'
      });
    }

    // Store user message in database
    const userMessageId = uuidv4();
    
    try {
      await pool.request()
        .input('id', sql.NVarChar, userMessageId)
        .input('chatId', sql.NVarChar, actualChatId)
        .input('userId', sql.NVarChar, userId)
        .input('content', sql.NVarChar, userMessageContent)
        .input('role', sql.NVarChar, 'user')
        .query(`
          INSERT INTO Messages (id, chatId, userId, content, role, createdAt)
          VALUES (@id, @chatId, @userId, @content, @role, GETUTCDATE())
        `);
    } catch (insertError) {
      logger.error(`Failed to insert user message into chat ${actualChatId}:`, insertError);
      return res.status(500).json({
        error: 'Failed to save message',
        message: 'There was an error saving your message. Please try again.'
      });
    }

    // Get chat history for context
    const historyResult = await pool.request()
      .input('chatId', sql.NVarChar, actualChatId)
      .query('SELECT content, role FROM Messages WHERE chatId = @chatId ORDER BY createdAt ASC');

    // Prepare messages for OpenAI
    const chatHistory = historyResult.recordset.map((msg: any) => ({
      role: msg.role,
      content: msg.content
    }));

    // Get AI response using OpenAI service with RAG support
    let aiResponseContent = '';
    let openAIError = null;
    
    try {
      // Import services
      const { OpenAIService } = require('../services/openai');
      const { RAGService } = require('../services/ragService');
      const openAIService = OpenAIService.getInstance();
      const ragService = RAGService.getInstance();
      
      // Get workspace information if available
      let workspaceName = null;
      if (actualWorkspaceId) {
        const workspaceResult = await pool.request()
          .input('workspaceId', sql.NVarChar, actualWorkspaceId)
          .query('SELECT name FROM Workspaces WHERE id = @workspaceId');
        
        if (workspaceResult.recordset.length > 0) {
          workspaceName = workspaceResult.recordset[0].name;
        }
      }
      
      // Get relevant documents using RAG if workspace is selected
      const relevantDocuments = await ragService.getRelevantDocuments(
        userMessageContent, 
        actualWorkspaceId, 
        workspaceName
      );
      
      // Format documents context
      const documentsContext = ragService.formatDocumentsContext(relevantDocuments);
      
      // Prepare user message with document context if available
      let finalUserMessage = userMessageContent;
      if (documentsContext) {
        finalUserMessage = `Context from workspace documents:\n${documentsContext}\n\nQuestion: ${userMessageContent}`;
      }
      
      // Prepare RAG context for system prompt
      const ragContext = {
        documents: relevantDocuments,
        workspaceId: actualWorkspaceId,
        workspaceName: workspaceName
      };
      
      // Prepare messages with system prompt including RAG context
      const messages = [
        {
          role: 'system',
          content: openAIService.getSystemPrompt(ragContext)
        },
        ...chatHistory,
        {
          role: 'user',
          content: finalUserMessage
        }
      ];

      // Get AI response
      const aiResponse = await openAIService.getChatCompletion(messages, {
        maxTokens: 1000,
        temperature: 0.7
      });
      
      aiResponseContent = aiResponse.content;
    } catch (error) {
      logger.error('OpenAI API error:', error);
      openAIError = error;
      // We'll handle this error after storing the user message
    }

    // If OpenAI failed, return an appropriate error response
    if (openAIError) {
      // Store a placeholder AI response in database
      const aiMessageId = uuidv4();
      const errorMessage = 'Sorry, I encountered an issue processing your request. Please try again.';
      
      try {
        await pool.request()
          .input('id', sql.NVarChar, aiMessageId)
          .input('chatId', sql.NVarChar, actualChatId)
          .input('userId', sql.NVarChar, userId)
          .input('content', sql.NVarChar, errorMessage)
          .input('role', sql.NVarChar, 'assistant')
          .query(`
            INSERT INTO Messages (id, chatId, userId, content, role, createdAt)
            VALUES (@id, @chatId, @userId, @content, @role, GETUTCDATE())
          `);
      } catch (insertError) {
        logger.error(`Failed to insert error message into chat ${actualChatId}:`, insertError);
        // Continue anyway since this is just a placeholder
      }

      // Update chat message count
      try {
        await pool.request()
          .input('chatId', sql.NVarChar, actualChatId)
          .query('UPDATE Chats SET messageCount = messageCount + 2, lastMessageAt = GETUTCDATE(), updatedAt = GETUTCDATE() WHERE id = @chatId');
      } catch (updateError) {
        logger.error(`Failed to update chat ${actualChatId} message count:`, updateError);
        // Continue anyway since this is just metadata
      }

      // Return error response
      return res.status(500).json({
        error: 'Failed to get AI response',
        message: 'Sorry, there was an error processing your message. Please try again.',
        details: openAIError instanceof Error ? openAIError.message : 'Unknown error'
      });
    }

    // Store AI response in database
    const aiMessageId = uuidv4();
    
    try {
      await pool.request()
        .input('id', sql.NVarChar, aiMessageId)
        .input('chatId', sql.NVarChar, actualChatId)
        .input('userId', sql.NVarChar, userId)
        .input('content', sql.NVarChar, aiResponseContent)
        .input('role', sql.NVarChar, 'assistant')
        .query(`
          INSERT INTO Messages (id, chatId, userId, content, role, createdAt)
          VALUES (@id, @chatId, @userId, @content, @role, GETUTCDATE())
        `);
    } catch (insertError) {
      logger.error(`Failed to insert AI message into chat ${actualChatId}:`, insertError);
      // Even if we can't save the AI response, we should still return it to the user
      // Return both messages with AI response
      return res.status(200).json({
        message: 'Message processed successfully (but not saved)',
        chatId: actualChatId,
        userMessage: {
          id: userMessageId,
          content: userMessageContent,
          role: 'user',
          timestamp: new Date().toISOString()
        },
        aiResponse: {
          id: aiMessageId,
          content: aiResponseContent,
          role: 'assistant',
          timestamp: new Date().toISOString()
        },
        warning: 'Message could not be saved to database'
      });
    }

    // Update chat message count
    try {
      await pool.request()
        .input('chatId', sql.NVarChar, actualChatId)
        .query('UPDATE Chats SET messageCount = messageCount + 2, lastMessageAt = GETUTCDATE(), updatedAt = GETUTCDATE() WHERE id = @chatId');
    } catch (updateError) {
      logger.error(`Failed to update chat ${actualChatId} message count:`, updateError);
      // Continue anyway since this is just metadata
    }

    // Return both messages with AI response
    res.status(200).json({
      message: 'Message processed successfully',
      chatId: actualChatId,
      userMessage: {
        id: userMessageId,
        content: userMessageContent,
        role: 'user',
        timestamp: new Date().toISOString()
      },
      aiResponse: {
        id: aiMessageId,
        content: aiResponseContent,
        role: 'assistant',
        timestamp: new Date().toISOString()
      }
    });

    logger.info(`Message processed for user ${userId} in chat ${actualChatId}`);
  } catch (error) {
    logger.error('Send message error:', error);
    
    // Return a proper error response instead of a fake success
    res.status(500).json({
      error: 'Failed to process message',
      message: 'Sorry, there was an error processing your message. Please try again.',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Helper function to check if message contains data-related keywords
function containsDataKeywords(message: string): boolean {
  const dataKeywords = [
    'show me', 'what is', 'how many', 'total', 'sum', 'average', 'count',
    'sales', 'revenue', 'profit', 'customers', 'orders', 'products',
    'last month', 'this year', 'trend', 'performance', 'report',
    'data', 'analytics', 'metrics', 'kpi', 'dashboard'
  ];
  
  const lowerMessage = message.toLowerCase();
  return dataKeywords.some(keyword => lowerMessage.includes(keyword));
}

// Helper function to get regular AI response
async function getRegularAIResponse(chatHistory: any[], openAIService: any) {
  const messages = [
    {
      role: 'system',
      content: openAIService.getSystemPrompt()
    },
    ...chatHistory.slice(-10).map((msg: any) => ({
      role: msg.role,
      content: msg.content
    }))
  ];

  return await openAIService.getChatCompletion(messages, {
    maxTokens: 1000,
    temperature: 0.7
  });
}

// Get messages for a specific chat
router.get('/:chatId/messages', validate(schemas.chatIdParam), validate(schemas.pagination), async (req, res) => {
  try {
    const { chatId } = req.params;
    const { page = 1, limit = 50 } = req.query;
    const userId = req.user.userId;
    
    const pool = await dbManager.getPool();
    const offset = (Number(page) - 1) * Number(limit);

    // Verify chat belongs to user (basic security check)
    const chatCheck = await pool.request()
      .input('chatId', sql.NVarChar, chatId)
      .input('userId', sql.NVarChar, userId)
      .query('SELECT id FROM Chats WHERE id = @chatId AND userId = @userId');

    if (chatCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Chat not found',
        message: 'Chat not found or access denied'
      });
    }

    const result = await pool.request()
      .input('chatId', sql.NVarChar, chatId)
      .input('limit', sql.Int, Number(limit))
      .input('offset', sql.Int, offset)
      .query(`
        SELECT 
          m.*,
          (SELECT COUNT(*) FROM MessageActions WHERE messageId = m.id AND actionType = 'like') as likeCount,
          (SELECT COUNT(*) FROM MessageActions WHERE messageId = m.id AND actionType = 'bookmark') as bookmarkCount
        FROM Messages m
        WHERE m.chatId = @chatId
        ORDER BY m.createdAt ASC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);
    
    const countResult = await pool.request()
      .input('chatId', sql.NVarChar, chatId)
      .query('SELECT COUNT(*) as total FROM Messages WHERE chatId = @chatId');
    
    const total = countResult.recordset[0].total;

    res.json({
      message: 'Messages retrieved successfully',
      messages: result.recordset,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.error('Get messages error:', error);
    res.status(500).json({
      error: 'Failed to retrieve messages'
    });
  }
});

// Delete chat
router.delete('/:chatId', validate(schemas.chatIdParam), async (req, res) => {
  try {
    const { chatId } = req.params;
    const userId = req.user.userId;
    
    const pool = await dbManager.getPool();

    // Verify chat belongs to user
    const chatCheck = await pool.request()
      .input('chatId', sql.NVarChar, chatId)
      .input('userId', sql.NVarChar, userId)
      .query('SELECT id FROM Chats WHERE id = @chatId AND userId = @userId');

    if (chatCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Chat not found',
        message: 'Chat not found or access denied'
      });
    }

    // Soft delete the chat
    await pool.request()
      .input('chatId', sql.NVarChar, chatId)
      .query(`
        UPDATE Chats 
        SET isArchived = 1, updatedAt = GETUTCDATE()
        WHERE id = @chatId
      `);
    
    res.json({
      message: 'Chat archived successfully',
      chatId
    });

    logger.info(`Chat deletion requested: ${chatId} by user: ${userId}`);
  } catch (error) {
    logger.error('Delete chat error:', error);
    res.status(500).json({
      error: 'Failed to delete chat'
    });
  }
});

// Message actions (like, bookmark, etc.)
router.post('/:chatId/messages/:messageId/actions', 
  validate(schemas.chatIdParam), 
  validate(schemas.messageIdParam),
  async (req, res) => {
    try {
      const { chatId, messageId } = req.params;
      const { actionType } = req.body;
      const userId = req.user.userId;
      
      if (!['like', 'dislike', 'bookmark', 'star'].includes(actionType)) {
        return res.status(400).json({
          error: 'Invalid action type',
          message: 'Action type must be one of: like, dislike, bookmark, star'
        });
      }
      
      const pool = await dbManager.getPool();
      
      // Verify message belongs to user's chat
      const messageCheck = await pool.request()
        .input('messageId', sql.NVarChar, messageId)
        .input('chatId', sql.NVarChar, chatId)
        .input('userId', sql.NVarChar, userId)
        .query(`
          SELECT m.id FROM Messages m
          JOIN Chats c ON m.chatId = c.id
          WHERE m.id = @messageId AND m.chatId = @chatId AND c.userId = @userId
        `);
      
      if (messageCheck.recordset.length === 0) {
        return res.status(404).json({
          error: 'Message not found',
          message: 'Message not found or access denied'
        });
      }
      
      // Toggle action
      const existingAction = await pool.request()
        .input('messageId', sql.NVarChar, messageId)
        .input('userId', sql.NVarChar, userId)
        .input('actionType', sql.NVarChar, actionType)
        .query(`
          SELECT id FROM MessageActions 
          WHERE messageId = @messageId AND userId = @userId AND actionType = @actionType
        `);
      
      if (existingAction.recordset.length > 0) {
        // Remove action
        await pool.request()
          .input('messageId', sql.NVarChar, messageId)
          .input('userId', sql.NVarChar, userId)
          .input('actionType', sql.NVarChar, actionType)
          .query(`
            DELETE FROM MessageActions 
            WHERE messageId = @messageId AND userId = @userId AND actionType = @actionType
          `);
        
        res.json({ message: 'Action removed', actionType, active: false });
      } else {
        // Add action
        const actionId = uuidv4();
        await pool.request()
          .input('id', sql.NVarChar, actionId)
          .input('messageId', sql.NVarChar, messageId)
          .input('userId', sql.NVarChar, userId)
          .input('actionType', sql.NVarChar, actionType)
          .query(`
            INSERT INTO MessageActions (id, messageId, userId, actionType)
            VALUES (@id, @messageId, @userId, @actionType)
          `);
        
        res.json({ message: 'Action added', actionType, active: true });
      }
    } catch (error) {
      logger.error('Message action error:', error);
      res.status(500).json({
        error: 'Failed to process message action'
      });
    }
  }
);

export { router as chatRoutes };