# Shopify App — Zero Signup / SSO Auto-Login Implementation Plan

> **Rule:** Pehle poora plan padhlo. Phir ek-ek step manually karo.  
> **Code touch mat karo** jab tak us step ka number na aaye.

---

## Samajhne ki baat (Current vs Target)

### Current Flow (Abhi kya ho raha hai)
```
Merchant opens App in Shopify Admin
        ↓
/app?shop=... route hit hota hai
        ↓
app.ejs render hota hai (Bootstrap dashboard with orders/products/customers)
        ↓
Dashboard seedha khul jaata hai — koi login nahi, koi redirect nahi
```

### Target Flow (Hume ye banana hai)
```
Merchant opens App in Shopify Admin
        ↓
/app?shop=... route hit hota hai
        ↓
LOADING SCREEN dikhao (spinner) — "Connecting your store..."
        ↓
Backend pe /sso-redirect call hota hai
        ↓
api.profitfirstanalytics.co.in ko call karo:
  → Store already registered hai? → onboarding complete?
        ↓
SSO JWT token generate karo (60 second valid, one-time use)
        ↓
REDIRECT to profitfirstanalytics.co.in with token:
  → New User:      /sso-login?token=xyz&redirect=/onboarding
  → Existing User: /sso-login?token=xyz&redirect=/dashboard
        ↓
React frontend token verify kare → Auto login → User is in!
```

---

## Step-by-Step Implementation Plan

---

### PHASE 1 — Shopify App Side (profitfirst-shopify-app / index.js)

---

#### STEP 1 — /app route pe Loading Screen lagao (app.ejs replace karo)

**File:** `views/app.ejs`

**Kya karna hai:**
- Abhi `app.ejs` ek full Bootstrap dashboard hai (orders/products/charts wala)
- Hume ye dashboard **hatana nahi hai** — sirf `/app` route per jo render hota hai wahan ek **loading screen** dikhani hai
- Loading screen ka kaam: spinner dikhao + JS se turant SSO flow trigger karo

**app.ejs ke andar kya hoga:**
```
- Full screen dark/green background
- ProfitFirst logo (https://res.cloudinary.com/dqdvr35aj/image/upload/v1748330108/Logo1_zbbbz4.png)
- Spinner (CSS animation)
- Text: "Connecting your store..." 
- Chhota text: "Please wait while we set up your dashboard"
- JS: Page load hote hi fetch('/sso-redirect?shop=<%= shop %>') call karo
- Agar error aaye: "Something went wrong. Please try again." message dikhao
```

**Important:** `app.use(express.static(...))` line ke wajah se `public/index.html` seedha serve ho rahi hai `/` pe. `/app` route pe EJS render hota hai. Dono alag hain — `app.ejs` sirf `/app` ke liye use hoti hai. Isliye `app.ejs` badalna safe hai.

---

#### STEP 2 — Backend pe `/sso-redirect` endpoint banao (index.js)

**File:** `index.js`

**Architecture decision (important):**
SSO JWT token **Auth-Service generate karega** — Shopify App sirf Auth-Service ka response lekar frontend ko `redirectUrl` pass karega. Shopify App JWT khud sign nahi karega.

**Kya karna hai:**
- Ek nayi GET route banao: `app.get('/sso-redirect', async (req, res) => { ... })`
- Is route ka kaam:
  1. `shop` query param lo
  2. MongoDB se us shop ka `accessToken` fetch karo (existing `getToken()` function use karo)
  3. Shopify API se store info fetch karo (shop name, email, currency, timezone)
  4. Shopify API se last 30 days ke orders quick count fetch karo (total, COD estimate, revenue)
  5. Ye sab data lekar `api.profitfirstanalytics.co.in/api/auth/shopify-sso` ko POST karo
     - Header me bhejo: `x-service-secret: process.env.INTERNAL_SERVICE_SECRET`
  6. Response me SSO token milega + user status (new/existing, onboarding complete/not)
  7. JSON response frontend (app.ejs JS) ko bhejo: `{ redirectUrl: "https://profitfirstanalytics.co.in/sso-login?token=..." }`

**Shopify Store Info fetch karne ka GraphQL query:**
```graphql
{
  shop {
    name
    email
    currencyCode
    ianaTimezone
    plan { displayName }
  }
}
```

**Order count fetch karne ka query (last 30 days):**
```graphql
{
  orders(first: 250, query: "created_at:>YYYY-MM-DD") {
    edges {
      node {
        id
        totalPriceSet { shopMoney { amount } }
        displayFinancialStatus
      }
    }
    pageInfo { hasNextPage }
  }
}
```
*(Date dynamically calculate karo: aaj ki date - 30 days)*

---

#### STEP 3 — Shopify App ke .env me variables add karo

