Architecture: "Zero Signup / No Password" Auto-Login kaise kaam karega?
Jab merchant Shopify App Store se app install karega ya Shopify Admin se app kholega, yeh flow chalega:
code
Code
[Merchant clicks Install / Opens App in Shopify]
                      │
                      ▼
[EC2: profitfirst.co.in/auth/callback]
  ├── 1. Shopify OAuth complete (Access Token mil gaya)
  ├── 2. Shopify API se Store Info fetch kiya (store_name, email, currency)
  ├── 3. Backend API ko call kiya (api.profitfirstanalytics.co.in):
  │        - "Check karo yeh store DynamoDB me hai?"
  │        - NAYA HAI: Auto-create account (Cognito/DynamoDB) with store email.
  │        - PURANA HAI: Check karo onboarding complete hai ya nahi.
  ├── 4. Generate 1-Time SSO Token (Short-lived JWT valid for 60 seconds)
  └── 5. REDIRECT to profitfirstanalytics.co.in with that SSO Token!
                      │
                      ▼
[React Frontend: profitfirstanalytics.co.in/sso-login?token=xyz]
  ├── SSO token verify hua -> User logged in automatically!
  ├── IF New User: Redirect to Onboarding Step (Image 1 Hook Screen)
  └── IF Existing User: Redirect directly to Dashboard!
3. Step-by-Step Flow: New User vs Returning User
Case A: Naya Merchant (First Time Install)
User ne Shopify App install ki.
EC2 backend ne Shopify API se past 30 days ke orders ka quick count fetch kiya (total orders, COD orders, cancelled orders).
EC2 ne background me calculate kiya:
Total Sales = ₹3,27,642
Actually Earned = ₹1,87,863 (Delivered/Prepaid)
Gap = ₹1,39,779 (RTO / Pending / Cancelled)
User redirect hua: profitfirstanalytics.co.in/onboarding/step-2?token=...
User ke samne turant Image 1 wali screen khulegi:
"Shopify connected — ₹1,39,779 showing in Shopify never reached your bank. Connect Meta Ads..."
User bache hue steps (Meta Ads ➔ Shiprocket ➔ COGS) complete karega.
End me DynamoDB me onboarding_completed: true flag set ho jayega.
Case B: Purana Merchant (Returning User)
Merchant ne Shopify Admin panel khola ➔ Apps ➔ ProfitFirst Analytics pe click kiya.
Request aayi EC2 pe (profitfirst.co.in).
EC2 ne check kiya: Is store ka onboarding_completed === true hai.
EC2 ne SSO token ke sath seedha redirect kiya: profitfirstanalytics.co.in/dashboard?token=...
Result: Merchant ko na password dalna pada, na OTP, na login page dikha — Direct uska Unlocked Dashboard khul gaya!
