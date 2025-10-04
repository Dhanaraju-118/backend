import { v4 as uuidv4 } from 'uuid';
import { WorkspaceStorageService } from '../services/workspaceStorage';
import { AzureSearchService } from '../services/azureSearchService';
import { logger } from '../utils/logger';

async function testFullWorkspaceSemanticSearch() {
  try {
    console.log('Testing full workspace semantic search workflow...');
    
    // Initialize services
    const workspaceStorageService = WorkspaceStorageService.getInstance();
    const azureSearchService = AzureSearchService.getInstance();
    
    // Test workspace data
    const testWorkspaceId = uuidv4();
    const testWorkspaceName = 'Full Workflow Test Workspace';
    
    console.log(`Test workspace ID: ${testWorkspaceId}`);
    console.log(`Test workspace name: ${testWorkspaceName}`);
    
    // Step 1: Create workspace folder
    console.log('Step 1: Creating workspace folder...');
    const folderPath = await workspaceStorageService.createWorkspaceFolder(testWorkspaceId, testWorkspaceName);
    console.log(`✓ Workspace folder created: ${folderPath}`);
    
    // Step 2: Get workspace folder name and index name
    const workspaceFolderName = workspaceStorageService.getWorkspaceFolderName(testWorkspaceId, testWorkspaceName);
    const indexName = `${workspaceFolderName}index`;
    const semanticConfigName = `search${indexName}`;
    
    console.log(`Workspace folder name: ${workspaceFolderName}`);
    console.log(`Index name: ${indexName}`);
    console.log(`Semantic config name: ${semanticConfigName}`);
    
    // Step 3: Create Azure Search index (this should automatically configure semantic search)
    console.log('Step 3: Creating Azure Search index with semantic configuration...');
    const indexCreated = await azureSearchService.createWorkspaceIndex(indexName);
    console.log(`✓ Index creation result: ${indexCreated}`);
    
    if (indexCreated) {
      // Wait for index to be fully created
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Step 4: Create and index test documents
      console.log('Step 4: Creating and indexing test documents...');
      
      // Document 1: Technical document
      const techDocument = {
        id: 'tech-doc-1',
        content: `
          # Machine Learning Framework Design Document
          
          ## Overview
          This document describes the architecture of our machine learning framework, which is designed to 
          process large-scale datasets and provide real-time predictions. The framework is built on 
          microservices architecture and uses containerization for deployment.
          
          ## Key Components
          1. **Data Ingestion Service**: Handles streaming data from various sources
          2. **Feature Engineering Pipeline**: Processes raw data into model-ready features
          3. **Model Training Service**: Trains machine learning models using distributed computing
          4. **Prediction Engine**: Serves real-time predictions with low latency
          5. **Monitoring Dashboard**: Provides insights into model performance and system health
          
          ## Technical Stack
          - Kubernetes for container orchestration
          - Apache Kafka for data streaming
          - TensorFlow and PyTorch for model development
          - Redis for caching frequently accessed predictions
          - PostgreSQL for storing model metadata and training logs
          
          ## Performance Metrics
          - Prediction latency: < 50ms for 95th percentile
          - Model accuracy: > 92% for classification tasks
          - System uptime: 99.9% SLA
        `,
        fileName: 'ml-framework-design.txt',
        fileType: 'text/plain',
        workspaceId: testWorkspaceId,
        workspaceName: testWorkspaceName,
        uploadedBy: 'test-user',
        uploadedAt: new Date().toISOString(),
        summary: 'Design document for machine learning framework with microservices architecture',
        keyPoints: ['Microservices architecture', 'Real-time predictions', 'Kubernetes deployment', 'Performance metrics']
      };
      
      // Document 2: Business requirements document
      const bizDocument = {
        id: 'biz-doc-1',
        content: `
          # Business Requirements for Customer Analytics Platform
          
          ## Project Objective
          Develop a comprehensive customer analytics platform that provides actionable insights to 
          improve customer retention and increase lifetime value. The platform should integrate with 
          existing CRM and marketing systems.
          
          ## Key Requirements
          1. **Customer Segmentation**: Automatically group customers based on behavior and demographics
          2. **Predictive Analytics**: Forecast customer churn and identify upsell opportunities
          3. **Real-time Dashboards**: Display key metrics and trends with interactive visualizations
          4. **Campaign Management**: Track marketing campaign effectiveness and ROI
          5. **Data Privacy**: Ensure compliance with GDPR and other privacy regulations
          
          ## Success Metrics
          - Reduce customer churn by 15%
          - Increase customer lifetime value by 20%
          - Improve marketing campaign ROI by 25%
          - Achieve 99% data accuracy and completeness
          
          ## Timeline and Budget
          - Phase 1 (Data Integration): 3 months, $150K
          - Phase 2 (Analytics Engine): 4 months, $200K
          - Phase 3 (Dashboard and Reports): 2 months, $100K
          - Total Budget: $450K
        `,
        fileName: 'customer-analytics-requirements.txt',
        fileType: 'text/plain',
        workspaceId: testWorkspaceId,
        workspaceName: testWorkspaceName,
        uploadedBy: 'test-user',
        uploadedAt: new Date().toISOString(),
        summary: 'Business requirements for customer analytics platform project',
        keyPoints: ['Customer segmentation', 'Predictive analytics', 'Real-time dashboards', 'Data privacy compliance']
      };
      
      // Index both documents
      console.log('Indexing technical document...');
      const techIndexResult = await azureSearchService.indexDocument(indexName, techDocument);
      console.log(`✓ Technical document indexing result: ${techIndexResult}`);
      
      console.log('Indexing business document...');
      const bizIndexResult = await azureSearchService.indexDocument(indexName, bizDocument);
      console.log(`✓ Business document indexing result: ${bizIndexResult}`);
      
      // Wait for indexing to complete
      console.log('Waiting for indexing to complete...');
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Step 5: Test semantic search queries
      console.log('Step 5: Testing semantic search queries...');
      
      // Test query 1: Technical architecture
      console.log('\nTest 1: Asking about technical architecture...');
      const results1 = await azureSearchService.searchDocuments(indexName, 'What is the technical architecture of the machine learning framework?');
      console.log(`Found ${results1.length} results`);
      if (results1.length > 0) {
        console.log('Top result:');
        console.log(`  File: ${results1[0].fileName}`);
        console.log(`  Summary: ${results1[0].summary}`);
        console.log(`  Score: ${results1[0]['@search.score']}`);
        console.log(`  Semantic score: ${results1[0]['@search.semantic.score']}`);
      }
      
      // Test query 2: Business requirements
      console.log('\nTest 2: Asking about business requirements...');
      const results2 = await azureSearchService.searchDocuments(indexName, 'What are the success metrics for the customer analytics project?');
      console.log(`Found ${results2.length} results`);
      if (results2.length > 0) {
        console.log('Top result:');
        console.log(`  File: ${results2[0].fileName}`);
        console.log(`  Summary: ${results2[0].summary}`);
        console.log(`  Score: ${results2[0]['@search.score']}`);
        console.log(`  Semantic score: ${results2[0]['@search.semantic.score']}`);
      }
      
      // Test query 3: Cross-document query
      console.log('\nTest 3: Asking cross-cutting question...');
      const results3 = await azureSearchService.searchDocuments(indexName, 'How does the system ensure data privacy and compliance?');
      console.log(`Found ${results3.length} results`);
      if (results3.length > 0) {
        console.log('Top result:');
        console.log(`  File: ${results3[0].fileName}`);
        console.log(`  Summary: ${results3[0].summary}`);
        console.log(`  Score: ${results3[0]['@search.score']}`);
        console.log(`  Semantic score: ${results3[0]['@search.semantic.score']}`);
      }
    }
    
    // Step 6: Clean up
    console.log('\nStep 6: Cleaning up test resources...');
    await azureSearchService.deleteWorkspaceIndex(indexName);
    await workspaceStorageService.deleteWorkspaceFolder(testWorkspaceId, testWorkspaceName);
    
    console.log('\n✓ Full workspace semantic search workflow test completed successfully!');
    
  } catch (error) {
    console.error('Test failed:', error);
    throw error;
  }
}

// Run the test
testFullWorkspaceSemanticSearch();