# 🚀 ProfitFirst Production - Sachin

Production-ready e-commerce analytics platform with Shopify, Meta Ads, and Shiprocket integrations.

## 📋 Project Overview

ProfitFirst is a comprehensive business analytics platform that helps e-commerce merchants track their profit, revenue, and expenses across multiple channels. The platform integrates with Shopify for order data, Meta Ads for advertising spend, and Shiprocket for shipping costs to provide real-time profit analysis.

## 🏗️ Architecture

### Backend (Node.js + Express)
- **Authentication**: AWS Cognito with JWT tokens
- **Database**: DynamoDB (Single Table Design)
- **External Integrations**: Shopify, Meta Ads, Shiprocket
- **Region**: Asia Pacific (Singapore) - ap-southeast-1

### Frontend (React + Vite)
- **Framework**: React 18 with Vite
- **Styling**: Tailwind CSS
- **State Management**: React Hooks
- **Notifications**: React Toastify

## 🗄️ Database Structure

### Single Table Design (ProfitFirst_Core)
```
PK: MERCHANT#<merchantId>
SK: ENTITY#<entityId>

Entities:
- PROFILE (User profile and onboarding)
- INTEGRATION#SHOPIFY (Shopify connection)
- INTEGRATION#META (Meta Ads connection)  
- INTEGRATION#SHIPROCKET (Shiprocket connection)
- PRODUCT#<productId> (Product information)
- VARIANT#<variantId> (Product variants with COGS)
- ORDER#<orderId> (Order data)
- SUMMARY#<date> (Daily profit summaries)
```

## 🔧 Setup Instructions

### Prerequisites
- Node.js 18+
- AWS Account with DynamoDB access
- Shopify Partner Account
- Meta Developer Account

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

## 🌟 Key Features

### ✅ Authentication & Onboarding
- AWS Cognito integration
- Email verification with OTP
- 5-step onboarding process
- Production-ready user management

### ✅ Enhanced Step 2 (Shopify Integration)
- **Auto-polling**: Automatically detects app installation
- **Smart status tracking**: Visual progress indicators
- **Mobile-optimized**: Responsive design for all devices
- **External OAuth**: Secure integration via profitfirst.co.in
- **Error resilient**: Multiple fallback mechanisms

### ✅ Database Production Ready
- Consistent merchant ID structure (UUID-based)
- Clean PROFILE schema (no legacy USER records)
- Proper integration records
- No undefined or email-based keys

### 🔄 Integrations
- **Shopify**: Order sync, product data, customer info
- **Meta Ads**: Campaign spend, impressions, clicks
- **Shiprocket**: Shipping costs, delivery status

## 📊 Onboarding Flow

1. **Step 1**: Business Information
2. **Step 2**: Shopify Integration (Enhanced UX)
3. **Step 3**: Product COGS Setup
4. **Step 4**: Meta Ads Connection
5. **Step 5**: Shiprocket Integration

## 🔒 Security Features

- JWT-based authentication
- AWS Cognito user management
- Environment variable protection
- Input validation and sanitization
- CORS protection
- Rate limiting

## 🚀 Production Deployment

### Environment Variables
```env
# AWS Configuration
AWS_REGION=ap-southeast-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key

# Cognito
COGNITO_USER_POOL_ID=your_pool_id
COGNITO_CLIENT_ID=your_client_id

# Database
NEW_DYNAMODB_TABLE_NAME=ProfitFirst_Core

# External Services
SHOPIFY_API_KEY=your_shopify_key
SHOPIFY_API_SECRET=your_shopify_secret
FB_APP_ID=your_facebook_app_id
FB_APP_SECRET=your_facebook_secret
```

### Deployment Steps
1. Set up AWS DynamoDB table
2. Configure Cognito User Pool
3. Deploy backend to AWS/Heroku
4. Deploy frontend to Vercel/Netlify
5. Configure domain and SSL

## 📈 Recent Updates

### Database Production Fixes (Latest)
- ✅ Fixed MERCHANT#undefined bug
- ✅ Migrated from USER# to PROFILE schema
- ✅ Removed email-based merchant IDs
- ✅ Cleaned up 6 incorrect records
- ✅ Production-ready database structure

### Enhanced Step 2 UX
- ✅ Auto-polling for app installation detection
- ✅ Smart single-button interface
- ✅ Mobile-optimized experience
- ✅ Visual progress tracking
- ✅ Comprehensive error handling

## 🧪 Testing

### Backend Tests
```bash
cd Profitfirst/Auth-service
npm test
```

### Frontend Tests
```bash
cd Profitfirst/frontend-profit-first/client
npm test
```

## 📝 API Documentation

### Authentication Endpoints
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-otp` - Email verification
- `POST /api/auth/refresh-token` - Token refresh

### Onboarding Endpoints
- `GET /api/onboard/step` - Get current step
- `POST /api/onboard/step` - Update step data
- `GET /api/onboard/proxy/token` - Shopify token proxy

### Integration Endpoints
- `POST /api/shopify/connect` - Initiate Shopify OAuth
- `GET /api/shopify/connection` - Check connection status
- `POST /api/meta/connect` - Connect Meta Ads
- `POST /api/shipping/connect` - Connect Shiprocket

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is proprietary and confidential.

## 🆘 Support

For support and questions, contact the development team.

---

**Status**: ✅ Production Ready  
**Last Updated**: March 2026  
**Version**: 1.0.0

