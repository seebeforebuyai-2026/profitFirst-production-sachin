const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { seedKnowledgeBase } = require("../agents/knowledge");

const initialKnowledge = [
  { id: "rto_1", category: "RTO", text: "In India, COD orders have 3x higher RTO. To fix: confirm every COD order via WhatsApp automated bot." },
  { id: "ads_1", category: "ADS", text: "If POAS is under 1.2, ads are eating profit. Shift budget to remarketing instead of cold interest." },
  { id: "ship_1", category: "LOGISTICS", text: "Use Shiprocket's 'Weight Freeze' to avoid fake weight charges by couriers." },
  { id: "profit_1", category: "STRATEGY", text: "A healthy D2C brand should maintain at least 15% Net Profit after all leakage (Ads + RTO + Shipping)." }
];

async function run() {
    console.log("🚀 Starting Production Knowledge Seed...");
    const result = await seedKnowledgeBase(initialKnowledge);
    if (result) console.log("🏁 AI BRAIN UPDATED.");
    else console.log("💀 SYSTEM FAILURE.");
}

run();