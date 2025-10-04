import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';
import { DatabaseManager } from '../config/database';
import sql from 'mssql';

// Extend Request interface to include user
declare global {
  namespace Express {
    interface Request {
      user: {
        userId: string;
        email: string;
        role?: string;
      };
    }
  }
}

export function authenticateToken(req: any, res: any, next: any) {
  // Development mode: bypass authentication for testing Azure SQL integration
  if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
    // Check if this is a request with a real token
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (token) {
      // If there's a token, verify it normally
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
        req.user = {
          userId: decoded.userId,
          email: decoded.email,
          role: decoded.role
        };
        return next();
      } catch (error) {
        logger.error('Token verification failed:', error);
        // Fall through to default test user
      }
    }
    
    // Default test user for bypass auth - make it an admin for testing
    req.user = {
      userId: 'test-user-id',
      email: 'test@example.com',
      role: 'admin'  // Changed from 'user' to 'admin'
    };
    return next();
  }

  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({
      error: 'Access token required',
      message: 'Please provide a valid authentication token'
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };
    next();
  } catch (error) {
    logger.error('Token verification failed:', error);
    
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Token expired',
        message: 'Please login again'
      });
    }
    
    if (error instanceof jwt.JsonWebTokenError) {
      return res.status(401).json({
        error: 'Invalid token',
        message: 'Please provide a valid authentication token'
      });
    }
    
    return res.status(401).json({
      error: 'Authentication failed',
      message: 'Token verification failed'
    });
  }
}

// Optional authentication middleware (for public endpoints that can benefit from user context)
export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return next(); // Continue without user context
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as any;
    req.user = {
      userId: decoded.userId,
      email: decoded.email,
      role: decoded.role
    };
  } catch (error) {
    // Ignore token errors for optional auth
    logger.warn('Optional auth token verification failed:', error);
  }

  next();
}

// Admin role middleware
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'Please login to access this resource'
    });
  }

  if (req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Admin access required'
    });
  }

  next();
}