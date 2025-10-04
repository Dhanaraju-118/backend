import express from 'express';
import { DatabaseManager } from '../config/database';
import { logger } from '../utils/logger';
import sql from 'mssql';

const router = express.Router();
const dbManager = DatabaseManager.getInstance();

// Get server configuration
router.get('/config', async (req, res) => {
  try {
    const config = {
      database: {
        server: process.env.SQL_SERVER || 'Not configured',
        database: process.env.SQL_DATABASE || 'Not configured',
        username: process.env.SQL_USERNAME || 'Not configured',
        connectionStatus: 'Connected',
        lastChecked: new Date().toISOString()
      },
      openai: {
        apiKey: process.env.OPENAI_API_KEY ? 'Configured' : 'Not configured',
        model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
        endpoint: process.env.OPENAI_ENDPOINT || 'https://api.openai.com/v1'
      },
      azure: {
        tenantId: process.env.AZURE_TENANT_ID || 'Not configured',
        clientId: process.env.AZURE_CLIENT_ID || 'Not configured',
        fabricWorkspace: process.env.FABRIC_WORKSPACE_ID || 'Not configured',
        storageAccount: process.env.AZURE_STORAGE_ACCOUNT_NAME || 'Not configured'
      },
      security: {
        jwtSecret: process.env.JWT_SECRET ? 'Configured' : 'Not configured',
        sessionTimeout: process.env.SESSION_TIMEOUT || '24h',
        rateLimitEnabled: true,
        corsEnabled: true
      }
    };

    res.json(config);
  } catch (error) {
    logger.error('Get admin config error:', error);
    res.status(500).json({ error: 'Failed to retrieve configuration' });
  }
});

// Get system statistics
router.get('/stats', async (req, res) => {
  try {
    const pool = await dbManager.getPool();
    
    // Get user statistics
    const userStats = await pool.request().query(`
      SELECT 
        COUNT(*) as totalUsers,
        SUM(CASE WHEN isActive = 1 THEN 1 ELSE 0 END) as activeUsers,
        SUM(CASE WHEN provider = 'local' THEN 1 ELSE 0 END) as localUsers,
        SUM(CASE WHEN lastLoginAt >= DATEADD(day, -7, GETUTCDATE()) THEN 1 ELSE 0 END) as weeklyActiveUsers
      FROM Users
    `);

    // Get chat statistics
    const chatStats = await pool.request().query(`
      SELECT 
        COUNT(*) as totalChats,
        SUM(CASE WHEN isArchived = 0 THEN 1 ELSE 0 END) as activeChats,
        AVG(messageCount) as avgMessagesPerChat
      FROM Chats
    `);

    // Get message statistics
    const messageStats = await pool.request().query(`
      SELECT 
        COUNT(*) as totalMessages,
        SUM(tokens) as totalTokens,
        AVG(tokens) as avgTokensPerMessage
      FROM Messages
    `);

    // Get recent activity
    const recentActivity = await pool.request().query(`
      SELECT TOP 10
        'Message' as type,
        m.content as description,
        u.firstName + ' ' + u.lastName as userName,
        m.createdAt as timestamp
      FROM Messages m
      JOIN Users u ON m.userId = u.id
      ORDER BY m.createdAt DESC
    `);

    res.json({
      users: userStats.recordset[0],
      chats: chatStats.recordset[0],
      messages: messageStats.recordset[0],
      recentActivity: recentActivity.recordset
    });
  } catch (error) {
    logger.error('Get admin stats error:', error);
    res.status(500).json({ error: 'Failed to retrieve statistics' });
  }
});

