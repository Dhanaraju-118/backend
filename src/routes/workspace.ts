import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { authenticateToken, requireAdmin } from '../middleware/auth';
import { validate, schemas } from '../middleware/validation';
import { DatabaseManager } from '../config/database';
import { logger } from '../utils/logger';
import sql from 'mssql';
import { blobServiceClient } from '../services/azure';
import { WorkspaceStorageService } from '../services/workspaceStorage';
import multer from 'multer';

// Import the Azure Search Service
import { AzureSearchService } from '../services/azureSearchService';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req: any, file: any, cb: any) => {
    // Allow common file types
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/octet-stream' // For .env files and other unknown types
    ];
    
    // Also allow files with no MIME type specified
    if (allowedTypes.includes(file.mimetype) || !file.mimetype) {
      cb(null, true);
    } else {
      cb(new Error('File type not allowed'));
    }
  }
});

// Apply authentication to all workspace routes
router.use(authenticateToken);

const dbManager = DatabaseManager.getInstance();

// Initialize the main workspace container when the server starts
const workspaceStorageService = WorkspaceStorageService.getInstance();
workspaceStorageService.initializeMainContainer().then(success => {
  if (success) {
    logger.info('Main workspace container initialized successfully');
  } else {
    logger.warn('Failed to initialize main workspace container');
  }
}).catch(error => {
  logger.error('Error initializing main workspace container:', error);
});

// Get user's workspaces (users see only assigned workspaces, admins see all they own)
router.get('/', validate(schemas.pagination), async (req: any, res: any) => {
  try {
    const userId = req.user.userId;
    const userRole = req.user.role;
    const { page = 1, limit = 20, sortBy = 'updatedAt', sortOrder = 'desc' } = req.query;
    
    logger.info(`Getting workspaces for user ${userId} with role ${userRole}`);
    
    const pool = await dbManager.getPool();
    const offset = (Number(page) - 1) * Number(limit);
    
    let workspaceQuery = '';
    let countQuery = '';
    
    if (userRole === 'admin') {
      // Admins can see all workspaces they own
      workspaceQuery = `
        SELECT 
          w.*,
          COALESCE(chatStats.chatCount, 0) as chatCount,
          chatStats.lastActivity
        FROM Workspaces w
        LEFT JOIN (
          SELECT 
            workspaceId,
            COUNT(*) as chatCount,
            MAX(lastMessageAt) as lastActivity
          FROM Chats 
          WHERE isArchived = 0
          GROUP BY workspaceId
        ) chatStats ON w.id = chatStats.workspaceId
        WHERE w.ownerId = @userId
        ORDER BY w.${sortBy} ${sortOrder}
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `;
      countQuery = 'SELECT COUNT(*) as total FROM Workspaces WHERE ownerId = @userId';
      logger.info(`Admin user ${userId} retrieving owned workspaces`);
    } else {
      // Regular users can only see workspaces they're assigned to
      workspaceQuery = `
        SELECT 
          w.*,
          wu.accessLevel,
          COALESCE(chatStats.chatCount, 0) as chatCount,
          chatStats.lastActivity
        FROM Workspaces w
        INNER JOIN WorkspaceUsers wu ON w.id = wu.workspaceId
        LEFT JOIN (
          SELECT 
            workspaceId,
            COUNT(*) as chatCount,
            MAX(lastMessageAt) as lastActivity
          FROM Chats 
          WHERE isArchived = 0
          GROUP BY workspaceId
        ) chatStats ON w.id = chatStats.workspaceId
        WHERE wu.userId = @userId
        ORDER BY w.${sortBy} ${sortOrder}
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
      `;
      countQuery = `
        SELECT COUNT(*) as total 
        FROM Workspaces w
        INNER JOIN WorkspaceUsers wu ON w.id = wu.workspaceId
        WHERE wu.userId = @userId
      `;
      logger.info(`Regular user ${userId} retrieving assigned workspaces`);
    }
    
    const result = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .input('limit', sql.Int, Number(limit))
      .input('offset', sql.Int, offset)
      .query(workspaceQuery);
    
    const countResult = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .query(countQuery);
    
    const total = countResult.recordset[0].total;
    
    logger.info(`Retrieved ${result.recordset.length} workspaces for user ${userId}, total: ${total}`);

    res.json({
      message: 'Workspaces retrieved successfully',
      workspaces: result.recordset,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit))
      }
    });
  } catch (error) {
    logger.error('Get workspaces error:', error);
    res.status(500).json({
      error: 'Failed to retrieve workspaces'
    });
  }
});

