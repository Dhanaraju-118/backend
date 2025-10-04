import express from 'express';
import { ConfidentialClientApplication } from '@azure/msal-node';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import Joi from 'joi';
import { logger } from '../utils/logger';
import { createUser, getUserById, getUserByEmail } from '../services/azure';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// MSAL configuration
let cca: ConfidentialClientApplication | null = null;

// Only initialize MSAL if all required environment variables are present
if (process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET && process.env.AZURE_TENANT_ID) {
  const msalConfig = {
    auth: {
      clientId: process.env.AZURE_CLIENT_ID,
      clientSecret: process.env.AZURE_CLIENT_SECRET,
      authority: `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`
    }
  };
  
  try {
    cca = new ConfidentialClientApplication(msalConfig);
    logger.info('✅ Microsoft Authentication initialized');
  } catch (error) {
    logger.error('❌ Failed to initialize Microsoft Authentication:', error);
  }
} else {
  logger.warn('⚠️ Microsoft Authentication not initialized: Missing environment variables');
}

// Validation schemas
const registerSchema = Joi.object({
  firstName: Joi.string().required().min(2).max(50),
  lastName: Joi.string().required().min(2).max(50),
  email: Joi.string().email().required(),
  password: Joi.string().min(6).required()
});

const loginSchema = Joi.object({
  email: Joi.string().email().required(),
  password: Joi.string().required(),
  adminLogin: Joi.boolean().optional() // Allow adminLogin field but make it optional
});

// Helper function to generate JWT token
function generateToken(userId: string, email: string, role: string = 'user') {
  return jwt.sign(
    { userId, email, role },
    process.env.JWT_SECRET as string,
    { expiresIn: process.env.JWT_EXPIRES_IN || '24h' } as jwt.SignOptions
  );
}

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    const { error, value } = registerSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    const { firstName, lastName, email, password } = value;

    // Check if user already exists by email
    let existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'User already exists',
        message: 'An account with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create user with proper ID format
    const userData = {
      id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      firstName,
      lastName,
      email,
      password: hashedPassword,
      provider: 'local',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const user = await createUser(userData);

    // Generate token
    const token = generateToken(user.id, user.email, user.role || 'user');

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.status(201).json({
      message: 'User registered successfully',
      user: userResponse,
      token
    });

    logger.info(`User registered: ${email}`);
  } catch (error) {
    logger.error('Registration error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to register user'
    });
  }
});

// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { error, value } = loginSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        error: 'Validation error',
        details: error.details[0].message
      });
    }

    const { email, password } = value;
    const { adminLogin } = req.body; // Check if this is an admin login request

    // Get user by email (since that's how local users are stored)
    const user = await getUserByEmail(email);
    if (!user) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
    }

    // If this is an admin login request, check if user has admin role
    if (adminLogin && user.role !== 'admin') {
      return res.status(403).json({
        error: 'Access denied',
        message: 'Admin privileges required'
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        error: 'Authentication failed',
        message: 'Invalid email or password'
      });
    }

    // Generate token
    const token = generateToken(user.id, user.email, user.role || 'user');

    // Remove password from response
    const { password: _, ...userResponse } = user;

    res.json({
      message: 'Login successful',
      user: userResponse,
      token
    });

    logger.info(`User logged in: ${email}`);
  } catch (error) {
    logger.error('Login error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Failed to login'
    });
  }
});