**File:** `profitfirst-shopify-app/.env`

**Kya karna hai:**
- `.env` me sirf yeh do nayi variables add karo:
  ```
  INTERNAL_SERVICE_SECRET=<strong-random-secret>
  PROFITFIRST_API_URL=https://api.profitfirstanalytics.co.in
  ```

**Note:**
- Shopify app ko `jsonwebtoken` install karne ki zaroorat **nahi** hai — wo sirf Auth-Service ko call karega aur milha hua token forward karega
- `SSO_JWT_SECRET` Shopify app ke `.env` me **nahi** dalega — wo sirf Auth-Service ke paas rahega
- `INTERNAL_SERVICE_SECRET` dono jagah same value honi chahiye (Shopify app + Auth-Service)

---

#### STEP 3.5 — `app/uninstalled` webhook handle karo (index.js)

**File:** `index.js`

**Kya karna hai:**
- `registerPrivacyWebhooks()` function me ek aur topic add karo: `APP_UNINSTALLED`
  - Callback path: `/webhooks/app/uninstalled`
- Nayi POST route banao: `app.post('/webhooks/app/uninstalled', async (req, res) => { ... })`
- Is webhook handler ka kaam:
  1. Webhook HMAC verify karo (existing `verifyWebhookHmac` middleware already handle kar raha hai)
  2. `shop` field lo webhook payload se
  3. MongoDB me us shop ka token **delete** karo: `await Token.findOneAndDelete({ shop })`
  4. In-memory cache se bhi hatao: `cache.delete(shop)`
  5. Auth-Service ko notify karo: `POST /api/auth/shopify-app-uninstalled` with `{ shop }` + service secret header
  6. Response: `res.status(200).send('OK')`

**Auth-Service side (Step 4 ke saath implement karo):**
- Auth-Service pe `/api/auth/shopify-app-uninstalled` route banao
- Kaam: DynamoDB me `INTEGRATION#SHOPIFY` record me `appInstalled: false` set karo, `accessToken` field null karo
- **`onboardingCompleted` flag touch mat karo** — warna reinstall pe dobara onboarding dikhegi
- Reinstall pe `/app` route seedha check karega: `appInstalled: false` hai → naya access token store karo → `appInstalled: true` → existing user flow (seedha dashboard)

---

### PHASE 2 — Main Backend Side (Auth-service)

---

#### STEP 4 — `/api/auth/shopify-sso` endpoint banao (auth.controller.js)

**File:** `Profitfirst/Auth-service/controllers/auth.controller.js`

**Security:** Ye route `INTERNAL_SERVICE_SECRET` header verify karega — direct public access block hoga.

**Kya karna hai:**
Ek nayi method `shopifySsoLogin` banao jo ye kaam kare:

```
Input (POST body):
{
  shop: "store-name.myshopify.com",
  shopInfo: { name, email, currency, timezone },
  orderSummary: { totalOrders, totalRevenue, codEstimate }
}

Header (required):
  x-service-secret: <INTERNAL_SERVICE_SECRET>

Security check (sabse pehle):
  → req.headers['x-service-secret'] !== process.env.INTERNAL_SERVICE_SECRET
  → Agar match nahi: return 403 Forbidden

Logic:
1. DynamoDB me dhundho: koi INTEGRATION#SHOPIFY hai is shop ke liye?
   → Query: GSI ya scan for shopDomain = shop

2A. NAYA USER (shop DynamoDB me nahi hai):
    a. Cognito me auto-create account:
       - email = shopInfo.email
       - password = random strong string (merchant ko pata nahi hoga)
       - given_name = shopInfo.name
       - auto-confirm karo (AdminConfirmSignUp)
    b. DynamoDB me MERCHANT#<cognitoSub> PROFILE record banao
    c. INTEGRATION#SHOPIFY record banao with shop domain, appInstalled: true
    d. orderSummary save karo (onboarding pe dikhane ke liye)
    e. SSO JWT token generate karo:
       { merchantId, email, shop, purpose: 'sso', iat, exp: now+60s, jti: uuid() }
    f. Return: { token, userStatus: 'new', redirectPath: '/onboarding' }

2B. PURANA USER (shop DynamoDB me mila):
    a. PROFILE record fetch karo
    b. appInstalled: true set karo (reinstall case handle)
    c. Check karo onboardingCompleted flag
    d. SSO JWT generate karo (same as above)
    e. Return:
       - onboarding complete:    { token, userStatus: 'existing',              redirectPath: '/dashboard' }
       - onboarding incomplete:  { token, userStatus: 'returning_incomplete',  redirectPath: '/onboarding' }

Output:
{
  success: true,
  token: "eyJ...",        ← SSO JWT (60 second valid, one-time use)
  userStatus: "new" | "existing" | "returning_incomplete",
  redirectPath: "/onboarding" | "/dashboard",
  merchantId: "cognito-uuid"
}
```

