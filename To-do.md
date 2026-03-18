Single Source of Truth strategy.

🏗️ The Simple "Unified ID" Plan
One person = One ID.
We will use the AWS Cognito ID as the Merchant ID for everything. Do not generate any other UUIDs.

Step 1: Signup & OTP (The Identity)
Action: User signs up and verifies OTP via Cognito.
Production Rule: Cognito creates a unique sub (Subject ID). This is your permanent Merchant ID.
The Bug Fix: Your backend must not create a DynamoDB record until the user successfully verifies their OTP and logs in for the first time.
Action 1: Fix the Signup/Login (No More Ghost Records)
Target: auth.controller.js
The Fix: Delete any code that creates temp_ IDs or writes to DynamoDB during signup.
The Pro Logic: Only write to DynamoDB after the user logs in. If they don't have a record yet, create one using their sub ID from Cognito.


Step 2: First Login (The Profile)
Action: User logs in. React gets a JWT Token.

Backend Task: Create the PROFILE record in DynamoDB.

PK: MERCHANT#<Cognito_sub>

SK: PROFILE

The Bug Fix: Stop using "temp" IDs. If they are logged in, you know exactly who they are.


Step 3: Business Details (Step 1 Onboarding)
Action: User enters Business Name and Phone.
Backend Task: Update the existing PROFILE record. Do not create a new one.
The Bug Fix: Ensure your code uses UpdateItem so you don't overwrite the email or signup date.
Action 3: The "Update" Rule (Business Details)
Target: onboarding.controller.js

The Fix: Switch from PutItem to UpdateItem.

The Pro Logic: Instead of throwing a whole new object at the database, just tell it: "Hey, for this Merchant ID, add this business name and this phone number."




Step 4: Shopify Connection (Step 2 Onboarding)
Action: User connects Shopify.

Backend Task: Create a new record in the same table.

PK: MERCHANT#<Cognito_sub> (The same ID from Step 1!)

SK: INTEGRATION#SHOPIFY

The Bug Fix: Never generate a new UUID here. Use the sub from the user's login token.
Action 4: The Integration Link (Shopify/Meta/Shiprocket)
Target: onboarding.controller.js

The Fix: When saving a connection, pull the ID from the Login Token (req.user.sub).

The Pro Logic: This ensures the Shopify account is "glued" to the right user account. No more disconnected data!


Step 5: Meta & Shiprocket (Final Steps)
Action: User connects Ads and Shipping.

Backend Task: Create two more records.

SK: INTEGRATION#META

SK: INTEGRATION#SHIPROCKET

The Bug Fix: Store these in the Singapore Region table only. Delete the Mumbai code.
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