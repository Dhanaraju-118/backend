import sql from 'mssql';
import { logger } from '../utils/logger';

export interface DatabaseConfig {
  server: string;
  database: string;
  user: string;
  password: string;
  options: {
    encrypt: boolean;
    trustServerCertificate: boolean;
    enableArithAbort: boolean;
    requestTimeout: number;
    connectionTimeout: number;
  };
  pool: {
    max: number;
    min: number;
    idleTimeoutMillis: number;
    acquireTimeoutMillis: number;
  };
}

export const getDatabaseConfig = async (): Promise<DatabaseConfig> => {
  // Use dotenv variables directly, never KeyVault or other sources
  const config: Record<string, string> = {};
  
  // Define the required config keys
  const requiredConfigKeys = ['SQL_SERVER', 'SQL_DATABASE', 'SQL_USERNAME', 'SQL_PASSWORD'];
  
  // Load configuration values directly from environment variables
  for (const key of requiredConfigKeys) {
    config[key] = process.env[key] || '';
  }
  
  // Add optional config keys
  config['SQL_ENCRYPT'] = process.env['SQL_ENCRYPT'] || 'true';
  config['SQL_TRUST_SERVER_CERTIFICATE'] = process.env['SQL_TRUST_SERVER_CERTIFICATE'] || 'false';
  config['SQL_REQUEST_TIMEOUT'] = process.env['SQL_REQUEST_TIMEOUT'] || '30000';
  config['SQL_CONNECTION_TIMEOUT'] = process.env['SQL_CONNECTION_TIMEOUT'] || '15000';
  config['SQL_POOL_MAX'] = process.env['SQL_POOL_MAX'] || '10';
  config['SQL_POOL_MIN'] = process.env['SQL_POOL_MIN'] || '0';
  config['SQL_POOL_IDLE_TIMEOUT'] = process.env['SQL_POOL_IDLE_TIMEOUT'] || '30000';
  config['SQL_POOL_ACQUIRE_TIMEOUT'] = process.env['SQL_POOL_ACQUIRE_TIMEOUT'] || '60000';
  
  // Check for missing required keys
  const missingKeys = requiredConfigKeys.filter(key => !config[key]);
  
  if (missingKeys.length > 0) {
    throw new Error(`Missing required database configuration keys: ${missingKeys.join(', ')}`);
  }
  
  // Log the source of database configuration
  logger.info('Database configuration loaded from environment variables');

  return {
    server: config.SQL_SERVER,
    database: config.SQL_DATABASE,
    user: config.SQL_USERNAME,
    password: config.SQL_PASSWORD,
    options: {
      encrypt: config.SQL_ENCRYPT === 'true',
      trustServerCertificate: config.SQL_TRUST_SERVER_CERTIFICATE === 'true',
      enableArithAbort: true,
      requestTimeout: parseInt(config.SQL_REQUEST_TIMEOUT),
      connectionTimeout: parseInt(config.SQL_CONNECTION_TIMEOUT),
    },
    pool: {
      max: parseInt(config.SQL_POOL_MAX),
      min: parseInt(config.SQL_POOL_MIN),
      idleTimeoutMillis: parseInt(config.SQL_POOL_IDLE_TIMEOUT),
      acquireTimeoutMillis: parseInt(config.SQL_POOL_ACQUIRE_TIMEOUT),
    }
  };
};

export class DatabaseManager {
  private static instance: DatabaseManager;
  private pool: sql.ConnectionPool | null = null;
  private isConnecting = false;
  private config: DatabaseConfig | null = null;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  public async connect(): Promise<sql.ConnectionPool> {
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    if (this.isConnecting) {
      // Wait for existing connection attempt
      while (this.isConnecting) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      if (this.pool && this.pool.connected) {
        return this.pool;
      }
    }

    this.isConnecting = true;

    try {
      // Check if we should use mock database - only if explicitly requested
      const mockDatabase = process.env.MOCK_SQL === 'true' || process.env.MOCK_DATABASE === 'true';
      
      // Only use mock database if explicitly requested
      if (mockDatabase) {
        logger.info('Using mock SQL database connection');
        // Create a mock SQL pool with the necessary methods
        this.pool = {
          request: () => ({
            input: () => ({
              input: () => ({
                input: () => ({
                  input: () => ({
                    input: () => ({
                      input: () => ({
                        query: async () => ({ recordset: [] })
                      })
                    })
                  })
                })
              })
            })
          }),
          query: async () => ({ recordset: [] }),
          connected: true,
          connect: async () => ({}),
          close: async () => ({})
        } as unknown as sql.ConnectionPool;
        
        return this.pool;
      }
      
      // Get database config from environment variables only
      this.config = await getDatabaseConfig();
      this.pool = new sql.ConnectionPool(this.config);
      
      this.pool.on('error', (err) => {
        logger.error('Database pool error:', err);
        this.pool = null;
      });

      await this.pool.connect();
      logger.info('✅ Database connected successfully');
      
      // Initialize database schema
      await this.initializeSchema();
      
      return this.pool;
    } catch (error) {
      logger.error('❌ Database connection failed:', error);
      this.pool = null;
      throw error;
    } finally {
      this.isConnecting = false;
    }
  }

