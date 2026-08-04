const { PutCommand, GetCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const crypto = require("crypto");
const { Cashfree, CFEnvironment } = require("cashfree-pg");

// ── Cashfree SDK init (static config — done once at startup) ─────────────
const CF_ENV = process.env.CASHFREE_ENV || "SANDBOX";

Cashfree.XClientId     = process.env.CASHFREE_CLIENT_ID;
Cashfree.XClientSecret = process.env.CASHFREE_CLIENT_SECRET;
Cashfree.XEnvironment  = CF_ENV === "PRODUCTION"
  ? CFEnvironment.PRODUCTION
  : CFEnvironment.SANDBOX;
Cashfree.XApiVersion   = "2025-01-01";

const cf = new Cashfree(); 

// ── Plans — must match frontend Ourplans.jsx ─────────────────────────────
const PLANS = {
  starter: { planId: "starter", name: "Starter", amount: 4999,  currency: "INR", duration: 30 },
  growth : { planId: "growth",  name: "Growth",  amount: 9999,  currency: "INR", duration: 30 },
};

// ── Helpers ───────────────────────────────────────────────────────────────
function calculateExpiry(planId) {
  const plan = PLANS[planId];
  if (!plan) return null;
  const d = new Date();
  d.setDate(d.getDate() + plan.duration);
  return d.toISOString();
}

async function activateSubscription(merchantId, paymentRecord, paymentData) {
  const { cfOrderId, planId } = paymentRecord;
  const expiresAt   = calculateExpiry(planId);
  const activatedAt = new Date().toISOString();

  console.log(`✅ [Payment] Activate ${merchantId} | plan: ${planId} | expires: ${expiresAt}`);

  await newDynamoDB.send(new UpdateCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${merchantId}`, SK: `PAYMENT#${cfOrderId}` },
    UpdateExpression:
      "SET #s = :s, activatedAt = :a, expiresAt = :e, cfPaymentId = :pid, updatedAt = :u",
    ExpressionAttributeNames : { "#s": "status" },
    ExpressionAttributeValues: {
      ":s"  : "SUCCESS",
      ":a"  : activatedAt,
      ":e"  : expiresAt,
      ":pid": String(paymentData.cf_payment_id || paymentData.payment_id || ""),
      ":u"  : new Date().toISOString(),
    },
  }));

  await newDynamoDB.send(new UpdateCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${merchantId}`, SK: "PROFILE" },
    UpdateExpression: "SET subscription = :sub, updatedAt = :u",
    ExpressionAttributeValues: {
      ":sub": {
        status     : "ACTIVE",
        planId,
        planName   : paymentRecord.planName,
        amount     : paymentRecord.amount,
        currency   : paymentRecord.currency,
        cfOrderId,
        expiresAt,
        activatedAt,
      },
      ":u": new Date().toISOString(),
    },
  }));
}

async function markPaymentFailed(merchantId, cfOrderId, status, paymentData) {
  await newDynamoDB.send(new UpdateCommand({
    TableName: newTableName,
    Key: { PK: `MERCHANT#${merchantId}`, SK: `PAYMENT#${cfOrderId}` },
    UpdateExpression: "SET #s = :s, failureReason = :fr, updatedAt = :u",
    ExpressionAttributeNames : { "#s": "status" },
    ExpressionAttributeValues: {
      ":s" : status,
      ":fr": String(paymentData.payment_message || paymentData.error_detail || ""),
      ":u" : new Date().toISOString(),
    },
  }));
}

// ═════════════════════════════════════════════════════════════════════════
class PaymentController {

