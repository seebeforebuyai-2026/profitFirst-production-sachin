const axios = require("axios");
const axiosRetry = require("axios-retry").default;

// 🟢 Automatically retry on network errors or 5xx/429 status codes
axiosRetry(axios, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return (
      axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      error.response.status === 429
    );
  },
});
const encryptionService = require("./encryption");

class ShopifyUtil {
  async fetchShopifyProducts(shop, encryptedToken, cursor = null) {
    try {
      const accessToken = encryptionService.decrypt(encryptedToken);
      const url = `https://${shop}/admin/api/2023-10/graphql.json`;

      const query = `
        query getProducts($cursor: String) {
          products(first: 50, after: $cursor , query: "status:active") {
            pageInfo {
              hasNextPage
              endCursor
            }
            edges {
              node {
                id
                title
                featuredImage { url }
                variants(first: 100) {
                  edges {
                    node {
                      id
                      title
                      price
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const response = await axios.post(
        url,
        { query, variables: { cursor } },
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }

      // Rate Limit Logic
      const extensions = response.data.extensions;
      if (extensions?.cost?.throttleStatus) {
        const { currentlyAvailable } = extensions.cost.throttleStatus;
        if (currentlyAvailable < 100) {
          console.warn("⏳ Shopify GraphQL budget low. Cooling down...");
          await new Promise((res) => setTimeout(res, 2000));
        }
      }

      return response.data.data.products;
    } catch (error) {
      console.error("Shopify GraphQL Error:", error.message);
      throw error;
    }
  }

  async fetchShopifyOrders(shop, encryptedToken, sinceDate, cursor = null) {
    try {
      const accessToken = encryptionService.decrypt(encryptedToken);
      const url = `https://${shop}/admin/api/2024-04/graphql.json`;
      const query = `
      query getOrders($cursor: String, $query: String) {
        orders(
          first: 250
          after: $cursor
          sortKey: CREATED_AT
          query: $query
        ) {
          pageInfo { hasNextPage endCursor }
          edges {
            node {
              id
              name
              createdAt
              cancelledAt
              test
              displayFinancialStatus
              paymentGatewayNames
              # FIX: subtotalPriceSet added to calculate exact Gross Sales (Audit logic)
              subtotalPriceSet    { shopMoney { amount } }
              totalPriceSet       { shopMoney { amount } }
              totalDiscountsSet   { shopMoney { amount } }
              totalTaxSet         { shopMoney { amount } }
              totalShippingPriceSet { shopMoney { amount } } # Added for full breakdown
              lineItems(first: 50) {
                edges {
                  node {
                    title
                    quantity
                    variant { id }
                    discountedUnitPriceSet { shopMoney { amount } }
                  }
                }
              }
              refunds {
                refundLineItems(first: 50) {
                  edges {
                    node {
                      quantity
                      subtotalSet { shopMoney { amount } } # Important for "Returns"
                    }
                  }
                }
              }
            }
          }
        }
      }
    `;
      // Logic Check: test:false filter and date filter combined
      const variables = {
        cursor,
        query: `created_at:>=${sinceDate} AND test:false`,
      };
      const response = await axios.post(
        url,
        { query, variables },
        {
          headers: {
            "X-Shopify-Access-Token": accessToken,
            "Content-Type": "application/json",
          },
        },
      );
      if (response.data.errors) {
        throw new Error(response.data.errors[0].message);
      }
      // Rate Limit Logic: Production-ready cooling system
      const throttle = response.data.extensions?.cost?.throttleStatus;
      if (throttle && throttle.currentlyAvailable < 200) {
        // Increased to 200 for safety
        console.warn("⏳ Shopify GraphQL budget low. Cooling down 2s...");
        await new Promise((res) => setTimeout(res, 2000));
      }
      return response.data.data.orders;
    } catch (error) {
      console.error("❌ fetchShopifyOrders Error:", error.message);
      throw new Error(`Shopify Order API Error: ${error.message}`);
    }
  }
}

module.exports = new ShopifyUtil();
