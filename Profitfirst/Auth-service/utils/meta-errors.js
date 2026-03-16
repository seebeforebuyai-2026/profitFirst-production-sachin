/**
 * Meta/Facebook API Error Handling Utility
 * 
 * Provides structured error handling for Facebook API responses
 */

class MetaErrorHandler {
  /**
   * Handle Facebook API Error
   * 
   * @param {Error} error - Axios error object
   * @returns {Object} Structured error response
   */
  static handleFacebookAPIError(error) {
    // Default error response
    let errorResponse = {
      type: 'UNKNOWN_ERROR',
      message: 'An unexpected error occurred',
      code: null,
      retryable: false
    };

    if (error.response?.data?.error) {
      const fbError = error.response.data.error;
      
      switch (fbError.code) {
        case 190: // Invalid access token
          errorResponse = {
            type: 'TOKEN_EXPIRED',
            message: 'Your Meta account connection has expired. Please reconnect.',
            code: 190,
            retryable: false,
            action: 'RECONNECT_REQUIRED'
          };
          break;

        case 100: // Invalid parameter
          errorResponse = {
            type: 'INVALID_REQUEST',
            message: 'Invalid request parameters provided.',
            code: 100,
            retryable: false,
            action: 'CHECK_PARAMETERS'
          };
          break;

        case 613: // Rate limit exceeded
          errorResponse = {
            type: 'RATE_LIMIT',
            message: 'Too many requests. Please try again in a few minutes.',
            code: 613,
            retryable: true,
            retryAfter: 300 // 5 minutes
          };
          break;

        case 102: // Session key invalid
          errorResponse = {
            type: 'SESSION_INVALID',
            message: 'Session expired. Please reconnect your Meta account.',
            code: 102,
            retryable: false,
            action: 'RECONNECT_REQUIRED'
          };
          break;

        case 200: // Permissions error
          errorResponse = {
            type: 'PERMISSIONS_ERROR',
            message: 'Insufficient permissions. Please reconnect with required permissions.',
            code: 200,
            retryable: false,
            action: 'RECONNECT_REQUIRED'
          };
          break;

        case 17: // User request limit reached
          errorResponse = {
            type: 'USER_RATE_LIMIT',
            message: 'User request limit reached. Please try again later.',
            code: 17,
            retryable: true,
            retryAfter: 3600 // 1 hour
          };
          break;

        default:
          errorResponse = {
            type: 'API_ERROR',
            message: fbError.message || 'Facebook API error occurred',
            code: fbError.code,
            retryable: fbError.code >= 500, // Server errors are retryable
            subcode: fbError.error_subcode
          };
      }
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      errorResponse = {
        type: 'NETWORK_ERROR',
        message: 'Unable to connect to Facebook. Please check your internet connection.',
        code: error.code,
        retryable: true,
        retryAfter: 60
      };
    } else if (error.code === 'ETIMEDOUT') {
      errorResponse = {
        type: 'TIMEOUT_ERROR',
        message: 'Request timed out. Please try again.',
        code: 'ETIMEDOUT',
        retryable: true,
        retryAfter: 30
      };
    }

    return errorResponse;
  }

  /**
   * Check if error requires token refresh
   * 
   * @param {Object} errorResponse - Structured error response
   * @returns {boolean} True if token refresh is needed
   */
  static requiresTokenRefresh(errorResponse) {
    return ['TOKEN_EXPIRED', 'SESSION_INVALID'].includes(errorResponse.type);
  }

  /**
   * Check if error is retryable
   * 
   * @param {Object} errorResponse - Structured error response
   * @returns {boolean} True if request can be retried
   */
  static isRetryable(errorResponse) {
    return errorResponse.retryable === true;
  }

  /**
   * Get retry delay in seconds
   * 
   * @param {Object} errorResponse - Structured error response
   * @returns {number} Delay in seconds before retry
   */
  static getRetryDelay(errorResponse) {
    return errorResponse.retryAfter || 60; // Default 1 minute
  }
}

module.exports = MetaErrorHandler;