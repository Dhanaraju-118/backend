import express from 'express';
import { authenticateToken } from '../middleware/auth';
import { FileAnalysisService } from '../services/fileAnalysisService';
import { logger } from '../utils/logger';

const router = express.Router();

// Apply authentication to all file analysis routes
router.use(authenticateToken);

// Initialize the file analysis service
const fileAnalysisService = FileAnalysisService.getInstance();

/**
 * Analyze a file's content using Azure OpenAI
 * POST /api/file-analysis/analyze/:fileName
 */
router.post('/analyze/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    const userId = req.user.userId;
    
    logger.info(`Analyzing file: ${fileName} for user: ${userId}`);
    
    // In a production environment, you would verify:
    // 1. The file exists
    // 2. The user has permission to access the file
    // 3. The file is within size limits for processing
    
    const result = await fileAnalysisService.analyzeFile(fileName);
    
    res.json({
      message: 'File analysis completed successfully',
      analysis: result
    });
    
  } catch (error) {
    logger.error('File analysis error:', error);
    res.status(500).json({
      error: 'Failed to analyze file',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * Compare multiple files
 * POST /api/file-analysis/compare
 */
router.post('/compare', async (req, res) => {
  try {
    const { fileNames } = req.body;
    const userId = req.user.userId;
    
    if (!fileNames || !Array.isArray(fileNames) || fileNames.length === 0) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Please provide an array of file names to compare'
      });
    }
    
    if (fileNames.length > 5) {
      return res.status(400).json({
        error: 'Too many files',
        message: 'You can compare up to 5 files at a time'
      });
    }
    
    logger.info(`Comparing ${fileNames.length} files for user: ${userId}`);
    
    const result = await fileAnalysisService.compareFiles(fileNames);
    
    res.json({
      message: 'File comparison completed successfully',
      comparison: result
    });
    
  } catch (error) {
    logger.error('File comparison error:', error);
    res.status(500).json({
      error: 'Failed to compare files',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

/**
 * Extract specific information from a file
 * POST /api/file-analysis/extract/:fileName
 */
router.post('/extract/:fileName', async (req, res) => {
  try {
    const { fileName } = req.params;
    const { prompt } = req.body;
    const userId = req.user.userId;
    
    if (!prompt) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'Please provide a prompt for information extraction'
      });
    }
    
    logger.info(`Extracting information from file: ${fileName} for user: ${userId}`);
    
    const extractedInfo = await fileAnalysisService.extractInformation(fileName, prompt);
    
    res.json({
      message: 'Information extraction completed successfully',
      extractedInfo
    });
    
  } catch (error) {
    logger.error('Information extraction error:', error);
    res.status(500).json({
      error: 'Failed to extract information',
      message: error instanceof Error ? error.message : 'Unknown error occurred'
    });
  }
});

export { router as fileAnalysisRoutes };