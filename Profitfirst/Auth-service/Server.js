

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
require('dotenv').config();

const authRoutes = require('./routes/auth.routes');
const adminRoutes = require('./routes/admin.routes');
const onboardingRoutes = require('./routes/onboarding.routes');
const shopifyRoutes = require('./routes/shopify.routes');
const metaRoutes = require('./routes/meta.routes');
const shippingRoutes = require('./routes/shipping.routes');
const aiChatRoutes = require('./routes/ai-chat.routes');
const predictionRoutes = require('./routes/prediction.routes');
const userRoutes = require('./routes/user.routes');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// HTTPS enforcement for production
if (isProduction) {
  app.use((req, res, next) => {
    // Skip HTTPS check if behind reverse proxy (Nginx)
    const forwardedProto = req.headers['x-forwarded-proto'];
    const isSecure = req.secure || forwardedProto === 'https' || req.headers.host?.includes('localhost');
    
    if (!isSecure && !req.headers.host?.includes('localhost')) {
      console.warn('Security: Non-HTTPS request redirected');
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}


const requiredEnvVars = [
  'AWS_REGION',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'COGNITO_CLIENT_ID'];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars.join(', '));
  console.error('Please check your .env file and ensure all required variables are set.');
  console.error('See .env.example for reference.');
  process.exit(1);
}


app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      "script-src": ["'self'", "'unsafe-inline'"], // Allow inline scripts for OAuth callback
    },
  },
}));


const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: process.env.NODE_ENV === 'development' ? 1000 : 100, // Higher limit for dev
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Stricter rate limit for authentication endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 auth requests per window
  message: 'Too many authentication attempts, please try again later.'
});

// Stricter rate limit for password reset endpoints (prevent brute force)
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // limit each IP to 5 password reset requests per hour
  message: 'Too many password reset attempts. Please try again later.'
});

// OAuth-specific rate limiter (prevent OAuth abuse)
const oauthLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 OAuth requests per window
  message: 'Too many OAuth attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

// CORS configuration - allows frontend to make requests
// Support multiple origins for development and production
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173', // Vite default
  'http://localhost:5174', // Vite alternative
  'http://localhost:4200', // Angular
  'http://localhost:8080', // Vue CLI
  'https://profitfirstanalytics.co.in',
  'https://www.profitfirstanalytics.co.in',
  process.env.FRONTEND_URL
].filter(Boolean); // Remove undefined values

// In development, allow all origins for easier testing
// In production, restrict to specific origins
const corsOptions = isProduction ? {
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, Postman, curl)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    } else {
      console.warn(`⚠️  CORS blocked request from origin: ${origin}`);
      return callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'x-shopify-access-token'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600
} : {
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'x-shopify-access-token'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600
};

app.use(cors(corsOptions));

// Compression middleware - gzip responses for faster transfer
app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 // Balance between speed and compression
}));

// Body parsing middleware with size limits and error handling
app.use(express.json({ 
  limit: '10kb',
  verify: (req, res, buf, encoding) => {
    // Verify JSON payload size
    if (buf.length > 10240) { // 10KB in bytes
      throw new Error('Request body too large');
    }
  }
}));
app.use(express.urlencoded({ 
  extended: true, 
  limit: '10kb',
  verify: (req, res, buf, encoding) => {
    if (buf.length > 10240) {
      throw new Error('Request body too large');
    }
  }
}));

// Serve static files from public directory
app.use(express.static('public'));

// OAuth callback handler at root (for AWS Cognito redirect)
app.get('/', (req, res) => {
  // Check if this is an OAuth callback (has 'code' parameter)
  if (req.query.code) {
    // Redirect to the API callback handler
    return res.redirect(`/api/auth/oauth/callback?code=${req.query.code}`);
  }
  
  // Check for OAuth errors
  if (req.query.error) {
    return res.status(400).json({
      error: req.query.error,
      error_description: req.query.error_description || 'OAuth authentication failed'
    });
  }
  
  // Default response for root
  res.status(200).json({
    message: 'Authentication API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      oauth: '/api/auth/oauth/url?provider=google',
      login: '/api/auth/login',
      signup: '/api/auth/signup'
    }
  });
});

