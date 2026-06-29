const { GetCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const dynamodbService = require("../services/dynamodb.service");
const { formatInTimeZone } = require("date-fns-tz");

const MERCHANT_ID = "c1c33d7a-d0a1-7089-bb93-76dff06d488b";

async function debugLast30Days() {
    console.log("🕵️ STARTING 30-DAY DEEP DIVE AUDIT...");
    
    // Range: May 16, 2026 to June 15, 2026
    const startDate = "2026-05-16";
    const endDate = "2026-06-15";

    // 1. Fetch All Data
    const [orders, shipments] = await Promise.all([
        dynamodbService.queryAll(MERCHANT_ID, "ORDER#"),
        dynamodbService.queryAll(MERCHANT_ID, "SHIPMENT#"),
    ]);

    // 2. Filter for the 30-day window
    const recentShipments = shipments.filter(s => 
        (s.shipActivityDateIST >= startDate && s.shipActivityDateIST <= endDate) ||
        (s.deliveredAtIST >= startDate && s.deliveredAtIST <= endDate) ||
        (s.rtoAtIST >= startDate && s.rtoAtIST <= endDate)
    );

    console.log(`📊 Total Records in 30-Day Window: ${recentShipments.length} shipments`);

    // 3. Analyzers
    const srOrderAnalysis = {};
    const stats = {
        totalUniqueOrders: new Set(),
        delivered: { count: 0, missingDate: 0, duplicates: 0, ids: new Set() },
        rto: { count: 0, missingDate: 0, ids: new Set() },
        transit: { count: 0, statusBreakdown: {} },
        ndr: { count: 0, ids: new Set() },
        pickup: { count: 0 },
        orphans: 0,
        totalShippingPaid: 0
    };

    recentShipments.forEach(s => {
        const id = s.srOrderId;
        const raw = (s.rawStatus || "").toUpperCase().trim();
        const ds = (s.deliveryStatus || "").toUpperCase().trim();

        // Track Unique Shipments
        if (!raw.includes("CANCEL")) stats.totalUniqueOrders.add(id);
        if (s.isOrphan) stats.orphans++;
        stats.totalShippingPaid += Number(s.totalShippingPaid || 0);

        // A. Delivered Debug (Why 307 vs 165?)
        if (ds === "DELIVERED") {
            if (s.deliveredAtIST >= startDate && s.deliveredAtIST <= endDate) {
                if (stats.delivered.ids.has(id)) stats.delivered.duplicates++;
                stats.delivered.count++;
                stats.delivered.ids.add(id);
            } else if (!s.deliveredAtIST) {
                stats.delivered.missingDate++;
            }
        }

        // B. RTO Debug (Why 204 vs 232?)
        if (ds === "RTO" || raw.includes("RTO") || raw.includes("BACK")) {
            const rtoDate = s.rtoAtIST || s.shipActivityDateIST;
            if (rtoDate >= startDate && rtoDate <= endDate) {
                stats.rto.count++;
                stats.rto.ids.add(id);
            } else if (!s.rtoAtIST) {
                stats.rto.missingDate++;
            }
        }

        // C. Snapshot Debug (Why 111 NDR?)
        if (s.shipActivityDateIST === endDate) { // Checking Latest Day only
            if (["NEW", "READY TO SHIP", "PICKUP GENERATED", "OUT FOR PICKUP"].includes(raw)) stats.pickup++;
            if (raw.includes("UNDELIVERED") || raw.includes("EXCEPTION")) stats.ndr.count++;
            if (["IN TRANSIT", "SHIPPED", "OUT FOR DELIVERY"].includes(raw)) stats.transit.count++;
        }
    });

    // --- REPORT GENERATION ---
    console.log("\n" + "=".repeat(60));
    console.log(`🔎 AUDIT REPORT [${startDate} to ${endDate}]`);
    console.log("=".repeat(60));

    console.log(`\n1. TOTAL SHIPMENTS (Unique Orders)`);
    console.log(`   - Your Current Code says : ${recentShipments.length} (Counting every AWB/Update)`);
    console.log(`   - Shiprocket Style       : ${stats.totalUniqueOrders.size} (Unique Order IDs)`);
    console.log(`   - ISSUE: You are overcounting shipments by ${recentShipments.length - stats.totalUniqueOrders.size} due to AWB updates.`);

    console.log(`\n2. DELIVERED ORDERS (Audit)`);
    console.log(`   - Total Delivered Found  : ${stats.delivered.count}`);
    console.log(`   - Double-counted AWBs    : ${stats.delivered.duplicates}`);
    console.log(`   - Missing Delivery Date  : ${stats.delivered.missingDate}`);
    console.log(`   - REAL UNIQUE DELIVERED  : ${stats.delivered.ids.size}`);

    console.log(`\n3. RTO ORDERS (Audit)`);
    console.log(`   - Total RTO captured     : ${stats.rto.count}`);
    console.log(`   - RTOs with NULL date    : ${stats.rto.missingDate} (Capturing via shipActivityDate)`);
    console.log(`   - REAL UNIQUE RTO        : ${stats.rto.ids.size}`);

    console.log(`\n4. SNAPSHOT METRICS (As of ${endDate})`);
    console.log(`   - Pickup Pending         : ${stats.pickup}`);
    console.log(`   - NDR Pending Task       : ${stats.ndr.count}`);
    console.log(`   - In Transit             : ${stats.transit.count}`);
    console.log(`   - ISSUE: Dashboard shows 111 NDR because it SUMS 30 days. You need ONLY today's count.`);

    console.log(`\n5. FINANCIALS`);
    console.log(`   - Total Shipping Spend   : ₹${stats.totalShippingPaid.toFixed(2)}`);
    console.log(`   - Orphan Shipments found : ${stats.orphans} (Charges for these are being added)`);

    console.log("\n" + "=".repeat(60));
    console.log("🚀 DEBUG COMPLETE. Ready to fix Summary Worker.");
}

debugLast30Days().catch(console.error);