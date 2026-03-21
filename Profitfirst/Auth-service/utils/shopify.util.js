const axios = require('axios');
const encryptionService = require('./encryption');

class ShopifyUtil {
  async fetchShopifyProducts(shop, encryptedToken, cursor = null) {
    try {
      const accessToken = encryptionService.decrypt(encryptedToken);
      const url = `https://${shop}/admin/api/2023-10/graphql.json`;

      const query = `
        query getProducts($cursor: String) {
          products(first: 50, after: $cursor) {
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
}

module.exports = new ShopifyUtil();