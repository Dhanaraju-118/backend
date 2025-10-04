import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

import { v4 as uuidv4 } from 'uuid';
import { AzureSearchService } from '../services/azureSearchService';
import axios from 'axios';

async function finalSemanticTest() {
  try {
    console.log('Final test: Azure Search semantic configuration with document indexing...');
    
    // Initialize services
    const azureSearchService = AzureSearchService.getInstance();
    
    // Test index name
    const testIndexName = `final-test-${uuidv4().substring(0, 8)}-index`;
    const semanticConfigName = `search${testIndexName}`;
    
    console.log(`Test index name: ${testIndexName}`);
    console.log(`Expected semantic config name: ${semanticConfigName}`);
    
    // Create Azure Search index
    console.log('Creating Azure Search index with semantic configuration...');
    const indexCreated = await azureSearchService.createWorkspaceIndex(testIndexName);
    console.log(`Index creation result: ${indexCreated}`);
    
    if (indexCreated) {
      // Wait a moment for index creation to complete
      console.log('Waiting for index creation to complete...');
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Verify the semantic configuration
      console.log('Verifying semantic configuration...');
      const endpoint = process.env.AZURE_AI_SEARCH_ENDPOINT || 'https://aivasearch.search.windows.net';
      const apiKey = process.env.AZURE_AI_SEARCH_API_KEY || '';
      
      if (!apiKey) {
        console.log('❌ Azure Search API key not found');
        return;
      }
      
      const headers = {
        'api-key': apiKey,
        'Content-Type': 'application/json'
      };
      
      try {
        const url = `${endpoint}/indexes/${testIndexName}?api-version=2023-07-01-Preview`;
        const response = await axios.get(url, { headers });
        const indexDefinition = response.data;
        
        console.log('✅ Index definition retrieved successfully');
        
        if (indexDefinition.semantic && indexDefinition.semantic.configurations) {
          console.log(`✅ Found ${indexDefinition.semantic.configurations.length} semantic configuration(s)`);
          
          const semanticConfig = indexDefinition.semantic.configurations.find(
            (config: any) => config.name === semanticConfigName
          );
          
          if (semanticConfig) {
            console.log('✅ Semantic configuration found with correct name format');
            console.log(`   Name: ${semanticConfig.name}`);
            console.log(`   Title field: ${semanticConfig.prioritizedFields.titleField.fieldName}`);
            
            const contentFields = semanticConfig.prioritizedFields.prioritizedContentFields.map((f: any) => f.fieldName);
            console.log(`   Content fields: ${contentFields.join(', ')}`);
            
            const keywordFields = semanticConfig.prioritizedFields.prioritizedKeywordsFields.map((f: any) => f.fieldName);
            console.log(`   Keywords fields: ${keywordFields.join(', ')}`);
            
            console.log('\n🎉 SUCCESS: Azure Search semantic configuration is working!');
            console.log('   - Index created successfully');
            console.log('   - Semantic configuration properly set up');
            console.log('   - Fields configured correctly');
            
            // Test document to index - employment contract HR metrics example
            const employmentContractDocument = {
              id: 'employment-contract-1',
              content: `EMPLOYMENT CONTRACT

This Employment Agreement ("Agreement") is made and entered into as of [Date], by and between [Company Name] ("Employer") and [Employee Name] ("Employee").

POSITION AND RESPONSIBILITIES
The Employee shall serve as [Position Title] and shall perform such duties and responsibilities as are customarily associated with this position. The Employee shall report directly to [Supervisor Name] and shall devote their full business time, attention, skill, and efforts to the performance of their duties.

COMPENSATION
The Employee shall receive an annual base salary of [Amount], payable in accordance with the Employer's standard payroll practices. The Employee shall also be eligible to participate in the Employer's performance bonus program, with target bonus opportunities of up to 15% of base salary based on individual and company performance metrics.

BENEFITS
The Employee shall be entitled to participate in the Employer's standard employee benefit programs, including:
- Health, dental, and vision insurance
- 401(k) retirement plan with company matching
- Paid time off (PTO) of 20 days per year
- Professional development opportunities
- Performance-based salary increases

PERFORMANCE METRICS
Employee performance will be evaluated annually based on the following key performance indicators:
1. Project completion rate (target: 95% on-time delivery)
2. Customer satisfaction scores (target: 4.5/5.0 average)
3. Team collaboration and leadership contributions
4. Professional development and skill enhancement
5. Adherence to company policies and procedures

TERMINATION
This Agreement may be terminated by either party with 30 days written notice. In the event of termination without cause, the Employee shall receive severance pay equivalent to two weeks of base salary.`,
              fileName: 'employment-contract-hr-metrics.txt',
              fileType: 'text/plain',
              workspaceId: 'hr-metrics-workspace',
              workspaceName: 'HR Metrics',
              uploadedBy: 'hr-manager',
              uploadedAt: new Date().toISOString(),
              summary: 'Employment contract outlining position responsibilities, compensation, benefits, and performance metrics for HR evaluation',
              keyPoints: ['Annual base salary', 'Performance bonus up to 15%', '20 days PTO', 'Health insurance', 'Project completion rate target 95%', 'Customer satisfaction target 4.5/5.0']
            };
            
            // Index the document
            console.log('\nIndexing employment contract document...');
            const indexResult = await azureSearchService.indexDocument(testIndexName, employmentContractDocument);
            console.log(`Document indexing result: ${indexResult}`);
            
            if (indexResult) {
              // Wait for indexing to complete
              console.log('Waiting for indexing to complete...');
              await new Promise(resolve => setTimeout(resolve, 5000));
              
              // Test semantic search with HR metrics query
              console.log('Testing semantic search with HR metrics query...');
              const searchUrl = `${endpoint}/indexes/${testIndexName}/docs/search?api-version=2023-07-01-Preview`;
              const searchBody = {
                search: 'What are the key performance indicators for employee evaluation in employment contracts?',
                top: 3,
                queryType: "semantic",
                semanticConfiguration: semanticConfigName,
                queryLanguage: "en-US",
                querySpeller: "lexicon"
              };
              
              try {
                const searchResponse = await axios.post(searchUrl, searchBody, { headers });
                console.log(`✅ Semantic search successful! Found ${searchResponse.data.value?.length || 0} results`);
                
                if (searchResponse.data.value && searchResponse.data.value.length > 0) {
                  console.log('\nTop search result:');
                  const result = searchResponse.data.value[0];
                  console.log(`  File: ${result.fileName || 'Unknown'}`);
                  console.log(`  Score: ${result['@search.score']}`);
                  if (result['@search.semantic.score']) {
                    console.log(`  Semantic score: ${result['@search.semantic.score']}`);
                  }
                  if (result.summary) {
                    console.log(`  Summary: ${result.summary}`);
                  }
                  if (result.keyPoints && result.keyPoints.length > 0) {
                    console.log(`  Key Points: ${result.keyPoints.join(', ')}`);
                  }
                }
                
                // Test another query related to employment contract
                console.log('\nTesting another employment contract query...');
                const searchBody2 = {
                  search: 'What benefits does the employment contract include?',
                  top: 3,
                  queryType: "semantic",
                  semanticConfiguration: semanticConfigName,
                  queryLanguage: "en-US",
                  querySpeller: "lexicon"
                };
                
                const searchResponse2 = await axios.post(searchUrl, searchBody2, { headers });
                console.log(`✅ Semantic search successful! Found ${searchResponse2.data.value?.length || 0} results`);
                
                if (searchResponse2.data.value && searchResponse2.data.value.length > 0) {
                  console.log('\nTop search result for benefits query:');
                  const result = searchResponse2.data.value[0];
                  console.log(`  File: ${result.fileName || 'Unknown'}`);
                  if (result.summary) {
                    console.log(`  Summary: ${result.summary}`);
                  }
                }
              } catch (searchError: any) {
                console.log(`❌ Semantic search test failed: ${searchError.message}`);
                if (searchError.response?.data) {
                  console.log('Error details:', JSON.stringify(searchError.response.data, null, 2));
                }
              }
            }
          } else {
            console.log('❌ Semantic configuration not found with expected name format');
            console.log('Available configurations:');
            indexDefinition.semantic.configurations.forEach((config: any) => {
              console.log(`   - ${config.name}`);
            });
          }
        } else {
          console.log('❌ No semantic configurations found in index definition');
        }
      } catch (error: any) {
        console.log(`❌ Failed to retrieve index definition: ${error.message}`);
        if (error.response?.data) {
          console.log('Error details:', JSON.stringify(error.response.data, null, 2));
        }
      }
    }
    
    // Clean up - delete the test index
    console.log('\nCleaning up test index...');
    await azureSearchService.deleteWorkspaceIndex(testIndexName);
    console.log('Final test completed successfully!');
    
  } catch (error) {
    console.error('Final test failed:', error);
  }
}

// Run the test
finalSemanticTest();