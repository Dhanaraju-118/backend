import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { DatabaseManager } from '../config/database';
import { logger } from '../utils/logger';
import sql from 'mssql';
import { v4 as uuidv4 } from 'uuid';
import { validate } from '../middleware/validation';
import { schemas } from '../middleware/validation';

const router = express.Router();
const dbManager = DatabaseManager.getInstance();

// Apply authentication to all message action routes
router.use(authenticateToken);

// Get liked messages
router.get('/liked', async (req, res) => {
  try {
    const userId = req.user.userId;
    console.log('🔍 Getting liked messages for user:', userId);
    
    const pool = await dbManager.getPool();
    const result = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .query(`
        SELECT ma.*, m.content as messageContent, m.role as messageRole, m.createdAt as messageCreatedAt,
               c.title as chatTitle
        FROM MessageActions ma
        INNER JOIN Messages m ON ma.messageId = m.id
        INNER JOIN Chats c ON m.chatId = c.id
        WHERE ma.userId = @userId AND ma.actionType = 'like'
        ORDER BY ma.createdAt DESC
      `);
    
    console.log('📋 Database query returned', result.recordset.length, 'records');
    
    const messages = result.recordset.map(record => ({
      id: record.messageId,
      title: `${record.chatTitle || 'Untitled Chat'} - ${record.messageRole === 'assistant' ? 'AI Response' : 'User Message'}`,
      description: record.messageContent ? (record.messageContent.length > 100 ? record.messageContent.substring(0, 100) + '...' : record.messageContent) : 'No content available',
      date: record.messageCreatedAt ? new Date(record.messageCreatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      type: 'Conversation',
      category: 'Conversation'
    }));

    console.log('✅ Mapped', messages.length, 'messages for response');
    
    res.json({
      message: 'Liked messages retrieved successfully',
      messages
    });
  } catch (error) {
    logger.error('Get liked messages error:', error);
    res.status(500).json({
      error: 'Failed to retrieve liked messages'
    });
  }
});

// Get disliked messages
router.get('/disliked', async (req, res) => {
  try {
    const userId = req.user.userId;
    
    const pool = await dbManager.getPool();
    const result = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .query(`
        SELECT ma.*, m.content as messageContent, m.role as messageRole, m.createdAt as messageCreatedAt,
               c.title as chatTitle
        FROM MessageActions ma
        INNER JOIN Messages m ON ma.messageId = m.id
        INNER JOIN Chats c ON m.chatId = c.id
        WHERE ma.userId = @userId AND ma.actionType = 'dislike'
        ORDER BY ma.createdAt DESC
      `);
    
    const messages = result.recordset.map(record => ({
      id: record.messageId,
      title: `${record.chatTitle || 'Untitled Chat'} - ${record.messageRole === 'assistant' ? 'AI Response' : 'User Message'}`,
      description: record.messageContent ? (record.messageContent.length > 100 ? record.messageContent.substring(0, 100) + '...' : record.messageContent) : 'No content available',
      date: record.messageCreatedAt ? new Date(record.messageCreatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      type: 'Conversation',
      category: 'Conversation'
    }));

    res.json({
      message: 'Disliked messages retrieved successfully',
      messages
    });
  } catch (error) {
    logger.error('Get disliked messages error:', error);
    res.status(500).json({
      error: 'Failed to retrieve disliked messages'
    });
  }
});

// Add message action (like, dislike, star, bookmark)
router.post('/:messageId/:actionType', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { messageId, actionType } = req.params;

    // Validate action type
    const validActions = ['like', 'dislike', 'star', 'bookmark'];
    if (!validActions.includes(actionType)) {
      return res.status(400).json({
        error: 'Invalid action type',
        message: 'Action type must be one of: like, dislike, star, bookmark'
      });
    }

    // If liking, remove any existing dislike (and vice versa)
    if (actionType === 'like') {
      await removeMessageAction(userId, messageId, 'dislike');
    } else if (actionType === 'dislike') {
      await removeMessageAction(userId, messageId, 'like');
    }

    await addMessageAction(userId, messageId, actionType);

    res.status(201).json({
      message: `Message ${actionType} added successfully`
    });

    logger.info(`Message action added: ${actionType} for user: ${userId}, message: ${messageId}`);
  } catch (error) {
    logger.error('Add message action error:', error);
    
    // Provide more specific error messages
    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({
          error: 'Message not found',
          message: 'The specified message could not be found'
        });
      }
      
      if (error.message.includes('Access denied')) {
        return res.status(403).json({
          error: 'Access denied',
          message: 'You do not have permission to perform this action on this message'
        });
      }
    }
    
    res.status(500).json({
      error: 'Failed to add message action',
      message: 'An error occurred while processing your request. Please try again.'
    });
  }
});

