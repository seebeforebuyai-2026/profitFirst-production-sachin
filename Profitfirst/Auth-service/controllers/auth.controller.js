/**
 * Authentication Controller
 *
 * Handles all authentication-related HTTP requests
 * Coordinates between Cognito (authentication) and DynamoDB (user data storage)
 * Supports both email/password and social login (Google OAuth)
 */

const cognitoService = require("../services/cognito.service");
const dynamoDBService = require("../services/dynamodb.service");

class AuthController {
 
  renderErrorPage = (res, message, errorCode = "unknown") => {
    const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Login Failed</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            max-width: 500px;
            text-align: center;
        }
        .error-icon {
            font-size: 60px;
            color: #f44336;
            margin-bottom: 20px;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .error-details {
            background: #ffebee;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
            color: #c62828;
        }
        .error-code {
            font-size: 12px;
            color: #999;
            margin-top: 10px;
        }
        .btn {
            background: #667eea;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            text-decoration: none;
            display: inline-block;
            margin: 10px;
        }
        .btn:hover {
            background: #5568d3;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">✗</div>
        <h1>Authentication Failed</h1>
        <p>Something went wrong during the authentication process.</p>
        
        <div class="error-details">
            <p><strong>Error:</strong> ${message}</p>
            <p class="error-code">Error Code: ${errorCode}</p>
        </div>
        
        <p style="color: #666; font-size: 14px;">Please try again or contact support if the problem persists.</p>
        
        <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}" class="btn">Back to Home</a>
        <a href="/api/auth/oauth/url?provider=google" class="btn">Try Again</a>
    </div>
</body>
</html>
    `;

    return res.status(400).send(errorHtml);
  };

 
  async signup(req, res) {
    try {
      const { firstName, lastName, email, password } = req.body;

      // 1. Validation
      if (!firstName || !lastName || !email || !password) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const normalizedEmail = email.toLowerCase().trim();

      // 2. Cognito Signup Only
      console.log(`🔧 Attempting Cognito Signup for: ${normalizedEmail}`);
      const cognitoResult = await cognitoService.signUp(
        normalizedEmail,
        password,
        firstName.trim(),
        lastName.trim(),
      );

      // 3. Handle Failures
      if (!cognitoResult.success) {
        console.log(`❌ Cognito signup failed: ${cognitoResult.error}`);
        return res.status(400).json({
          error: cognitoResult.error,
          requiresVerification: cognitoResult.error.includes(
            "UsernameExistsException",
          ),
        });
      }

      // 4. Success Response (NO DYNAMODB WRITE)
      console.log(`✅ SIGNUP SUCCESSFUL: ${normalizedEmail}. Awaiting OTP.`);
      return res.status(201).json({
        message:
          "User registered successfully. Please check your email for OTP verification.",
        requiresVerification: true,
      });
    } catch (error) {
      console.error("❌ Signup error:", error.message);
      res.status(500).json({ error: "Registration failed. Please try again." });
    }
  }

  
  async verifyOTP(req, res) {
    try {
      const { email, otp } = req.body;
      const normalizedEmail = email.toLowerCase().trim();
      const cleanOtp = otp.toString().trim();

      // 1. Validate format
      if (!/^\d{6}$/.test(cleanOtp)) {
        return res.status(400).json({ error: "OTP must be exactly 6 digits" });
      }

      // 2. Verify with Cognito Service
      const verifyResult = await cognitoService.verifyEmail(
        normalizedEmail,
        cleanOtp,
      );

      if (!verifyResult.success && !verifyResult.alreadyVerified) {
        console.log(`❌ Verification FAILED for: ${normalizedEmail}`);
        return res.status(400).json({ error: verifyResult.error });
      }

      // 3. Success Response
      console.log(`✅ EMAIL VERIFIED: ${normalizedEmail}. User can now login.`);

      return res.status(200).json({
        message: "Email verified successfully. You can now login.",
        canLogin: true,
      });
    } catch (error) {
      console.error("❌ Verify OTP error:", error.message);
      res.status(500).json({ error: "Verification failed. Please try again." });
    }
  }
 
  async resendOTP(req, res) {
    try {
      const { email } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const result = await cognitoService.resendOTP(normalizedEmail);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res
        .status(200)
        .json({ message: "OTP resent successfully. Please check your email." });
    } catch (error) {
      console.error("Resend OTP error:", error.message);
      res
        .status(500)
        .json({ error: "Failed to resend OTP. Please try again." });
    }
  }

 
  async login(req, res) {
    try {
      const { email, password } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      // 1. Authenticate with Cognito
      const signInResult = await cognitoService.signIn(
        normalizedEmail,
        password,
      );
      if (!signInResult.success) {
        return res.status(401).json({ error: signInResult.error });
      }

      // 2. Get the real Cognito sub (User ID) and Attributes
      const cognitoUserDetails = await cognitoService.getUserDetails(
        signInResult.data.AccessToken,
      );
      const cognitoUserId = cognitoUserDetails.data.Username; // This is the 'sub'

      const userAttributes = cognitoUserDetails.data.UserAttributes || [];
      const firstName =
        userAttributes.find((a) => a.Name === "given_name")?.Value || "User";
      const lastName =
        userAttributes.find((a) => a.Name === "family_name")?.Value || "";

      // 3. THE CRITICAL CHECK: Fetch profile using PROFILE Sort Key
      let userResult = await dynamoDBService.getUserProfile(cognitoUserId);

      // 4. Create Profile if it doesn't exist (First Login Case)
      if (!userResult.success) {
        console.log(
          `🆕 First Login: Creating DynamoDB profile for ${cognitoUserId}`,
        );

        const createResult = await dynamoDBService.createUserProfile({
          userId: cognitoUserId,
          email: normalizedEmail,
          firstName: firstName,
          lastName: lastName,
          authProvider: "cognito",
          isVerified: true, // Login successful implies verification
        });

        if (!createResult.success) {
          throw new Error("Failed to initialize user profile in database.");
        }
        userResult = createResult; // Use the newly created data
      }

      // 5. Update last login timestamp
      await dynamoDBService.updateLastLogin(cognitoUserId);

      // 6. Return response to React
      res.status(200).json({
        message: "Login successful",
        user: {
          userId: cognitoUserId,
          email: normalizedEmail,
          firstName: userResult.data.firstName || firstName,
          onboardingStep: userResult.data.onboardingStep || 1,
          onboardingCompleted: userResult.data.onboardingCompleted || false,
          // 🟢 ADD THESE THREE FLAGS:
          cogsCompleted: userResult.data.cogsCompleted || false,
          initialSyncCompleted: userResult.data.initialSyncCompleted || false,
          dashboardUnlocked: userResult.data.dashboardUnlocked || false,
        },
        tokens: {
          accessToken: signInResult.data.AccessToken,
          idToken: signInResult.data.IdToken,
          refreshToken: signInResult.data.RefreshToken,
        },
      });
    } catch (error) {
      console.error(`❌ Login Error:`, error.message);
      res.status(500).json({ error: "Login failed. Please try again." });
    }
  }
 
  async checkUserStatus(req, res) {
    try {
      const { email } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      console.log(`\n🔍 Checking user status for: ${normalizedEmail}`);

      // Check DynamoDB first
      const dbResult = await dynamoDBService.getUserByEmail(normalizedEmail);

      const response = {
        email: normalizedEmail,
        existsInDatabase: dbResult.success,
        isVerified: dbResult.success ? dbResult.data.isVerified : false,
        needsVerification: false,
        canLogin: false,
      };

      if (dbResult.success) {
        console.log(`✅ User found in database`);
        console.log(`   Verified: ${dbResult.data.isVerified}`);

        response.canLogin = dbResult.data.isVerified;
        response.needsVerification = !dbResult.data.isVerified;

        if (!dbResult.data.isVerified) {
          response.message =
            "Please verify your email before logging in. Check your inbox for the verification code.";
        } else {
          response.message = "Account is active. You can login.";
        }
      } else {
        console.log(`❌ User not found in database`);
        response.message = "No account found. Please sign up first.";
      }

      console.log(`📊 User status:`, response);
      res.status(200).json(response);
    } catch (error) {
      console.error("❌ Check user status error:", error.message);
      res.status(500).json({ error: "Failed to check user status" });
    }
  }

 
  async logout(req, res) {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(" ")[1];

      if (!token) {
        return res.status(400).json({ error: "Access token required" });
      }

      const result = await cognitoService.signOut(token);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res.status(200).json({ message: "Logged out successfully" });
    } catch (error) {
      console.error("Logout error:", error.message);
      res.status(500).json({ error: "Logout failed. Please try again." });
    }
  }

 
  async refreshToken(req, res) {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({ error: "Refresh token required" });
      }

      // Validate refresh token format (JWT should have 3 parts)
      if (
        typeof refreshToken !== "string" ||
        refreshToken.split(".").length !== 3
      ) {
        return res.status(400).json({ error: "Invalid refresh token format" });
      }

      const result = await cognitoService.refreshToken(refreshToken);

      if (!result.success) {
        console.warn("Token refresh failed:", result.error);

        // Provide specific error messages
        if (result.error.includes("NotAuthorizedException")) {
          return res
            .status(401)
            .json({ error: "Refresh token expired. Please login again." });
        }

        return res
          .status(401)
          .json({ error: "Invalid or expired refresh token" });
      }

      // Validate response contains required tokens
      if (!result.data.AccessToken || !result.data.IdToken) {
        console.error("Token refresh: Missing tokens in response");
        return res.status(500).json({ error: "Failed to refresh tokens" });
      }

      res.status(200).json({
        message: "Token refreshed successfully",
        tokens: {
          accessToken: result.data.AccessToken,
          idToken: result.data.IdToken,
        },
      });
    } catch (error) {
      console.error("Refresh token error:", error.message);
      res
        .status(500)
        .json({ error: "Token refresh failed. Please try again." });
    }
  }

 
  async changePassword(req, res) {
    try {
      const { oldPassword, newPassword } = req.body;
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(" ")[1];

      if (!token) {
        return res.status(401).json({ error: "Access token required" });
      }

      if (!oldPassword || !newPassword) {
        return res
          .status(400)
          .json({ error: "Old and new passwords are required" });
      }

      // Prevent using same password
      if (oldPassword === newPassword) {
        return res
          .status(400)
          .json({ error: "New password must be different from old password" });
      }

      const result = await cognitoService.changePassword(
        token,
        oldPassword,
        newPassword,
      );

      if (!result.success) {
        console.warn("Password change failed for user:", req.user?.email);

        // Provide specific error messages
        if (result.error.includes("NotAuthorizedException")) {
          return res
            .status(401)
            .json({ error: "Current password is incorrect" });
        }
        if (result.error.includes("LimitExceededException")) {
          return res.status(429).json({
            error: "Too many password change attempts. Please try again later.",
          });
        }
        if (result.error.includes("InvalidPasswordException")) {
          return res
            .status(400)
            .json({ error: "New password does not meet requirements" });
        }

        return res.status(400).json({ error: result.error });
      }

      console.log("Password changed successfully for user:", req.user?.email);
      res.status(200).json({ message: "Password changed successfully" });
    } catch (error) {
      console.error("Change password error:", error.message);
      res
        .status(500)
        .json({ error: "Password change failed. Please try again." });
    }
  }

 
  async forgotPassword(req, res) {
    try {
      const { email } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      // Check if user exists in DynamoDB
      const userResult = await dynamoDBService.getUserByEmail(normalizedEmail);

      if (!userResult.success) {
        // User doesn't exist - return generic message for security
        return res.status(400).json({
          error:
            "If this email is registered, you will receive a password reset code.",
        });
      }

      // IMPORTANT: Always try to ensure email is marked as verified in Cognito
      // This handles cases where user just verified but DynamoDB might have stale data
      console.log(
        "Ensuring email is verified in Cognito before password reset",
      );
      const markVerifiedResult =
        await cognitoService.markEmailAsVerified(normalizedEmail);

      if (markVerifiedResult.success) {
        console.log("✓ Email marked as verified in Cognito");
      } else {
        console.warn(
          "⚠ Could not mark email as verified in Cognito:",
          markVerifiedResult.error,
        );
        // Don't fail here - try to send reset code anyway
        // Cognito will reject if email is truly not verified
      }

      // Send password reset code - let Cognito decide if email is verified
      const result = await cognitoService.forgotPassword(normalizedEmail);

      if (!result.success) {
        console.error("Cognito forgotPassword error:", result.error);

        // Handle specific Cognito errors
        if (result.error.includes("UserNotFoundException")) {
          return res.status(400).json({
            error:
              "If this email is registered, you will receive a password reset code.",
          });
        }

        // Check for email verification errors
        if (
          result.error.includes("InvalidParameterException") ||
          result.error.includes("email") ||
          result.error.includes("verified")
        ) {
          // Try one more time to mark as verified
          console.log("Attempting to mark email as verified again...");
          await cognitoService.markEmailAsVerified(normalizedEmail);

          // Retry sending reset code
          const retryResult =
            await cognitoService.forgotPassword(normalizedEmail);
          if (retryResult.success) {
            console.log("✓ Retry successful after marking email as verified");
            return res
              .status(200)
              .json({ message: "Password reset code sent to your email" });
          }

          // If still failing, user needs to verify
          return res.status(400).json({
            error:
              "Your email is not verified. Please verify your email first before resetting your password.",
            requiresVerification: true,
          });
        }

        return res.status(400).json({ error: result.error });
      }

      res
        .status(200)
        .json({ message: "Password reset code sent to your email" });
    } catch (error) {
      console.error("Forgot password error:", error.message);
      res
        .status(500)
        .json({ error: "Password reset request failed. Please try again." });
    }
  }

  
  async verifyResetOTP(req, res) {
    try {
      const { email, code } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      if (!code) {
        return res.status(400).json({ error: "Verification code is required" });
      }

      // Validate code format
      if (!/^\d{6}$/.test(code)) {
        return res.status(400).json({
          error: "Invalid verification code format. Must be 6 digits.",
        });
      }

      // Verify the OTP with Cognito by attempting to reset with a temporary password
      // This validates the code without actually changing the password yet
      const crypto = require("crypto");
      const tempPassword = crypto.randomBytes(32).toString("hex") + "Aa1!"; // Meets password requirements

      const verifyResult = await cognitoService.confirmForgotPassword(
        normalizedEmail,
        code,
        tempPassword,
      );

      if (!verifyResult.success) {
        // OTP is invalid or expired
        if (verifyResult.error.includes("CodeMismatchException")) {
          return res.status(400).json({
            error: "Invalid verification code. Please check and try again.",
          });
        }
        if (verifyResult.error.includes("ExpiredCodeException")) {
          return res.status(400).json({
            error: "Verification code has expired. Please request a new one.",
          });
        }
        if (verifyResult.error.includes("LimitExceededException")) {
          return res
            .status(429)
            .json({ error: "Too many attempts. Please try again later." });
        }
        return res.status(400).json({ error: verifyResult.error });
      }

      // OTP is valid! Now create a signed token for the user to set their actual password
      const secret = process.env.ADMIN_KEY || "default-secret-key";

      const tokenData = {
        email: normalizedEmail,
        tempPassword: tempPassword, // Store temp password to reset again
        timestamp: Date.now(),
        verified: true,
      };

      // Create HMAC signature to prevent tampering
      const dataString = JSON.stringify(tokenData);
      const signature = crypto
        .createHmac("sha256", secret)
        .update(dataString)
        .digest("hex");

      const signedToken = Buffer.from(
        JSON.stringify({
          data: tokenData,
          signature: signature,
        }),
      ).toString("base64");

      res.status(200).json({
        message:
          "OTP verified successfully. You can now set your new password.",
        accessToken: signedToken,
        expiresIn: 600, // 10 minutes
        verified: true,
      });
    } catch (error) {
      console.error("Verify reset OTP error:", error.message);
      res.status(500).json({ error: "Verification failed. Please try again." });
    }
  }

  
  async resendResetOTP(req, res) {
    try {
      const { email } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      const result = await cognitoService.forgotPassword(normalizedEmail);

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res
        .status(200)
        .json({ message: "Password reset code resent to your email" });
    } catch (error) {
      console.error("Resend reset OTP error:", error.message);
      res
        .status(500)
        .json({ error: "Failed to resend OTP. Please try again." });
    }
  }

  
  async resetPassword(req, res) {
    try {
      const { newPassword } = req.body;
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.split(" ")[1];

      if (!token) {
        return res
          .status(401)
          .json({ error: "Access token required. Please verify OTP first." });
      }

      if (!newPassword) {
        return res.status(400).json({ error: "New password is required" });
      }

      // Decode and verify the token
      let signedData;
      try {
        const decoded = Buffer.from(token, "base64").toString("utf-8");
        signedData = JSON.parse(decoded);
      } catch (e) {
        return res.status(401).json({ error: "Invalid access token format" });
      }

      // Verify signature to prevent tampering
      const crypto = require("crypto");
      const secret = process.env.ADMIN_KEY || "default-secret-key";
      const dataString = JSON.stringify(signedData.data);
      const expectedSignature = crypto
        .createHmac("sha256", secret)
        .update(dataString)
        .digest("hex");

      if (signedData.signature !== expectedSignature) {
        return res.status(401).json({
          error: "Invalid access token. Token has been tampered with.",
        });
      }

      const tokenData = signedData.data;

      // Check if token is expired (10 minutes)
      const tokenAge = Date.now() - tokenData.timestamp;
      if (tokenAge > 600000) {
        // 10 minutes in milliseconds
        return res
          .status(401)
          .json({ error: "Access token expired. Please verify OTP again." });
      }

      // Check if OTP was verified
      if (!tokenData.verified) {
        return res
          .status(401)
          .json({ error: "OTP not verified. Please verify OTP first." });
      }

      // User is now logged in with the temporary password
      // We need to change it to their desired password
      // First, sign in with temp password to get access token
      const signInResult = await cognitoService.signIn(
        tokenData.email,
        tokenData.tempPassword,
      );

      if (!signInResult.success) {
        return res
          .status(400)
          .json({ error: "Session expired. Please verify OTP again." });
      }

      // Now change password to the user's desired password
      const changeResult = await cognitoService.changePassword(
        signInResult.data.AccessToken,
        tokenData.tempPassword,
        newPassword,
      );

      if (!changeResult.success) {
        return res.status(400).json({ error: changeResult.error });
      }

      res.status(200).json({
        message:
          "Password reset successfully. You can now login with your new password.",
      });
    } catch (error) {
      console.error("Reset password error:", error.message);
      res
        .status(500)
        .json({ error: "Password reset failed. Please try again." });
    }
  }

 
  async confirmForgotPassword(req, res) {
    try {
      const { email, code, newPassword } = req.body;
      const normalizedEmail = email.toLowerCase().trim();

      if (!code || !newPassword) {
        return res
          .status(400)
          .json({ error: "Code and new password are required" });
      }

      const result = await cognitoService.confirmForgotPassword(
        normalizedEmail,
        code,
        newPassword,
      );

      if (!result.success) {
        return res.status(400).json({ error: result.error });
      }

      res
        .status(200)
        .json({ message: "Password reset successfully. You can now login." });
    } catch (error) {
      console.error("Confirm forgot password error:", error.message);
      res
        .status(500)
        .json({ error: "Password reset failed. Please try again." });
    }
  }

  async getProfile(req, res) {
    try {
      // req.user comes from your Auth Middleware (decoded JWT)
      const { userId, email } = req.user;

      // Fetch by PK: MERCHANT#<ID>, SK: PROFILE
      const userResult = await dynamoDBService.getUserProfile(userId);

      if (!userResult.success) {
        return res.status(404).json({ error: "Profile not found" });
      }

      const data = userResult.data;

      res.status(200).json({
        user: {
          userId: userId,
          email: data.email || email,
          firstName: data.firstName,
          lastName: data.lastName,
          isVerified: data.isVerified,
          onboardingStep: data.onboardingStep || 1,
          onboardingCompleted: data.onboardingCompleted || false,
          cogsCompleted: data.cogsCompleted || false,
          expensesCompleted: data.expensesCompleted || false,
          initialSyncCompleted: data.initialSyncCompleted || false,
          dashboardUnlocked: data.dashboardUnlocked || false,
          createdAt: data.createdAt,
          updatedAt: data.updatedAt,
        },
      });
    } catch (error) {
      console.error("❌ Get Profile error:", error.message);
      res.status(500).json({ error: "Failed to fetch profile." });
    }
  }
 
  getOAuthUrl = async (req, res) => {
    try {
      const { provider } = req.query;

      const validProviders = ["google", "facebook", "amazon", "apple"];
      if (!provider || !validProviders.includes(provider.toLowerCase())) {
        return res.status(400).json({
          error: "Invalid provider",
          validProviders,
        });
      }

      const oauthUrl = cognitoService.getOAuthUrl(provider);

      if (req.headers.accept?.includes("text/html")) {
        return res.redirect(oauthUrl);
      }

      res.status(200).json({ url: oauthUrl, provider });
    } catch (error) {
      console.error("OAuth URL error:", error.message);
      res.status(500).json({ error: error.message });
    }
  };

 
  verifyOAuthTokens = async (req, res) => {
    try {
      const { accessToken, idToken, refreshToken } = req.body;

      if (!accessToken || !idToken) {
        return res
          .status(400)
          .json({ error: "Access token and ID token required" });
      }

      const userInfoResult = await cognitoService.getUserDetails(accessToken);
      if (!userInfoResult.success) {
        return res.status(401).json({ error: "Invalid access token" });
      }

      const userAttributes = userInfoResult.data.UserAttributes || [];
      const email = userAttributes.find((attr) => attr.Name === "email")?.Value;
      const firstName =
        userAttributes.find((attr) => attr.Name === "given_name")?.Value || "";
      const lastName =
        userAttributes.find((attr) => attr.Name === "family_name")?.Value || "";
      const emailVerified =
        userAttributes.find((attr) => attr.Name === "email_verified")?.Value ===
        "true";

      const identities = userAttributes.find(
        (attr) => attr.Name === "identities",
      )?.Value;
      let authProvider = "cognito";
      if (identities) {
        try {
          authProvider =
            JSON.parse(identities)[0]?.providerName?.toLowerCase() || "cognito";
        } catch (e) {}
      }

      if (!email) {
        return res.status(400).json({ error: "Email not provided" });
      }

      const normalizedEmail = email.toLowerCase().trim();
      let userResult = await dynamoDBService.getUserByEmail(normalizedEmail);

      if (!userResult.success) {
        const createResult = await dynamoDBService.createUserProfile({
          email: normalizedEmail,
          firstName: firstName.trim() || "User",
          lastName: lastName.trim() || "",
          authProvider,
          isVerified: emailVerified,
        });

        if (!createResult.success) {
          return res.status(500).json({ error: "Failed to create user" });
        }
        userResult = createResult;
      } else {
        await dynamoDBService.updateLastLogin(normalizedEmail);
      }

      res.status(200).json({
        message: "OAuth tokens verified",
        user: {
          userId: userResult.data.userId,
          email: normalizedEmail,
          firstName: firstName,
          lastName: lastName,
          isVerified: emailVerified,
          authProvider: authProvider,
        },
        tokens: {
          accessToken: accessToken,
          idToken: idToken,
          refreshToken: refreshToken,
        },
      });
    } catch (error) {
      console.error("Verify OAuth tokens error:", error.message);
      res
        .status(500)
        .json({ error: "Token verification failed. Please try again." });
    }
  };

  
  handleOAuthCallback = async (req, res) => {
    try {
      const { code, error, error_description, state } = req.query;

      // Log OAuth callback for debugging
      console.log("OAuth callback received:", {
        hasCode: !!code,
        error,
        state,
        ip: req.ip,
      });

      // Check for OAuth errors from provider
      if (error) {
        console.error("OAuth provider error:", {
          error,
          error_description,
          state,
        });

        // Handle specific OAuth errors
        const errorMessages = {
          access_denied: "User denied access to their information",
          invalid_request: "Invalid OAuth request parameters",
          unauthorized_client: "OAuth client not authorized",
          unsupported_response_type: "OAuth response type not supported",
          invalid_scope: "Invalid OAuth scope requested",
          server_error: "OAuth provider server error",
          temporarily_unavailable: "OAuth provider temporarily unavailable",
        };

        const userMessage =
          errorMessages[error] ||
          error_description ||
          "OAuth authentication failed";

        return this.renderErrorPage(res, userMessage, error);
      }

      // Validate authorization code
      if (!code) {
        console.error("OAuth callback: Missing authorization code");
        return this.renderErrorPage(
          res,
          "Authorization code is required",
          "missing_code",
        );
      }

      // Validate code format (should be alphanumeric)
      if (!/^[a-zA-Z0-9_-]+$/.test(code)) {
        console.error("OAuth callback: Invalid code format");
        return this.renderErrorPage(
          res,
          "Invalid authorization code format",
          "invalid_code",
        );
      }

      // Exchange code for tokens
      console.log("OAuth: Exchanging authorization code for tokens...");
      const tokenResult = await cognitoService.exchangeCodeForTokens(code);

      if (!tokenResult.success) {
        console.error("OAuth token exchange failed:", {
          error: tokenResult.error,
          code: code.substring(0, 20) + "...",
          redirectUri: process.env.COGNITO_REDIRECT_URI,
        });

        // Handle specific token exchange errors
        if (tokenResult.error.includes("invalid_grant")) {
          return this.renderErrorPage(
            res,
            "Authorization code expired or already used. Please try logging in again.",
            "invalid_grant",
          );
        }
        if (tokenResult.error.includes("invalid_client")) {
          return this.renderErrorPage(
            res,
            "OAuth client configuration error. Please contact support.",
            "invalid_client",
          );
        }
        if (tokenResult.error.includes("redirect_uri")) {
          return this.renderErrorPage(
            res,
            "Redirect URI mismatch. Please check configuration.",
            "redirect_uri_mismatch",
          );
        }

        return this.renderErrorPage(
          res,
          `Token exchange failed: ${tokenResult.error}`,
          "token_exchange_failed",
        );
      }

      console.log("OAuth: Token exchange successful");

      const { accessToken, idToken, refreshToken } = tokenResult.data;

      // Validate tokens exist
      if (!accessToken || !idToken) {
        console.error("OAuth: Missing tokens in response");
        return this.renderErrorPage(
          res,
          "Failed to receive authentication tokens",
          "missing_tokens",
        );
      }

      // Decode ID token to get user info (no API call needed - bulletproof)
      let email, firstName, lastName, emailVerified, authProvider;

      try {
        // ID token is a JWT with 3 parts: header.payload.signature
        const tokenParts = idToken.split(".");
        if (tokenParts.length !== 3) {
          console.error("OAuth: Invalid ID token format");
          throw new Error("Invalid ID token format");
        }

        // Decode the payload (base64url encoded)
        const base64Payload = tokenParts[1]
          .replace(/-/g, "+")
          .replace(/_/g, "/");
        const payload = JSON.parse(
          Buffer.from(base64Payload, "base64").toString(),
        );

        // Extract user info from ID token claims with multiple fallbacks
        email = payload.email || payload["cognito:username"] || payload.sub;

        // Handle name extraction with multiple fallbacks
        if (payload.given_name && payload.family_name) {
          firstName = payload.given_name;
          lastName = payload.family_name;
        } else if (payload.name) {
          const nameParts = payload.name.split(" ");
          firstName = nameParts[0] || "User";
          lastName = nameParts.slice(1).join(" ") || "";
        } else {
          firstName = email?.split("@")[0] || "User";
          lastName = "";
        }

        // Email verification status
        emailVerified =
          payload.email_verified === true ||
          payload.email_verified === "true" ||
          true;

        // Determine auth provider from identities with fallback
        authProvider = "google"; // Default
        if (payload.identities) {
          try {
            const identities =
              typeof payload.identities === "string"
                ? JSON.parse(payload.identities)
                : payload.identities;
            if (Array.isArray(identities) && identities.length > 0) {
              authProvider =
                identities[0]?.providerName?.toLowerCase() || "google";
            }
          } catch (e) {
            console.warn("OAuth: Could not parse identities, using default");
          }
        }

        console.log("OAuth: User info decoded from ID token:", {
          email,
          firstName,
          lastName,
          authProvider,
          emailVerified,
        });
      } catch (error) {
        console.error("OAuth: Failed to decode ID token:", error);
        // Even if decoding fails, try to continue with minimal info
        email = "user@oauth.local";
        firstName = "OAuth";
        lastName = "User";
        emailVerified = true;
        authProvider = "google";
        console.warn("OAuth: Using fallback user info due to decode error");
      }

      if (!email) {
        console.error("OAuth: Email not provided by provider");
        return this.renderErrorPage(
          res,
          "Email not provided by OAuth provider. Please ensure email permission is granted.",
          "missing_email",
        );
      }

      const normalizedEmail = email.toLowerCase().trim();

      // Check if user exists in DynamoDB
      let userResult = await dynamoDBService.getUserByEmail(normalizedEmail);
      let isNewUser = false;

      if (!userResult.success) {
        // Create new user in DynamoDB
        console.log("OAuth: Creating new user:", normalizedEmail);
        isNewUser = true;

        const createResult = await dynamoDBService.createUserProfile({
          email: normalizedEmail,
          firstName: firstName.trim() || "User",
          lastName: lastName.trim() || "",
          authProvider: authProvider,
          isVerified: emailVerified, // OAuth providers verify email
        });

        if (!createResult.success) {
          console.error(
            "OAuth: Failed to create user in database:",
            createResult.error,
          );
          return this.renderErrorPage(
            res,
            "Failed to create user account. Please try again.",
            "db_create_failed",
          );
        }

        userResult = createResult;

        // Mark email as verified in Cognito for new OAuth users
        console.log("OAuth: Marking email as verified in Cognito for new user");
        await cognitoService.markEmailAsVerified(normalizedEmail);
      } else {
        // Existing user - update last login
        console.log("OAuth: Existing user login:", normalizedEmail);
        isNewUser = false;

        const updateResult =
          await dynamoDBService.updateLastLogin(normalizedEmail);

        if (!updateResult.success) {
          console.warn(
            "OAuth: Failed to update last login:",
            updateResult.error,
          );
          // Non-critical error, continue with login
        }

        // Mark email as verified in Cognito for existing OAuth users (in case it wasn't set before)
        console.log(
          "OAuth: Ensuring email is verified in Cognito for existing user",
        );
        await cognitoService.markEmailAsVerified(normalizedEmail);
      }

      // Check if request wants JSON response (API call) or HTML (browser)
      const acceptHeader = req.headers.accept || "";
      const wantsJson =
        acceptHeader.includes("application/json") ||
        req.query.format === "json";

      // Prepare response data
      const responseData = {
        message: "Login successful",
        isNewUser: isNewUser,
        user: {
          userId: userResult.data.userId,
          email: normalizedEmail,
          firstName: firstName,
          lastName: lastName,
          isVerified: emailVerified,
          authProvider: authProvider,
        },
        tokens: {
          accessToken: accessToken,
          idToken: idToken,
          refreshToken: refreshToken,
        },
      };

      // For API requests, return JSON with tokens
      if (wantsJson) {
        return res.status(200).json(responseData);
      }

      // Determine redirect URL based on user status
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const redirectUrl = isNewUser
        ? `${frontendUrl}/onboarding`
        : `${frontendUrl}/dashboard`;

      // Production-ready: Redirect immediately with tokens in URL hash
      // This avoids CSP issues and provides clean UX
      const tokenData = encodeURIComponent(
        JSON.stringify({
          accessToken,
          idToken,
          refreshToken,
          isNewUser,
          user: {
            userId: userResult.data.userId,
            email: normalizedEmail,
            firstName,
            lastName,
            authProvider,
            isVerified: emailVerified,
          },
        }),
      );

      // Redirect to frontend with tokens in URL hash
      console.log(`OAuth: Redirecting to ${redirectUrl}`);
      return res.redirect(`${redirectUrl}#auth=${tokenData}`);
    } catch (error) {
      console.error("OAuth callback error:", error.message);

      // Return error HTML page
      const errorHtml = `
<!DOCTYPE html>
<html>
<head>
    <title>Login Failed</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            margin: 0;
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
        .container {
            background: white;
            padding: 40px;
            border-radius: 10px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            max-width: 500px;
            text-align: center;
        }
        .error-icon {
            font-size: 60px;
            color: #f44336;
            margin-bottom: 20px;
        }
        h1 {
            color: #333;
            margin-bottom: 10px;
        }
        .error-details {
            background: #ffebee;
            padding: 20px;
            border-radius: 5px;
            margin: 20px 0;
            color: #c62828;
        }
        .btn {
            background: #667eea;
            color: white;
            padding: 12px 30px;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
            text-decoration: none;
            display: inline-block;
        }
        .btn:hover {
            background: #5568d3;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="error-icon">✗</div>
        <h1>Authentication Failed</h1>
        <p>Something went wrong during the OAuth authentication process.</p>
        
        <div class="error-details">
            <p><strong>Error:</strong> ${error.message || "Unknown error"}</p>
        </div>
        
        <p style="color: #666; font-size: 14px;">Please try again or contact support if the problem persists.</p>
        
        <a href="${process.env.FRONTEND_URL || "http://localhost:3000"}" class="btn">Back to Home</a>
    </div>
</body>
</html>
      `;

      res.status(500).send(errorHtml);
    }
  };
}

module.exports = new AuthController();
