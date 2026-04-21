const path = require("path");
const fs   = require("fs");
require("dotenv").config({ path: path.join(__dirname, "../.env") });
const { QueryCommand } = require("@aws-sdk/lib-dynamodb");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const encryption = require("../utils/encryption");
const axios = require("axios");

const MERCHANT_ID = "41037dca-f0a1-7005-fcfe-6841ff1fc07b";
const TARGET_DATE = "2026-02-19";
const DUMP_FILE   = path.join(__dirname, `audit-dump-${TARGET_DATE}.json`);

const r2 = (n) => Math.round(n * 100) / 100;
const pct = (n) => r2(n * 100);

// ─────────────────────────────────────────────────────────────────────────────
//  PROVEN FORMULAS (verified from real data):
//
//  Store uses TAX-INCLUSIVE pricing.
//  Gross Sales   = SUM(subtotalPriceSet − totalTaxSet)   ← matches dashboard exactly
//  Revenue Gen.  = SUM(totalPriceSet − totalDiscountsSet) for non-cancelled, non-test
//  Revenue Earned= SUM(totalPriceSet − discounts − refunds) for DELIVERED orders only
//  Returns       = SUM(refundLineItems[].subtotalSet)     ← product value only
//  Prepaid       = paymentGatewayNames does NOT include "Cash on Delivery"
// ─────────────────────────────────────────────────────────────────────────────

// Shopify GraphQL — fetch all fields needed for full dashboard
// lineItems needed for product profitability (Section 4)
// paymentGatewayNames needed for prepaid detection (gateway fee calc)
const ORDER_QUERY = `
  query GetOrders($after: String) {
    orders(
      first: 250
      after: $after
      sortKey: CREATED_AT
      query: "created_at:>=${TARGET_DATE} AND created_at:<=${TARGET_DATE}"
    ) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          name
          createdAt
          cancelledAt
          test
          displayFulfillmentStatus
          paymentGatewayNames

          subtotalPriceSet        { shopMoney { amount } }
          totalPriceSet           { shopMoney { amount } }
          totalDiscountsSet       { shopMoney { amount } }
          totalTaxSet             { shopMoney { amount } }
          totalShippingPriceSet   { shopMoney { amount } }

          # Product breakdown for Section 4
          lineItems(first: 50) {
            edges {
              node {
                name
                quantity
                variant { id }
                originalUnitPriceSet { shopMoney { amount } }
                discountedUnitPriceSet { shopMoney { amount } }
                totalDiscountSet { shopMoney { amount } }
              }
            }
          }

          # Refund line items — product portion only (matches dashboard Returns)
          refunds {
            createdAt
            refundLineItems(first: 50) {
              edges {
                node {
                  quantity
                  subtotalSet { shopMoney { amount } }
                  lineItem { name }
                }
              }
            }
          }
        }
      }
    }
  }`;

