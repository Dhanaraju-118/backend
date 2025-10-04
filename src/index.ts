import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { requestSizeLimiter, corsOptions } from './middleware/security';
import { generalLimiter } from './middleware/rateLimiter';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { authRoutes } from './routes/auth';
import { chatRoutes } from './routes/chat';
import { userRoutes } from './routes/user';
import { dataRoutes } from './routes/data';
import { fileRoutes } from './routes/files';
import { workspaceRoutes } from './routes/workspace';
import { searchRoutes } from './routes/search';
import { adminRoutes } from './routes/admin';
import { feedbackRoutes } from './routes/feedback';
import { adminDataRoutes } from './routes/adminData';
import { configRoutes } from './routes/config';
import { bookmarkRoutes } from './routes/bookmarks';
import { messageActionRoutes } from './routes/messageActions';
import { historyRoutes } from './routes/history';
import { fileAnalysisRoutes } from './routes/fileAnalysis';
import { keyVaultRoutes } from './routes/keyVault';
import { DatabaseManager } from './config/database';
import { StorageService } from './services/storage';
import { CacheService } from './services/cache';
import { authenticateToken, requireAdmin } from './middleware/auth';

// Load environment variables
dotenv.config();

export const app = express();
// Use port 3002 instead of 3001 to avoid conflicts
const PORT = process.env.PORT || 3002;

app.use(requestSizeLimiter);
app.use(compression());

// Rate limiting
app.use(generalLimiter);

// CORS configuration
app.use(cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'AIVA Backend API',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  });
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'AIVA Backend API',
    version: process.env.npm_package_version || '1.0.0',
    description: 'AI-powered chat application backend',
    endpoints: {
      auth: '/api/auth',
      chat: '/api/chat',
      user: '/api/user',
      files: '/api/files',
      workspaces: '/api/workspaces',
      search: '/api/search',
      feedback: '/api/feedback',
      keyVault: '/api/admin/keyvault',
      fileAnalysis: '/api/file-analysis'
    }
  });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/user', userRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/workspaces', workspaceRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', authenticateToken, requireAdmin, adminRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/admin/data', authenticateToken, requireAdmin, adminDataRoutes);
app.use('/api/admin/config', authenticateToken, requireAdmin, configRoutes);
app.use('/api/bookmarks', bookmarkRoutes);
app.use('/api/message-actions', messageActionRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/file-analysis', fileAnalysisRoutes);
app.use('/api/admin/keyvault', authenticateToken, requireAdmin, keyVaultRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    message: `Cannot ${req.method} ${req.originalUrl}`
  });
});

// Initialize services and start server
async function startServer() {
  try {
    // Initialize Azure services
    const { initializeAzureServices } = require('./services/azure');
    await initializeAzureServices();
    logger.info('✅ Azure services initialized');
    
    // Initialize ConfigurationManager to load settings from Key Vault
    const { ConfigurationManager } = require('./services/configurationManager');
    const configManager = ConfigurationManager.getInstance();
    await configManager.initialize();
    logger.info('✅ Configuration Manager initialized with Key Vault integration');
    
    // Note: Database initialization is handled by Azure services
    
    // Initialize storage
    const storageService = StorageService.getInstance();
    await storageService.initialize();
    await storageService.initializeContainer();
    logger.info('✅ Storage service ready');
    
    // Initialize cache
    const cacheService = CacheService.getInstance();
    await cacheService.initialize();
    logger.info('✅ Cache service ready');
    
    app.listen(PORT, () => {
      logger.info(`🚀 AIVA Backend API running on port ${PORT}`);
      logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      logger.info(`📚 API info: http://localhost:${PORT}/api`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV}`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  
  // Cleanup services
  const dbManager = DatabaseManager.getInstance();
  dbManager.disconnect();
  
  const cacheService = CacheService.getInstance();
  cacheService.destroy();
  
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  
  // Cleanup services
  const dbManager = DatabaseManager.getInstance();
  dbManager.disconnect();
  
  const cacheService = CacheService.getInstance();
  cacheService.destroy();
  
  process.exit(0);
});

startServer();

