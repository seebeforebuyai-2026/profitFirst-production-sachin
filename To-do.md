
Action 5: Product Organization (Scalability)
Target: onboarding.controller.js

The Fix: Don't save a list of 100 products inside the User Profile.

The Pro Logic: Save each product as its own row: PK: MERCHANT#123, SK: PRODUCT#ABC. This keeps your database fast and prevents it from breaking when a merchant has a lot of items.

The "Production Ready" ResultWhen you finish, a scan of your database for one user will look like this simple Your Final Database View (Perfection):
Partition Key (PK)	Sort Key (SK)	Content
MERCHANT#COGNITO_ID	PROFILE	Business info, Email, Onboarding Step
MERCHANT#COGNITO_ID	INTEGRATION#SHOPIFY	Encrypted Shopify Tokens
MERCHANT#COGNITO_ID	INTEGRATION#META	Encrypted Meta Tokens
MERCHANT#COGNITO_ID	INTEGRATION#SHIPROCKET	Encrypted Shiprocket Tokens
MERCHANT#COGNITO_ID	PRODUCT#12345	Product Name, Cost Price (COGS)
MERCHANT#COGNITO_ID	PRODUCT#67890	Product Name, Cost Price (COGS)


================================================================

WHAT we will do LATER (During Background Sync Phase)
When we finish Onboarding and move to the background sync architecture, we will write a Nightly Cron Job (using AWS EventBridge).
Every night at 2:00 AM, the worker will do this simple check:
Look at all INTEGRATION records.
"Are there any tokens expiring in the next 3 days?"
If yes -> Run the refresh API call -> Update DynamoDB with the new token and new expiresAt date.
This way, the merchant never has to log in again. It happens invisibly in the background.

Meta Integration (Expires in 60 days)
When connecting Meta, their API gives you an expires_in value (usually 60 days).
Action NOW: We calculate the exact expiration date and save it.
DynamoDB Record:
PK: MERCHANT#COGNITO_ID
SK: INTEGRATION#META
accessToken: [Encrypted]
issuedAt: The date you got the token.
expiresAt: 2026-05-16T... (Current date + 59 days)

Shiprocket Integration (Expires in 10 days)
Shiprocket requires an email and password to generate a new token.
Action NOW: We must encrypt and store the Shiprocket password alongside the token, and set the 10-day expiration date.
DynamoDB Record:
PK: MERCHANT#COGNITO_ID
SK: INTEGRATION#SHIPROCKET
shiprocketEmail: merchant@email.com
shiprocketPassword: [Encrypted] (Crucial for generating new tokens later)
accessToken: [Encrypted]
issuedAt: The date you got the token.
expiresAt: 2026-03-26T... (Current date + 9 days)


ENCRYPTION_KEY=a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456


================================================================

CODE CLEANUP - FILES TO DELETE / REVIEW
(Do this after COGS page is complete)

✅ COMPLETED
- auth.controller.js - Fixed (no DynamoDB on signup/OTP)
- onboarding.service.js - Fixed (Cognito sub as merchantId, upsert integrations)
- dynamodb.service.js - Fixed (createUserProfile requires userId)
- Shiprocket flow - Fixed (auto-generate token from email+password)
- Meta flow - Fixed (60-day expiry, upsert logic)

❌ SAFE TO DELETE (Old/Unused Files)
- config/onboarding-table-schema.js     → Old separate Onboarding table, replaced by single table
- controllers/dashboard.controller.js   → Uses old dynamoDB + redis.config, not in Server.js
- controllers/orderconformationdata.js  → Uses old ap-south-1 DynamoDB, not in Server.js
- routes/dashboard.routes.js            → Not registered in Server.js
- routes/prediction.routes.js           → Not registered in Server.js
- scripts/check-shiprocket-connection.js → Debug script only
- scripts/check-shiprocket-fields.js    → Debug script only
- scripts/get-shopify-token.js          → Debug script only

⚠️ NEEDS REWRITE BEFORE USE
- controllers/shopify.controller.js     → Uses old dynamoDB from aws.config, needs new DB
- controllers/prediction.controller.js  → Uses old ap-south-1 DynamoDB directly
- services/prediction.service.js        → Uses old DynamoDB client

⚠️ KEEP BUT REVIEW LATER (Only needed if AI features are active)
- config/ai.config.js
- config/bedrock.config.js
- config/groq.config.js

================================================================

NEXT UP - COGS PAGE (Product Manufacturing Details)
- User enters product cost price (COGS) per variant
- Save each product as its own row: PK: MERCHANT#<id>, SK: PRODUCT#<productId>
- Save each variant as its own row: PK: MERCHANT#<id>, SK: VARIANT#<variantId>
- Fields to store: productName, variantName, costPrice, salePrice
- This is Step 5 of onboarding





SQS_QUEUE_URL=https://sqs.ap-southeast-1.amazonaws.com/243547230894/profitfirst-sync-queue-sachin
S3_BUCKET_NAME=profitfirst-raw-data-sachin