// Get all users
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pool = await dbManager.getPool();
    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = '';
    let searchInput = '';
    
    if (search) {
      whereClause = `WHERE u.firstName LIKE @search OR u.lastName LIKE @search OR u.email LIKE @search`;
      searchInput = `%${search}%`;
    }
    
    const result = await pool.request()
      .input('limit', sql.Int, Number(limit))
      .input('offset', sql.Int, offset)
      .input('search', sql.NVarChar, searchInput)
      .query(`
        SELECT 
          u.id,
          u.firstName,
          u.lastName,
          u.email,
          u.provider,
          u.providerId,
          u.avatar,
          u.preferences,
          u.role,
          u.isActive,
          u.lastLoginAt,
          u.createdAt,
          u.updatedAt,
          COUNT(c.id) as chatCount,
          COUNT(m.id) as messageCount,
          MAX(u.lastLoginAt) as lastLogin
        FROM Users u
        LEFT JOIN Chats c ON u.id = c.userId
        LEFT JOIN Messages m ON u.id = m.userId
        ${whereClause}
        GROUP BY u.id, u.firstName, u.lastName, u.email, u.provider, u.providerId, 
                 u.avatar, u.preferences, u.role, u.isActive, u.lastLoginAt, u.createdAt, u.updatedAt
        ORDER BY u.createdAt DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);
    
    const countResult = await pool.request()
      .input('search', sql.NVarChar, searchInput)
      .query(`SELECT COUNT(*) as total FROM Users u ${whereClause}`);
    
    const total = countResult.recordset[0].total;

    res.json({
      users: result.recordset,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.error('Get admin users error:', error);
    res.status(500).json({ error: 'Failed to retrieve users' });
  }
});

// Get disliked messages
router.get('/disliked-messages', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '' } = req.query;
    const pool = await dbManager.getPool();
    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = '';
    let searchInput = '';
    
    if (search) {
      whereClause = `AND (m.content LIKE @search OR c.title LIKE @search)`;
      searchInput = `%${search}%`;
    }
    
    const result = await pool.request()
      .input('limit', sql.Int, Number(limit))
      .input('offset', sql.Int, offset)
      .input('search', sql.NVarChar, searchInput)
      .query(`
        SELECT 
          m.id,
          m.content,
          m.role,
          m.createdAt,
          c.title as chatTitle,
          c.id as chatId,
          u.firstName + ' ' + u.lastName as userName,
          u.email as userEmail,
          ma.createdAt as dislikedAt,
          COUNT(*) OVER() as totalCount
        FROM Messages m
        JOIN MessageActions ma ON m.id = ma.messageId
        JOIN Chats c ON m.chatId = c.id
        JOIN Users u ON ma.userId = u.id
        WHERE ma.actionType = 'dislike' ${whereClause}
        ORDER BY ma.createdAt DESC
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `);
    
    const messages = result.recordset.map(record => ({
      id: record.id,
      title: record.chatTitle,
      description: record.content.length > 100 ? record.content.substring(0, 100) + '...' : record.content,
      content: record.content,
      date: record.dislikedAt,
      type: record.role,
      category: 'Conversation',
      chatId: record.chatId,
      userName: record.userName,
      userEmail: record.userEmail
    }));
    
    const total = result.recordset.length > 0 ? result.recordset[0].totalCount : 0;

    res.json({
      messages,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.error('Get disliked messages error:', error);
    res.status(500).json({ error: 'Failed to retrieve disliked messages' });
  }
});

// Get Azure service status
router.get('/azure-services', async (req, res) => {
  try {
    const services = [
      {
        id: 'fabric',
        name: 'Microsoft Fabric',
        status: process.env.FABRIC_WORKSPACE_ID ? 'connected' : 'disconnected',
        lastChecked: new Date().toISOString(),
        workspaceId: process.env.FABRIC_WORKSPACE_ID || 'Not configured'
      },
      {
        id: 'blob-storage',
        name: 'Azure Blob Storage',
        status: process.env.AZURE_STORAGE_ACCOUNT_NAME ? 'connected' : 'disconnected',
        lastChecked: new Date().toISOString(),
        accountName: process.env.AZURE_STORAGE_ACCOUNT_NAME || 'Not configured'
      },
      {
        id: 'sql-database',
        name: 'Azure SQL Database',
        status: process.env.SQL_SERVER ? 'connected' : 'disconnected',
        lastChecked: new Date().toISOString(),
        server: process.env.SQL_SERVER || 'Not configured'
      },
      {
        id: 'openai',
        name: 'Azure OpenAI',
        status: process.env.AZURE_OPENAI_API_KEY ? 'connected' : 'disconnected',
        lastChecked: new Date().toISOString(),
        endpoint: process.env.AZURE_OPENAI_ENDPOINT || 'Not configured'
      },
      {
        id: 'active-directory',
        name: 'Azure Active Directory',
        status: process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID ? 'connected' : 'disconnected',
        lastChecked: new Date().toISOString(),
        tenantId: process.env.AZURE_TENANT_ID || 'Not configured'
      }
    ];

    res.json({ services });
  } catch (error) {
    logger.error('Get Azure services error:', error);
    res.status(500).json({ error: 'Failed to retrieve Azure services' });
  }
});

// Get system monitoring data
router.get('/monitoring', async (req, res) => {
  try {
    // Simulate system metrics (in production, integrate with actual monitoring)
    const metrics = {
      cpu: Math.floor(Math.random() * 40) + 20, // 20-60%
      memory: Math.floor(Math.random() * 30) + 50, // 50-80%
      disk: Math.floor(Math.random() * 20) + 30, // 30-50%
      network: Math.floor(Math.random() * 100) + 50, // 50-150 Mbps
      activeUsers: Math.floor(Math.random() * 50) + 25,
      requestsPerMin: Math.floor(Math.random() * 200) + 100,
      responseTime: Math.floor(Math.random() * 100) + 50, // 50-150ms
      uptime: '99.8%'
    };

    // Get recent logs
    const pool = await dbManager.getPool();
    const recentLogs = await pool.request().query(`
      SELECT TOP 20
        'INFO' as level,
        'User ' + u.firstName + ' ' + u.lastName + ' sent a message' as message,
        m.createdAt as timestamp
      FROM Messages m
      JOIN Users u ON m.userId = u.id
      WHERE m.role = 'user'
      ORDER BY m.createdAt DESC
    `);

    res.json({
      metrics,
      logs: recentLogs.recordset
    });
  } catch (error) {
    logger.error('Get monitoring data error:', error);
    res.status(500).json({ error: 'Failed to retrieve monitoring data' });
  }
});

// Update configuration - redirect to new config routes
router.put('/config', async (req, res) => {
  try {
    // This endpoint is deprecated in favor of /api/admin/config/:section
    res.status(301).json({
      message: 'This endpoint has been moved',
      redirectTo: '/api/admin/config',
      deprecated: true
    });
  } catch (error) {
    logger.error('Update admin config error:', error);
    res.status(500).json({ error: 'Failed to update configuration' });
  }
});

// Get all feedback
router.get('/feedback', async (req, res) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', category = '' } = req.query;
    const pool = await dbManager.getPool();
    const offset = (Number(page) - 1) * Number(limit);
    
    let whereClause = 'WHERE 1=1';
    const inputs: any = {
      limit: Number(limit),
      offset: offset
    };
    
    if (search) {
      whereClause += ` AND (f.subject LIKE @search OR f.message LIKE @search OR u.firstName LIKE @search OR u.lastName LIKE @search)`;
      inputs.search = `%${search}%`;
    }
    
    if (status) {
      whereClause += ` AND f.status = @status`;
      inputs.status = status;
    }
    
    if (category) {
      whereClause += ` AND f.category = @category`;
      inputs.category = category;
    }
    
    const request = pool.request();
    Object.keys(inputs).forEach(key => {
      if (key === 'limit' || key === 'offset') {
        request.input(key, sql.Int, inputs[key]);
      } else {
        request.input(key, sql.NVarChar, inputs[key]);
      }
    });
    
    const result = await request.query(`
      SELECT 
        f.*,
        u.firstName + ' ' + u.lastName as userName,
        u.email as userEmail,
        a.firstName + ' ' + a.lastName as adminName
      FROM Feedback f
      JOIN Users u ON f.userId = u.id
      LEFT JOIN Users a ON f.adminId = a.id
      ${whereClause}
      ORDER BY f.createdAt DESC
      OFFSET @offset ROWS
      FETCH NEXT @limit ROWS ONLY
    `);
    
    const countRequest = pool.request();
    Object.keys(inputs).filter(k => k !== 'limit' && k !== 'offset').forEach(key => {
      countRequest.input(key, sql.NVarChar, inputs[key]);
    });
    
    const countResult = await countRequest.query(`
      SELECT COUNT(*) as total 
      FROM Feedback f
      JOIN Users u ON f.userId = u.id
      ${whereClause}
    `);
    
    const total = countResult.recordset[0].total;

    res.json({
      feedback: result.recordset,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.error('Get admin feedback error:', error);
    res.status(500).json({ error: 'Failed to retrieve feedback' });
  }
});

// Respond to feedback
router.post('/feedback/:id/respond', async (req, res) => {
  try {
    const { id } = req.params;
    const { response, status = 'resolved' } = req.body;
    const adminEmail = req.headers['x-admin-email'];
    
    if (!response) {
      return res.status(400).json({ error: 'Response is required' });
    }

    const pool = await dbManager.getPool();
    
    // Get admin user ID
    const adminResult = await pool.request()
      .input('email', sql.NVarChar, adminEmail)
      .query('SELECT id FROM Users WHERE email = @email');
    
    if (adminResult.recordset.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }
    
    const adminId = adminResult.recordset[0].id;
    
    // Update feedback with response
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('response', sql.NVarChar, response)
      .input('status', sql.NVarChar, status)
      .input('adminId', sql.NVarChar, adminId)
      .input('respondedAt', sql.DateTime2, new Date())
      .input('updatedAt', sql.DateTime2, new Date())
      .query(`
        UPDATE Feedback 
        SET adminResponse = @response, 
            status = @status, 
            adminId = @adminId, 
            respondedAt = @respondedAt,
            updatedAt = @updatedAt
        WHERE id = @id
      `);

    logger.info('Feedback response sent:', { feedbackId: id, adminId });

    res.json({
      message: 'Response sent successfully'
    });
  } catch (error) {
    logger.error('Send feedback response error:', error);
    res.status(500).json({ error: 'Failed to send response' });
  }
});

export { router as adminRoutes };