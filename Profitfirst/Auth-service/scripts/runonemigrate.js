// Migration Script (run once)
const migrateOldOrders = async (merchantId) => {
  const orders = await dynamodbService.queryAll(merchantId, "ORDER#");
  
  for (const order of orders) {
    // Skip if already has the fields
    if (order.orderCreatedAtIST && order.prepaidAmount !== undefined) {
      continue;
    }
    
    // Recalculate for old orders
    const totalPrice = Number(order.totalPrice || 0);
    const discounts = Number(order.discounts || 0);
    const refunds = Number(order.refunds || 0);
    const netRevenue = totalPrice - discounts - refunds;
    
    const amountPaidAtOrder = Number(order.totalPaidSet?.shopMoney?.amount || 0);
    
    let prepaidAmount = 0, codAmount = 0, paymentType = "cod";
    
    if (amountPaidAtOrder >= netRevenue && netRevenue > 0) {
      prepaidAmount = netRevenue;
      codAmount = 0;
      paymentType = "prepaid";
    } else if (amountPaidAtOrder > 0) {
      prepaidAmount = amountPaidAtOrder;
      codAmount = Math.max(0, netRevenue - amountPaidAtOrder);
      paymentType = "partial_cod";
    } else {
      prepaidAmount = 0;
      codAmount = netRevenue;
      paymentType = "cod";
    }
    
    // Convert createdAt (UTC) to IST
    const orderCreatedAtIST = formatInTimeZone(
      new Date(order.orderCreatedAt),
      "Asia/Kolkata",
      "yyyy-MM-dd"
    );
    
    // Update the order
    await newDynamoDB.send(
      new UpdateCommand({
        TableName: newTableName,
        Key: { PK: order.PK, SK: order.SK },
        UpdateExpression: `
          SET orderCreatedAtIST = :oist,
              prepaidAmount = :pa,
              codAmount = :ca,
              paymentType = :pt,
              isRealized = :ir,
              updatedAt = :ut
        `,
        ExpressionAttributeValues: {
          ":oist": orderCreatedAtIST,
          ":pa": Number(prepaidAmount.toFixed(2)),
          ":ca": Number(codAmount.toFixed(2)),
          ":pt": paymentType,
          ":ir": paymentType === "prepaid" || paymentType === "partial_cod",
          ":ut": new Date().toISOString(),
        },
      })
    );
  }
  console.log(`✅ Migrated all orders for ${merchantId}`);
};

migrateOldOrders("MERCHANT#f173edda-a031-705d-cbb3-e868f0a6782a");