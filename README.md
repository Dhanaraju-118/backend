# AIVA Backend Server

## Overview
This is the backend server for the AIVA application, built with Node.js, Express, and TypeScript. It provides RESTful APIs for authentication, chat functionality, user management, and integration with Azure services.

## Prerequisites
- Node.js (v18 or higher)
- npm or yarn
- Azure SQL Database access

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Configuration
The server requires several environment variables to be set. These are defined in the [.env](../.env) file in the parent directory:

```
# Database Configuration
SQL_SERVER=aivaserver.database.windows.net
SQL_DATABASE=aivadb
SQL_USERNAME=aivadbadmin
SQL_PASSWORD=ravi@0791
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERTIFICATE=false

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Azure Configuration
AZURE_KEY_VAULT_URL=https://aivakeys.vault.azure.net/
AZURE_TENANT_ID=53be55ec-4183-4a38-8c83-8e6e12e2318a
AZURE_CLIENT_ID=613e41ad-ed10-491c-8788-b42f488aaa29
AZURE_CLIENT_SECRET=ad73e712-46b5-42a4-a659-47f5c0db59d2
```

### 3. Database Initialization
Run the database initialization script to create tables and test users:

```bash
npm run init-db
```

This will:
- Create all required database tables
- Create test users:
  - Regular user: test@example.com / password123
  - Admin user: admin@example.com / admin123

### 4. Available Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm run start` | Start the production server |
| `npm run dev` | Start the development server with hot reloading |
| `npm run watch` | Watch for changes and restart server |
| `npm run init-db` | Initialize database schema and create test users |
| `npm run test-auth` | Test user authentication against database |

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register a new user
- `POST /api/auth/login` - Login with email and password
- `POST /api/auth/microsoft/callback` - Microsoft OAuth callback
- `GET /api/auth/verify` - Verify JWT token
- `POST /api/auth/logout` - Logout user

### User Management
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `GET /api/user/stats` - Get user statistics

### Chat
- `POST /api/chat/message` - Send a chat message
- `GET /api/chat` - Get user chats
- `POST /api/chat` - Create a new chat
- `GET /api/chat/:chatId/messages` - Get messages for a chat
- `DELETE /api/chat/:chatId` - Delete a chat

### Message Actions
- `GET /api/message-actions/liked` - Get liked messages
- `GET /api/message-actions/disliked` - Get disliked messages
- `POST /api/message-actions/:messageId/:actionType` - Add message action (like, dislike, bookmark)
- `DELETE /api/message-actions/:messageId/:actionType` - Remove message action

### Bookmarks
- `GET /api/bookmarks` - Get user bookmarks
- `POST /api/bookmarks/:messageId` - Add bookmark
- `DELETE /api/bookmarks/:messageId` - Remove bookmark

### History
- `GET /api/history` - Get chat history
- `GET /api/history/:chatId` - Get chat details

### Feedback
- `POST /api/feedback` - Submit feedback
- `GET /api/feedback/my-feedback` - Get user feedback

### Admin
- `GET /api/admin/users` - Get all users
- `PUT /api/admin/users/:userId` - Update user
- `DELETE /api/admin/users/:userId` - Delete user
- `GET /api/admin/feedback` - Get all feedback
- `PUT /api/admin/feedback/:feedbackId` - Update feedback
- `GET /api/admin/config` - Get system configuration
- `PUT /api/admin/config` - Update system configuration
- `GET /api/admin/keyvault/secrets` - Get Key Vault secrets
- `POST /api/admin/keyvault/secrets` - Set Key Vault secret

## Testing

### Test Authentication
```bash
npm run test-auth
```

### Test API Endpoints
You can test the API endpoints using tools like Postman or curl:

```bash
# Test login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

## Troubleshooting

### Database Connection Issues
If you encounter database connection issues:

1. Verify that your Azure SQL Database is accessible
2. Check that the firewall rules allow connections from your IP
3. Confirm that the database credentials in [.env](../.env) are correct
4. Test connectivity using the test script: `npm run test-auth`

### Authentication Errors
If login fails with "Invalid email or password":

1. Run `npm run init-db` to ensure test users exist
2. Run `npm run test-auth` to verify database authentication
3. Check that the JWT_SECRET is set in [.env](../.env)
4. Verify that the bcrypt hashing is working correctly

# AIVA Backend API

A comprehensive backend API for the AIVA (Intelligent Virtual Assistant) application built with Microsoft Azure services.

## 🏗️ Architecture

### Azure Services Used
- **Azure SQL Database** - Relational database for user data, chats, and messages
- **Azure Blob Storage** - File storage for user uploads
- **Azure OpenAI** - AI-powered chat responses
- **Azure App Configuration** - Centralized configuration management
- **Azure Active Directory** - Authentication and authorization
- **Azure Monitor** - Logging and monitoring

### Tech Stack
- **Node.js** with **TypeScript**
- **Express.js** - Web framework
- **JWT** - Authentication tokens
- **Winston** - Logging
- **Joi** - Input validation
- **Multer** - File uploads

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- Azure subscription
- Azure CLI (optional, for deployment)

### Installation

1. **Clone and setup**
   ```bash
   cd server
   npm install
   ```

2. **Environment Configuration**
   ```bash
   cp .env.example .env
   ```

3. **Configure Azure Services**
   Update `.env` with your Azure service credentials:
   - SQL Database server and credentials
   - Blob Storage account details
   - Azure OpenAI endpoint and key
   - Azure AD tenant and client information

4. **Start Development Server**
   ```bash
   npm run dev
   ```

5. **Build for Production**
   ```bash
   npm run build
   npm start
   ```

## 📚 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/microsoft/callback` - Microsoft OAuth callback
- `GET /api/auth/verify` - Verify JWT token
- `POST /api/auth/logout` - User logout