  // POST /api/payment/create-order
  async createOrder(req, res) {
    try {
      const { planId }  = req.body;
      const merchantId  = req.user.userId;
      const email       = req.user.email;

      const plan = PLANS[planId];
      if (!plan) {
        return res.status(400).json({ error: "Invalid plan. Use 'starter' or 'growth'." });
      }

      // Unique order ID — Cashfree requires max 50 chars, alphanumeric + _ -
      const cfOrderId = `PF_${merchantId.replace(/-/g, "").slice(0, 8)}_${Date.now()}`;

      // Save to DynamoDB BEFORE calling Cashfree (idempotency)
      await newDynamoDB.send(new PutCommand({
        TableName: newTableName,
        Item: {
          PK        : `MERCHANT#${merchantId}`,
          SK        : `PAYMENT#${cfOrderId}`,
          entityType: "PAYMENT",
          cfOrderId,
          planId,
          planName  : plan.name,
          amount    : plan.amount,
          currency  : plan.currency,
          status    : "PENDING",
          merchantId,
          email,
          createdAt : new Date().toISOString(),
          updatedAt : new Date().toISOString(),
        },
      }));

      // Reverse-lookup so webhook can find merchantId from cfOrderId
      await newDynamoDB.send(new PutCommand({
        TableName: newTableName,
        Item: {
          PK        : `PAYMENT_LOOKUP#${cfOrderId}`,
          SK        : "LOOKUP",
          merchantId,
          cfOrderId,
          createdAt : new Date().toISOString(),
          ttl       : Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7-day TTL
        },
      }));

      // Create order via Cashfree SDK (v6, API 2025-01-01)
      const orderRequest = {
        order_id      : cfOrderId,
        order_amount  : plan.amount,
        order_currency: plan.currency,
        order_note    : `ProfitFirst ${plan.name} Plan`,
        customer_details: {
          customer_id   : merchantId,
          customer_email: email,
          customer_phone: "9999999999",    // Cashfree requires phone
          customer_name : email.split("@")[0],
        },
        order_meta: {
          return_url: `${process.env.FRONTEND_URL}/payment/status?order_id={order_id}`,
          notify_url: `${process.env.BASE_URL}/api/payment/webhook`,
        },
      };

      const response = await cf.PGCreateOrder(orderRequest);
      const orderData = response.data;

      console.log(`✅ [Payment] Order ${cfOrderId} | ${plan.name} | ₹${plan.amount}`);

      return res.json({
        success    : true,
        orderId    : cfOrderId,
        sessionId  : orderData.payment_session_id,
        amount     : plan.amount,
        currency   : plan.currency,
        planName   : plan.name,
        environment: CF_ENV,
      });

    } catch (err) {
      const detail = err.response?.data?.message || err.message;
      console.error("❌ [Payment] createOrder:", detail);
      return res.status(500).json({ error: "Failed to create payment order", detail });
    }
  }