  public async getPool(): Promise<sql.ConnectionPool> {
    if (!this.pool || !this.pool.connected) {
      return await this.connect();
    }
    return this.pool;
  }

  public async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
      logger.info('Database disconnected');
    }
  }

  public async reinitialize(): Promise<void> {
    try {
      logger.info('Reinitializing database connection with new configuration...');
      await this.disconnect();
      await this.connect();
      logger.info('✅ Database connection reinitialized successfully');
    } catch (error) {
      logger.error('Failed to reinitialize database connection:', error);
      throw error;
    }
  }

  private async initializeSchema(): Promise<void> {
    if (!this.pool) throw new Error('Database not connected');

    try {
      // Create Users table
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Users' AND xtype='U')
        CREATE TABLE Users (
          id NVARCHAR(255) PRIMARY KEY,
          firstName NVARCHAR(100) NOT NULL,
          lastName NVARCHAR(100) NOT NULL,
          email NVARCHAR(255) UNIQUE NOT NULL,
          password NVARCHAR(255),
          provider NVARCHAR(50) NOT NULL DEFAULT 'local',
          providerId NVARCHAR(255),
          avatar NVARCHAR(500),
          preferences NVARCHAR(MAX),
          role NVARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
          isActive BIT DEFAULT 1,
          lastLoginAt DATETIME2,
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          updatedAt DATETIME2 DEFAULT GETUTCDATE()
        )
      `);

      // Add role column to existing Users table if it doesn't exist
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users' AND COLUMN_NAME = 'role')
        ALTER TABLE Users ADD role NVARCHAR(50) DEFAULT 'user' CHECK (role IN ('admin', 'user'))
      `);

      // Create Workspaces table
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Workspaces' AND xtype='U')
        CREATE TABLE Workspaces (
          id NVARCHAR(255) PRIMARY KEY,
          name NVARCHAR(200) NOT NULL,
          description NVARCHAR(1000),
          color NVARCHAR(7) DEFAULT '#3B82F6',
          isShared BIT DEFAULT 0,
          ownerId NVARCHAR(255) NOT NULL,
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          updatedAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (ownerId) REFERENCES Users(id) ON DELETE CASCADE
        )
      `);

      // Create Chats table
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Chats' AND xtype='U')
        CREATE TABLE Chats (
          id NVARCHAR(255) PRIMARY KEY,
          title NVARCHAR(500) NOT NULL,
          description NVARCHAR(1000),
          userId NVARCHAR(255) NOT NULL,
          workspaceId NVARCHAR(255),
          messageCount INT DEFAULT 0,
          isArchived BIT DEFAULT 0,
          lastMessageAt DATETIME2,
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          updatedAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
          FOREIGN KEY (workspaceId) REFERENCES Workspaces(id) ON DELETE CASCADE
        )
      `);

      // Create Messages table
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Messages' AND xtype='U')
        CREATE TABLE Messages (
          id NVARCHAR(255) PRIMARY KEY,
          chatId NVARCHAR(255) NOT NULL,
          userId NVARCHAR(255) NOT NULL,
          content NVARCHAR(MAX) NOT NULL,
          role NVARCHAR(50) NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
          metadata NVARCHAR(MAX),
          tokens INT DEFAULT 0,
          isEdited BIT DEFAULT 0,
          editedAt DATETIME2,
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (chatId) REFERENCES Chats(id) ON DELETE CASCADE,
          FOREIGN KEY (userId) REFERENCES Users(id)
        )
      `);

      // Create MessageActions table for likes, bookmarks, etc.
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='MessageActions' AND xtype='U')
        CREATE TABLE MessageActions (
          id NVARCHAR(255) PRIMARY KEY,
          messageId NVARCHAR(255) NOT NULL,
          userId NVARCHAR(255) NOT NULL,
          actionType NVARCHAR(50) NOT NULL CHECK (actionType IN ('like', 'dislike', 'bookmark', 'star')),
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (messageId) REFERENCES Messages(id),
          FOREIGN KEY (userId) REFERENCES Users(id),
          UNIQUE(messageId, userId, actionType)
        )
      `);

      // Create Files table
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Files' AND xtype='U')
        CREATE TABLE Files (
          id NVARCHAR(255) PRIMARY KEY,
          originalName NVARCHAR(500) NOT NULL,
          fileName NVARCHAR(500) NOT NULL,
          mimeType NVARCHAR(200) NOT NULL,
          size BIGINT NOT NULL,
          url NVARCHAR(1000) NOT NULL,
          userId NVARCHAR(255) NOT NULL,
          chatId NVARCHAR(255),
          messageId NVARCHAR(255),
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE
        )
      `);

      // Create Sessions table for user sessions
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Sessions' AND xtype='U')
        CREATE TABLE Sessions (
          id NVARCHAR(255) PRIMARY KEY,
          userId NVARCHAR(255) NOT NULL,
          token NVARCHAR(500) NOT NULL,
          refreshToken NVARCHAR(500),
          expiresAt DATETIME2 NOT NULL,
          isActive BIT DEFAULT 1,
          userAgent NVARCHAR(1000),
          ipAddress NVARCHAR(45),
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (userId) REFERENCES Users(id)
        )
      `);

      // Create WorkspaceUsers table for user-workspace assignments
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WorkspaceUsers' AND xtype='U')
        CREATE TABLE WorkspaceUsers (
          id NVARCHAR(255) PRIMARY KEY,
          workspaceId NVARCHAR(255) NOT NULL,
          userId NVARCHAR(255) NOT NULL,
          accessLevel NVARCHAR(50) DEFAULT 'member' CHECK (accessLevel IN ('owner', 'admin', 'member', 'readonly')),
          assignedBy NVARCHAR(255),
          assignedAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (workspaceId) REFERENCES Workspaces(id) ON DELETE CASCADE,
          FOREIGN KEY (userId) REFERENCES Users(id),
          FOREIGN KEY (assignedBy) REFERENCES Users(id),
          UNIQUE(workspaceId, userId)
        )
      `);

      // Create AuditLogs table
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='AuditLogs' AND xtype='U')
        CREATE TABLE AuditLogs (
          id NVARCHAR(255) PRIMARY KEY,
          userId NVARCHAR(255),
          action NVARCHAR(100) NOT NULL,
          resource NVARCHAR(100) NOT NULL,
          resourceId NVARCHAR(255),
          details NVARCHAR(MAX),
          ipAddress NVARCHAR(45),
          userAgent NVARCHAR(1000),
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (userId) REFERENCES Users(id)
        )
      `);

      // Create DatabaseConnections table
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='DatabaseConnections' AND xtype='U')
        CREATE TABLE DatabaseConnections (
          id NVARCHAR(255) PRIMARY KEY,
          userId NVARCHAR(255) NOT NULL,
          name NVARCHAR(200) NOT NULL,
          type NVARCHAR(50) NOT NULL CHECK (type IN ('fabric', 'sql-server', 'mysql', 'postgresql', 'oracle', 'mongodb')),
          host NVARCHAR(500) NOT NULL,
          port INT NOT NULL,
          [database] NVARCHAR(200),
          username NVARCHAR(200),
          password NVARCHAR(500), -- In production, this should be encrypted
          status NVARCHAR(50) DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'error')),
          isDefault BIT DEFAULT 0,
          lastConnected DATETIME2,
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          updatedAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (userId) REFERENCES Users(id)
        )
      `);

      // Create Feedback table
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='Feedback' AND xtype='U')
        CREATE TABLE Feedback (
          id NVARCHAR(255) PRIMARY KEY,
          userId NVARCHAR(255) NOT NULL,
          subject NVARCHAR(500) NOT NULL,
          message NVARCHAR(MAX) NOT NULL,
          category NVARCHAR(100) NOT NULL CHECK (category IN ('bug', 'feature', 'improvement', 'general', 'complaint', 'compliment')),
          priority NVARCHAR(50) DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
          status NVARCHAR(50) DEFAULT 'open' CHECK (status IN ('open', 'in-progress', 'resolved', 'closed')),
          adminResponse NVARCHAR(MAX),
          adminId NVARCHAR(255),
          respondedAt DATETIME2,
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          updatedAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (userId) REFERENCES Users(id),
          FOREIGN KEY (adminId) REFERENCES Users(id)
        )
      `);

      // Create WorkspaceFiles table for workspace file attachments
      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='WorkspaceFiles' AND xtype='U')
        CREATE TABLE WorkspaceFiles (
          id NVARCHAR(255) PRIMARY KEY,
          originalName NVARCHAR(500) NOT NULL,
          fileName NVARCHAR(500) NOT NULL,
          mimeType NVARCHAR(200) NOT NULL,
          size BIGINT NOT NULL,
          url NVARCHAR(1000) NOT NULL,
          userId NVARCHAR(255) NOT NULL,
          workspaceId NVARCHAR(255) NOT NULL,
          createdAt DATETIME2 DEFAULT GETUTCDATE(),
          FOREIGN KEY (userId) REFERENCES Users(id) ON DELETE CASCADE,
          FOREIGN KEY (workspaceId) REFERENCES Workspaces(id) ON DELETE NO ACTION
        )
      `);

      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_WorkspaceFiles_WorkspaceId')
        CREATE INDEX IX_WorkspaceFiles_WorkspaceId ON WorkspaceFiles(workspaceId)
      `);

      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_WorkspaceFiles_UserId')
        CREATE INDEX IX_WorkspaceFiles_UserId ON WorkspaceFiles(userId)
      `);

      await this.pool.request().query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_WorkspaceFiles_CreatedAt')
        CREATE INDEX IX_WorkspaceFiles_CreatedAt ON WorkspaceFiles(createdAt DESC)
      `);

      logger.info('✅ Database tables created/verified');
    } catch (error) {
      logger.error('❌ Failed to initialize database schema:', error);
      throw error;
    }
  }
}