---

#### STEP 5 — `/api/auth/shopify-sso` route register karo (auth.routes.js)

**File:** `Profitfirst/Auth-service/routes/auth.routes.js`

**Kya karna hai:**
- Existing routes ke saath ye routes add karo:
  ```js
  router.post('/shopify-sso', authController.shopifySsoLogin);
  router.post('/shopify-app-uninstalled', authController.shopifyAppUninstalled);
  ```
- Dono routes public honge (no `authenticateToken` middleware) — security `x-service-secret` header se hogi
- `shopifyAppUninstalled` method bhi Step 4 ke saath hi `auth.controller.js` me banana hai

---

#### STEP 6 — `/api/auth/sso-verify` endpoint banao (auth.controller.js)

**File:** `Profitfirst/Auth-service/controllers/auth.controller.js`

**Pre-requisite (AWS Console step):**
Cognito User Pool Client settings me `ALLOW_ADMIN_USER_PASSWORD_AUTH` (ya `ADMIN_NO_SRP_AUTH`) checkbox enable karo — bina iske `AdminInitiateAuth` backend se fail karega.
check:- it is done already

**Kya karna hai:**
Ek aur method `verifySsoToken` banao:

```
Input (POST body): { token: "eyJ..." }

Logic:
1. JWT verify karo with SSO_JWT_SECRET
2. Check karo exp (60 second window)
3. Check karo purpose === 'sso'
4. DynamoDB me check karo: SSO_USED#<jti> record exist karta hai?
   → Exist karta hai: return 401 "Token already used"
5. merchantId se DynamoDB PROFILE fetch karo
6. Cognito se full access token generate karo via AdminInitiateAuth
   → Temporary password set karo → Auth karo → Real tokens lo
7. DynamoDB me SSO_USED#<jti> record banao (TTL: 5 minutes) ← one-time use enforce
8. redirectTo set karo: onboardingCompleted === true ? '/dashboard' : '/onboarding'

Output:
{
  success: true,
  accessToken: "cognito-access-token",
  refreshToken: "cognito-refresh-token",
  idToken: "cognito-id-token",
  user: { userId, email, firstName, lastName },
  redirectTo: "/dashboard" | "/onboarding"
}
```

---

#### STEP 7 — `/api/auth/sso-verify` route register karo

**File:** `Profitfirst/Auth-service/routes/auth.routes.js`

```js
router.post('/sso-verify', authController.verifySsoToken);
```

---

### PHASE 3 — React Frontend Side

---

#### STEP 8 — `/sso-login` page banao React me

**File:** `Profitfirst/frontend-profit-first/client/src/pages/SsoLogin.jsx` *(nayi file)*

**Kya karna hai:**
- URL se `token` query param lo: `/sso-login?token=xyz`
- Page load hone par turant `POST /api/auth/sso-verify` call karo with token
- Loading state dikhao: spinner + "Logging you in..."
- Success hone par:
  - Tokens localStorage me store karo (same format jaise normal login karta hai)
  - `tokenUpdated` event dispatch karo
  - `redirectTo` ke hisaab se navigate karo (`/onboarding` ya `/dashboard`)
- Error hone par: "Login link expired. Please open the app from Shopify again." dikhao

---

#### STEP 9 — `/sso-login` route App.jsx me add karo

**File:** `Profitfirst/frontend-profit-first/client/src/App.jsx`

**Kya karna hai:**
- Import karo: `import SsoLogin from './pages/SsoLogin';`
- Routes me add karo (public route, no auth check needed):
  ```jsx
  <Route path="/sso-login" element={<SsoLogin />} />
  ```
- Existing routes ke saath place karo (before the dashboard protected route)

---

### PHASE 4 — Testing & Verification

---

#### STEP 10 — Local testing plan

**Kya karna hai (sequence):**

1. Shopify app locally run karo: `node index.js` (port 3000)
2. Ngrok se tunnel banao: `ngrok http 3000` — ye `HOST` env var me daalo
3. Auth-service locally run karo: `node Server.js` (alag port pe)
4. Frontend locally run karo: `npm run dev`

**Test Case A — Naya User:**
- Browser me kholo: `http://localhost:3000/app?shop=test-store.myshopify.com`
- Expected: Loading screen dikhe → SSO flow chale → `/sso-login` → `/onboarding` pe land karo

**Test Case B — Purana User (onboarding complete):**
- Same URL, but DynamoDB me `onboardingCompleted: true` ho
- Expected: Loading screen → `/sso-login` → `/dashboard` pe land karo

**Test Case C — Token Expired:**
- 60 seconds baad `/sso-login?token=old-token` manually kholo
- Expected: "Login link expired" error message