// Request logging middleware
app.use((req, _res, next) => {
  const logLevel = isProduction ? 'info' : 'debug';
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`;
  
  if (isProduction) {
    // Production: Log only important requests
    if (req.method !== 'GET' || req.path.includes('/auth/')) {
      console.log(logMessage);
    }
  } else {
    // Development: Log all requests
    console.log(logMessage);
  }
  
  next();
});

// Authentication routes with rate limiting
// OAuth routes have stricter limits
app.use('/api/auth/oauth', oauthLimiter);
app.use('/api/auth', authLimiter, authRoutes);

// Onboarding routes (requires authentication)
app.use('/api/onboard', onboardingRoutes);

// Shopify routes (requires authentication)
app.use('/api/shopify', shopifyRoutes);

// Meta/Facebook Ads routes
app.use('/api/meta', metaRoutes);

// Shipping platform routes
app.use('/api/shipping', shippingRoutes);

// User profile routes (requires authentication)
app.use('/api/user', userRoutes);

// Admin routes (requires admin key)
app.use('/api/admin', adminRoutes);

// Health check endpoint - useful for monitoring and load balancers
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// OAuth configuration check endpoint (development only)
if (!isProduction) {
  app.get('/api/auth/oauth/config', (_req, res) => {
    const config = {
      cognitoDomain: process.env.COGNITO_DOMAIN || 'NOT_SET',
      redirectUri: process.env.COGNITO_REDIRECT_URI || 'NOT_SET',
      clientId: process.env.COGNITO_CLIENT_ID ? 'SET' : 'NOT_SET',
      isConfigured: !!(process.env.COGNITO_DOMAIN && process.env.COGNITO_REDIRECT_URI && process.env.COGNITO_CLIENT_ID),
      warnings: []
    };

    // Check for common configuration issues
    if (!config.isConfigured) {
      config.warnings.push('OAuth not fully configured. Set COGNITO_DOMAIN, COGNITO_REDIRECT_URI, and COGNITO_CLIENT_ID in .env');
    }

    if (config.redirectUri && !config.redirectUri.includes('/api/auth/oauth/callback')) {
      config.warnings.push('COGNITO_REDIRECT_URI should include /api/auth/oauth/callback path');
      config.warnings.push(`Current: ${config.redirectUri}`);
      config.warnings.push(`Expected: http://localhost:3000/api/auth/oauth/callback`);
    }

    if (config.cognitoDomain && config.cognitoDomain.includes('your-domain')) {
      config.warnings.push('COGNITO_DOMAIN contains placeholder "your-domain". Update with actual Cognito domain.');
    }

    res.status(200).json(config);
  });
}

// 404 handler for undefined routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Global error handling middleware
app.use((err, req, res, _next) => {
  // Log error with context
  console.error(`[${new Date().toISOString()}] Error on ${req.method} ${req.path}:`, {
    message: err.message,
    stack: isProduction ? undefined : err.stack,
    ip: req.ip,
    userAgent: req.headers['user-agent']
  });
  
  const statusCode = err.statusCode || 500;
  
  // Handle specific error types
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body too large. Maximum size is 10KB.' });
  }
  
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Invalid JSON in request body' });
  }
  
  // Hide error details in production for security
  const message = isProduction ? 'Internal server error' : err.message;
  
  res.status(statusCode).json({ 
    error: message,
    // Include stack trace only in development
    ...((!isProduction && err.stack) && { stack: err.stack })
  });
});

// Start server
const server = app.listen(PORT, async () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🚀 SERVER STARTED`);
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Server: port ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health: http://localhost:${PORT}/health`);
  console.log(`\n💾 DATABASE CONFIGURATION`);
  console.log(`   Region: ${process.env.AWS_REGION || 'ap-south-1'} (Cognito)`);
  console.log(`   Region: ap-southeast-1 (Singapore - New Database)`);
  console.log(`   Table: ${process.env.NEW_DYNAMODB_TABLE_NAME || 'ProfitFirst_Core'}`);
  console.log(`   Status: Connected ✅`);
  console.log(`\n🔗 ROUTES REGISTERED`);
  console.log(`   /api/auth/* - Authentication`);
  console.log(`   /api/onboard/* - Onboarding`);
  console.log(`   /api/shopify/* - Shopify OAuth`);
  console.log(`   /api/meta/* - Meta Ads OAuth`);
  console.log(`   /api/shipping/* - Shipping Connection`);
  console.log(`   /api/user/* - User Profile`);
  console.log(`\n⚠️  NO SYNC SCHEDULER RUNNING`);
  console.log(`   Data processing will be added in next phase`);
  console.log(`${'='.repeat(60)}\n`);
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown...`);
  
  server.close(() => {
    console.log('✅ HTTP server closed');
    console.log('👋 Process terminated gracefully');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = app;
