const axios = require("axios");
const { formatInTimeZone } = require("date-fns-tz");

const DELHIVERY_TRACK_API = "https://track.delhivery.com/api/v1/packages/json/";
const ORDER_BATCH_SIZE = 25; // Delhivery ref_ids hard limit per call
const BATCH_DELAY_MS = 300; // Safe delay between batches to prevent 429
const MAX_RETRIES = 4;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 1. Normalize Order Reference (Shopify #1001 -> '1001')
 * Matches Delhivery ReferenceNo with Shopify order names
 */
function normalizeOrderReference(value) {
  if (!value) return "";
  return String(value)
    .replace(/^R_/i, "") // strip return prefix e.g. R_#1001 -> #1001
    .replace(/^#/, "") // strip leading # e.g. #1001 -> 1001
    .replace(/-[A-Z]$/i, "") // strip trailing letter suffix e.g. -A, -C
    .replace(/-\d{5,}$/, "") // strip trailing shopify numeric id
    .trim()
    .toLowerCase();
}

/**
 * 2. Parse any date string into IST 'YYYY-MM-DD'
 */
function parseDateIST(dateStr) {
  if (!dateStr || dateStr === "0000-00-00 00:00:00") return null;
  const clean = String(dateStr).replace(/(\d+)(st|nd|rd|th)/, "$1");
  const d = new Date(clean);
  if (isNaN(d.getTime())) return null;
  return formatInTimeZone(d, "Asia/Kolkata", "yyyy-MM-dd");
}

/**
 * 3. Map Delhivery raw statuses into Universal Shipping Statuses
 * (Exact match with Summary Calculator expectations)
 */
function normalizeDelhiveryStatus(rawStatus) {
  if (!rawStatus) return "UNKNOWN";
  const s = String(rawStatus).trim().toUpperCase();

  // RTO / Return to Origin / DTO
  if (
    s === "DTO" ||
    s.includes("DELIVERED TO ORIGIN") ||
    s.includes("RTO") ||
    s.includes("RETURN")
  ) {
    return "RTO";
  }

  // Delivered
  if (s.includes("DELIVER") && !s.includes("UNDELIVER")) {
    return "DELIVERED";
  }

  // Cancelled
  if (s.includes("CANCEL")) {
    return "CANCELLED";
  }

  // NDR / Failed Delivery Attempt
  if (s.includes("NDR") || s.includes("UNDELIVER")) {
    return "NDR";
  }

  // Pickup Pending
  if (
    s.includes("PICKUP") ||
    s.includes("MANIFEST") ||
    s.includes("LABEL") ||
    s.includes("SCHEDULE")
  ) {
    return "PICKUP_PENDING";
  }

  // Default fallback for moving parcels
  return "IN_TRANSIT";
}

/**
 * 4. Extract Milestone Dates from a Delhivery Shipment
 */
function extractDelhiveryDates(shipment, statusCategory) {
  // Anchor / Booking date (defaults to PickupDate or OrderDate or StatusDate)
  const srCreatedAtIST =
    parseDateIST(shipment.PickupDate || shipment.pickup_date) ||
    parseDateIST(shipment.OrderDate || shipment.order_date) ||
    parseDateIST(shipment.Status?.StatusDateTime);

  // Delivered Date (Cash realization date)
  const deliveredAtIST =
    statusCategory === "DELIVERED"
      ? parseDateIST(shipment.DeliveryDate || shipment.delivery_date) ||
        parseDateIST(shipment.Status?.StatusDateTime)
      : null;

  // RTO Confirmation Date (Penalty / Loss realization date)
  const rtoAtIST =
    statusCategory === "RTO"
      ? parseDateIST(shipment.Status?.StatusDateTime) ||
        parseDateIST(shipment.DeliveryDate || shipment.delivery_date)
      : null;

  // Activity Date (Freight charged date)
  const shipActivityDateIST =
    deliveredAtIST ||
    rtoAtIST ||
    parseDateIST(shipment.Status?.StatusDateTime) ||
    srCreatedAtIST;

  return {
    srCreatedAtIST,
    deliveredAtIST,
    rtoAtIST,
    shipActivityDateIST,
  };
}

/**
 * 5. Fetch Tracking Data from Delhivery API (Chunked in Batches of 25)
 * Handles Rate Limit (429) with exponential backoff
 */
async function fetchDelhiveryShipments(token, references) {
  if (!token || !references || references.length === 0) return [];

  const allShipments = [];

  for (let i = 0; i < references.length; i += ORDER_BATCH_SIZE) {
    const batch = references.slice(i, i + ORDER_BATCH_SIZE);
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        const response = await axios.get(DELHIVERY_TRACK_API, {
          headers: {
            Authorization: `Token ${token}`,
            Accept: "application/json",
          },
          params: { ref_ids: batch.join(",") },
          timeout: 30000,
        });

        // Extract Shipment objects from Delhivery's ShipmentData wrapper
        const data = response.data?.ShipmentData || [];
        for (const entry of data) {
          if (entry?.Shipment) {
            allShipments.push(entry.Shipment);
          }
        }
        break; // Batch success, loop se bahar niklo
      } catch (err) {
        attempt++;
        const status = err.response?.status;

        // 429 Throttle ya 5xx server issues pe wait karo
        if (status === 429 || (status && status >= 500) || !status) {
          const retryAfter = Number(err.response?.headers?.["retry-after"]);
          const waitMs = retryAfter
            ? retryAfter * 1000 + 500
            : Math.max(1500 * attempt, 2000);

          console.warn(
            `⏳ [Delhivery API] Throttled (${status || "network"}). Retry ${attempt}/${MAX_RETRIES} after ${waitMs}ms`,
          );
          await sleep(waitMs);
          continue;
        }

        // 401 / 403 / 400 jaise fatal errors pe aage badho
        console.error(
          `❌ [Delhivery API] Batch error (${status}):`,
          err.response?.data?.message || err.message,
        );
        break;
      }
    }

    // Har batch ke baad thoda buffer delay
    if (i + ORDER_BATCH_SIZE < references.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return allShipments;
}

module.exports = {
  normalizeOrderReference,
  parseDateIST,
  normalizeDelhiveryStatus,
  extractDelhiveryDates,
  fetchDelhiveryShipments,
};