// Create new workspace (admin only)
router.post('/', requireAdmin, validate(schemas.createWorkspace), async (req: any, res: any) => {
  try {
    const { name, description, color, isShared } = req.body;
    const userId = req.user.userId;
    const workspaceId = uuidv4();
    
    const pool = await dbManager.getPool();
    
    const result = await pool.request()
      .input('id', sql.NVarChar, workspaceId)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description || '')
      .input('color', sql.NVarChar, color || '#3B82F6')
      .input('isShared', sql.Bit, isShared || false)
      .input('ownerId', sql.NVarChar, userId)
      .query(`
        INSERT INTO Workspaces (id, name, description, color, isShared, ownerId)
        OUTPUT INSERTED.*
        VALUES (@id, @name, @description, @color, @isShared, @ownerId)
      `);
    
    // Also assign the owner to their own workspace
    const assignmentId = uuidv4();
    await pool.request()
      .input('id', sql.NVarChar, assignmentId)
      .input('workspaceId', sql.NVarChar, workspaceId)
      .input('userId', sql.NVarChar, userId)
      .input('accessLevel', sql.NVarChar, 'owner')
      .input('assignedBy', sql.NVarChar, userId)
      .query(`
        INSERT INTO WorkspaceUsers (id, workspaceId, userId, accessLevel, assignedBy)
        VALUES (@id, @workspaceId, @userId, @accessLevel, @assignedBy)
      `);
    
    const workspace = result.recordset[0];
    
    // Create workspace folder in the main blob storage container
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    const folderPath = await workspaceStorageService.createWorkspaceFolder(workspaceId, name);
    
    if (folderPath) {
      logger.info(`Workspace folder created and verified for workspace: ${folderPath}`);
      // Add folder info to workspace object
      workspace.folderPath = folderPath;
      
      // Create Azure Search index for the workspace
      const azureSearchService = AzureSearchService.getInstance();
      const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(workspaceId, name);
      const indexName = `${workspaceFolderName}index`;
      
      logger.info(`Attempting to create Azure Search index: ${indexName} for workspace: ${name}`);
      const indexCreated = await azureSearchService.createWorkspaceIndex(indexName);
      if (indexCreated) {
        logger.info(`Azure Search index created for workspace: ${indexName}`);
        workspace.searchIndexName = indexName;
      } else {
        logger.warn(`Failed to create Azure Search index for workspace: ${name}`);
      }
    } else {
      logger.warn(`Failed to create workspace folder for workspace: ${name}`);
    }

    res.status(201).json({
      message: 'Workspace created successfully',
      workspace
    });

    logger.info(`Workspace created: ${workspaceId} by user: ${userId}`);
  } catch (error) {
    logger.error('Create workspace error:', error);
    res.status(500).json({
      error: 'Failed to create workspace'
    });
  }
});

// Update workspace (admin only)
router.put('/:id', requireAdmin, validate(schemas.uuidParam), validate(schemas.updateWorkspace), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const { name, description, color, isShared } = req.body;
    const userId = req.user.userId;
    
    const pool = await dbManager.getPool();
    
    // Verify workspace belongs to user
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('userId', sql.NVarChar, userId)
      .query('SELECT id FROM Workspaces WHERE id = @id AND ownerId = @userId');
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('name', sql.NVarChar, name)
      .input('description', sql.NVarChar, description)
      .input('color', sql.NVarChar, color)
      .input('isShared', sql.Bit, isShared)
      .query(`
        UPDATE Workspaces 
        SET 
          name = COALESCE(@name, name),
          description = COALESCE(@description, description),
          color = COALESCE(@color, color),
          isShared = COALESCE(@isShared, isShared),
          updatedAt = GETUTCDATE()
        OUTPUT INSERTED.*
        WHERE id = @id
      `);
    
    const workspace = result.recordset[0];

    res.json({
      message: 'Workspace updated successfully',
      workspace
    });

    logger.info(`Workspace updated: ${id} by user: ${userId}`);
  } catch (error) {
    logger.error('Update workspace error:', error);
    res.status(500).json({
      error: 'Failed to update workspace'
    });
  }
});

