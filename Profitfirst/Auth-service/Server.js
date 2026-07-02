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
const userRoutes = require('./routes/user.routes');
const productsRoutes = require('./routes/products.routes');
const syncRoutes = require('./routes/sync.routes');

const app = express();
app.set('trust proxy', 1);
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ── NIGHTLY SYNC SCHEDULER ────────────────────────────────────────────────
// Fires at midnight IST (18:30 UTC) every day for all active merchants.
// Sends DISPATCH_DAILY_SYNC to Shopify SQS queue → triggers full relay chain
// Shopify → Meta → Shiprocket → Summary for every merchant automatically.
function scheduleMidnightSync() {
  const { SendMessageCommand } = require('@aws-sdk/client-sqs');
  const { sqsClient, shopifyQueueUrl } = require('./config/aws.config');
  const { formatInTimeZone } = require('date-fns-tz');

  function msUntilMidnightIST() {
    const now = new Date();
    // Next midnight IST = next day 00:00:00 Asia/Kolkata
    const todayIST = formatInTimeZone(now, 'Asia/Kolkata', 'yyyy-MM-dd');
    const midnightIST = new Date(`${todayIST}T18:30:00.000Z`); // midnight IST = 18:30 UTC
    if (midnightIST <= now) midnightIST.setUTCDate(midnightIST.getUTCDate() + 1);
    return midnightIST.getTime() - now.getTime();
  }

  async function fireDailySync() {
    try {
      await sqsClient.send(new SendMessageCommand({
        QueueUrl: shopifyQueueUrl,
        MessageBody: JSON.stringify({ type: 'DISPATCH_DAILY_SYNC' }),
      }));
      console.log(`🌙 [Nightly] DISPATCH_DAILY_SYNC sent at ${new Date().toISOString()}`);
    } catch (err) {
      console.error('❌ [Nightly] Failed to send sync message:', err.message);
    }
    // Schedule next midnight
    setTimeout(fireDailySync, msUntilMidnightIST());
  }

  const msToMidnight = msUntilMidnightIST();
  console.log(`🌙 [Nightly] Next sync scheduled in ${Math.round(msToMidnight / 3600000 * 10) / 10}h (midnight IST)`);
  setTimeout(fireDailySync, msToMidnight);
}
// ─────────────────────────────────────────────────────────────────────────
/*
if (isProduction) {
  app.use((req, res, next) => {
    if (req.path === '/health') {
      return next();
    }

    const forwardedProto = req.headers['x-forwarded-proto'];
    const isSecure = req.secure || forwardedProto === 'https' || req.headers.host?.includes('localhost');
    
    if (!isSecure && !req.headers.host?.includes('localhost')) {
      console.warn('Security: Non-HTTPS request redirected');
      return res.redirect(301, `https://${req.headers.host}${req.url}`);
    }
    next();
  });
}

*/
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
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 500, // Increase this to 500 requests per minute
  message: 'Too many requests, please wait a moment.'
});
app.use('/api/', limiter);

// 🟢 FIX 3: Increase Auth Limiter (Polling hits this!)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // Increase from 20 to 100
  message: 'Too many authentication attempts.'
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

const allowedOrigins = [
  'http://localhost:3000',  
  'http://localhost:5173', // Vite default
  'http://localhost:5174', // Vite alternative
  'http://localhost:4200', // Angular
  'http://localhost:8080', // Vue CLI
  'https://profitfirstanalytics.co.in',
  'https://www.profitfirstanalytics.co.in',
  'https://api.profitfirstanalytics.co.in',
  "*",
  'https://www.api.profitfirstanalytics.co.in',
  process.env.FRONTEND_URL
].filter(Boolean); // Remove undefined values


const corsOptions = isProduction ? {
  origin: function(origin, callback) {
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
  origin: true, 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-admin-key', 'x-shopify-access-token'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  maxAge: 600
};

app.use(cors(corsOptions));

app.use(compression({
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    return compression.filter(req, res);
  },
  level: 6 
}));



app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(express.json({ 
  limit: '10mb', 
  verify: (req, res, buf, encoding) => {
    if (buf.length > 10 * 1024 * 1024) { // 10MB in bytes
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
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`;
  
  if (isProduction) {
    if (req.method !== 'GET' || req.path.includes('/auth/')) {
      console.log(logMessage);
    }
  } else {
    console.log(logMessage);
  }
  
  next();
});

app.use('/api/auth/oauth', oauthLimiter);
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/ai', require('./routes/ai-chat.routes')); 
// Onboarding routes (requires authentication)
app.use('/api/onboard', onboardingRoutes);

app.use('/api/dashboard', require('./routes/dashboard.routes'));
app.use('/api/expenses', require('./routes/expense.routes'));

// Shopify routes (requires authentication)
app.use('/api/shopify', shopifyRoutes);
app.use('/api/meta', metaRoutes); 

// User profile routes (requires authentication)
app.use('/api/user', userRoutes);

// Admin routes (requires admin key)
app.use('/api/admin', adminRoutes);

app.use('/api/products', productsRoutes);
app.use('/api/sync', syncRoutes);


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
  console.log(`🚀 ProfitFirst Server Started`);
  console.log(`✅ Port: ${PORT}`);
  console.log(`📦 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💾 Database: Singapore (ap-southeast-1)`);
  console.log(`🔗 Health Check: http://localhost:${PORT}/health`);
  // Note: Nightly sync is handled by AWS EventBridge (30 18 * * ? *)
  // which sends DISPATCH_DAILY_SYNC to Shopify SQS queue at midnight IST.
});

// Graceful shutdown handler
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received. Shutting down gracefully...`);
  
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

// Listen for termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  gracefulShutdown('UNHANDLED_REJECTION');
});

module.exports = app;
