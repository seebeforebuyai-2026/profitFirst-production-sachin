const aiAgentService = require("../services/ai-agent.service");
const dynamoDBService = require("../services/dynamodb.service");

class AIChatController {
  async handleChat(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (req.flush) req.flush();
    let fullAIResponse = "";

    try {
      const merchantId = req.user.userId;
      const { message } = req.body;

      const profileRes = await dynamoDBService.getUserProfile(merchantId);
      const p = profileRes.data || {};
      const contextStr = `Merchant: ${p.businessName}, Target Margin: ${p.targetMargin || '20%'}`;

      const chatHistory = await dynamoDBService.getChatHistory(merchantId, 5);

      // 🚀 Start Agent Logic
      const { stream, usedTools } = await aiAgentService.chatStream(
        merchantId, message, chatHistory, contextStr
      );

      // 🟢 Notification: Tell frontend which tool is being used
      if (usedTools && usedTools.length > 0) {
        res.write(`data: ${JSON.stringify({ status: `Fetching data from ${usedTools.join(', ')}...` })}\n\n`);
      }

      // 🔄 Iterate Stream
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        if (content) {
          fullAIResponse += content;
          res.write(`data: ${JSON.stringify({ text: content })}\n\n`);
        }
      }

      // 💾 Save to DB
      await dynamoDBService.saveChatMessage(merchantId, "user", message);
      await dynamoDBService.saveChatMessage(merchantId, "assistant", fullAIResponse);

      res.write('data: [DONE]\n\n');
      res.end();

    } catch (error) {
      console.error("❌ Controller Error:", error);
      res.write(`data: ${JSON.stringify({ error: "System overload. Try again." })}\n\n`);
      res.end();
    }
  }

  async clearHistory(req, res) {
    try {
        const merchantId = req.user.userId;
        await dynamoDBService.clearChatHistory(merchantId);
        res.status(200).json({ success: true, message: "Chat history cleared" });
    } catch (error) {
        res.status(500).json({ error: "Failed to clear history" });
    }
}
}

module.exports = new AIChatController();