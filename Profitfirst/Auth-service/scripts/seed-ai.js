const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { seedKnowledgeBase } = require("../agents/knowledge");

const megaKnowledgeBase = [
  {
    id: "rto_master_strategy",
    category: "RTO",
    text: "RTO reduction strategy for India: 1. Automated WhatsApp/Call confirmation for every COD order. 2. Address verification for house numbers/landmarks. 3. Partial COD (₹200 upfront) for high-risk cities. 4. Weight Freeze on Shiprocket to avoid fake volumetric charges. 5. Prepaid users abandon less because of trust; COD users have higher regret rates. Use 'Loyalty Discount' after delivery to keep them coming back."
  },
  {
    id: "cod_vs_prepaid_logic",
    category: "RTO",
    text: "Why prepaid users abandon? Usually due to lack of trust or failed payment gateways. To fix: Use Razorpay/GoKwik one-click checkout. Why COD has high RTO? Impulse buying. Switch COD to Prepaid by offering a flat 5-10% discount on the payment page."
  },

  {
    id: "ads_scaling_rules",
    category: "ADS",
    text: "Scaling rules: Never double the budget in one go (it resets the learning phase). Increase budget by 15-20% every 48 hours. If ROAS drops, duplicate the winning ad sets instead of editing them. Minimum budget: ₹1L/month for India, ₹2-3L/month for International."
  },
  {
    id: "creative_fatigue_strategy",
    category: "ADS",
    text: "Manage ad fatigue by refreshing creatives every 1-2 weeks. Test 4-5 new creatives weekly. Hierarchy of importance: Creative > Website Speed > Targeting. UGC (User Generated Content) and influencer face-videos currently convert better than studio shoots because of the 'Trust Factor'."
  },
  {
    id: "metrics_cpr_ctr_logic",
    category: "ADS",
    text: "To improve CTR: Hook the user in the first 3 seconds with music/visuals. To reduce CPR/CPP: Improve website conversion rate. Moving from 1% to 2% conversion reduces your ad cost (CPR) by half."
  },

  {
    id: "sales_aov_hacks",
    category: "SALES",
    text: "Increase AOV (Average Order Value) via: 1. Product Bundles (Watch + Extra Strap). 2. Buy 2 Get 1 Free offers. 3. Upsell on the thank-you page. Price Anchoring: Show a higher original price (₹2000) and give 50% off (₹1000) to attract middle-class buyers."
  },
  {
    id: "funnel_optimization",
    category: "SALES",
    text: "Funnel drop-off points: If users 'Add to Cart' but don't buy, check for hidden shipping costs or a slow checkout. Urgency elements like 'Only 5 left' or 'Sale ends in 2 hours' work, but only if used sparingly. Too many fake timers kill trust."
  },

  {
    id: "website_trust_elements",
    category: "WEBSITE",
    text: "Trust elements that actually work: 1. Video reviews from real customers. 2. Influencer testimonials (as they have recognizable faces). 3. Trust badges (SSL, Safe Checkout). 4. Clear Return/Refund policy visible on the product page. 5. Show a mix of positive and a few 'neutral' reviews to look authentic."
  },
  {
    id: "mobile_checkout_optimization",
    category: "WEBSITE",
    text: "90% of traffic is mobile. Product page must have: 1. Fast load time (<3s). 2. Sticky 'Buy Now' button. 3. Review stars at the top. 4. Optimized checkout with minimal fields."
  },

  {
    id: "testing_phase_expectations",
    category: "STRATEGY",
    text: "Testing phase lasts 7-14 days. First sale usually takes 7-10 days of consistent spend. Do not judge results in 3 days. Meta needs data to optimize. Current global situations (war/economic) mostly impact international shipping times and freight costs, buffer your delivery dates accordingly."
  },
  {
    id: "repeat_purchase_strategy",
    category: "STRATEGY",
    text: "Repeat purchases are the key to profitability. Use WhatsApp marketing and Email flows for post-purchase. Offer a 'Second Purchase Discount' of 15% within 48 hours of first delivery."
  }
];

async function run() {
  console.log(`\n🚀 [KNOWLEDGE REFRESH] Preparing Mega-Seed...`);
  console.log(`📊 Total Expert Insights to index: ${megaKnowledgeBase.length}`);
  
  try {
    // 🟢 Step 1: Ingest everything
    const result = await seedKnowledgeBase(megaKnowledgeBase);
    if (result) {
      console.log("------------------------------------------");
      console.log("✨ SUCCESS: AI Brain is now a MEGA EXPERT!");
      console.log("------------------------------------------");
    }
  } catch (err) {
    console.error("❌ FATAL ERROR during seed:", err.message);
  }
}

run();

// run string 1 

// const path = require("path");
// require("dotenv").config({ path: path.join(__dirname, "../.env") });
// const { seedKnowledgeBase } = require("../agents/knowledge");

// const initialKnowledge = [
//   { id: "rto_1", category: "RTO", text: "In India, COD orders have 3x higher RTO. To fix: confirm every COD order via WhatsApp automated bot." },
//   { id: "ads_1", category: "ADS", text: "If POAS is under 1.2, ads are eating profit. Shift budget to remarketing instead of cold interest." },
//   { id: "ship_1", category: "LOGISTICS", text: "Use Shiprocket's 'Weight Freeze' to avoid fake weight charges by couriers." },
//   { id: "profit_1", category: "STRATEGY", text: "A healthy D2C brand should maintain at least 15% Net Profit after all leakage (Ads + RTO + Shipping)." }
// ];

// async function run() {
//     console.log("🚀 Starting Production Knowledge Seed...");
//     const result = await seedKnowledgeBase(initialKnowledge);
//     if (result) console.log("🏁 AI BRAIN UPDATED.");
//     else console.log("💀 SYSTEM FAILURE.");
// }

// run();