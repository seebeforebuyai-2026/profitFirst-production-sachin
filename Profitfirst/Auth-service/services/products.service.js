const { SendMessageCommand } = require("@aws-sdk/client-sqs");
const { QueryCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
// 🟢 FIX 1: Import productQueueUrl (matching your aws.config.js exactly)
const {
  newDynamoDB,
  newTableName,
  sqsClient,
  productQueueUrl,
} = require("../config/aws.config");

class ProductsService {
  /**
   * 1. Trigger the background Product Fetch (SQS)
   */
  async queueProductFetch(merchantId) {
    try {
      // 🟢 Safety Check: Prevent undefined URL crash
      if (!productQueueUrl) {
        throw new Error(
          "PRODUCT_QUEUE_URL is not defined in environment variables.",
        );
      }

      const params = {
        QueueUrl: productQueueUrl, // 👈 FIXED NAME
        MessageBody: JSON.stringify({
          type: "PRODUCT_FETCH",
          merchantId: merchantId,
          timestamp: new Date().toISOString(),
        }),
      };

      await sqsClient.send(new SendMessageCommand(params));
      console.log(`📥 [SQS] Product fetch queued for: ${merchantId}`);
      return { success: true };
    } catch (error) {
      console.error("❌ SQS Queue Error:", error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * 2. Fetch paginated variants for the COGS table
   */
  async getVariantsList(merchantId, limit = 50, exclusiveStartKey = null) {
    try {
      const params = {
        TableName: newTableName,
        KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
        ExpressionAttributeValues: {
          ":pk": `MERCHANT#${merchantId}`,
          ":sk": "VARIANT#",
        },
        Limit: limit,
      };

      // 🟢 DYNAMIC PARAM FIX: Prevents "null to object" marshalling crash
      if (exclusiveStartKey) {
        params.ExclusiveStartKey = exclusiveStartKey;
      }

      const result = await newDynamoDB.send(new QueryCommand(params));

      const variants = (result.Items || []).map((v) => ({
        variantId: v.variantId || v.SK.replace("VARIANT#", ""),
        productId: v.productId,
        productName: v.productName || "Unknown Product",
        variantName: v.variantName || "Default Variant",
        salePrice: v.salePrice || 0,
        costPrice: v.costPrice || 0,
        productImage: v.productImage || null,
      }));

      return {
        success: true,
        variants,
        lastKey: result.LastEvaluatedKey || null,
      };
    } catch (error) {
      console.error("❌ DynamoDB Query Error:", error.message);
      throw error;
    }
  }

  /**
   * 3. Save COGS in Chunks (Batch Processing)
   */
  async saveCogsBatch(merchantId, variants) {
    try {
      const timestamp = new Date().toISOString();
      const chunkSize = 25; // DynamoDB safety limit

      for (let i = 0; i < variants.length; i += chunkSize) {
        const chunk = variants.slice(i, i + chunkSize);

        await Promise.all(
          chunk.map((v) =>
            newDynamoDB.send(
              new UpdateCommand({
                TableName: newTableName,
                Key: {
                  PK: `MERCHANT#${merchantId}`,
                  SK: `VARIANT#${v.variantId}`,
                },
                // 🟢 FIX 2: Use ExpressionAttributeNames (#cp, #ua) to avoid reserved keyword errors
                UpdateExpression: "SET #cp = :c, #set = :t, #ua = :t",
                ExpressionAttributeNames: {
                  "#cp": "costPrice",
                  "#set": "cogsSetAt",
                  "#ua": "updatedAt",
                },
                ExpressionAttributeValues: {
                  ":c": Number(v.costPrice),
                  ":t": timestamp,
                },
              }),
            ),
          ),
        );
      }

      // 🟢 STEP 4: Update Profile to show Step 1 is done
      await newDynamoDB.send(
        new UpdateCommand({
          TableName: newTableName,
          Key: { PK: `MERCHANT#${merchantId}`, SK: "PROFILE" },
          UpdateExpression: "SET #cc = :true, #ua = :t",
          ExpressionAttributeNames: {
            "#cc": "cogsCompleted",
            "#ua": "updatedAt",
          },
          ExpressionAttributeValues: {
            ":true": true,
            ":t": timestamp,
          },
        }),
      );

      console.log(`✅ COGS saved and Profile updated for ${merchantId}`);
      return { success: true };
    } catch (error) {
      console.error("❌ Save COGS Error:", error.message);
      throw error;
    }
  }

  async getTopSellingProducts(merchantId) {
    try {
      // 1. Sare variants fetch karo (with costPrice)
      const variantsRes = await newDynamoDB.send(
        new QueryCommand({
          TableName: newTableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          ExpressionAttributeValues: {
            ":pk": `MERCHANT#${merchantId}`,
            ":sk": "VARIANT#",
          },
        }),
      );

      const allVariants = variantsRes.Items || [];

      // variantId → variant map
      const variantMap = {};
      allVariants.forEach((v) => {
        const vId = v.variantId || v.SK.replace("VARIANT#", "");
        variantMap[vId] = {
          variantId: vId,
          productId: v.productId,
          productName: v.productName || "Unknown Product",
          variantName: v.variantName || "Default",
          salePrice: Number(v.salePrice || 0),
          costPrice: Number(v.costPrice || 0),
          productImage: v.productImage || null,
        };
      });

      // 2. Last 30 days ORDER# records fetch karo
      const today = new Date();
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(today.getDate() - 30);
      const sinceISO = thirtyDaysAgo.toISOString().split("T")[0];

      let allOrders = [];
      let lastKey = null;
      do {
        const params = {
          TableName: newTableName,
          KeyConditionExpression: "PK = :pk AND begins_with(SK, :sk)",
          FilterExpression: "orderCreatedAtIST >= :since",
          ExpressionAttributeValues: {
            ":pk": `MERCHANT#${merchantId}`,
            ":sk": "ORDER#",
            ":since": sinceISO,
          },
        };
        if (lastKey) params.ExclusiveStartKey = lastKey;
        const res = await newDynamoDB.send(new QueryCommand(params));
        allOrders.push(...(res.Items || []));
        lastKey = res.LastEvaluatedKey;
      } while (lastKey);

      // 3. Product revenue calculate karo from lineItems
      const productRevenue = {}; // productId → { revenue, orders, productName, image }
      const variantOrders = {}; // variantId → orders count

      allOrders.forEach((order) => {
        if (!order.lineItems) return;
        const lineItems = Array.isArray(order.lineItems) ? order.lineItems : [];

        lineItems.forEach((item) => {
          const vId = item.variantId;
          const pId = variantMap[vId]?.productId || vId;
          const rev = Number(item.price || 0) * Number(item.quantity || 1);

          if (!productRevenue[pId]) {
            productRevenue[pId] = {
              productId: pId,
              productName:
                variantMap[vId]?.productName || item.title || "Unknown",
              productImage: variantMap[vId]?.productImage || null,
              revenue: 0,
              orders: 0,
            };
          }
          productRevenue[pId].revenue += rev;
          productRevenue[pId].orders += Number(item.quantity || 1);

          if (vId) variantOrders[vId] = (variantOrders[vId] || 0) + 1;
        });
      });

      // 4. Revenue by descending sort karo
      const sorted = Object.values(productRevenue).sort(
        (a, b) => b.revenue - a.revenue,
      );

      const totalRevenue = sorted.reduce((s, p) => s + p.revenue, 0);

      // 5. Top 20 + remaining split karo
      // const TOP_N = 20;
      // const topSorted = sorted.slice(0, TOP_N);
      // const restSorted = sorted.slice(TOP_N);

      // const topRevenue = topSorted.reduce((s, p) => s + p.revenue, 0);
      // const topPercent =
      //   totalRevenue > 0 ? Math.round((topRevenue / totalRevenue) * 100) : 0;

      // 5. 🟢 80% Revenue Cutoff + Remaining Split (Pareto Rule)
      const target80Percent = totalRevenue * 0.8; // 80% target
      let runningSum = 0;
      const topSorted = [];
      const restSorted = [];

      sorted.forEach((p) => {
        // Jab tak 80% revenue na ho, Top me daalo (Max 20 products, Min 3 products)
        const shouldAddToTop =
          (runningSum < target80Percent && topSorted.length < 20) ||
          topSorted.length < Math.min(3, sorted.length);

        if (shouldAddToTop) {
          topSorted.push(p);
          runningSum += Number(p.revenue || 0);
        } else {
          // 80% ke baad bache hue products Remaining me jayenge
          restSorted.push(p);
        }
      });

      const topRevenue = topSorted.reduce((s, p) => s + p.revenue, 0);
      const topPercent =
        totalRevenue > 0 ? Math.round((topRevenue / totalRevenue) * 100) : 0;

      // 6. Variants attach karo
      const attachVariants = (products) =>
        products
          .map((p) => {
            const variants = allVariants
              .filter(
                (v) =>
                  v.productId === p.productId && Number(v.salePrice || 0) > 0,
              )
              .map((v) => ({
                variantId: v.variantId || v.SK.replace("VARIANT#", ""),
                variantName: v.variantName || "Default",
                salePrice: Number(v.salePrice || 0),
                costPrice: Number(v.costPrice || 0),
              }));
            return { ...p, variants };
          })
          .filter((p) => p.variants.length > 0);

      // Products without ORDER data bhi include karo (new products)
      const orderedProductIds = new Set(sorted.map((p) => p.productId));
      const unorderedProducts = [];
      const seenProductIds = new Set();

      allVariants.forEach((v) => {
        const pId = v.productId;
        if (
          !orderedProductIds.has(pId) &&
          !seenProductIds.has(pId) &&
          Number(v.salePrice || 0) > 0
        ) {
          seenProductIds.add(pId);
          unorderedProducts.push({
            productId: pId,
            productName: v.productName || "Unknown",
            productImage: v.productImage || null,
            revenue: 0,
            orders: 0,
          });
        }
      });

      const topProducts = attachVariants(topSorted);
      const remainingProducts = attachVariants([
        ...restSorted,
        ...unorderedProducts,
      ]);

      return {
        success: true,
        topProducts,
        remainingProducts,
        totalRevenue: Math.round(totalRevenue),
        topRevenuePercent: topPercent,
      };
    } catch (error) {
      console.error("getTopSellingProducts error:", error.message);
      throw error;
    }
  }

  async saveCogsBulk(merchantId, exactVariants, bulkPercent, bulkVariantIds) {
    try {
      const timestamp = new Date().toISOString();
      const chunkSize = 25;

      // 1. Exact COGS save karo (top products)
      if (exactVariants && exactVariants.length > 0) {
        for (let i = 0; i < exactVariants.length; i += chunkSize) {
          const chunk = exactVariants.slice(i, i + chunkSize);
          await Promise.all(
            chunk.map((v) =>
              newDynamoDB.send(
                new UpdateCommand({
                  TableName: newTableName,
                  Key: {
                    PK: `MERCHANT#${merchantId}`,
                    SK: `VARIANT#${v.variantId}`,
                  },
                  UpdateExpression: "SET #cp = :c, #set = :t, #ua = :t",
                  ExpressionAttributeNames: {
                    "#cp": "costPrice",
                    "#set": "cogsSetAt",
                    "#ua": "updatedAt",
                  },
                  ExpressionAttributeValues: {
                    ":c": Number(v.costPrice),
                    ":t": timestamp,
                  },
                }),
              ),
            ),
          );
        }
      }

      // 2. Bulk % COGS save karo (remaining products)
      if (bulkPercent && bulkVariantIds && bulkVariantIds.length > 0) {
        // Pehle sale prices fetch karo
        const variantsToUpdate = [];
        for (let i = 0; i < bulkVariantIds.length; i += chunkSize) {
          const chunk = bulkVariantIds.slice(i, i + chunkSize);
          const fetched = await Promise.all(
            chunk.map((vId) =>
              newDynamoDB
                .send(
                  new QueryCommand({
                    TableName: newTableName,
                    KeyConditionExpression: "PK = :pk AND SK = :sk",
                    ExpressionAttributeValues: {
                      ":pk": `MERCHANT#${merchantId}`,
                      ":sk": `VARIANT#${vId}`,
                    },
                    Limit: 1,
                  }),
                )
                .then((r) => r.Items?.[0]),
            ),
          );
          fetched.filter(Boolean).forEach((v) => {
            const salePrice = Number(v.salePrice || 0);
            const estimatedCost = Number(
              ((salePrice * bulkPercent) / 100).toFixed(2),
            );
            variantsToUpdate.push({
              variantId: v.variantId || v.SK.replace("VARIANT#", ""),
              estimatedCost,
            });
          });
        }

        // Save estimated costs
        for (let i = 0; i < variantsToUpdate.length; i += chunkSize) {
          const chunk = variantsToUpdate.slice(i, i + chunkSize);
          await Promise.all(
            chunk.map((v) =>
              newDynamoDB.send(
                new UpdateCommand({
                  TableName: newTableName,
                  Key: {
                    PK: `MERCHANT#${merchantId}`,
                    SK: `VARIANT#${v.variantId}`,
                  },
                  UpdateExpression:
                    "SET #cp = :c, isEstimated = :est, bulkPercent = :bp, #ua = :t",
                  ExpressionAttributeNames: {
                    "#cp": "costPrice",
                    "#ua": "updatedAt",
                  },
                  ExpressionAttributeValues: {
                    ":c": v.estimatedCost,
                    ":est": true,
                    ":bp": bulkPercent,
                    ":t": timestamp,
                  },
                }),
              ),
            ),
          );
        }
      }

      // 3. Profile update karo
      await newDynamoDB.send(
        new UpdateCommand({
          TableName: newTableName,
          Key: { PK: `MERCHANT#${merchantId}`, SK: "PROFILE" },
          UpdateExpression: "SET #cc = :true, #ua = :t",
          ExpressionAttributeNames: {
            "#cc": "cogsCompleted",
            "#ua": "updatedAt",
          },
          ExpressionAttributeValues: { ":true": true, ":t": timestamp },
        }),
      );

      return { success: true };
    } catch (error) {
      console.error("saveCogsBulk error:", error.message);
      throw error;
    }
  }
}

module.exports = new ProductsService();
