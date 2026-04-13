/**
 * 🕵️ PRODUCTION LOGGER
 * Using specific tags like [CRITICAL_FAILURE] allows us to 
 * create Dashboards in CloudWatch easily.
 */
exports.logError = (merchantId, platform, error, context = "SYNC") => {
    const timestamp = new Date().toISOString();
    const logMessage = {
        level: "ERROR",
        tag: "CRITICAL_FAILURE",
        merchantId: merchantId,
        platform: platform,
        action: context,
        message: error.message,
        stack: error.stack,
        timestamp: timestamp
    };

    // Print as JSON string - CloudWatch logs love JSON because they are searchable
    console.error(JSON.stringify(logMessage));
};

exports.logInfo = (merchantId, platform, message) => {
    console.log(`[INFO] | ${platform} | ${merchantId} | ${message}`);
};