import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { DatabaseManager } from '../config/database';
import { logger } from '../utils/logger';
import sql from 'mssql';

const router = express.Router();
const dbManager = DatabaseManager.getInstance();

// Database helper functions
async function getUserChatHistory(userId: string, limit: number = 50) {
  try {
    const pool = await dbManager.getPool();
    const result = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit) c.*, 
               (SELECT TOP 1 content FROM Messages m WHERE m.chatId = c.id ORDER BY m.createdAt DESC) as lastMessage
        FROM Chats c
        WHERE c.userId = @userId AND c.isArchived = 0
        ORDER BY ISNULL(c.lastMessageAt, c.updatedAt) DESC, c.createdAt DESC
      `);
    
    return result.recordset.map(chat => ({
      id: chat.id,
      title: chat.title,
      description: chat.description,
      date: chat.lastMessageAt || chat.createdAt,
      messageCount: chat.messageCount,
      lastMessage: chat.lastMessage || 'No messages yet'
    }));
  } catch (error) {
    logger.error('Error getting user chat history:', error);
    throw error;
  }
}

async function getChatsByUserId(userId: string) {
  try {
    const pool = await dbManager.getPool();
    const result = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .query('SELECT * FROM Chats WHERE userId = @userId ORDER BY createdAt DESC');
    
    return result.recordset;
  } catch (error) {
    logger.error('Error getting chats:', error);
    throw error;
  }
}

async function getMessagesByChatId(chatId: string) {
  try {
    const pool = await dbManager.getPool();
    const result = await pool.request()
      .input('chatId', sql.NVarChar, chatId)
      .query('SELECT * FROM Messages WHERE chatId = @chatId ORDER BY createdAt ASC');
    
    return result.recordset.map(message => ({
      ...message,
      metadata: message.metadata ? JSON.parse(message.metadata) : null
    }));
  } catch (error) {
    logger.error('Error getting messages:', error);
    throw error;
  }
}

// Apply authentication to all history routes
router.use(authenticateToken);

// Get user chat history
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const limit = parseInt(req.query.limit as string) || 50;
    
    const pool = await dbManager.getPool();
    const result = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .input('limit', sql.Int, limit)
      .query(`
        SELECT TOP (@limit) c.*, 
               (SELECT TOP 1 content FROM Messages m WHERE m.chatId = c.id ORDER BY m.createdAt DESC) as lastMessage
        FROM Chats c
        WHERE c.userId = @userId AND c.isArchived = 0
        ORDER BY ISNULL(c.lastMessageAt, c.updatedAt) DESC, c.createdAt DESC
      `);
    
    const chatHistory = result.recordset.map(chat => ({
      id: chat.id,
      title: chat.title,
      description: chat.description,
      date: chat.lastMessageAt || chat.createdAt,
      messageCount: chat.messageCount,
      lastMessage: chat.lastMessage || 'No messages yet'
    }));

    res.json({
      message: 'Chat history retrieved successfully',
      chatHistory
    });
  } catch (error) {
    logger.error('Get chat history error:', error);
    res.status(500).json({
      error: 'Failed to retrieve chat history'
    });
  }
});

// Get specific chat details with messages
router.get('/:chatId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { chatId } = req.params;

    const pool = await dbManager.getPool();
    
    // First verify that the chat belongs to the user
    const chatCheck = await pool.request()
      .input('chatId', sql.NVarChar, chatId)
      .input('userId', sql.NVarChar, userId)
      .query('SELECT id FROM Chats WHERE id = @chatId AND userId = @userId');

    if (chatCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Chat not found',
        message: 'The requested chat does not exist or you do not have access to it'
      });
    }

    // Get the chat details
    const chatResult = await pool.request()
      .input('chatId', sql.NVarChar, chatId)
      .query('SELECT * FROM Chats WHERE id = @chatId');
    
    const chat = chatResult.recordset[0];

    // Get all messages for this chat
    const messages = await getMessagesByChatId(chatId);

    res.json({
      message: 'Chat details retrieved successfully',
      chat: {
        ...chat,
        messages
      }
    });
  } catch (error) {
    logger.error('Get chat details error:', error);
    res.status(500).json({
      error: 'Failed to retrieve chat details'
    });
  }
});

export { router as historyRoutes };