// Get workspace details with chats
router.get('/:id', validate(schemas.uuidParam), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    const pool = await dbManager.getPool();
    
    // Check if user has access to this workspace
    let accessQuery = '';
    if (userRole === 'admin') {
      // Admin can access any workspace they own
      accessQuery = `
        SELECT id FROM Workspaces 
        WHERE id = @id AND ownerId = @userId
      `;
    } else {
      // Regular users can only access workspaces they're assigned to
      accessQuery = `
        SELECT w.id 
        FROM Workspaces w
        INNER JOIN WorkspaceUsers wu ON w.id = wu.workspaceId
        WHERE w.id = @id AND wu.userId = @userId
      `;
    }
    
    // Verify workspace exists and user has access
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('userId', sql.NVarChar, userId)
      .query(accessQuery);
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    // Get workspace details
    const result = await pool.request()
      .input('id', sql.NVarChar, id)
      .query(`
        SELECT 
          w.*,
          COALESCE(chatStats.chatCount, 0) as chatCount,
          chatStats.lastActivity
        FROM Workspaces w
        LEFT JOIN (
          SELECT 
            workspaceId,
            COUNT(*) as chatCount,
            MAX(lastMessageAt) as lastActivity
          FROM Chats 
          WHERE isArchived = 0
          GROUP BY workspaceId
        ) chatStats ON w.id = chatStats.workspaceId
        WHERE w.id = @id
      `);
    
    const workspace = result.recordset[0];
    
    // Get assigned users for this workspace
    const usersResult = await pool.request()
      .input('workspaceId', sql.NVarChar, id)
      .query(`
        SELECT 
          u.id,
          u.firstName,
          u.lastName,
          u.email,
          u.avatar,
          wu.accessLevel,
          wu.assignedBy,
          wu.createdAt as assignedAt
        FROM Users u
        INNER JOIN WorkspaceUsers wu ON u.id = wu.userId
        WHERE wu.workspaceId = @workspaceId
        ORDER BY wu.accessLevel DESC, u.firstName, u.lastName
      `);
    
    workspace.users = usersResult.recordset;

    res.json({
      message: 'Workspace retrieved successfully',
      workspace
    });

    logger.info(`Workspace details retrieved: ${id} for user: ${userId}`);
  } catch (error) {
    logger.error('Get workspace details error:', error);
    res.status(500).json({
      error: 'Failed to retrieve workspace details'
    });
  }
});

// Admin endpoints for user-workspace management

// Get all users for workspace assignment (admin only)
router.get('/:id/available-users', requireAdmin, validate(schemas.uuidParam), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const { search = '' } = req.query;
    
    const pool = await dbManager.getPool();
    
    // Verify workspace belongs to admin
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('userId', sql.NVarChar, userId)
      .query('SELECT id FROM Workspaces WHERE id = @id AND ownerId = @userId');
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    let whereClause = "WHERE u.role != 'admin'";
    let searchInput = '';
    
    if (search) {
      whereClause += ` AND (u.firstName LIKE @search OR u.lastName LIKE @search OR u.email LIKE @search)`;
      searchInput = `%${search}%`;
    }
    
    const result = await pool.request()
      .input('workspaceId', sql.NVarChar, id)
      .input('search', sql.NVarChar, searchInput)
      .query(`
        SELECT 
          u.id,
          u.firstName,
          u.lastName,
          u.email,
          u.isActive,
          wu.accessLevel,
          wu.assignedAt,
          CASE WHEN wu.id IS NOT NULL THEN 1 ELSE 0 END as isAssigned
        FROM Users u
        LEFT JOIN WorkspaceUsers wu ON u.id = wu.userId AND wu.workspaceId = @workspaceId
        ${whereClause}
        ORDER BY u.firstName, u.lastName
      `);

    res.json({
      message: 'Users retrieved successfully',
      users: result.recordset
    });
  } catch (error) {
    logger.error('Get available users error:', error);
    res.status(500).json({
      error: 'Failed to retrieve users'
    });
  }
});