// Microsoft OAuth callback
router.post('/microsoft/callback', async (req, res) => {
  try {
    // Check if we're receiving user data directly (new approach) or authorization code (old approach)
    const { code, email, name, clientId, tenantId } = req.body;

    // If we have user data directly, use it (new approach)
    if (email) {
      // Validate email
      if (!email) {
        return res.status(400).json({
          error: 'Email is required'
        });
      }

      // Check if user exists, create if not
      let user = await getUserByEmail(email);
      
      if (!user) {
        const [firstName, ...lastNameParts] = (name || email.split('@')[0]).split(' ');
        const lastName = lastNameParts.join(' ');

        // Generate a proper user ID
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const userData = {
          id: userId,
          firstName: firstName || email.split('@')[0],
          lastName: lastName || '',
          email,
          provider: 'microsoft',
          providerId: null, // We don't have this in the new approach
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        user = await createUser(userData);
      }

      // Generate JWT token
      const token = generateToken(user.id, user.email, user.role || 'user');

      return res.json({
        message: 'Microsoft login successful',
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          provider: user.provider
        },
        token
      });

      logger.info(`Microsoft OAuth login: ${email}`);
    }

    // If we have an authorization code, use the old approach
    if (code) {
      // Use client-provided clientId and tenantId if available
      const msalConfigForRequest = {
        auth: {
          clientId: clientId || process.env.AZURE_CLIENT_ID,
          clientSecret: process.env.AZURE_CLIENT_SECRET,
          authority: tenantId ? 
            `https://login.microsoftonline.com/${tenantId}` : 
            `https://login.microsoftonline.com/${process.env.AZURE_TENANT_ID}`
        }
      };

      // Create a new confidential client application with the provided config
      const clientApp = new ConfidentialClientApplication(msalConfigForRequest);

      // Exchange code for tokens
      const tokenRequest = {
        code,
        scopes: ['openid', 'profile', 'email'],
        redirectUri: process.env.MICROSOFT_REDIRECT_URI!
      };

      const response = await clientApp.acquireTokenByCode(tokenRequest);
      
      if (!response) {
        return res.status(400).json({
          error: 'Failed to acquire token'
        });
      }

      // Extract user info from token
      const { account } = response;
      const email = account?.username;
      const name = account?.name;

      if (!email) {
        return res.status(400).json({
          error: 'Email not found in token'
        });
      }

      // Check if user exists, create if not
      let user = await getUserByEmail(email);
      
      if (!user) {
        const [firstName, ...lastNameParts] = (name || email.split('@')[0]).split(' ');
        const lastName = lastNameParts.join(' ');

        // Generate a proper user ID
        const userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const userData = {
          id: userId,
          firstName: firstName || email.split('@')[0],
          lastName: lastName || '',
          email,
          provider: 'microsoft',
          providerId: account?.localAccountId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        user = await createUser(userData);
      }

      // Generate JWT token
      const token = generateToken(user.id, user.email, user.role || 'user');

      res.json({
        message: 'Microsoft login successful',
        user: {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          provider: user.provider
        },
        token
      });

      logger.info(`Microsoft OAuth login: ${email}`);
    } else {
      // Neither email nor code provided
      return res.status(400).json({
        error: 'Either email or authorization code is required'
      });
    }
  } catch (error) {
    logger.error('Microsoft OAuth error:', error);
    res.status(500).json({
      error: 'Microsoft authentication failed',
      message: 'Please try again'
    });
  }
});

// Google OAuth callback (placeholder - requires Google OAuth setup)
router.post('/google/callback', async (req, res) => {
  try {
    // This would require Google OAuth library setup
    // For now, return a placeholder response
    res.status(501).json({
      error: 'Google OAuth not implemented yet',
      message: 'Please use Microsoft login or email/password'
    });
  } catch (error) {
    logger.error('Google OAuth error:', error);
    res.status(500).json({
      error: 'Google authentication failed'
    });
  }
});

// Yahoo OAuth callback (placeholder)
router.post('/yahoo/callback', async (req, res) => {
  try {
    res.status(501).json({
      error: 'Yahoo OAuth not implemented yet',
      message: 'Please use Microsoft login or email/password'
    });
  } catch (error) {
    logger.error('Yahoo OAuth error:', error);
    res.status(500).json({
      error: 'Yahoo authentication failed'
    });
  }
});

// Verify token endpoint
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    // In development mode with bypass auth, we need to handle the test user properly
    if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
      // Check if this is the test user
      if (req.user.userId === 'test-user-id') {
        // For the test user, we need to make sure it exists in the database
        try {
          let user = await getUserById(req.user.userId);
          
          // If user doesn't exist in database, create it
          if (!user) {
            const userData = {
              id: req.user.userId,
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              provider: 'local',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            };
            
            try {
              user = await createUser(userData);
            } catch (createError) {
              // User might already exist with a different ID, try to get by email
              user = await getUserByEmail('test@example.com');
              if (!user) {
                throw createError;
              }
            }
          }
          
          const { password: _, ...userResponse } = user;
          
          return res.json({
            message: 'Token valid',
            user: userResponse
          });
        } catch (dbError) {
          // If database is not available, return the test user data directly
          logger.warn('Database not available, returning mock user data:', dbError);
          return res.json({
            message: 'Token valid',
            user: {
              id: req.user.userId,
              firstName: 'Test',
              lastName: 'User',
              email: 'test@example.com',
              provider: 'local',
              role: 'user'
            }
          });
        }
      }
    }
    
    try {
      const user = await getUserById(req.user.userId);
      
      if (!user) {
        return res.status(404).json({
          error: 'User not found'
        });
      }

      const { password: _, ...userResponse } = user;

      res.json({
        message: 'Token valid',
        user: userResponse
      });
    } catch (dbError) {
      // If database is not available, return an error
      logger.error('Database error during token verification:', dbError);
      return res.status(500).json({
        error: 'Database connection failed',
        message: 'Unable to verify user due to database connection issues'
      });
    }
  } catch (error) {
    logger.error('Token verification error:', error);
    res.status(500).json({
      error: 'Token verification failed'
    });
  }
});

// Logout endpoint
router.post('/logout', authenticateToken, (req, res) => {
  // In a stateless JWT system, logout is handled client-side
  // You could implement token blacklisting here if needed
  res.json({
    message: 'Logout successful'
  });
});

export { router as authRoutes };