import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { logger } from '../utils/logger';
import { app } from '..';
import { securityHeaders, securityLogger } from './security';

export interface ValidationSchema {
  body?: Joi.ObjectSchema;
  query?: Joi.ObjectSchema;
  params?: Joi.ObjectSchema;
}

export const validate = (schema: ValidationSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: string[] = [];

    // Validate request body
    if (schema.body) {
      const { error } = schema.body.validate(req.body, { abortEarly: false });
      if (error) {
        error.details.forEach(detail => {
          errors.push(`Body: ${detail.message} at ${detail.path.join('.')}`);
        });
      }
    }

    // Validate query parameters
    if (schema.query) {
      const { error } = schema.query.validate(req.query, { abortEarly: false });
      if (error) {
        error.details.forEach(detail => {
          errors.push(`Query: ${detail.message} at ${detail.path.join('.')}`);
        });
      }
    }

    // Validate route parameters
    if (schema.params) {
      const { error } = schema.params.validate(req.params, { abortEarly: false });
      if (error) {
        error.details.forEach(detail => {
          errors.push(`Params: ${detail.message} at ${detail.path.join('.')}`);
        });
      }
    }

    if (errors.length > 0) {
      logger.warn('Validation failed:', { errors, url: req.url, method: req.method, body: req.body });
      
      // Check if this is our custom validation error for missing message/files
      const isCustomMessageError = errors.some(error => error.includes('any.invalid'));
      
      if (isCustomMessageError) {
        return res.status(400).json({
          error: 'Message content or files are required',
          message: 'Please provide a message or attach files to send'
        });
      }
      
      return res.status(400).json({
        error: 'Validation failed',
        details: errors
      });
    }

    next();
  };
};

// Common validation schemas
export const schemas = {
  // User schemas
  register: {
    body: Joi.object({
      firstName: Joi.string().min(2).max(50).required(),
      lastName: Joi.string().min(2).max(50).required(),
      email: Joi.string().email().required(),
      password: Joi.string().min(8).max(128).required()
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .message('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
    })
  },

  login: {
    body: Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().required()
    })
  },

  updateProfile: {
    body: Joi.object({
      firstName: Joi.string().min(2).max(50),
      lastName: Joi.string().min(2).max(50),
      preferences: Joi.object({
        theme: Joi.string().valid('light', 'dark'),
        language: Joi.string().min(2).max(5),
        notifications: Joi.boolean(),
        timezone: Joi.string()
      })
    })
  },

  // Chat schemas
  createChat: {
    body: Joi.object({
      title: Joi.string().min(1).max(200).required(),
      description: Joi.string().max(500),
      workspaceId: Joi.string().uuid()
    })
  },

  sendMessage: {
    body: Joi.object({
      message: Joi.string().min(1).max(4000).optional(), // Make message optional to allow file-only messages
      chatId: Joi.string().uuid().optional(), // Make chatId optional since a new chat can be created
      parentMessageId: Joi.string().uuid().optional(),
      useDataAgent: Joi.boolean().optional(), // Add this line
      datasetId: Joi.string().uuid().optional(), // Add this line
      workspaceId: Joi.string().uuid().optional(), // Add this line
      files: Joi.array().items(Joi.object({
        id: Joi.string().optional(), // Make id optional and remove UUID validation
        originalName: Joi.string().required(),
        fileName: Joi.string().optional(), // Add fileName field
        url: Joi.string().uri().required(),
        mimeType: Joi.string().required()
      })).optional()
    }).custom((value, helpers) => {
      // Custom validation: either message or files must be present
      if ((!value.message || value.message.trim().length === 0) && (!value.files || value.files.length === 0)) {
        return helpers.error('any.invalid');
      }
      return value;
    }, 'Message or files required')
  },

  // Workspace schemas
  createWorkspace: {
    body: Joi.object({
      name: Joi.string().min(1).max(200).required(),
      description: Joi.string().max(1000),
      color: Joi.string().pattern(/^#[0-9A-F]{6}$/i),
      isShared: Joi.boolean()
    })
  },

  updateWorkspace: {
    body: Joi.object({
      name: Joi.string().min(1).max(200),
      description: Joi.string().max(1000),
      color: Joi.string().pattern(/^#[0-9A-F]{6}$/i),
      isShared: Joi.boolean()
    })
  },

  assignUsersToWorkspace: {
    body: Joi.object({
      userIds: Joi.array().items(Joi.string().pattern(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|user_[0-9]+_[a-z0-9]+)$/)).min(1).required(),
      accessLevel: Joi.string().valid('member', 'readonly').default('member')
    })
  },

  removeUsersFromWorkspace: {
    body: Joi.object({
      userIds: Joi.array().items(Joi.string().pattern(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|user_[0-9]+_[a-z0-9]+)$/)).min(1).required()
    })
  },

  updateUserAccess: {
    body: Joi.object({
      userId: Joi.string().pattern(/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|user_[0-9]+_[a-z0-9]+)$/).required(),
      accessLevel: Joi.string().valid('member', 'readonly').required()
    })
  },

  // File schemas
  uploadFile: {
    body: Joi.object({
      chatId: Joi.string().uuid(),
      messageId: Joi.string().uuid()
    })
  },

  // Common parameter schemas
  uuidParam: {
    params: Joi.object({
      id: Joi.string().uuid().required()
    })
  },

  chatIdParam: {
    params: Joi.object({
      chatId: Joi.string().uuid().required()
    })
  },

  messageIdParam: {
    params: Joi.object({
      messageId: Joi.string().uuid().required()
    })
  },

  // Pagination schema
  pagination: {
    query: Joi.object({
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(100).default(20),
      sortBy: Joi.string().valid('createdAt', 'updatedAt', 'name', 'title'),
      sortOrder: Joi.string().valid('asc', 'desc').default('desc')
    })
  },

  // Search schema
  search: {
    query: Joi.object({
      q: Joi.string().min(1).max(200).required(),
      type: Joi.string().valid('chats', 'messages', 'files'),
      page: Joi.number().integer().min(1).default(1),
      limit: Joi.number().integer().min(1).max(50).default(10)
    })
  }
};

// Sanitization middleware
export const sanitize = (req: Request, res: Response, next: NextFunction) => {
  // Remove any potential XSS attempts
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return obj.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
                .replace(/javascript:/gi, '')
                .replace(/on\w+\s*=/gi, '');
    }
    
    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }
    
    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }
    
    return obj;
  };

  req.body = sanitizeObject(req.body);
  req.query = sanitizeObject(req.query);
  
  next();
};
// Security middleware
// Note: Security headers and loggers should be applied in the main app file, not here
// These were causing errors as 'app' is not defined in this context