// Assign user to workspace (admin only)
router.post('/:id/assign-user', requireAdmin, validate(schemas.uuidParam), validate(schemas.assignUsersToWorkspace), async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds, accessLevel = 'member' } = req.body;
    const adminId = req.user.userId;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        error: 'User IDs are required',
        message: 'Please provide an array of user IDs to assign'
      });
    }
    
    const pool = await dbManager.getPool();
    
    // Verify workspace belongs to admin
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('adminId', sql.NVarChar, adminId)
      .query('SELECT id FROM Workspaces WHERE id = @id AND ownerId = @adminId');
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    const assignments = [];
    for (const userId of userIds) {
      try {
        const assignmentId = uuidv4();
        
        // Check if user is already assigned
        const existingAssignment = await pool.request()
          .input('workspaceId', sql.NVarChar, id)
          .input('userId', sql.NVarChar, userId)
          .query('SELECT id FROM WorkspaceUsers WHERE workspaceId = @workspaceId AND userId = @userId');
        
        if (existingAssignment.recordset.length === 0) {
          await pool.request()
            .input('id', sql.NVarChar, assignmentId)
            .input('workspaceId', sql.NVarChar, id)
            .input('userId', sql.NVarChar, userId)
            .input('accessLevel', sql.NVarChar, accessLevel)
            .input('assignedBy', sql.NVarChar, adminId)
            .query(`
              INSERT INTO WorkspaceUsers (id, workspaceId, userId, accessLevel, assignedBy)
              VALUES (@id, @workspaceId, @userId, @accessLevel, @assignedBy)
            `);
          
          assignments.push({ userId, assignmentId, status: 'assigned' });
        } else {
          assignments.push({ userId, status: 'already_assigned' });
        }
      } catch (userError) {
        logger.error(`Error assigning user ${userId} to workspace ${id}:`, userError);
        assignments.push({ userId, status: 'error', error: (userError as Error).message });
      }
    }

    res.json({
      message: 'User assignments completed',
      assignments
    });

    logger.info(`Users assigned to workspace ${id} by admin ${adminId}:`, assignments);
  } catch (error) {
    logger.error('Assign user to workspace error:', error);
    res.status(500).json({
      error: 'Failed to assign users to workspace',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Remove user from workspace (admin only)
router.post('/:id/remove-user', requireAdmin, validate(schemas.uuidParam), validate(schemas.removeUsersFromWorkspace), async (req, res) => {
  try {
    const { id } = req.params;
    const { userIds } = req.body;
    const adminId = req.user.userId;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        error: 'User IDs are required',
        message: 'Please provide an array of user IDs to remove'
      });
    }
    
    const pool = await dbManager.getPool();
    
    // Verify workspace belongs to admin
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('adminId', sql.NVarChar, adminId)
      .query('SELECT id FROM Workspaces WHERE id = @id AND ownerId = @adminId');
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    const removals = [];
    for (const userId of userIds) {
      try {
        const result = await pool.request()
          .input('workspaceId', sql.NVarChar, id)
          .input('userId', sql.NVarChar, userId)
          .query('DELETE FROM WorkspaceUsers WHERE workspaceId = @workspaceId AND userId = @userId');
        
        if (result.rowsAffected[0] > 0) {
          removals.push({ userId, status: 'removed' });
        } else {
          removals.push({ userId, status: 'not_found' });
        }
      } catch (userError) {
        logger.error(`Error removing user ${userId} from workspace ${id}:`, userError);
        removals.push({ userId, status: 'error', error: (userError as Error).message });
      }
    }

    res.json({
      message: 'User removals completed',
      removals
    });

    logger.info(`Users removed from workspace ${id} by admin ${adminId}:`, removals);
  } catch (error) {
    logger.error('Remove user from workspace error:', error);
    res.status(500).json({
      error: 'Failed to remove users from workspace',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Update user access level in workspace (admin only)
router.put('/:id/user-access', requireAdmin, validate(schemas.uuidParam), validate(schemas.updateUserAccess), async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, accessLevel } = req.body;
    const adminId = req.user.userId;
    
    if (!userId || !accessLevel) {
      return res.status(400).json({
        error: 'User ID and access level are required'
      });
    }
    
    const validAccessLevels = ['member', 'readonly'];
    if (!validAccessLevels.includes(accessLevel)) {
      return res.status(400).json({
        error: 'Invalid access level',
        message: 'Access level must be one of: member, readonly'
      });
    }
    
    const pool = await dbManager.getPool();
    
    // Verify workspace belongs to admin
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('adminId', sql.NVarChar, adminId)
      .query('SELECT id FROM Workspaces WHERE id = @id AND ownerId = @adminId');
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    // Check if user is assigned to workspace
    const userCheck = await pool.request()
      .input('workspaceId', sql.NVarChar, id)
      .input('userId', sql.NVarChar, userId)
      .query('SELECT id FROM WorkspaceUsers WHERE workspaceId = @workspaceId AND userId = @userId');
    
    if (userCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'User assignment not found',
        message: 'User is not assigned to this workspace'
      });
    }
    
    const result = await pool.request()
      .input('workspaceId', sql.NVarChar, id)
      .input('userId', sql.NVarChar, userId)
      .input('accessLevel', sql.NVarChar, accessLevel)
      .query(`
        UPDATE WorkspaceUsers 
        SET accessLevel = @accessLevel 
        WHERE workspaceId = @workspaceId AND userId = @userId
      `);
    
    if (result.rowsAffected[0] === 0) {
      return res.status(500).json({
        error: 'Failed to update user access level',
        message: 'Database update failed'
      });
    }

    res.json({
      message: 'User access level updated successfully',
      userId,
      accessLevel
    });

    logger.info(`User ${userId} access level updated to ${accessLevel} in workspace ${id} by admin ${adminId}`);
  } catch (error) {
    logger.error('Update user access level error:', error);
    res.status(500).json({
      error: 'Failed to update user access level',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Delete workspace (admin only)
router.delete('/:id', requireAdmin, validate(schemas.uuidParam), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    
    const pool = await dbManager.getPool();
    
    // Verify workspace belongs to user and get workspace details
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('userId', sql.NVarChar, userId)
      .query('SELECT id, name FROM Workspaces WHERE id = @id AND ownerId = @userId');
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    const workspace = workspaceCheck.recordset[0];
    const workspaceName = workspace.name;
    
    // Check if workspace has any chats (archived or active)
    const chatCheck = await pool.request()
      .input('workspaceId', sql.NVarChar, id)
      .query('SELECT COUNT(*) as count FROM Chats WHERE workspaceId = @workspaceId');
    
    const chatCount = chatCheck.recordset[0].count;
    
    if (chatCount > 0) {
      // Archive all chats in the workspace before deletion
      await pool.request()
        .input('workspaceId', sql.NVarChar, id)
        .query('UPDATE Chats SET isArchived = 1, workspaceId = NULL WHERE workspaceId = @workspaceId');
    }
    
    // Delete all workspace files first (to avoid foreign key constraint issues)
    await pool.request()
      .input('workspaceId', sql.NVarChar, id)
      .query('DELETE FROM WorkspaceFiles WHERE workspaceId = @workspaceId');
    
    // Delete all workspace users
    await pool.request()
      .input('workspaceId', sql.NVarChar, id)
      .query('DELETE FROM WorkspaceUsers WHERE workspaceId = @workspaceId');
    
    // Delete workspace
    await pool.request()
      .input('id', sql.NVarChar, id)
      .query('DELETE FROM Workspaces WHERE id = @id');
    
    // Delete workspace folder and all its contents
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    const folderDeleted = await workspaceStorageService.deleteWorkspaceFolder(id, workspaceName);
    
    if (folderDeleted) {
      logger.info(`Workspace folder deleted for workspace: ${id}`);
    } else {
      logger.warn(`Failed to delete workspace folder for workspace: ${id}`);
    }
    
    // Delete Azure Search index for the workspace
    const azureSearchService = AzureSearchService.getInstance();
    const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(id, workspaceName);
    const indexName = `${workspaceFolderName}index`;
    
    const indexDeleted = await azureSearchService.deleteWorkspaceIndex(indexName);
    if (indexDeleted) {
      logger.info(`Azure Search index deleted for workspace: ${indexName}`);
    } else {
      logger.warn(`Failed to delete Azure Search index for workspace: ${workspaceName}`);
    }

    res.json({
      message: 'Workspace deleted successfully',
      workspaceId: id
    });

    logger.info(`Workspace deleted: ${id} by user: ${userId}`);
  } catch (error) {
    logger.error('Delete workspace error:', error);
    res.status(500).json({
      error: 'Failed to delete workspace',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Upload file to workspace
router.post('/:id/upload', validate(schemas.uuidParam), upload.single('file'), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: 'No file provided',
        message: 'Please select a file to upload'
      });
    }
    
    const file = req.file;
    const fileId = uuidv4();
    
    const pool = await dbManager.getPool();
    
    // Check if user has access to this workspace
    let accessQuery = '';
    if (userRole === 'admin') {
      // Admin can upload files to workspaces they own
      accessQuery = `
        SELECT id, name FROM Workspaces 
        WHERE id = @id AND ownerId = @userId
      `;
    } else {
      // Regular users can upload files to workspaces they're assigned to with member access
      accessQuery = `
        SELECT w.id, w.name 
        FROM Workspaces w
        INNER JOIN WorkspaceUsers wu ON w.id = wu.workspaceId
        WHERE w.id = @id AND wu.userId = @userId AND wu.accessLevel = 'member'
      `;
    }
    
    // Verify workspace exists and user has access
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('userId', sql.NVarChar, userId)
      .query(accessQuery);
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    const workspace = workspaceCheck.recordset[0];
    const workspaceName = workspace.name;
    
    // Upload file to workspace-specific folder within the main container
    let fileUrl = '';
    const isMockStorage = !process.env.AZURE_STORAGE_ACCOUNT_NAME || process.env.MOCK_STORAGE === 'true';
    
    if (!isMockStorage && blobServiceClient) {
      // Use the main container with workspace-specific folder
      const workspaceStorageService = WorkspaceStorageService.getInstance();
      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = id.substring(0, 7);
      const folderPath = `workspace/${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      
      const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files';
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Create blob name with folder path
      const blobName = `${folderPath}${fileId}-${file.originalname}`;
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      // Upload file to Azure Blob Storage
      await blockBlobClient.uploadData(file.buffer, {
        blobHTTPHeaders: {
          blobContentType: file.mimetype
        },
        metadata: {
          userId,
          workspaceId: id,
          originalName: file.originalname,
          uploadDate: new Date().toISOString()
        }
      });
      
      fileUrl = blockBlobClient.url;
    } else {
      // For mock storage, generate a mock URL
      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = id.substring(0, 7);
      const folderPath = `workspace/${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      fileUrl = `https://mockstorage.example.com/aiva-files/${folderPath}${fileId}-${file.originalname}`;
    }
    
    // Store file metadata in database
    const fileData = {
      id: fileId,
      originalName: file.originalname,
      fileName: `${fileId}-${file.originalname}`,
      mimeType: file.mimetype,
      size: file.size,
      url: fileUrl,
      userId: userId,
      workspaceId: id
    };
    
    const insertResult = await pool.request()
      .input('id', sql.NVarChar, fileData.id)
      .input('originalName', sql.NVarChar, fileData.originalName)
      .input('fileName', sql.NVarChar, fileData.fileName)
      .input('mimeType', sql.NVarChar, fileData.mimeType)
      .input('size', sql.BigInt, fileData.size)
      .input('url', sql.NVarChar, fileData.url)
      .input('userId', sql.NVarChar, fileData.userId)
      .input('workspaceId', sql.NVarChar, fileData.workspaceId)
      .query(`
        INSERT INTO WorkspaceFiles (id, originalName, fileName, mimeType, size, url, userId, workspaceId)
        OUTPUT INSERTED.*
        VALUES (@id, @originalName, @fileName, @mimeType, @size, @url, @userId, @workspaceId)
      `);
    
    const uploadedFile = insertResult.recordset[0];
    
    // Extract file content and index it in Azure Search
    try {
      // Import required services
      const { FileAnalysisService } = require('../services/fileAnalysisService');
      const { AzureSearchService } = require('../services/azureSearchService');
      const { WorkspaceStorageService } = require('../services/workspaceStorage');
      
      const fileAnalysisService = FileAnalysisService.getInstance();
      const azureSearchService = AzureSearchService.getInstance();
      const workspaceStorageService = WorkspaceStorageService.getInstance();
      
      // Get the correct file path for workspace files
      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = id.substring(0, 7);
      const folderPath = `workspace/${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      const fullBlobName = `${folderPath}${fileId}-${file.originalname}`;
      const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files';
      
      // Extract content from the uploaded file using the correct path and container
      const fileContentResult = await fileAnalysisService.extractFileContent(
        fullBlobName, 
        file.originalname,
        containerName
      );
      
      // Analyze the content to get summary and key points
      let summary = '';
      let keyPoints: string[] = [];
      
      try {
        const analysisResult = await fileAnalysisService.analyzeFile(
          fullBlobName, 
          file.mimetype,
          containerName
        );
        summary = analysisResult.summary || '';
        keyPoints = analysisResult.keyPoints || [];
      } catch (analysisError) {
        logger.warn(`Failed to analyze file content for ${fileId}, using raw content:`, analysisError);
        // Use first 500 characters as summary if analysis fails
        summary = fileContentResult.content.substring(0, 500) + (fileContentResult.content.length > 500 ? '...' : '');
        keyPoints = [];
      }
      
      // Get workspace folder name and index name
      const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(id, workspaceName);
      const indexName = `${workspaceFolderName}index`;
      
      // Check if the index exists, create it if it doesn't
      const indexExists = await azureSearchService.indexExists(indexName);
      if (!indexExists) {
        logger.info(`Azure Search index ${indexName} does not exist, creating it now`);
        await azureSearchService.createWorkspaceIndex(indexName);
      }
      
      // Create document for indexing with enhanced fields
      const documentToIndex = {
        id: fileId,
        content: fileContentResult.content,
        fileName: file.originalname,
        fileType: file.mimetype,
        workspaceId: id,
        workspaceName: workspaceName,
        uploadedBy: userId,
        uploadedAt: new Date().toISOString(),
        summary: summary,
        keyPoints: keyPoints
      };
      
      // Index the document
      const indexResult = await azureSearchService.indexDocument(indexName, documentToIndex);
      if (indexResult) {
        logger.info(`Successfully indexed document ${fileId} in index ${indexName}`);
        
        // Wait a short time to ensure indexing is complete before responding
        await new Promise(resolve => setTimeout(resolve, 1000));
      } else {
        logger.warn(`Failed to index document ${fileId} in index ${indexName}`);
      }
    } catch (indexError) {
      logger.error(`Failed to index document ${fileId}:`, indexError);
      // Don't fail the upload if indexing fails, just log the error
    }
    
    res.json({
      message: 'File uploaded successfully',
      file: uploadedFile
    });
    
    logger.info(`File uploaded to workspace ${id}: ${file.originalname} by user: ${userId}`);
  } catch (error) {
      logger.error('Workspace file upload error:', error);
      res.status(500).json({
        error: 'Failed to upload file',
        message: 'Please try again later'
      });
  }
});

// Get files for workspace
router.get('/:id/files', validate(schemas.uuidParam), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    const pool = await dbManager.getPool();
    
    // Check if user has access to this workspace
    let accessQuery = '';
    if (userRole === 'admin') {
      // Admin can access files in workspaces they own
      accessQuery = `
        SELECT id FROM Workspaces 
        WHERE id = @id AND ownerId = @userId
      `;
    } else {
      // Regular users can access files in workspaces they're assigned to
      accessQuery = `
        SELECT w.id 
        FROM Workspaces w
        INNER JOIN WorkspaceUsers wu ON w.id = wu.workspaceId
        WHERE w.id = @id AND wu.userId = @userId
      `;
    }
    
    // Verify workspace exists and user has access
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('userId', sql.NVarChar, userId)
      .query(accessQuery);
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    // Get files for this workspace
    const result = await pool.request()
      .input('workspaceId', sql.NVarChar, id)
      .query('SELECT * FROM WorkspaceFiles WHERE workspaceId = @workspaceId ORDER BY createdAt DESC');
    
    res.json({
      message: 'Workspace files retrieved successfully',
      files: result.recordset
    });
  } catch (error) {
    logger.error('Get workspace files error:', error);
    res.status(500).json({
      error: 'Failed to retrieve workspace files',
      message: 'Please try again later'
    });
  }
});

// Delete file from workspace
router.delete('/:id/files/:fileId', validate(schemas.uuidParam), async (req: any, res: any) => {
  try {
    const { id, fileId } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    const pool = await dbManager.getPool();
    
    // Check if user has access to this workspace
    let accessQuery = '';
    if (userRole === 'admin') {
      // Admin can delete files in workspaces they own
      accessQuery = `
        SELECT id, name FROM Workspaces 
        WHERE id = @id AND ownerId = @userId
      `;
    } else {
      // Regular users can only delete files in workspaces they're assigned to with member access
      accessQuery = `
        SELECT w.id, w.name 
        FROM Workspaces w
        INNER JOIN WorkspaceUsers wu ON w.id = wu.workspaceId
        WHERE w.id = @id AND wu.userId = @userId AND wu.accessLevel = 'member'
      `;
    }
    
    // Verify workspace exists and user has access
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('userId', sql.NVarChar, userId)
      .query(accessQuery);
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    const workspace = workspaceCheck.recordset[0];
    const workspaceName = workspace.name;
    
    // Get file to delete
    const fileResult = await pool.request()
      .input('fileId', sql.NVarChar, fileId)
      .input('workspaceId', sql.NVarChar, id)
      .query('SELECT * FROM WorkspaceFiles WHERE id = @fileId AND workspaceId = @workspaceId');
    
    if (fileResult.recordset.length === 0) {
      return res.status(404).json({
        error: 'File not found',
        message: 'File not found in this workspace'
      });
    }
    
    const file = fileResult.recordset[0];
    
    // Delete file from blob storage
    const isMockStorage = !process.env.AZURE_STORAGE_ACCOUNT_NAME || process.env.MOCK_STORAGE === 'true';
    
    if (!isMockStorage && blobServiceClient) {
      const workspaceStorageService = WorkspaceStorageService.getInstance();
      const sanitizedWorkspaceName = workspaceName.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
      const shortWorkspaceId = id.substring(0, 7);
      const folderPath = `workspace/${sanitizedWorkspaceName}-${shortWorkspaceId}/`;
      
      const containerName = process.env.AZURE_STORAGE_CONTAINER_NAME || 'aiva-files';
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blobName = `${folderPath}${file.fileName}`;
      const blobClient = containerClient.getBlobClient(blobName);
      await blobClient.deleteIfExists();
    }
    
    // Delete file record from database
    await pool.request()
      .input('fileId', sql.NVarChar, fileId)
      .query('DELETE FROM WorkspaceFiles WHERE id = @fileId');
    
    res.json({
      message: 'File deleted successfully',
      fileId: fileId
    });
    
    logger.info(`File deleted from workspace ${id}: ${file.originalName} by user: ${userId}`);
  } catch (error) {
    logger.error('Delete workspace file error:', error);
    res.status(500).json({
      error: 'Failed to delete file',
      message: 'Please try again later'
    });
  }
});

// Trigger workspace indexing
router.post('/:id/index', validate(schemas.uuidParam), async (req: any, res: any) => {
  try {
    const { id } = req.params;
    const userId = req.user.userId;
    const userRole = req.user.role;
    
    const pool = await dbManager.getPool();
    
    // Check if user has access to this workspace
    let accessQuery = '';
    if (userRole === 'admin') {
      // Admin can trigger indexing for workspaces they own
      accessQuery = `
        SELECT id, name FROM Workspaces 
        WHERE id = @id AND ownerId = @userId
      `;
    } else {
      // Regular users can trigger indexing for workspaces they're assigned to with member access
      accessQuery = `
        SELECT w.id, w.name 
        FROM Workspaces w
        INNER JOIN WorkspaceUsers wu ON w.id = wu.workspaceId
        WHERE w.id = @id AND wu.userId = @userId AND wu.accessLevel = 'member'
      `;
    }
    
    // Verify workspace exists and user has access
    const workspaceCheck = await pool.request()
      .input('id', sql.NVarChar, id)
      .input('userId', sql.NVarChar, userId)
      .query(accessQuery);
    
    if (workspaceCheck.recordset.length === 0) {
      return res.status(404).json({
        error: 'Workspace not found',
        message: 'Workspace not found or access denied'
      });
    }
    
    const workspace = workspaceCheck.recordset[0];
    const workspaceName = workspace.name;
    
    // Import the indexing function
    const { ensureWorkspaceIndexing } = require('../scripts/ensure-workspace-indexing');
    
    // Trigger indexing in the background
    setImmediate(async () => {
      try {
        logger.info(`Triggering workspace indexing for workspace: ${id}`);
        const result = await ensureWorkspaceIndexing(id);
        if (result) {
          logger.info(`Workspace indexing completed successfully for workspace: ${id}`);
        } else {
          logger.warn(`Workspace indexing failed for workspace: ${id}`);
        }
      } catch (error) {
        logger.error(`Error during workspace indexing for workspace ${id}:`, error);
      }
    });
    
    res.json({
      message: 'Workspace indexing started successfully',
      workspaceId: id
    });
    
    logger.info(`Workspace indexing triggered for workspace ${id} by user: ${userId}`);
  } catch (error) {
    logger.error('Workspace indexing trigger error:', error);
    res.status(500).json({
      error: 'Failed to trigger workspace indexing',
      message: 'Please try again later'
    });
  }
});

export { router as workspaceRoutes };