// Remove message action
router.delete('/:messageId/:actionType', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { messageId, actionType } = req.params;

    // Validate action type
    const validActions = ['like', 'dislike', 'star', 'bookmark'];
    if (!validActions.includes(actionType)) {
      return res.status(400).json({
        error: 'Invalid action type',
        message: 'Action type must be one of: like, dislike, star, bookmark'
      });
    }

    await removeMessageAction(userId, messageId, actionType);

    res.json({
      message: `Message ${actionType} removed successfully`
    });

    logger.info(`Message action removed: ${actionType} for user: ${userId}, message: ${messageId}`);
  } catch (error) {
    logger.error('Remove message action error:', error);
    res.status(500).json({
      error: 'Failed to remove message action'
    });
  }
});

async function addMessageAction(userId: string, messageId: string, actionType: string) {
  try {
    // Validate UUID format for messageId - more permissive regex to handle different UUID versions
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(messageId)) {
      logger.warn(`Invalid messageId format: ${messageId}`);
      throw new Error('Invalid messageId format');
    }
    
    // Validate actionType
    const validActions = ['like', 'dislike', 'star', 'bookmark'];
    if (!validActions.includes(actionType)) {
      logger.warn(`Invalid actionType: ${actionType}`);
      throw new Error('Invalid action type');
    }
    
    const pool = await dbManager.getPool();
    
    // First, verify that the message exists and belongs to a chat owned by the user
    const messageCheck = await pool.request()
      .input('messageId', sql.NVarChar, messageId)
      .input('userId', sql.NVarChar, userId)
      .query(`
        SELECT m.id FROM Messages m
        INNER JOIN Chats c ON m.chatId = c.id
        WHERE m.id = @messageId AND c.userId = @userId
      `);
    
    if (messageCheck.recordset.length === 0) {
      // Log more details for debugging
      logger.warn(`Message access check failed for user ${userId}, message ${messageId}`);
      
      // Check if message exists at all
      const messageExists = await pool.request()
        .input('messageId', sql.NVarChar, messageId)
        .query(`SELECT id FROM Messages WHERE id = @messageId`);
      
      if (messageExists.recordset.length === 0) {
        logger.warn(`Message ${messageId} does not exist in database`);
        throw new Error('Message not found');
      }
      
      // Check if message belongs to user's chat
      const userChatCheck = await pool.request()
        .input('messageId', sql.NVarChar, messageId)
        .input('userId', sql.NVarChar, userId)
        .query(`
          SELECT m.id FROM Messages m
          INNER JOIN Chats c ON m.chatId = c.id
          WHERE m.id = @messageId AND c.userId = @userId
        `);
      
      if (userChatCheck.recordset.length === 0) {
        logger.warn(`Message ${messageId} exists but does not belong to user ${userId}`);
        throw new Error('Access denied: Message does not belong to your chat');
      }
      
      // If we get here, there's an unexpected condition
      throw new Error('Message not found or access denied');
    }
    
    const actionId = uuidv4();
    
    // First, remove any existing action of this type for this message/user to avoid duplicates
    await pool.request()
      .input('messageId', sql.NVarChar, messageId)
      .input('userId', sql.NVarChar, userId)
      .input('actionType', sql.NVarChar, actionType)
      .query(`
        DELETE FROM MessageActions 
        WHERE messageId = @messageId AND userId = @userId AND actionType = @actionType
      `);
    
    // Then add the new action with createdAt timestamp
    await pool.request()
      .input('id', sql.NVarChar, actionId)
      .input('messageId', sql.NVarChar, messageId)
      .input('userId', sql.NVarChar, userId)
      .input('actionType', sql.NVarChar, actionType)
      .query(`
        INSERT INTO MessageActions (id, messageId, userId, actionType, createdAt)
        VALUES (@id, @messageId, @userId, @actionType, GETUTCDATE())
      `);
    
    logger.info(`Message action added: ${actionType} for message: ${messageId} user: ${userId}`);
  } catch (error) {
    logger.error('Error adding message action:', error);
    throw error;
  }
}

async function removeMessageAction(userId: string, messageId: string, actionType: string) {
  try {
    // Validate UUID format for messageId - more permissive regex to handle different UUID versions
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(messageId)) {
      logger.warn(`Invalid messageId format: ${messageId}`);
      throw new Error('Invalid messageId format');
    }
    
    // Validate actionType
    const validActions = ['like', 'dislike', 'star', 'bookmark'];
    if (!validActions.includes(actionType)) {
      logger.warn(`Invalid actionType: ${actionType}`);
      throw new Error('Invalid action type');
    }
    
    const pool = await dbManager.getPool();
    await pool.request()
      .input('messageId', sql.NVarChar, messageId)
      .input('userId', sql.NVarChar, userId)
      .input('actionType', sql.NVarChar, actionType)
      .query(`
        DELETE FROM MessageActions 
        WHERE messageId = @messageId AND userId = @userId AND actionType = @actionType
      `);
    
    logger.info(`Message action removed: ${actionType} for message: ${messageId} user: ${userId}`);
  } catch (error) {
    logger.error('Error removing message action:', error);
    throw error;
  }
}

export { router as messageActionRoutes };