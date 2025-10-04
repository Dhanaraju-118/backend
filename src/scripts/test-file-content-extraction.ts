import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { FileAnalysisService } from '../services/fileAnalysisService';
import { StorageService } from '../services/storage';
import { v4 as uuidv4 } from 'uuid';

async function testFileContentExtraction() {
  try {
    console.log('Testing file content extraction...');
    
    // Initialize services
    const storageService = StorageService.getInstance();
    const fileAnalysisService = FileAnalysisService.getInstance();
    
    // Test with a simple text file
    const testFileName = 'test-document.txt';
    const testContent = `This is a test document for file content extraction.
It contains multiple lines of text to verify that the extraction process is working correctly.
The document also includes some key points:
1. First key point about the document
2. Second key point with important information
3. Third key point summarizing the content

This would be used in a workspace for semantic search and RAG functionality.`;
    
    // Upload test file to storage
    const buffer = Buffer.from(testContent, 'utf-8');
    const uploadResult = await storageService.uploadFile(buffer, testFileName, 'text/plain', 'test-user');
    console.log(`Uploaded test file: ${uploadResult.fileName}`);
    
    // Test file content extraction
    console.log('\nTesting file content extraction...');
    const fileContentResult = await fileAnalysisService.extractFileContent(uploadResult.fileName, testFileName);
    console.log('File content extraction result:');
    console.log(`  File name: ${fileContentResult.fileName}`);
    console.log(`  Original name: ${fileContentResult.originalName}`);
    console.log(`  Content length: ${fileContentResult.content.length}`);
    console.log(`  Content preview: ${fileContentResult.content.substring(0, 100)}...`);
    
    // Test file analysis
    console.log('\nTesting file analysis...');
    const analysisResult = await fileAnalysisService.analyzeFile(uploadResult.fileName, 'text/plain');
    console.log('File analysis result:');
    console.log(`  Summary: ${analysisResult.summary}`);
    console.log(`  Key points: ${analysisResult.keyPoints.join(', ')}`);
    console.log(`  Sentiment: ${analysisResult.sentiment}`);
    console.log(`  Language: ${analysisResult.language}`);
    
    // Clean up
    console.log('\nCleaning up test file...');
    await storageService.deleteFile(uploadResult.fileName);
    console.log('Test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testFileContentExtraction();