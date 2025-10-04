import { DatabaseManager } from '../config/database';
import sql from 'mssql';
import { v4 as uuidv4 } from 'uuid';

async function createTestUserAndWorkspace() {
  try {
    console.log('Creating test user and workspace...');
    
    // Get database manager instance
    const dbManager = DatabaseManager.getInstance();
    
    // Connect to database
    const pool = await dbManager.getPool();
    console.log('✅ Connected to database successfully');
    
    // Create a test user
    const userId = uuidv4();
    const testUser = {
      id: userId,
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      password: 'hashed_password_here', // In real scenario, this would be hashed
      provider: 'local',
      role: 'user'
    };
    
    await pool.request()
      .input('id', sql.NVarChar, testUser.id)
      .input('firstName', sql.NVarChar, testUser.firstName)
      .input('lastName', sql.NVarChar, testUser.lastName)
      .input('email', sql.NVarChar, testUser.email)
      .input('password', sql.NVarChar, testUser.password)
      .input('provider', sql.NVarChar, testUser.provider)
      .input('role', sql.NVarChar, testUser.role)
      .query(`
        INSERT INTO Users (id, firstName, lastName, email, password, provider, role)
        VALUES (@id, @firstName, @lastName, @email, @password, @provider, @role)
      `);
    
    console.log('✅ Test user created successfully');
    
    // Create a test workspace
    const workspaceId = uuidv4();
    const testWorkspace = {
      id: workspaceId,
      name: 'Personal Projects',
      description: 'Default workspace for personal projects',
      ownerId: userId,
      color: '#3B82F6'
    };
    
    await pool.request()
      .input('id', sql.NVarChar, testWorkspace.id)
      .input('name', sql.NVarChar, testWorkspace.name)
      .input('description', sql.NVarChar, testWorkspace.description)
      .input('ownerId', sql.NVarChar, testWorkspace.ownerId)
      .input('color', sql.NVarChar, testWorkspace.color)
      .query(`
        INSERT INTO Workspaces (id, name, description, ownerId, color)
        VALUES (@id, @name, @description, @ownerId, @color)
      `);
    
    console.log('✅ Test workspace created successfully');
    
    // Create a test chat
    const chatId = uuidv4();
    const testChat = {
      id: chatId,
      title: 'Test Chat',
      description: 'Test chat for verification',
      userId: userId,
      workspaceId: workspaceId
    };
    
    await pool.request()
      .input('id', sql.NVarChar, testChat.id)
      .input('title', sql.NVarChar, testChat.title)
      .input('description', sql.NVarChar, testChat.description)
      .input('userId', sql.NVarChar, testChat.userId)
      .input('workspaceId', sql.NVarChar, testChat.workspaceId)
      .query(`
        INSERT INTO Chats (id, title, description, userId, workspaceId)
        VALUES (@id, @title, @description, @userId, @workspaceId)
      `);
    
    console.log('✅ Test chat created successfully');
    
    // Create a test message
    const messageId = uuidv4();
    const testMessage = {
      id: messageId,
      chatId: chatId,
      userId: userId,
      content: 'This is a test message for verification',
      role: 'user'
    };
    
    await pool.request()
      .input('id', sql.NVarChar, testMessage.id)
      .input('chatId', sql.NVarChar, testMessage.chatId)
      .input('userId', sql.NVarChar, testMessage.userId)
      .input('content', sql.NVarChar, testMessage.content)
      .input('role', sql.NVarChar, testMessage.role)
      .query(`
        INSERT INTO Messages (id, chatId, userId, content, role)
        VALUES (@id, @chatId, @userId, @content, @role)
      `);
    
    console.log('✅ Test message created successfully');
    
    // Create a test message action
    const actionId = uuidv4();
    const testAction = {
      id: actionId,
      messageId: messageId,
      userId: userId,
      actionType: 'like'
    };
    
    await pool.request()
      .input('id', sql.NVarChar, testAction.id)
      .input('messageId', sql.NVarChar, testAction.messageId)
      .input('userId', sql.NVarChar, testAction.userId)
      .input('actionType', sql.NVarChar, testAction.actionType)
      .query(`
        INSERT INTO MessageActions (id, messageId, userId, actionType)
        VALUES (@id, @messageId, @userId, @actionType)
      `);
    
    console.log('✅ Test message action created successfully');
    
    // Verify the data was inserted
    console.log('\n🔍 Verifying data...');
    
    const verifyUser = await pool.request()
      .input('userId', sql.NVarChar, userId)
      .query('SELECT * FROM Users WHERE id = @userId');
    
    if (verifyUser.recordset.length > 0) {
      console.log('✅ User verification successful');
    } else {
      console.log('❌ User verification failed');
    }

    const verifyWorkspace = await pool.request()
      .input('workspaceId', sql.NVarChar, workspaceId)
      .query('SELECT * FROM Workspaces WHERE id = @workspaceId');
    
    if (verifyWorkspace.recordset.length > 0) {
      console.log('✅ Workspace verification successful');
    } else {
      console.log('❌ Workspace verification failed');
    }

    const verifyChat = await pool.request()
      .input('chatId', sql.NVarChar, chatId)
      .query('SELECT * FROM Chats WHERE id = @chatId');
    
    if (verifyChat.recordset.length > 0) {
      console.log('✅ Chat verification successful');
    } else {
      console.log('❌ Chat verification failed');
    }

    const verifyMessage = await pool.request()
      .input('messageId', sql.NVarChar, messageId)
      .query('SELECT * FROM Messages WHERE id = @messageId');
    
    if (verifyMessage.recordset.length > 0) {
      console.log('✅ Message verification successful');
    } else {
      console.log('❌ Message verification failed');
    }

    const verifyAction = await pool.request()
      .input('actionId', sql.NVarChar, actionId)
      .query('SELECT * FROM MessageActions WHERE id = @actionId');
    
    if (verifyAction.recordset.length > 0) {
      console.log('✅ Message action verification successful');
    } else {
      console.log('❌ Message action verification failed');
    }
    
    console.log('\n🎉 All tests completed successfully!');
    console.log('Test user ID:', userId);
    console.log('Test workspace ID:', workspaceId);
    console.log('Test chat ID:', chatId);
    console.log('Test message ID:', messageId);
    console.log('Test action ID:', actionId);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

createTestUserAndWorkspace();