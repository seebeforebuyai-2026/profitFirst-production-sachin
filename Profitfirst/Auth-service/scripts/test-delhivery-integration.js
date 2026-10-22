require("dotenv").config({
  path: require("path").resolve(__dirname, "..", ".env"),
});

const axios = require("axios");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const util = require("util");
const {
  GetCommand,
  QueryCommand,
  ScanCommand,
} = require("@aws-sdk/lib-dynamodb");
const { subDays } = require("date-fns");
const { formatInTimeZone } = require("date-fns-tz");
const { newDynamoDB, newTableName } = require("../config/aws.config");
const encryptionService = require("../utils/encryption");

const SHOPIFY_STORE = normalizeStore(
  process.env.DELHIVERY_SHOPIFY_STORE || "apun0t-bc.myshopify.com",
);
const LOOKBACK_DAYS = Number(process.env.DELHIVERY_LOOKBACK_DAYS || 0);
const DETAIL_LIMIT = Number(process.env.DELHIVERY_DETAIL_LIMIT || 50);
const SCAN_LIMIT = Number(process.env.DELHIVERY_SCAN_LIMIT || 5);
const DELHIVERY_API_URL =
  "https://track.delhivery.com/api/v1/packages/json/";
const ORDER_BATCH_SIZE = 25;
const BATCH_DELAY_MS = 300;
const FINANCIAL_FIELD_PATTERN =
  /(charge|freight|amount|weight|payment|invoice|currency|value|price|^cod$)/i;
const OPERATIONAL_FIELD_PATTERN =
  /(attempt|ndr|remark|reason|exception|rto|return|status|scan)/i;
const PRIVATE_FIELD_PATTERN =
  /(name|phone|mobile|address|email|pincode|pin_code|consignee|customer|receiver|recipient|contact|token|password|authorization)/i;
const LOG_FILE = path.resolve(
  process.env.DELHIVERY_LOG_FILE ||
    path.join(__dirname, "delhivery-test.log"),
);
const logDirectory = path.dirname(LOG_FILE);
fs.mkdirSync(logDirectory, { recursive: true });
const logStream = fs.createWriteStream(LOG_FILE, { flags: "w" });

function writeLog(level, message) {
  const timestamp = new Date().toISOString();
  logStream.write(`${timestamp} [${level}] ${message}\n`);
}

console.log = (...args) => writeLog("INFO", util.format(...args));
console.info = (...args) => writeLog("INFO", util.format(...args));
console.warn = (...args) => writeLog("WARN", util.format(...args));
console.error = (...args) => writeLog("ERROR", util.format(...args));
console.debug = (...args) => writeLog("DEBUG", util.format(...args));
console.dir = (value, options = {}) =>
  writeLog("INFO", util.inspect(value, options));

function finishLogging(exitCode) {
  logStream.end(() => {
    process.stdout.write(
      `Delhivery diagnostic log saved to: ${LOG_FILE}\n`,
    );
    if (exitCode) process.exitCode = exitCode;
  });
}

function normalizeStore(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
}