async function fullAuditDump() {
  console.log(`\n🚀 FULL DASHBOARD AUDIT — ${TARGET_DATE}`);
  console.log("=".repeat(60));

  // ── CREDENTIALS ─────────────────────────────────────────────────────────────
  const intRes = await newDynamoDB.send(new QueryCommand({
    TableName: newTableName,
    KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
    ExpressionAttributeValues: {
      ":pk": `MERCHANT#${MERCHANT_ID}`,
      ":sk": "INTEGRATION#",
    },
  }));
  const integrations = {};
  intRes.Items.forEach((i) => { integrations[i.platform.toUpperCase()] = i; });

  const shopifyToken = encryption.decrypt(integrations.SHOPIFY.accessToken);
  const srToken      = encryption.decrypt(integrations.SHIPROCKET.token);
  const metaToken    = encryption.decrypt(integrations.META.accessToken);

  // ═══════════════════════════════════════════════════════════════════════════
  //  SECTION 1+3+4: SHOPIFY ORDERS
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📡 Shopify: fetching orders with line items...");

  // Accumulators
  const shopifyOrderIds = new Set(); // all non-test, non-cancelled order IDs
  const productMap = {};             // variantId/name → { name, qty, revenue }

  let s = {
    // Section 1
    revenueGenerated: 0,   // SUM(totalPrice - discounts) non-cancelled, non-test
    refs: 0,               // SUM(refundLineItems subtotals) product refunds
    tax: 0,
    ship: 0,
    total: 0,
    grossSales: 0,         // SUM(subtotal - tax) for dashboard cross-check

    // Section 3
    totalOrders: 0,        // non-cancelled, non-test
    cancelledCount: 0,
    testCount: 0,
    prepaidCount: 0,
    prepaidRevenue: 0,     // needed for gateway fee on prepaid delivered

    // Raw order list (to cross-ref with Shiprocket)
    orders: [],            // { id, name, total, discounts, refunded, prepaid, cancelled }
  };

  let hasNext = true, cursor = null, page = 0;

  while (hasNext) {
    page++;
    const res = await axios.post(
      `https://${integrations.SHOPIFY.shopifyStore}/admin/api/2024-04/graphql.json`,
      { query: ORDER_QUERY, variables: { after: cursor } },
      { headers: { "X-Shopify-Access-Token": shopifyToken } },
    );

    if (res.data.errors) {
      console.error("❌ Shopify error:", JSON.stringify(res.data.errors, null, 2));
      break;
    }

    const od = res.data.data.orders;
    hasNext  = od.pageInfo.hasNextPage;
    cursor   = od.pageInfo.endCursor;

    od.edges.forEach(({ node: o }) => {
      if (o.test) { s.testCount++; return; }

      const isCancelled = !!o.cancelledAt;
      const subtotal    = Number(o.subtotalPriceSet.shopMoney.amount);
      const total       = Number(o.totalPriceSet.shopMoney.amount);
      const discounts   = Number(o.totalDiscountsSet.shopMoney.amount);
      const tax         = Number(o.totalTaxSet.shopMoney.amount);
      const shipping    = Number(o.totalShippingPriceSet.shopMoney.amount);

      // Prepaid = payment gateway is NOT Cash on Delivery
      const isPrepaid = !o.paymentGatewayNames.some(
        (g) => g.toLowerCase().includes("cash on delivery") || g.toLowerCase() === "cod",
      );

      // Product-only refund (matches dashboard Returns column)
      const refunded = o.refunds.reduce((sum, refund) => {
        return sum + refund.refundLineItems.edges.reduce((rSum, { node: rli }) => {
          return rSum + Number(rli.subtotalSet.shopMoney.amount);
        }, 0);
      }, 0);

      // ── DASHBOARD FORMULA: Revenue Generated ─────────────────────────────
      // SUM(totalPrice - discounts) for NON-cancelled, non-test
      // Per spec: "Includes pending, paid, excludes cancelled, failed, test"
      if (!isCancelled) {
        s.revenueGenerated += total - discounts;
        s.totalOrders++;
        shopifyOrderIds.add(o.name); // order name matches Shiprocket channel_order_id

        if (isPrepaid) {
          s.prepaidCount++;
          s.prepaidRevenue += total - discounts - refunded;
        }
      } else {
        s.cancelledCount++;
      }

      // Gross sales for cross-check (all orders incl cancelled, proven formula)
      s.grossSales += subtotal - tax;
      s.refs       += refunded;
      s.tax        += tax;
      s.ship       += shipping;
      s.total      += total;

      // Store order record for cross-referencing with Shiprocket
      s.orders.push({
        shopifyOrderName: o.name,
        shopifyOrderId:   o.id,
        total,
        discounts,
        refunded,
        netRevenue:       total - discounts - refunded,
        isCancelled,
        isPrepaid,
      });

      // ── SECTION 4: Product accumulation ───────────────────────────────────
      // Only for non-cancelled orders
      if (!isCancelled) {
        o.lineItems.edges.forEach(({ node: li }) => {
          const key     = li.variant?.id || li.name;
          const lineRev = Number(li.discountedUnitPriceSet.shopMoney.amount) * li.quantity;
          if (!productMap[key]) {
            productMap[key] = { name: li.name, qty: 0, revenue: 0 };
          }
          productMap[key].qty     += li.quantity;
          productMap[key].revenue += lineRev;
        });
      }
    });

    console.log(`   Page ${page}: fetched ${od.edges.length} | non-cancelled: ${s.totalOrders} | cancelled: ${s.cancelledCount} | hasNext: ${hasNext}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  META ADS — Section 2
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📡 Meta: fetching ad insights...");

  const metaRes = await axios.get(
    `https://graph.facebook.com/v20.0/${integrations.META.adAccountId}/insights`,
    {
      params: {
        access_token: metaToken,
        time_range: JSON.stringify({ since: TARGET_DATE, until: TARGET_DATE }),
        fields: "spend,purchase_roas,inline_link_click_ctr,reach,impressions,actions,action_values",
      },
    },
  );

  const m = metaRes.data.data[0] || {};
  const meta = {
    spend:          Number(m.spend || 0),
    roas_raw:       Number(m.purchase_roas?.[0]?.value || 0),
    purchases:      Number(m.actions?.find((a) => a.action_type === "purchase")?.value || 0),
    purchase_value: Number(m.action_values?.find((a) => a.action_type === "purchase")?.value || 0),
    ctr:            Number(m.inline_link_click_ctr || 0),
    reach:          Number(m.reach || 0),
    impressions:    Number(m.impressions || 0),
    link_clicks:    Number(m.actions?.find((a) => a.action_type === "link_click")?.value || 0),
    add_to_cart:    Number(m.actions?.find((a) => a.action_type === "add_to_cart")?.value || 0),
    initiate_checkout: Number(m.actions?.find((a) => a.action_type === "initiate_checkout")?.value || 0),
  };

  // ═══════════════════════════════════════════════════════════════════════════
  //  SHIPROCKET — Sections 3, 5, 6
  // ═══════════════════════════════════════════════════════════════════════════
  console.log("\n📡 Shiprocket: fetching shipments...");

  const srShipments = [];
  let sh = { delivered: 0, rto: 0, inTransit: 0, returned: 0, cancelled: 0,
             forwardFreight: 0, returnFreight: 0, totalFreight: 0 };

  // Map Shiprocket order_id → category (to cross-ref with Shopify for Revenue Earned)
  // Shiprocket stores Shopify order name (e.g. "#luxc3288") in channel_order_id
  const srDeliveredOrderNames = new Set();
  const srRTOOrderNames       = new Set();
  const srInTransitOrderNames = new Set();

  let nextUrl = `https://apiv2.shiprocket.in/v1/external/shipments?from=${TARGET_DATE}&to=${TARGET_DATE}&per_page=100&page=1`;
  let srPage  = 0;

  while (nextUrl) {
    srPage++;
    const srRes = await axios.get(nextUrl, {
      headers: { Authorization: `Bearer ${srToken}` },
    });

    const items    = srRes.data.data || [];
    const nextLink = srRes.data.meta?.pagination?.links?.next || null;

    items.forEach((shipment) => {
      const charges    = shipment.charges || {};
      const freight    = Number(charges.freight_charges || 0);
      const rtoFreight = Number(
        charges.charged_weight_amount_rto ||
        charges.applied_weight_amount_rto ||
        charges.rto_charges || 0,
      );

      const stat           = (shipment.status || "").toUpperCase().trim();
      const channelOrderId = (shipment.channel_order_id || shipment.order_id || "").toString();

      let category, freightApplied;

      if (stat === "DELIVERED") {
        category = "delivered"; sh.delivered++;
        freightApplied = freight;
        sh.forwardFreight += freight;
        srDeliveredOrderNames.add(channelOrderId);

      } else if (stat.startsWith("RTO")) {
        category = "rto"; sh.rto++;
        freightApplied = freight + rtoFreight;
        sh.forwardFreight += freight;
        sh.returnFreight  += rtoFreight;
        srRTOOrderNames.add(channelOrderId);

      } else if (stat.includes("RETURN") && !stat.startsWith("RTO")) {
        category = "returned"; sh.returned++;
        freightApplied = freight + rtoFreight;
        sh.forwardFreight += freight;
        sh.returnFreight  += rtoFreight;

      } else if (stat.includes("CANCEL")) {
        category = "cancelled"; sh.cancelled++;
        freightApplied = 0;

      } else {
        category = "in_transit"; sh.inTransit++;
        freightApplied = freight;
        sh.forwardFreight += freight;
        srInTransitOrderNames.add(channelOrderId);
      }

      sh.totalFreight += freightApplied;

      srShipments.push({
        id: shipment.id, order_id: shipment.order_id,
        channel_order_id: channelOrderId,
        awb: shipment.awb, status: shipment.status, category,
        created_at: shipment.created_at, channel_name: shipment.channel_name,
        payment_method: shipment.payment_method,
        charges: {
          zone: charges.zone, freight_charges: freight, rto_freight: rtoFreight,
          cod_charges: Number(charges.cod_charges || 0), applied_weight: charges.applied_weight,
        },
        freight_applied_in_calc: r2(freightApplied),
      });
    });

    console.log(`   SR Page ${srPage}: ${items.length} shipments | hasNext: ${!!nextLink}`);
    nextUrl = (nextLink && nextLink !== nextUrl) ? nextLink : null;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  CROSS-REFERENCE: Shopify ↔ Shiprocket for Revenue Earned & Gateway Fees
  //
  //  Revenue Earned = SUM(netRevenue) for DELIVERED orders only
  //  Gateway Fee    = SUM(prepaid delivered revenue) × 2.5%
  //  RTO Revenue Lost = SUM(netRevenue) for RTO orders
  // ═══════════════════════════════════════════════════════════════════════════

  let revenueEarned     = 0;
  let prepaidDelivRev   = 0;  // for gateway fee
  let rtoRevenueLost    = 0;

  s.orders.forEach((order) => {
    const name = order.shopifyOrderName; // e.g. "#luxc3288"

    if (srDeliveredOrderNames.has(name)) {
      revenueEarned   += order.netRevenue;
      if (order.isPrepaid) prepaidDelivRev += order.netRevenue;
    }
    if (srRTOOrderNames.has(name)) {
      rtoRevenueLost  += order.netRevenue;
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  FINAL CALCULATIONS
  // ═══════════════════════════════════════════════════════════════════════════

  // Section 5: Cost Leakage
  const shippingSpend  = r2(sh.totalFreight);
  const gatewayFees    = r2(prepaidDelivRev * 0.025);  // only prepaid delivered
  // (RTO handling fees & fixed expenses need DB profile record — skip for now)

  // Section 1: Money Kept (without COGS & fixed expenses since unavailable)
  const revenueEarnedR = r2(revenueEarned);
  const moneyKept      = r2(revenueEarnedR - meta.spend - shippingSpend - gatewayFees);
  const profitMargin   = revenueEarnedR > 0 ? pct(moneyKept / revenueEarnedR) : 0;

  // Section 2: ROAS & POAS
  const revenueGeneratedR = r2(s.revenueGenerated);
  const roas = meta.spend > 0 ? r2(revenueGeneratedR / meta.spend) : 0;
  const poas = meta.spend > 0 ? r2(moneyKept / meta.spend) : 0;
  const poasStatus = poas < 1.2
    ? { label: "🚨 High Risk",    msg: "Your ad spend is eating your profit. Review campaigns." }
    : poas <= 2.5
    ? { label: "✅ Sustainable",  msg: "Ads are profitable. Monitor closely." }
    : { label: "🚀 Scale Now",    msg: "You earn profit." };

  // Section 3: Order economics
  const aov              = s.totalOrders > 0 ? r2(revenueGeneratedR / s.totalOrders) : 0;
  const profitPerOrder   = sh.delivered   > 0 ? r2(moneyKept / sh.delivered) : 0;
  const shippingPerOrder = sh.delivered   > 0 ? r2(shippingSpend / sh.delivered) : 0;

  // Section 6: Pending / forecast
  const totalDecided     = sh.delivered + sh.rto;
  const deliveryRate     = totalDecided > 0 ? sh.delivered / totalDecided : 0;
  const rtoRate          = totalDecided > 0 ? sh.rto / totalDecided : 0;
  const expectedDelivered= r2(sh.inTransit * deliveryRate);
  const expectedRevenue  = r2(expectedDelivered * aov);
  const riskLevel        = rtoRate < 0.15
    ? { label: "🟢 Low Risk",    color: "green"  }
    : rtoRate < 0.30
    ? { label: "🟡 Medium Risk", color: "yellow" }
    : { label: "🔴 High Risk",   color: "red"    };

  // Section 4: Top 5 products by revenue
  const top5Products = Object.values(productMap)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5)
    .map((p) => ({ name: p.name, qty: p.qty, revenue: r2(p.revenue) }));

  // ═══════════════════════════════════════════════════════════════════════════
  //  BUILD DUMP JSON
  // ═══════════════════════════════════════════════════════════════════════════
  const dump = {
    generated_at: new Date().toISOString(),
    target_date:  TARGET_DATE,

    section1_actual_money: {
      revenue_generated:    revenueGeneratedR,   // non-cancelled, non-test orders
      revenue_earned:       revenueEarnedR,       // delivered orders only
      cogs:                 "SKIPPED — no variant cost data available",
      money_kept:           moneyKept,            // without COGS & fixed expenses
      profit_margin_pct:    profitMargin,
      note:                 "money_kept excludes COGS and fixed expenses (unavailable from APIs)",
    },

    section2_ads: {
      ads_spend:     meta.spend,
      roas,                                        // Revenue Generated / Ads Spend
      poas,                                        // Money Kept / Ads Spend
      poas_status:   poasStatus,
      purchases:     meta.purchases,
      purchase_value: meta.purchase_value,
      ctr_pct:       r2(meta.ctr),
      reach:         meta.reach,
      impressions:   meta.impressions,
      link_clicks:   meta.link_clicks,
      add_to_cart:   meta.add_to_cart,
      initiate_checkout: meta.initiate_checkout,
    },

    section3_order_economics: {
      total_orders:        s.totalOrders,
      delivered_orders:    sh.delivered,
      rto_count:           sh.rto,
      in_transit:          sh.inTransit,
      cancelled_orders:    s.cancelledCount,
      returned:            sh.returned,
      prepaid_orders:      s.prepaidCount,
      cod_orders:          s.totalOrders - s.prepaidCount,
      aov:                 aov,
      profit_per_order:    profitPerOrder,
      shipping_per_order:  shippingPerOrder,
    },

    section4_top_products: top5Products,

    section5_cost_leakage: {
      shipping_spend:        shippingSpend,
      forward_freight:       r2(sh.forwardFreight),
      return_freight:        r2(sh.returnFreight),
      gateway_fees:          gatewayFees,          // prepaid delivered × 2.5%
      rto_revenue_lost:      r2(rtoRevenueLost),
      rto_handling_fees:     "SKIPPED — needs profile record",
      fixed_expenses:        "SKIPPED — manually entered",
    },

    section6_pending: {
      in_transit_orders:     sh.inTransit,
      delivery_success_rate: r2(deliveryRate * 100) + "%",
      rto_rate:              r2(rtoRate * 100) + "%",
      risk_level:            riskLevel,
      expected_delivered:    expectedDelivered,
      expected_revenue:      expectedRevenue,
      note:                  "Delivery rate calculated from today's data only (ideally use 30-day rolling)",
    },

    // Raw data for debugging
    _raw: {
      shopify_summary: {
        orders_fetched:       s.orders.length,
        non_cancelled:        s.totalOrders,
        cancelled:            s.cancelledCount,
        test_excluded:        s.testCount,
        prepaid:              s.prepaidCount,
        gross_sales_crosscheck: r2(s.grossSales),  // should = 66450.87 for Feb 21
        tax:                  r2(s.tax),
        shipping_collected:   r2(s.ship),
        total_sales:          r2(s.total),
        returns_on_todays_orders: r2(s.refs),
      },
      shiprocket_summary: {
        total_shipments: srShipments.length,
        delivered: sh.delivered, rto: sh.rto,
        in_transit: sh.inTransit, returned: sh.returned, cancelled: sh.cancelled,
        total_freight: shippingSpend,
        unique_statuses: [...new Set(srShipments.map((s) => s.status))],
      },
      meta_raw: m,
    },
  };

  fs.writeFileSync(DUMP_FILE, JSON.stringify(dump, null, 2));

  // ═══════════════════════════════════════════════════════════════════════════
  //  CONSOLE REPORT — Full Dashboard
  // ═══════════════════════════════════════════════════════════════════════════
  const sep  = "═".repeat(64);
  const sep2 = "─".repeat(64);
  const row  = (label, value, note = "") =>
    console.log(`  ${label.padEnd(30)} ${String(value).padStart(14)}${note ? "   " + note : ""}`);

  console.log(`\n\n${sep}`);
  console.log(`📊  DASHBOARD REPORT — ${TARGET_DATE}`);
  console.log(sep);

  // ── SECTION 1 ──────────────────────────────────────────────────────────────
  console.log(`\n💰  SECTION 1 — ACTUAL MONEY`);
  console.log(sep2);
  row("Revenue Generated",  `₹${revenueGeneratedR}`,  "(non-cancelled orders: total - discounts)");
  row("Revenue Earned",     `₹${revenueEarnedR}`,     "(delivered orders only: total - disc - refunds)");
  row("COGS",               "N/A",                    "(skipped — no variant cost data)");
  row("Money Kept",         `₹${moneyKept}`,          "(Revenue Earned - Ads - Shipping - Gateway)");
  row("Profit Margin",      `${profitMargin}%`,        "(Money Kept / Revenue Earned)");

  // ── SECTION 2 ──────────────────────────────────────────────────────────────
  console.log(`\n📢  SECTION 2 — ADS PERFORMANCE`);
  console.log(sep2);
  row("Ads Spend (Meta)",   `₹${meta.spend}`);
  row("ROAS",               roas,                     "(Revenue Generated / Ads Spend)");
  row("POAS",               poas,                     "(Money Kept / Ads Spend)");
  console.log(`  ${poasStatus.label}`);
  console.log(`  → ${poasStatus.msg}`);
  console.log(sep2);
  row("Meta Purchases",     meta.purchases);
  row("Purchase Value",     `₹${meta.purchase_value}`);
  row("CTR",                `${r2(meta.ctr)}%`);
  row("Reach",              meta.reach.toLocaleString());
  row("Impressions",        meta.impressions.toLocaleString());
  row("Link Clicks",        meta.link_clicks.toLocaleString());
  row("Add to Cart",        meta.add_to_cart);
  row("Initiate Checkout",  meta.initiate_checkout);

  // ── SECTION 3 ──────────────────────────────────────────────────────────────
  console.log(`\n📦  SECTION 3 — ORDER ECONOMICS`);
  console.log(sep2);
  row("Total Orders",       s.totalOrders,            "(non-cancelled, non-test)");
  row("Delivered",          sh.delivered);
  row("RTO",                sh.rto);
  row("In Transit",         sh.inTransit);
  row("Cancelled",          s.cancelledCount);
  row("Returned",           sh.returned);
  row("Prepaid Orders",     s.prepaidCount);
  row("COD Orders",         s.totalOrders - s.prepaidCount);
  console.log(sep2);
  row("AOV",                `₹${aov}`,                "(Revenue Generated / Total Orders)");
  row("Profit Per Order",   `₹${profitPerOrder}`,     "(Money Kept / Delivered)");
  row("Shipping Per Order", `₹${shippingPerOrder}`,   "(Shipping Spend / Delivered)");

  // ── SECTION 4 ──────────────────────────────────────────────────────────────
  console.log(`\n🛍️   SECTION 4 — TOP 5 PRODUCTS BY REVENUE`);
  console.log(sep2);
  console.log(`  ${"Product".padEnd(36)} ${"Qty".padStart(6)} ${"Revenue".padStart(12)}`);
  console.log(`  ${sep2.slice(0, 56)}`);
  top5Products.forEach((p, i) => {
    console.log(`  ${String(i + 1).padEnd(2)} ${p.name.slice(0, 33).padEnd(34)} ${String(p.qty).padStart(6)} ₹${String(p.revenue).padStart(10)}`);
  });
  console.log(`  Note: Product profit skipped (no COGS data)`);

  // ── SECTION 5 ──────────────────────────────────────────────────────────────
  console.log(`\n🕳️   SECTION 5 — COST LEAKAGE`);
  console.log(sep2);
  row("Shipping Spend",     `₹${shippingSpend}`,      "(forward + return freight)");
  row("  Forward Freight",  `₹${r2(sh.forwardFreight)}`);
  row("  Return Freight",   `₹${r2(sh.returnFreight)}`);
  row("Gateway Fees",       `₹${gatewayFees}`,        "(prepaid delivered × 2.5%)");
  row("RTO Revenue Lost",   `₹${r2(rtoRevenueLost)}`, "(revenue lost on RTO orders)");
  row("RTO Handling Fees",  "N/A",                    "(skipped — needs profile record)");
  row("Fixed Expenses",     "N/A",                    "(skipped — manually entered)");

  // ── SECTION 6 ──────────────────────────────────────────────────────────────
  console.log(`\n⏳  SECTION 6 — PENDING / FORECAST`);
  console.log(sep2);
  row("In Transit Orders",  sh.inTransit);
  row("Delivery Rate",      `${r2(deliveryRate * 100)}%`, "(today's delivered / decided)");
  row("RTO Rate",           `${r2(rtoRate * 100)}%`);
  row("Risk Level",         riskLevel.label);
  row("Expected Delivered", expectedDelivered,          "(in transit × delivery rate)");
  row("Expected Revenue",   `₹${expectedRevenue}`,      "(expected delivered × AOV)");
  console.log(`  ⚠️  Note: Delivery rate based on today only. Use 30-day rolling for accuracy.`);

  // ── SUMMARY ────────────────────────────────────────────────────────────────
  console.log(`\n${sep}`);
  console.log(`💎  BOTTOM LINE`);
  console.log(sep);
  row("Revenue Generated",  `₹${revenueGeneratedR}`);
  row("Revenue Earned",     `₹${revenueEarnedR}`);
  row("Ads Spend",          `-₹${meta.spend}`);
  row("Shipping Spend",     `-₹${shippingSpend}`);
  row("Gateway Fees",       `-₹${gatewayFees}`);
  console.log(`  ${"─".repeat(46)}`);
  row("MONEY KEPT",         `₹${moneyKept}`,           "(excl. COGS & fixed expenses)");
  row("Profit Margin",      `${profitMargin}%`);
  console.log(sep);
  console.log(`\n📁  Dump → ${DUMP_FILE}\n`);
}

fullAuditDump().catch((e) => {
  console.error("❌ Fatal:", e.message);
  if (e.response) console.error(JSON.stringify(e.response.data, null, 2));
  else console.error(e.stack);
});