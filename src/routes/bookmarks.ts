import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { DatabaseManager } from '../config/database';
import { logger } from '../utils/logger';
import sql from 'mssql';
import { v4 as uuidv4 } from 'uuid';

const router = express.Router();
const dbManager = DatabaseManager.getInstance();

// Database helper functions
async function getUserBookmarks(userId: string) {
  try {
    const pool = await dbManager.getPool();
    const result = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .query(`
        SELECT ma.*, m.content as messageContent, m.role as messageRole, m.createdAt as messageCreatedAt,
               c.title as chatTitle
        FROM MessageActions ma
        INNER JOIN Messages m ON ma.messageId = m.id
        INNER JOIN Chats c ON m.chatId = c.id
        WHERE ma.userId = @userId AND ma.actionType = 'bookmark'
        ORDER BY ma.createdAt DESC
      `);
    
    return result.recordset.map(record => ({
      id: record.messageId,
      title: `${record.chatTitle || 'Untitled Chat'} - ${record.messageRole === 'assistant' ? 'AI Response' : 'User Message'}`,
      description: record.messageContent ? (record.messageContent.length > 100 ? record.messageContent.substring(0, 100) + '...' : record.messageContent) : 'No content available',
      date: record.messageCreatedAt ? new Date(record.messageCreatedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      type: 'Conversation',
      category: 'Conversation'
    }));
  } catch (error) {
    logger.error('Error getting user bookmarks:', error);
    throw error;
  }
}

async function addBookmark(userId: string, messageId: string) {
  try {
    const pool = await dbManager.getPool();
    const bookmarkId = uuidv4();
    
    await pool.request()
      .input('id', sql.NVarChar, bookmarkId)
      .input('messageId', sql.NVarChar, messageId)
      .input('userId', sql.NVarChar, userId)
      .input('actionType', sql.NVarChar, 'bookmark')
      .query(`
        INSERT INTO MessageActions (id, messageId, userId, actionType)
        VALUES (@id, @messageId, @userId, @actionType)
      `);
    
    logger.info(`Bookmark added: ${bookmarkId} for user: ${userId}`);
  } catch (error) {
    logger.error('Error adding bookmark:', error);
    throw error;
  }
}

async function removeBookmark(userId: string, messageId: string) {
  try {
    const pool = await dbManager.getPool();
    await pool.request()
      .input('messageId', sql.NVarChar, messageId)
      .input('userId', sql.NVarChar, userId)
      .input('actionType', sql.NVarChar, 'bookmark')
      .query(`
        DELETE FROM MessageActions 
        WHERE messageId = @messageId AND userId = @userId AND actionType = @actionType
      `);
    
    logger.info(`Bookmark removed for message: ${messageId} user: ${userId}`);
  } catch (error) {
    logger.error('Error removing bookmark:', error);
    throw error;
  }
}

// Apply authentication to all bookmark routes
router.use(authenticateToken);

// Get user bookmarks
router.get('/', async (req, res) => {
  try {
    const userId = req.user.userId;
    const bookmarks = await getUserBookmarks(userId);

    res.json({
      message: 'Bookmarks retrieved successfully',
      bookmarks
    });
  } catch (error) {
    logger.error('Get bookmarks error:', error);
    res.status(500).json({
      error: 'Failed to retrieve bookmarks'
    });
  }
});

// Add bookmark
router.post('/:messageId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { messageId } = req.params;

    await addBookmark(userId, messageId);

    res.status(201).json({
      message: 'Bookmark added successfully'
    });

    logger.info(`Bookmark added for user: ${userId}, message: ${messageId}`);
  } catch (error) {
    logger.error('Add bookmark error:', error);
    res.status(500).json({
      error: 'Failed to add bookmark'
    });
  }
});

// Remove bookmark
router.delete('/:messageId', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { messageId } = req.params;

    await removeBookmark(userId, messageId);

    res.json({
      message: 'Bookmark removed successfully'
    });

    logger.info(`Bookmark removed for user: ${userId}, message: ${messageId}`);
  } catch (error) {
    logger.error('Remove bookmark error:', error);
    res.status(500).json({
      error: 'Failed to remove bookmark'
    });
  }
});

export { router as bookmarkRoutes };