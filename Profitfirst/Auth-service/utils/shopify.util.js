const axios = require('axios');
const axiosRetry = require('axios-retry').default;

// 🟢 Automatically retry on network errors or 5xx/429 status codes
axiosRetry(axios, { 
  retries: 3, 
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || error.response.status === 429;
  }
});
const encryptionService = require('./encryption');

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

      const response = await axios.post(url, 
        { query, variables: { cursor } },
        { headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' } }
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
          await new Promise(res => setTimeout(res, 2000));
        }
      }

      return response.data.data.products;
    } catch (error) {
      console.error('Shopify GraphQL Error:', error.message);
      throw error;
    }
  }

  async fetchShopifyOrders(shop, encryptedToken, sinceDate, cursor = null) {
    try {
      const accessToken = encryptionService.decrypt(encryptedToken);
      const url = `https://${shop}/admin/api/2023-10/graphql.json`;

      const query = `
        query getOrders($cursor: String, $query: String) {
          orders(first: 50, after: $cursor, query: $query) {
            pageInfo { hasNextPage endCursor }
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                totalPriceSet { shopMoney { amount currencyCode } }
                lineItems(first: 50) {
                  edges {
                    node {
                      title
                      quantity
                      variant { id price }
                      product { id }
                    }
                  }
                }
              }
            }
          }
        }
      `;

      const variables = {
        cursor,
        query: `created_at:>=${sinceDate}`
      };

      const response = await axios.post(url, { query, variables }, {
        headers: { 'X-Shopify-Access-Token': accessToken, 'Content-Type': 'application/json' }
      });

      return response.data.data.orders;
    } catch (error) {
      throw new Error(`Shopify Order API Error: ${error.message}`);
    }
  }
}

module.exports = new ShopifyUtil();