const { GetCommand, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const { formatInTimeZone } = require("date-fns-tz");
const dynamodbService = require("../services/dynamodb.service");

const MERCHANT_ID = "c1c33d7a-d0a1-7089-bb93-76dff06d488b";
const DAYS_TO_RECALCULATE = 365;

const PICKUP_PENDING_STATUSES = ["NEW", "READY_TO_SHIP", "PICKUP_SCHEDULED", "PICKUP_GENERATED", "PICKUP_QUEUED", "LABEL_GENERATED", "MANIFEST_GENERATED"];
const NDR_PENDING_STATUSES = ["UNDELIVERED", "PICKUP_EXCEPTION", "UNDELIVERED_1ST", "UNDELIVERED_2ND", "UNDELIVERED_3RD"];
const normalize = (name) => name ? name.toString().replace(/^#/, "").trim().toLowerCase() : "";

function initDay() {
    return {
        revenueGenerated: 0, revenueEarned: 0, prepaidRevenue: 0, codRevenue: 0,
        revenueFromPastOrders: 0, revenueFromCurrentOrders: 0,
        pastOrdersCount: 0, currentOrdersCount: 0,
        cogs: 0, adsSpend: 0, shippingSpend: 0, gatewayFees: 0,
        rtoHandlingFees: 0, rtoRevenueLost: 0, businessExpenses: 0,
        totalOrders: 0, totalShipments: 0, deliveredOrders: 0, rtoOrders: 0,
        inTransitOrders: 0, pickupPendingOrders: 0, ndrPendingOrders: 0,
        orphanShipmentsCount: 0, cancelledOrders: 0, prepaidOrders: 0,
        codOrders: 0, partialCodOrders: 0, expectedRevenue: 0, aov: 0
    };
}

async function runSummaryLocal() {
    console.log(`🚀 Starting FINAL Accuracy Fix for ${MERCHANT_ID}...`);
    try {
        const profileRes = await newDynamoDB.send(new GetCommand({
            TableName: newTableName, Key: { PK: `MERCHANT#${MERCHANT_ID}`, SK: "PROFILE" }
        }));
        const profile = profileRes?.Item || {};
        const gatewayRate = (profile.paymentGatewayFeePercent || 2.5) / 100;
        const rtoFee = Number(profile.rtoHandlingFees || 60);
        const dailyOverhead = ((Number(profile.agencyFees) || 0) + (Number(profile.staffSalary) || 0) + (Number(profile.officeRent) || 0) + (Number(profile.otherExpenses) || 0)) / 30;

        const [orders, ads, shipments] = await Promise.all([
            dynamodbService.queryAll(MERCHANT_ID, "ORDER#"),
            dynamodbService.queryAll(MERCHANT_ID, "ADS#"),
            dynamodbService.queryAll(MERCHANT_ID, "SHIPMENT#"),
        ]);

        const orderMap = new Map(orders.map((o) => [normalize(o.orderName), o]));
        const firstActivityMap = new Map();
        shipments.forEach(s => {
            const key = normalize(s.shopifyOrderName);
            if (s.shipActivityDateIST && (!firstActivityMap.has(key) || s.shipActivityDateIST < firstActivityMap.get(key))) {
                firstActivityMap.set(key, s.shipActivityDateIST);
            }
        });

        const shipByActivity = new Map();
        const shipByDelivery = new Map();
        const shipByRTO = new Map();
        shipments.forEach(s => {
            if (s.shipActivityDateIST) {
                if (!shipByActivity.has(s.shipActivityDateIST)) shipByActivity.set(s.shipActivityDateIST, []);
                shipByActivity.get(s.shipActivityDateIST).push(s);
            }
            if (s.deliveredAtIST) {
                if (!shipByDelivery.has(s.deliveredAtIST)) shipByDelivery.set(s.deliveredAtIST, []);
                shipByDelivery.get(s.deliveredAtIST).push(s);
            }
            const rtoDate = s.rtoAtIST || (s.deliveryStatus === "RTO" ? s.shipActivityDateIST : null);
            if (rtoDate) {
                if (!shipByRTO.has(rtoDate)) shipByRTO.set(rtoDate, []);
                shipByRTO.get(rtoDate).push(s);
            }
        });

        const today = new Date();
        for (let i = 0; i < DAYS_TO_RECALCULATE; i++) {
            const dateObj = new Date();
            dateObj.setDate(today.getDate() - i);
            const targetDate = formatInTimeZone(dateObj, "Asia/Kolkata", "yyyy-MM-dd");
            const targetMonth = targetDate.substring(0, 7);
            const stats = initDay();
            let hasActivity = false;

            // 1. ADS
            ads.filter(a => a.date === targetDate).forEach(a => { stats.adsSpend += Number(a.spend || 0); hasActivity = true; });

            // 2. ORDERS (Realize Prepaid COGS here)
            orders.filter(o => o.orderCreatedAtIST === targetDate).forEach(o => {
                hasActivity = true;
                stats.totalOrders += 1;
                stats.revenueGenerated += (Number(o.totalPrice) - Number(o.discounts || 0));
                if (o.isCancelled) stats.cancelledOrders += 1;
                if (o.paymentType === "PREPAID") {
                    stats.prepaidOrders += 1;
                    stats.revenueEarned += Number(o.prepaidAmount || 0);
                    stats.prepaidRevenue += Number(o.prepaidAmount || 0);
                    stats.gatewayFees += Number(o.prepaidAmount || 0) * gatewayRate;
                    stats.cogs += Number(o.totalCogs || 0); // COGS Realized on Order Day
                    stats.revenueFromCurrentOrders += Number(o.prepaidAmount || 0);
                    stats.currentOrdersCount += 1;
                } else if (o.paymentType === "COD") { stats.codOrders += 1; }
                else if (o.paymentType === "PARTIAL_COD") {
                    stats.partialCodOrders += 1;
                    stats.revenueEarned += Number(o.prepaidAmount || 0);
                    stats.gatewayFees += Number(o.prepaidAmount || 0) * gatewayRate;
                    stats.revenueFromCurrentOrders += Number(o.prepaidAmount || 0);
                }
            });

            // 3. SHIPMENTS
            const deliveredUniqueOrders = new Set();
            const rtoUniqueOrders = new Set();
            const activityUniqueOrders = new Set();

            (shipByActivity.get(targetDate) || []).forEach(s => {
                hasActivity = true;
                stats.shippingSpend += Number(s.totalShippingPaid || 0);
                const orderKey = normalize(s.shopifyOrderName);
                if (firstActivityMap.get(orderKey) === targetDate) stats.totalShipments += 1;
                if (PICKUP_PENDING_STATUSES.includes(s.rawStatus)) stats.pickupPendingOrders += 1;
                if (NDR_PENDING_STATUSES.includes(s.rawStatus)) stats.ndrPendingOrders += 1;
                if (s.deliveryStatus === "IN_TRANSIT") stats.inTransitOrders += 1;
            });

            (shipByDelivery.get(targetDate) || []).forEach(s => {
                const orderKey = normalize(s.shopifyOrderName);
                if (s.deliveryStatus === "DELIVERED" && !deliveredUniqueOrders.has(orderKey)) {
                    hasActivity = true;
                    deliveredUniqueOrders.add(orderKey);
                    stats.deliveredOrders += 1;
                    const matchingOrder = orderMap.get(orderKey);
                    const realizedCod = matchingOrder ? Number(matchingOrder.codAmount || 0) : Number(s.codAmount || 0);
                    
                    if (realizedCod > 0) {
                        stats.revenueEarned += realizedCod;
                        stats.codRevenue += realizedCod;
                        // 🟢 FIX: Realize COGS for COD/Partial only on delivery
                        if (matchingOrder?.paymentType !== "PREPAID") {
                            stats.cogs += (matchingOrder ? Number(matchingOrder.totalCogs || 0) : Number(s.totalCogs || 0));
                        }
                        const orderDate = matchingOrder?.orderCreatedAtIST || s.orderCreatedAtIST;
                        if (orderDate && orderDate.substring(0, 7) < targetMonth) {
                            stats.revenueFromPastOrders += realizedCod;
                            stats.pastOrdersCount += 1;
                        } else {
                            stats.revenueFromCurrentOrders += realizedCod;
                            if (matchingOrder?.paymentType === "COD") stats.currentOrdersCount += 1;
                        }
                    }
                }
            });

            (shipByRTO.get(targetDate) || []).forEach(s => {
                const orderKey = normalize(s.shopifyOrderName);
                if (!rtoUniqueOrders.has(orderKey)) {
                    hasActivity = true;
                    stats.rtoOrders += 1;
                    stats.rtoHandlingFees += rtoFee;
                    const matchingOrder = orderMap.get(orderKey);
                    stats.rtoRevenueLost += (matchingOrder ? Number(matchingOrder.netRevenue || 0) : Number(s.netRevenue || 0));
                    rtoUniqueOrders.add(orderKey);
                }
            });

            if (hasActivity) {
                const totalCost = stats.cogs + stats.adsSpend + stats.shippingSpend + stats.gatewayFees + stats.rtoHandlingFees + dailyOverhead;
                const moneyKept = Number((stats.revenueEarned - totalCost).toFixed(2));
                await newDynamoDB.send(new PutCommand({
                    TableName: newTableName,
                    Item: { PK: `MERCHANT#${MERCHANT_ID}`, SK: `SUMMARY#${targetDate}`, ...stats, moneyKept, totalCost: Number(totalCost.toFixed(2)), businessExpenses: Number(dailyOverhead.toFixed(2)), updatedAt: new Date().toISOString() }
                }));
            }
        }
        console.log("✅ Database Fixed.");
    } catch (err) { console.error(err); }
}
runSummaryLocal();