  // POST /api/payment/webhook  (no JWT — Cashfree calls this directly)
  async webhook(req, res) {
    try {
      const signature = req.headers["x-webhook-signature"];
      const timestamp = req.headers["x-webhook-timestamp"];

      // Always return 200 quickly so Cashfree doesn't retry
      if (!signature || !timestamp) {
        console.warn("⚠️ [Webhook] Missing headers");
        return res.status(200).json({ received: true });
      }

      // Verify HMAC-SHA256 signature
      const rawBody     = JSON.stringify(req.body);
      const signedData  = `${timestamp}${rawBody}`;
      const expectedSig = crypto
        .createHmac("sha256", process.env.CASHFREE_CLIENT_SECRET)
        .update(signedData)
        .digest("base64");

      if (expectedSig !== signature) {
        console.warn("⚠️ [Webhook] Invalid signature");
        return res.status(200).json({ received: true });   // still 200
      }

      const event         = req.body;
      const cfOrderId     = event.data?.order?.order_id;
      const paymentStatus = event.data?.payment?.payment_status; // SUCCESS | FAILED | USER_DROPPED

      console.log(`📩 [Webhook] ${event.type} | orderId=${cfOrderId} | status=${paymentStatus}`);

      if (!cfOrderId) return res.status(200).json({ received: true });

      // Look up merchantId from reverse-lookup record
      const lookup = await newDynamoDB.send(new GetCommand({
        TableName: newTableName,
        Key: { PK: `PAYMENT_LOOKUP#${cfOrderId}`, SK: "LOOKUP" },
      }));

      if (!lookup.Item) {
        console.warn(`⚠️ [Webhook] No lookup record for ${cfOrderId}`);
        return res.status(200).json({ received: true });
      }

      const merchantId = lookup.Item.merchantId;
      const payRec = await newDynamoDB.send(new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: `PAYMENT#${cfOrderId}` },
      }));

      if (!payRec.Item) {
        console.warn(`⚠️ [Webhook] No payment record for ${cfOrderId}`);
        return res.status(200).json({ received: true });
      }

      // Idempotency — don't re-activate already processed payments
      if (payRec.Item.status === "SUCCESS") {
        return res.status(200).json({ received: true });
      }

      if (paymentStatus === "SUCCESS") {
        await activateSubscription(merchantId, payRec.Item, event.data.payment);
      } else if (paymentStatus === "FAILED" || paymentStatus === "USER_DROPPED") {
        await markPaymentFailed(merchantId, cfOrderId, paymentStatus, event.data.payment || {});
      }

      return res.status(200).json({ received: true });

    } catch (err) {
      console.error("❌ [Webhook] Error:", err.message);
      return res.status(200).json({ received: true }); // always 200
    }
  }

  // GET /api/payment/verify/:orderId  (JWT protected)
  async verifyPayment(req, res) {
    try {
      const { orderId } = req.params;
      const merchantId  = req.user.userId;

      // Check DB first
      const dbRes = await newDynamoDB.send(new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: `PAYMENT#${orderId}` },
      }));

      if (!dbRes.Item) {
        return res.status(404).json({ error: "Payment not found" });
      }

      if (dbRes.Item.status === "SUCCESS") {
        return res.json({
          success    : true,
          status     : "SUCCESS",
          planId     : dbRes.Item.planId,
          planName   : dbRes.Item.planName,
          expiresAt  : dbRes.Item.expiresAt,
          activatedAt: dbRes.Item.activatedAt,
        });
      }

      // Not yet confirmed — fetch live from Cashfree SDK
      try {
        const cfRes = await cf.PGFetchOrder(orderId);
        const order = cfRes.data;

        if (order.order_status === "PAID") {
          // Webhook not fired yet — activate now as fallback
          const paymentsRes  = await cf.PGOrderFetchPayments(orderId);
          const successPayment = (paymentsRes.data || []).find(
            (p) => p.payment_status === "SUCCESS"
          );
          if (successPayment) {
            await activateSubscription(merchantId, dbRes.Item, successPayment);
            return res.json({
              success  : true,
              status   : "SUCCESS",
              planId   : dbRes.Item.planId,
              planName : dbRes.Item.planName,
              expiresAt: calculateExpiry(dbRes.Item.planId),
            });
          }
        }
      } catch (cfErr) {
        console.warn("[Verify] Cashfree fetch error:", cfErr.message);
      }

      return res.json({ success: false, status: dbRes.Item.status });

    } catch (err) {
      console.error("❌ [Payment] verify:", err.message);
      return res.status(500).json({ error: "Verification failed" });
    }
  }

  // GET /api/payment/subscription  (JWT protected)
  async getSubscription(req, res) {
    try {
      const merchantId = req.user.userId;
      const profileRes = await newDynamoDB.send(new GetCommand({
        TableName: newTableName,
        Key: { PK: `MERCHANT#${merchantId}`, SK: "PROFILE" },
      }));

      const sub = profileRes.Item?.subscription || {};
      const isActive = sub.status === "ACTIVE" &&
        sub.expiresAt && new Date(sub.expiresAt) > new Date();

      return res.json({
        success    : true,
        isActive,
        status     : isActive ? "ACTIVE" : (sub.status || "NONE"),
        planId     : sub.planId     || null,
        planName   : sub.planName   || null,
        expiresAt  : sub.expiresAt  || null,
        activatedAt: sub.activatedAt|| null,
        daysLeft   : isActive
          ? Math.ceil((new Date(sub.expiresAt) - new Date()) / 86400000)
          : 0,
      });
    } catch (err) {
      console.error("❌ [Payment] getSubscription:", err.message);
      return res.status(500).json({ error: "Failed to fetch subscription" });
    }
  }

  // GET /api/payment/plans  (public)
  getPlans(_req, res) {
    return res.json({
      success: true,
      plans  : Object.values(PLANS),
    });
  }
}

module.exports = new PaymentController();