**Test Case D — App Uninstall + Reinstall:**
- Shopify se app uninstall karo
- Expected: MongoDB token delete ho, DynamoDB me `appInstalled: false` set ho
- Phir reinstall karo
- Expected: Naya token store ho, `appInstalled: true`, seedha dashboard khule (onboarding na dikhe)

**Test Case E — Replay Attack (one-time use):**
- Valid `/sso-login?token=xyz` use karo → success
- Same URL dobara kholo
- Expected: "Token already used" error

---

#### STEP 11 — Environment Variables Checklist

**`profitfirst-shopify-app/.env` me add karo:**
```
INTERNAL_SERVICE_SECRET=<strong-random-secret-same-both-sides>
PROFITFIRST_API_URL=https://api.profitfirstanalytics.co.in
```

**`Profitfirst/Auth-service/.env` me add karo:**
```
SSO_JWT_SECRET=<strong-random-string-only-auth-service-needs-this>
INTERNAL_SERVICE_SECRET=<strong-random-secret-same-both-sides>
```

**Note:** `INTERNAL_SERVICE_SECRET` dono files me same value honi chahiye.  
`SSO_JWT_SECRET` sirf Auth-Service ke paas rahega — Shopify app ko ye kabhi nahi chahiye.

---

## Summary Table

| Step | File | Action | Phase |
|------|------|--------|-------|
| 1 | `views/app.ejs` | Loading screen banana | Shopify App |
| 2 | `index.js` | `/sso-redirect` endpoint add karo | Shopify App |
| 3 | `.env` | `INTERNAL_SERVICE_SECRET` + `PROFITFIRST_API_URL` add karo | Shopify App |
| 3.5 | `index.js` | `app/uninstalled` webhook register + handler banana | Shopify App |
| 4 | `auth.controller.js` | `shopifySsoLogin` + `shopifyAppUninstalled` methods banana | Auth-Service |
| 5 | `auth.routes.js` | `/shopify-sso` + `/shopify-app-uninstalled` routes register | Auth-Service |
| 6 | `auth.controller.js` | `verifySsoToken` method banana | Auth-Service |
| 7 | `auth.routes.js` | `/sso-verify` route register | Auth-Service |
| 8 | `SsoLogin.jsx` | Nayi page banana | Frontend |
| 9 | `App.jsx` | `/sso-login` route add karna | Frontend |
| 10 | — | Local testing (5 test cases) | Testing |
| 11 | `.env` files | Environment variables set (both sides) | Config |

---

## Important Notes

- **`app.use(express.static(path.join(__dirname, 'public')))`** — Ye line `public/index.html` ko serve karti hai jab `/` ya koi static file request aaye. Ise touch mat karna. Ye `/app` route ko affect nahi karta.
- **`/app` route aur `public/index.html` alag hain** — `/app` EJS render karta hai, static middleware sirf `public/` folder ke files serve karta hai.
- **Existing `/token` endpoint** (`/token?shop=...&password=Sachin369`) — Ye as-is rahega. Abhi bhi Auth-service ke Shopify worker use karta hai COGS fetch ke liye.
- **Existing `/orders`, `/products`, `/customers` routes** — Ye bhi as-is rahenge. Inhe hatana nahi hai.
- **`app.ejs` (Bootstrap dashboard)** — Ye sirf `/app` route pe render hota tha. Ab hum ise loading screen se replace kar rahe hain. Old dashboard code comment kar sakte ho backup ke liye.
- **SSO token one-time use** — `jti` (JWT ID) har token me unique hoga. Verify hone par `SSO_USED#<jti>` DynamoDB record banta hai (5 min TTL). Dobara same token aaya toh 401 milega.
- **Cognito auto-create** — Naye user ke liye `adminCreateUser` + `adminSetUserPassword` + `adminConfirmSignUp` use karna hoga. Random password merchant ko kabhi dikhana nahi — unhe kabhi password enter nahi karna padega.
- **`onboardingCompleted` flag protect karo** — Uninstall/reinstall pe ye flag touch mat karo. Warna purana merchant dobara onboarding se guzrega.
- **AWS Console step (ek baar)** — Cognito User Pool → App Client settings → `ALLOW_ADMIN_USER_PASSWORD_AUTH` enable karo. Code likhne se pehle ye karo warna Step 6 fail karega.


Bas ek chhoti si baat dhyan me rakhna jab Step 3.5 implement karo: agar /app route pe already koi check hai ki accessToken DB me mila ya nahi, wahi logic appInstalled: false ke case ko bhi handle kare — matlab reinstall detect hote hi naya token turant save ho, purana onboarding state touch na ho. Yeh implementation detail hai, plan me already implied hai, bas Step 2/3.5 code likhte waqt is edge case ko test karna mat bhoolna.