### Chat Endpoints
- `GET /api/chat` - Get user's chats
- `POST /api/chat` - Create new chat
- `POST /api/chat/message` - Send message and get AI response
- `GET /api/chat/:chatId/messages` - Get chat messages
- `DELETE /api/chat/:chatId` - Delete chat

### User Endpoints
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update user profile
- `GET /api/user/stats` - Get user statistics
- `DELETE /api/user/account` - Delete user account

### File Endpoints
- `POST /api/files/upload` - Upload file
- `GET /api/files` - Get user's files
- `GET /api/files/download/:fileName` - Download file
- `DELETE /api/files/:fileName` - Delete file

## 🔐 Security Features

### Authentication & Authorization
- JWT-based authentication
- Microsoft OAuth integration
- Role-based access control
- Token expiration and refresh

### Data Protection
- Input validation with Joi
- SQL injection prevention
- XSS protection with Helmet
- Rate limiting
- CORS configuration

### Azure Security
- Azure AD integration
- Cosmos DB with partition keys
- Blob Storage with access controls
- Encrypted data in transit and at rest

## 🗄️ Database Schema

### Users Table
```typescript
{
  id: string,           // Email as primary key
  firstName: string,
  lastName: string,
  email: string,
  password?: string,    // For local auth
  provider: string,     // 'local', 'microsoft', 'google'
  providerId?: string,
  createdAt: string,
  updatedAt: string,
  preferences?: object
}
```

### Chats Table
```typescript
{
  id: string,           // UUID
  userId: string,       // Foreign key to Users
  title: string,
  description: string,
  createdAt: string,
  updatedAt: string,
  messageCount: number
}
```

### Messages Table
```typescript
{
  id: string,           // UUID
  chatId: string,       // Foreign key to Chats
  userId: string,
  content: string,
  role: 'user' | 'assistant',
  createdAt: string
}
```

## 🔧 Configuration

### Environment Variables
- `AZURE_TENANT_ID` - Azure AD tenant ID
- `AZURE_CLIENT_ID` - Azure AD application ID
- `AZURE_CLIENT_SECRET` - Azure AD client secret
- `SQL_SERVER` - SQL Database server name
- `SQL_DATABASE` - Database name
- `SQL_USERNAME` - Database username
- `SQL_PASSWORD` - Database password
- `AZURE_STORAGE_ACCOUNT_NAME` - Storage account name
- `AZURE_OPENAI_ENDPOINT` - OpenAI service endpoint
- `JWT_SECRET` - JWT signing secret

### Azure Resource Setup

1. **Create Resource Group**
   ```bash
   az group create --name aiva-rg --location eastus
   ```

2. **Create SQL Database**
   ```bash
   az sql server create --name aiva-sql-server --resource-group aiva-rg --admin-user aivaadmin --admin-password YourPassword123!
   az sql db create --resource-group aiva-rg --server aiva-sql-server --name aiva-db --service-objective Basic
   ```

3. **Create Storage Account**
   ```bash
   az storage account create --name aivastorage --resource-group aiva-rg
   ```

4. **Create OpenAI Service**
   ```bash
   az cognitiveservices account create --name aiva-openai --resource-group aiva-rg --kind OpenAI
   ```

## 📊 Monitoring & Logging

### Winston Logging
- Console logging for development
- File logging for production
- Error tracking and debugging
- Request/response logging

### Azure Monitor Integration
- Application insights
- Performance monitoring
- Error tracking
- Custom metrics

## 🚀 Deployment

### Azure App Service
1. Create App Service plan
2. Deploy using Azure CLI or GitHub Actions
3. Configure environment variables
4. Set up custom domain and SSL

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

## 🧪 Testing

### Unit Tests
```bash
npm test
```

### API Testing
Use tools like Postman or Thunder Client to test endpoints.

### Load Testing
Use Azure Load Testing for performance validation.

## 📈 Performance Optimization

### Caching Strategy
- Redis for session storage (optional)
- SQL Database query optimization with indexes
- Blob Storage CDN integration

### Scaling
- Horizontal scaling with App Service
- Database partitioning
- Load balancing

## 🔍 Troubleshooting

### Common Issues
1. **SQL Database Connection** - Check server name, credentials, and firewall rules
2. **Authentication Errors** - Verify Azure AD configuration
3. **File Upload Issues** - Check storage account permissions
4. **OpenAI Errors** - Verify deployment and quota

### Debugging
- Check application logs in `logs/` directory
- Use Azure Monitor for cloud debugging
- Enable debug logging in development

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes with tests
4. Submit pull request

## 📄 License

This project is licensed under the MIT License.