function normalizeOrderReference(value) {
  return String(value || "")
    .replace(/^R_/i, "")
    .replace(/^#/, "")
    .replace(/-[A-Z]$/i, "")
    .replace(/-\d{5,}$/, "")
    .trim()
    .toLowerCase();
}

function getIstDate(date = new Date()) {
  return formatInTimeZone(date, "Asia/Kolkata", "yyyy-MM-dd");
}

async function findShopifyIntegration(store) {
  const matches = [];
  let lastKey;

  do {
    const result = await newDynamoDB.send(
      new ScanCommand({
        TableName: newTableName,
        FilterExpression: "SK = :sk",
        ExpressionAttributeValues: {
          ":sk": "INTEGRATION#SHOPIFY",
        },
        ProjectionExpression: "PK, SK, shopDomain, shopifyStore",
        ExclusiveStartKey: lastKey,
      }),
    );

    for (const item of result.Items || []) {
      if (
        [item.shopDomain, item.shopifyStore].some(
          (value) => normalizeStore(value) === store,
        )
      ) {
        matches.push(item);
      }
    }

    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  if (matches.length > 1) {
    throw new Error(
      `Multiple Shopify integrations match ${store}; refusing to choose a merchant.`,
    );
  }

  return matches[0] || null;
}

async function getDelhiveryIntegration(merchantId) {
  for (const sk of [
    "INTEGRATION#DILEVERY",
    "INTEGRATION#DELHIVERY",
  ]) {
    const result = await newDynamoDB.send(
      new GetCommand({
        TableName: newTableName,
        Key: {
          PK: `MERCHANT#${merchantId}`,
          SK: sk,
        },
      }),
    );

    if (result.Item) return result.Item;
  }

  return null;
}

async function getRecentOrders(merchantId) {
  const today = new Date();
  const endDate = getIstDate(today);
  const orders = [];
  let lastKey;

  do {
    const result = await newDynamoDB.send(
      new QueryCommand({
        TableName: newTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `MERCHANT#${merchantId}`,
          ":sk": "ORDER#",
        },
        ProjectionExpression:
          "orderName, orderCreatedAtIST, netRevenue, prepaidAmount, codAmount, paymentType, isTest",
        ExclusiveStartKey: lastKey,
      }),
    );

    orders.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);

  const startDate = LOOKBACK_DAYS > 0
    ? getIstDate(subDays(today, LOOKBACK_DAYS - 1))
    : null;
  const selectedOrders = orders.filter((order) => {
    if (order.isTest) return false;
    if (startDate) {
      const date = String(order.orderCreatedAtIST || "").slice(0, 10);
      return date >= startDate && date <= endDate;
    }
    return true;
  });
  const dates = selectedOrders
    .map((order) => String(order.orderCreatedAtIST || "").slice(0, 10))
    .filter(Boolean)
    .sort();

  return {
    orders: selectedOrders,
    startDate: startDate || dates[0] || "unknown",
    endDate: startDate ? endDate : dates[dates.length - 1] || endDate,
    availableOrderCount: orders.length,
  };
}

function extractShipments(responseData) {
  if (Array.isArray(responseData?.ShipmentData)) {
    return responseData.ShipmentData
      .map((entry) => entry?.Shipment)
      .filter(Boolean);
  }

  return [];
}

function getShipmentStatus(shipment) {
  return String(
    shipment.Status?.Status ||
      shipment.Status?.StatusType ||
      shipment.status ||
      "UNKNOWN",
  )
    .trim()
    .toUpperCase();
}

function getStatusDetails(shipment) {
  return sanitizeForConsole(
    shipment.Status || shipment.status_details || {},
  );
}

function getShipmentReference(shipment) {
  return normalizeOrderReference(
    shipment.ReferenceNo ||
      shipment.ReferenceID ||
      shipment.OrderID ||
      shipment.OrderNo,
  );
}

function classifyStatus(status) {
  const value = String(status || "").toUpperCase();
  if (value.includes("RTO") || value.includes("RETURN")) return "rto_or_return";
  if (value.includes("DELIVER")) return "delivered";
  if (value.includes("CANCEL")) return "cancelled";
  if (value.includes("LOST")) return "lost";
  if (value.includes("NDR") || value.includes("UNDELIVERED")) return "ndr";
  if (value.includes("OUT FOR DELIVERY") || value.includes("OUT_FOR_DELIVERY"))
    return "out_for_delivery";
  if (value.includes("PICKUP") || value.includes("READY FOR PICKUP"))
    return "pickup";
  if (value.includes("SCHEDULE")) return "scheduled";
  if (value.includes("DISPATCH")) return "dispatched";
  if (value.includes("TRANSIT")) return "in_transit";
  if (value.includes("PENDING")) return "pending";
  return "other";
} 

function sanitizeForConsole(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForConsole(item, depth + 1));
  }
  if (typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PRIVATE_FIELD_PATTERN.test(key))
      .map(([key, item]) => [key, sanitizeForConsole(item, depth + 1)]),
  );
}

function collectRelevantFields(value, pattern, path = "", depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return [];
  if (/^scans(?:\.|$)/i.test(path)) return [];

  return Object.entries(value).flatMap(([key, item]) => {
    if (PRIVATE_FIELD_PATTERN.test(key)) return [];
    const fieldPath = path ? `${path}.${key}` : key;
    const current =
      pattern.test(key) && (typeof item !== "object" || item === null)
        ? [{ field: fieldPath, value: item }]
        : [];

    return [
      ...current,
      ...collectRelevantFields(item, pattern, fieldPath, depth + 1),
    ];
  });
}

function collectFieldPaths(value, path = "", depth = 0) {
  if (!value || typeof value !== "object" || depth > 5) return [];
  if (Array.isArray(value)) {
    return value
      .slice(0, 3)
      .flatMap((item) => collectFieldPaths(item, `${path}[]`, depth + 1));
  }

  return Object.entries(value).flatMap(([key, item]) => {
    if (PRIVATE_FIELD_PATTERN.test(key)) return [];
    const fieldPath = path ? `${path}.${key}` : key;

    if (item && typeof item === "object") {
      return collectFieldPaths(item, fieldPath, depth + 1);
    }
    return [fieldPath];
  });
}

