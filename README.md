# ProfitFirst - E-commerce Profit Analytics Platform

## 🚀 Project Overview

ProfitFirst is a comprehensive e-commerce profit analytics platform designed to help merchants track, analyze, and optimize their business profitability across multiple channels. The platform integrates with Shopify, Meta Ads, and Shiprocket to provide real-time insights into revenue, costs, and profit margins.

## 📋 Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Database Schema](#database-schema)
- [Authentication System](#authentication-system)
- [Onboarding Flow](#onboarding-flow)
- [Integrations](#integrations)
- [Security Features](#security-features)
- [Recent Fixes & Updates](#recent-fixes--updates)
- [Installation & Setup](#installation--setup)
- [API Documentation](#api-documentation)
- [Environment Configuration](#environment-configuration)
- [Production Deployment](#production-deployment)
- [Known Issues & Solutions](#known-issues--solutions)
- [Contributing](#contributing)

## ✨ Features

### Core Analytics
- **Real-time Profit Tracking**: Monitor profit margins across all sales channels
- **Revenue Analysis**: Track revenue from Shopify orders
- **Cost Management**: Monitor COGS, shipping costs, and advertising spend
- **ROI Calculation**: Analyze return on investment for Meta Ads campaigns
- **Daily/Monthly Reports**: Automated profit and loss statements

### Multi-Platform Integration
- **Shopify Integration**: Sync orders, products, and customer data
- **Meta Ads Integration**: Track advertising spend and campaign performance
- **Shiprocket Integration**: Monitor shipping costs and delivery status
- **Unified Dashboard**: Single view of all business metrics

### Advanced Features
- **AI-Powered Insights**: Intelligent recommendations for profit optimization
- **Cohort Analysis**: Customer lifetime value and retention metrics
- **Predictive Analytics**: Forecast future profits and trends
- **Custom Alerts**: Notifications for profit thresholds and anomalies

## 🏗️ Architecture

### System Architecture
```
Frontend (React/Vite) ↔ Backend (Node.js/Express) ↔ AWS Services
                                    ↓
                            DynamoDB (Singapore)
                                    ↓
                        External APIs (Shopify, Meta, Shiprocket)
```

### Database Design
- **Single Table Design**: DynamoDB with composite keys (PK/SK pattern)
- **Region**: Asia Pacific (Singapore) - `ap-southeast-1`
- **Table**: `ProfitFirst_Core`
- **Access Patterns**: Optimized for merchant-centric queries

## 🛠️ Technology Stack

### Backend
- **Runtime**: Node.js 18+
- **Framework**: Express.js
- **Authentication**: AWS Cognito
- **Database**: Amazon DynamoDB
- **File Storage**: AWS S3 (if needed)
- **Security**: AES-256-CBC encryption for sensitive data

### Frontend
- **Framework**: React 18
- **Build Tool**: Vite
- **Styling**: CSS3 with modern features
- **State Management**: React Context/Hooks
- **HTTP Client**: Axios

### AWS Services
- **Cognito**: User authentication and management
- **DynamoDB**: Primary database (Singapore region)
- **Lambda**: Serverless functions (future)
- **CloudWatch**: Monitoring and logging

### External APIs
- **Shopify Admin API**: E-commerce data sync
- **Meta Marketing API**: Advertising data
- **Shiprocket API**: Shipping and logistics

## 🗄️ Database Schema

### Table Structure: `ProfitFirst_Core`

#### Entity Types & Keys
```
MERCHANT#{merchantId} | PROFILE                    → User profile data
MERCHANT#{merchantId} | INTEGRATION#{platform}    → Platform integrations
MERCHANT#{merchantId} | PRODUCT#{productId}       → Product information
MERCHANT#{merchantId} | VARIANT#{variantId}       → Product variants with COGS
MERCHANT#{merchantId} | ORDER#{orderId}           → Order data
MERCHANT#{merchantId} | SHIPMENT#{shipmentId}     → Shipping data
MERCHANT#{merchantId} | ADS#{campaignId}          → Advertising data
MERCHANT#{merchantId} | EXPENSE#{expenseId}       → Business expenses
MERCHANT#{merchantId} | SUMMARY#{date}            → Daily summaries
SESSION#{sessionId}   | OAUTH                     → OAuth sessions
```

#### Key Patterns
- **PK**: `MERCHANT#{merchantId}` (Cognito user ID)
- **SK**: Entity-specific sort key
- **GSI**: Email-based lookup for authentication

## 🔐 Authentication System

### Cognito Integration
- **User Pool**: Manages user registration and authentication
- **JWT Tokens**: Access, ID, and refresh tokens
- **Email Verification**: OTP-based email confirmation
- **Password Policy**: Strong password requirements

### Identity Management
- **Single Identity**: One Cognito ID per user (no duplicates)
- **Merchant ID**: Always equals Cognito user ID
- **Migration System**: Automatic conversion of legacy users

### Security Features
- **Token Encryption**: AES-256-CBC for access tokens
- **Session Management**: DynamoDB-based OAuth sessions
- **CORS Protection**: Configured for production domains
- **Rate Limiting**: Built-in request throttling

## 📝 Onboarding Flow

### 5-Step Process
1. **Business Information**: Company details and contact info
2. **Shopify Integration**: Connect e-commerce store
3. **Meta Ads Integration**: Link advertising accounts
4. **Shiprocket Integration**: Connect shipping provider
5. **Product COGS Setup**: Configure cost of goods sold

### External OAuth
- **Shopify**: Uses external service at `profitfirst.co.in/connect`
- **Meta**: Direct Facebook OAuth integration
- **Shiprocket**: API key-based authentication

## 🔌 Integrations

### Shopify Integration
- **OAuth Flow**: External service handles app installation
- **Data Sync**: Orders, products, customers, inventory
- **Webhook Support**: Real-time order updates
- **API Version**: 2023-10

### Meta Ads Integration
- **OAuth Scopes**: ads_read, ads_management, business_management
- **Data Points**: Spend, impressions, clicks, conversions
- **Account Management**: Multiple ad account support
- **API Version**: v23.0

### Shiprocket Integration
- **Authentication**: Token-based API access
- **Features**: Order tracking, shipping rates, AWB generation
- **Data Sync**: Shipment status and costs
- **Webhook Support**: Delivery status updates

## 🔒 Security Features

### Data Protection
- **Encryption at Rest**: DynamoDB encryption
- **Encryption in Transit**: HTTPS/TLS 1.2+
- **Token Security**: AES-256-CBC encryption for API tokens
- **PII Protection**: Sensitive data masking

### Access Control
- **JWT Authentication**: Stateless token validation
- **Role-based Access**: Merchant-specific data isolation
- **CORS Policy**: Restricted origin access
- **Input Validation**: Comprehensive request sanitization

### Monitoring
- **Error Logging**: Structured error tracking
- **Access Logs**: Request/response monitoring
- **Security Alerts**: Anomaly detection (future)

## 🔧 Recent Fixes & Updates

### ✅ Critical Issues Resolved

#### 1. Double Identity Bug (FIXED)
- **Issue**: Users had multiple merchant IDs causing data fragmentation
- **Root Cause**: UUID generation instead of using Cognito IDs
- **Solution**: 
  - Removed all UUID generation from user creation
  - Implemented temporary user system for signup
  - Added automatic migration on first login
  - Cleaned up duplicate database records
- **Status**: ✅ Completely resolved

#### 2. Production Security Enhancements (COMPLETED)
- **Added**: AES-256-CBC encryption for access tokens
- **Implemented**: Secure DynamoDB session management
- **Enhanced**: Facebook API error handling
- **Updated**: Environment configuration for production
- **Status**: ✅ Production-ready

#### 3. Database Architecture Overhaul (COMPLETED)
- **Migrated**: From multiple tables to single table design
- **Region**: Moved to Singapore (ap-southeast-1) for better performance
- **Schema**: Implemented proper PRODUCT/VARIANT separation
- **Optimization**: Merchant-centric access patterns
- **Status**: ✅ Optimized and scalable

#### 4. Onboarding Flow Restructure (COMPLETED)
- **Reordered**: Steps for better user experience
- **Enhanced**: Shopify integration with auto-polling
- **Improved**: UX with smart status tracking
- **Added**: Mobile-optimized OAuth flow
- **Status**: ✅ User-friendly and robust

#### 5. Code Quality & Production Readiness (COMPLETED)
- **Removed**: Test files and debug code
- **Cleaned**: Excessive console.log statements
- **Optimized**: Error handling and logging
- **Standardized**: Code formatting and documentation
- **Status**: ✅ Production-ready codebase

### 🚀 Current Status
- **Authentication**: ✅ Fully functional with single identity
- **Database**: ✅ Clean, optimized, production-ready
- **Integrations**: ✅ Shopify, Meta, Shiprocket working
- **Security**: ✅ Enterprise-grade encryption and protection
- **Performance**: ✅ Optimized for production workloads
- **Code Quality**: ✅ Clean, maintainable, documented

## 🚀 Installation & Setup

### Prerequisites
- Node.js 18+ and npm
- AWS Account with Cognito and DynamoDB access
- Shopify Partner Account
- Meta Developer Account
- Shiprocket Account

### Backend Setup
```bash
cd Profitfirst/Auth-service
npm install
cp .env.example .env
# Configure environment variables
npm start
```

### Frontend Setup
```bash
cd Profitfirst/frontend-profit-first/client
npm install
npm run dev
```

### Environment Configuration
Create `.env` file in `Auth-service` directory:
```env
# Server Configuration
PORT=3000
NODE_ENV=production

# AWS Configuration
AWS_REGION=ap-south-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Cognito Configuration
COGNITO_USER_POOL_ID=your_user_pool_id
COGNITO_CLIENT_ID=your_client_id
COGNITO_DOMAIN=your_cognito_domain

# Database Configuration
NEW_DYNAMODB_TABLE_NAME=ProfitFirst_Core
NEW_AWS_REGION=ap-southeast-1

# API Keys
GROQ_API_KEY=your_groq_key
SHOPIFY_API_KEY=your_shopify_key
SHOPIFY_API_SECRET=your_shopify_secret
FB_APP_ID=your_facebook_app_id
FB_APP_SECRET=your_facebook_secret

# Security
ENCRYPTION_KEY=your_32_byte_hex_key

# URLs
FRONTEND_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173,http://localhost:3000
```

## 📚 API Documentation

### Authentication Endpoints
```
POST /api/auth/signup          - User registration
POST /api/auth/login           - User login
POST /api/auth/logout          - User logout
GET  /api/auth/profile         - Get user profile
POST /api/auth/verify-otp      - Email verification
```

### Onboarding Endpoints
```
GET  /api/onboard/status       - Get onboarding status
POST /api/onboard/step         - Update onboarding step
GET  /api/onboard/data         - Get complete onboarding data
```

### Integration Endpoints
```
POST /api/meta/connect         - Initiate Meta OAuth
GET  /api/meta/callback        - Meta OAuth callback
GET  /api/meta/connection      - Get Meta connection status
POST /api/meta/select-account  - Select Meta ad account

GET  /api/shopify/callback     - Shopify OAuth callback
POST /api/shipping/connect     - Connect Shiprocket
```

## 🌐 Production Deployment

### AWS Infrastructure
- **Compute**: EC2 or ECS for backend
- **Database**: DynamoDB in Singapore region
- **CDN**: CloudFront for frontend assets
- **Load Balancer**: Application Load Balancer
- **SSL**: AWS Certificate Manager

### Environment Variables
Update production URLs and credentials:
```env
NODE_ENV=production
FRONTEND_URL=https://your-domain.com
CORS_ORIGIN=https://your-domain.com
FB_REDIRECT_URI=https://your-api-domain.com/api/meta/callback
```

### Security Checklist
- [ ] Update CORS origins for production domains
- [ ] Configure proper SSL certificates
- [ ] Set up CloudWatch monitoring
- [ ] Enable DynamoDB encryption
- [ ] Configure backup strategies
- [ ] Set up error alerting

## ⚠️ Known Issues & Solutions

### Resolved Issues
- ✅ **Double Identity Bug**: Fixed with single Cognito ID architecture
- ✅ **UUID Generation**: Eliminated in favor of Cognito IDs
- ✅ **Database Fragmentation**: Resolved with single table design
- ✅ **Security Vulnerabilities**: Fixed with token encryption
- ✅ **Production Readiness**: Code cleaned and optimized

- Email verification required for new users
- Meta Ads requires manual ad account selection
- Shiprocket integration needs API key setup

---

## 📋 Step 1 Implementation Notes (Dashboard Lock Flow)

### 3 Critical Changes for Production-Ready Implementation

#### Change 1: Sequential Trigger (Not Parallel)
**Problem**: If we trigger Product Fetch and Order Sync in parallel, orders might sync before COGS is set.

**Solution**: 
1. User clicks "Set Up Products" → Product fetch starts
2. User enters COGS for all variants
3. User clicks "Save All Costs" → Only THEN order sync starts

**Why**: Orders need `cogsAtSale` stamped correctly during sync. If sync runs before COGS is set, historical profit will be wrong.

#### Change 2: Onboarding Step Index
**Current**: Step 4 is Shiprocket (last step in wizard)

**Update**: When Shiprocket saves successfully:
- `onboardingStep: 6` (not 5 - wizard is closed)
- `onboardingCompleted: true`
- `dashboardUnlocked: false` (still locked, waiting for COGS + sync)

#### Change 3: SQS Visibility Timeout
**Current**: 5 minutes

**Update**: 15 minutes

**Why**: For 50,000+ products or 100,000 orders:
- 50,000 products ÷ 250 per page = 200 pages
- 200 pages × 0.5s per page = 100 seconds
- Plus rate limit backoffs = ~12-15 minutes total

If timeout is 5 minutes, worker crashes mid-way and job reappears → duplicate processing possible.

---

## 🚀 Next Steps

1. **Step 1**: Update Shiprocket save logic to set `dashboardUnlocked: false`
2. **Step 2**: Frontend redirects to `/dashboard` after Shiprocket
3. **Step 3**: Dashboard lock logic (blur + welcome modal)
4. **Step 4**: Products page with sequential trigger
5. **Step 5**: SQS queue setup (15-minute timeout)