function getScans(shipment) {
  const scans = shipment.Scans || shipment.scans || shipment.ScanDetails || [];
  if (!Array.isArray(scans)) return [];
  const sanitizedScans = scans.map((scan) => sanitizeForConsole(scan));
  return {
    count: sanitizedScans.length,
    items: sanitizedScans.slice(0, SCAN_LIMIT || sanitizedScans.length),
  };
}

function sumTopLevelNumericField(shipments, field) {
  let count = 0;
  let total = 0;

  for (const shipment of shipments) {
    const value = Number(shipment[field]);
    if (shipment[field] === null || shipment[field] === undefined || !Number.isFinite(value)) {
      continue;
    }
    count++;
    total += value;
  }

  return { count, total: Number(total.toFixed(2)) };
}

async function fetchShipments(token, references) {
  const shipments = [];

  for (let i = 0; i < references.length; i += ORDER_BATCH_SIZE) {
    const batch = references.slice(i, i + ORDER_BATCH_SIZE);
    console.log(
      `Fetching Delhivery tracking batch ${Math.floor(i / ORDER_BATCH_SIZE) + 1}/${Math.ceil(references.length / ORDER_BATCH_SIZE)} (${batch.length} references)...`,
    );
    let response;
    let attempt = 0;
    while (attempt < 4) {
      try {
        response = await axios.get(DELHIVERY_API_URL, {
          headers: {
            Authorization: `Token ${token}`,
            Accept: "application/json",
          },
          params: { ref_ids: batch.join(",") },
          timeout: 30000,
        });
        break;
      } catch (error) {
        attempt++;
        const status = error.response?.status;
        if (status !== 429 && (!status || status < 500)) throw error;
        if (attempt >= 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      }
    }
    shipments.push(...extractShipments(response.data));
    if (i + ORDER_BATCH_SIZE < references.length) {
      await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
    }
  }

  return shipments;
}

async function main() {
  if (!SHOPIFY_STORE) {
    throw new Error("Set DELHIVERY_SHOPIFY_STORE to a Shopify store domain.");
  }
  if (!Number.isInteger(LOOKBACK_DAYS) || LOOKBACK_DAYS < 0) {
    throw new Error(
      "DELHIVERY_LOOKBACK_DAYS must be zero (all available orders) or a positive integer.",
    );
  }
  if (!Number.isInteger(DETAIL_LIMIT) || DETAIL_LIMIT < 0) {
    throw new Error(
      "DELHIVERY_DETAIL_LIMIT must be zero (all records) or a positive integer.",
    );
  }
  if (!Number.isInteger(SCAN_LIMIT) || SCAN_LIMIT < 0) {
    throw new Error(
      "DELHIVERY_SCAN_LIMIT must be zero (all scans) or a positive integer.",
    );
  }

  console.log(`Searching Shopify integration for ${SHOPIFY_STORE}...`);
  const shopifyIntegration = await findShopifyIntegration(SHOPIFY_STORE);

  if (!shopifyIntegration) {
    console.error(
      "No exact Shopify integration match found. No Delhivery credentials were read and no API request was made.",
    );
    process.exitCode = 2;
    return;
  }

  const merchantId = shopifyIntegration.PK.replace(/^MERCHANT#/, "");
  console.log(`Matched merchant: ${merchantId}`);

  const delhiveryIntegration = await getDelhiveryIntegration(merchantId);
  if (!delhiveryIntegration?.access_token) {
    console.error(
      "No saved Delhivery access token found for this merchant. No API request was made.",
    );
    process.exitCode = 2;
    return;
  }

  const token = encryptionService.decrypt(delhiveryIntegration.access_token);
  const tokenFingerprint = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex")
    .slice(0, 12);
  console.log(
    `Delhivery token loaded from this merchant's saved integration (SHA-256 fingerprint: ${tokenFingerprint}).`,
  );
  const { orders, startDate, endDate, availableOrderCount } =
    await getRecentOrders(merchantId);
  const referenceToOrder = new Map();

  for (const order of orders) {
    const reference = normalizeOrderReference(order.orderName);
    if (reference && !referenceToOrder.has(reference)) {
      referenceToOrder.set(reference, order);
    }
  }

  const references = [...referenceToOrder.keys()];
  console.log(
    LOOKBACK_DAYS > 0
      ? `Shopify order date filter (IST): ${startDate} through ${endDate}`
      : `Shopify order dates in data: ${startDate} through ${endDate} (no date filter)`,
  );
  console.log(`All Shopify orders in database: ${availableOrderCount}`);
  console.log(`Orders selected for tracking: ${orders.length}`);
  console.log(`Unique order references to check: ${references.length}`);

  if (references.length === 0) {
    console.error(
      "No Shopify order references are available for a Delhivery tracking request.",
    );
    process.exitCode = 2;
    return;
  }

  let shipments;
  try {
    shipments = await fetchShipments(token, references);
  } catch (error) {
    if (error.response?.status === 401 || error.response?.status === 403) {
      throw new Error(
        `Delhivery rejected the saved access token (HTTP ${error.response.status}).`,
      );
    }
    if (error.response?.status) {
      throw new Error(
        `Delhivery tracking request failed (HTTP ${error.response.status}).`,
      );
    }
    throw new Error(`Delhivery tracking request failed: ${error.message}`);
  }

  const rawStatuses = {};
  const statusCategories = {};
  const trackedReferences = new Set();
  const trackedOrders = new Map();
  const observedFieldPaths = new Set();
  const matchedShipments = [];
  const financeDetails = [];
  const operationalDetails = [];

  for (const shipment of shipments) {
    const status = getShipmentStatus(shipment);
    const category = classifyStatus(status);
    rawStatuses[status] = (rawStatuses[status] || 0) + 1;
    statusCategories[category] = (statusCategories[category] || 0) + 1;

    for (const fieldPath of collectFieldPaths(shipment)) {
      observedFieldPaths.add(fieldPath);
    }

    const financeFields = collectRelevantFields(
      shipment,
      FINANCIAL_FIELD_PATTERN,
    );
    const operationFields = collectRelevantFields(
      shipment,
      OPERATIONAL_FIELD_PATTERN,
    );
    if (financeFields.length > 0) {
      financeDetails.push({
        awb: shipment.AWB || shipment.awb || null,
        reference: shipment.ReferenceNo || shipment.ReferenceID || null,
        fields: financeFields,
      });
    }
    if (operationFields.length > 0) {
      operationalDetails.push({
        awb: shipment.AWB || shipment.awb || null,
        reference: shipment.ReferenceNo || shipment.ReferenceID || null,
        fields: operationFields,
      });
    }

    const reference = getShipmentReference(shipment);
    const matchedOrder = reference ? referenceToOrder.get(reference) : null;
    matchedShipments.push({
      reference: shipment.ReferenceNo || shipment.ReferenceID || null,
      matchedShopifyOrder: Boolean(matchedOrder),
      orderName: matchedOrder?.orderName || null,
      awb: shipment.AWB || shipment.awb || null,
      status,
      category,
      statusDetails: getStatusDetails(shipment),
      milestoneDates: {
        orderDate: shipment.OrderDate || shipment.order_date || null,
        pickupDate: shipment.PickupDate || shipment.pickup_date || null,
        expectedDeliveryDate:
          shipment.ExpectedDeliveryDate ||
          shipment.expected_delivery_date ||
          null,
        deliveryDate: shipment.DeliveryDate || shipment.delivery_date || null,
        statusDateTime:
          shipment.Status?.StatusDateTime ||
          shipment.Status?.StatusDate ||
          null,
      },
      scanHistory: getScans(shipment),
    });

    if (matchedOrder) {
      trackedReferences.add(reference);
      const existing = trackedOrders.get(reference);
      const orderStatus = existing?.statuses || new Set();
      orderStatus.add(category);
      trackedOrders.set(reference, {
        order: matchedOrder,
        statuses: orderStatus,
      });
    }
  }

  const matchedOrderCategories = {};
  for (const { statuses } of trackedOrders.values()) {
    for (const category of statuses) {
      matchedOrderCategories[category] =
        (matchedOrderCategories[category] || 0) + 1;
    }
  }

  const prepaidAmount = orders.reduce(
    (total, order) => total + Number(order.prepaidAmount || 0),
    0,
  );
  const matchedDeliveredCod = [...trackedOrders.values()].reduce(
    (total, { order, statuses }) =>
      total + (statuses.has("delivered") ? Number(order.codAmount || 0) : 0),
    0,
  );

  console.log("\nDelhivery tracking test results");
  console.log(`Tracking records returned: ${shipments.length}`);
  console.log(`Distinct Shopify references matched: ${trackedReferences.size}`);
  console.log(
    `Selected Shopify references with no tracking match: ${Math.max(0, references.length - trackedReferences.size)}`,
  );
  console.log("Raw tracking statuses:", JSON.stringify(rawStatuses, null, 2));
  console.log(
    "Tracking status categories:",
    JSON.stringify(statusCategories, null, 2),
  );
  console.log(
    "Distinct matched orders by status category (categories can overlap if multiple tracking records exist):",
    JSON.stringify(matchedOrderCategories, null, 2),
  );
  console.log(
    `Shopify prepaid amount in selected orders: ₹${prepaidAmount.toFixed(2)}`,
  );
  console.log(
    `Shopify COD amount for orders with a delivered tracking record: ₹${matchedDeliveredCod.toFixed(2)}`,
  );
  console.log(
    `Combined estimate (prepaid + matched delivered COD; not a settled remittance): ₹${(prepaidAmount + matchedDeliveredCod).toFixed(2)}`,
  );
  console.log(
    "Top-level numeric fields from tracking responses (interpretation must be confirmed in Delhivery's account-specific API docs):",
  );
  console.log(
    JSON.stringify(
      {
        InvoiceAmount: sumTopLevelNumericField(shipments, "InvoiceAmount"),
        CODAmount: sumTopLevelNumericField(shipments, "CODAmount"),
        ChargedWeight: sumTopLevelNumericField(shipments, "ChargedWeight"),
      },
      null,
      2,
    ),
  );
  console.log(
    "InvoiceAmount is reported as returned; it is not assumed to be shipping freight or a settled invoice charge.",
  );
  console.log(
    "CODAmount is reported as returned; it is not assumed to be bank-remitted COD.",
  );

  console.log("\nObserved non-personal tracking response fields:");
  console.log([...observedFieldPaths].sort().join("\n") || "(none)");
  console.log(
    "\nShipment details (customer-identifying fields omitted):",
  );
  const detailLimit = DETAIL_LIMIT || matchedShipments.length;
  console.dir(matchedShipments.slice(0, detailLimit), {
    depth: 8,
    colors: false,
    maxArrayLength: null,
  });
  if (matchedShipments.length > detailLimit) {
    console.log(
      `Showing ${detailLimit} of ${matchedShipments.length} tracking records. Set DELHIVERY_DETAIL_LIMIT=0 to print all records.`,
    );
  }

  console.log(
    "\nFinancial / charge / COD / weight fields actually present in tracking responses:",
  );
  console.dir(financeDetails.slice(0, detailLimit), {
    depth: 8,
    colors: false,
    maxArrayLength: null,
  });
  console.log("\nNDR / attempts / status / return fields actually present:");
  console.dir(operationalDetails.slice(0, detailLimit), {
    depth: 8,
    colors: false,
    maxArrayLength: null,
  });
  if (
    financeDetails.length > detailLimit ||
    operationalDetails.length > detailLimit
  ) {
    console.log(
      `Detailed fields are limited to ${detailLimit} records. Set DELHIVERY_DETAIL_LIMIT=0 to print all records.`,
    );
  }

  console.log("\nNot queried by this tracking-only script:");
  console.log(
    "- Invoice PDFs and AWB-wise billed freight: Delhivery One > Finances > Invoices.",
  );
  console.log(
    "- COD remittance transactions/receipts: Delhivery One > Finances > Remittance.",
  );
  console.log(
    "- Scheduled Order and Exceptions/NDR reports: Delhivery One > Reports.",
  );
  console.log(
    "- Pickup, shipment creation, shipping-cost calculation and NDR update APIs require the account's authenticated developer-portal request examples; this read-only script does not call them.",
  );
  console.log(
    "Developer portal: https://ucp.delhivery.com/developer-portal/documents",
  );
  console.log(
    "Set DELHIVERY_LOOKBACK_DAYS to a positive number to optionally filter by Shopify order date; default 0 checks all orders currently stored for this merchant.",
  );
  console.log(
    "Set DELHIVERY_DETAIL_LIMIT=0 to print details for every tracking record; the default limits detailed output to 50 records.",
  );
  console.log(
    "Set DELHIVERY_SCAN_LIMIT=0 to print every scan event per displayed shipment; the default shows the first 5 scans per shipment.",
  );
  console.log("\nNo database records were modified.");
}

main()
  .then(() => finishLogging(0))
  .catch((error) => {
    console.error(
      `Delhivery test failed: ${error.name || "Error"}: ${error.message}`,
    );
    finishLogging(1);
  });
