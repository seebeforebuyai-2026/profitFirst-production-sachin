const Groq = require("groq-sdk");
const tools = require("../agents/tools");
const { format } = require("date-fns"); // To give AI the date context

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

class AIAgentService {
  async chat(merchantId, userMessage, chatHistory = []) {
    try {
      // 🟢 STEP 1: Date Context (Bina iske AI relative dates nahi samajh payega)
      const today = format(new Date(), "EEEE, MMMM do, yyyy");

      const systemMessage = {
        role: "system",
        content: `You are "ProfitFirst AI", a professional D2C Financial Analyst.
                STRICT RULES:
                1. Today is ${today}. Use this to calculate dates like yesterday or last month.
                2. Use tools for numbers. NEVER guess.
                3. If profit is negative, suggest checking RTO or Ads.
                4. Currency is INR (₹). Format using Bold and Tables.`,
      };

      const messages = [
        systemMessage,
        ...chatHistory,
        { role: "user", content: userMessage },
      ];

      // 🟢 STEP 2: Initial Call (AI deciding strategy)
      const response = await groq.chat.completions.create({
        model: "llama3-70b-8192",
        messages,
        tools: this.getToolDefinitions(),
        tool_choice: "auto",
        temperature: 0, // Keep it deterministic (no random answers)
      });

      let responseMessage = response.choices[0].message;
      const toolCalls = responseMessage.tool_calls;

      // 🟢 STEP 3: Multi-Tool Execution (Handles multiple tool requests)
      if (toolCalls) {
        // Add the AI's tool request to history
        messages.push(responseMessage);

        for (const toolCall of toolCalls) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);

          console.log(`🤖 AI calling Tool: ${functionName} with args:`, args);

          let content;
          try {
            if (functionName === "getFinancialSummary") {
              content = await tools.getFinancialSummary(
                merchantId,
                args.startDate,
                args.endDate,
              );
            } else if (functionName === "getPerformanceSummary") {
              content = await tools.getPerformanceSummary(
                merchantId,
                args.days,
              );
            } else if (functionName === "getProductAnalytics") {
              content = await tools.getProductAnalytics(
                merchantId,
                args.startDate,
                args.endDate,
              );
            } else {
              // 🟢 SAFETY: Agar AI ne koi aisa tool mang liya jo exist nahi karta
              content = "Tool not implemented yet.";
            }
          } catch (err) {
            content = `Error in data engine: ${err.message}`;
          }

          // Push each tool response into messages
          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: content,
          });
        }

        // 🟢 STEP 4: Final Synthesis (AI explains the numbers)
        const finalResponse = await groq.chat.completions.create({
          model: "llama3-70b-8192",
          messages,
          temperature: 0,
        });

        return finalResponse.choices[0].message.content;
      }

      return responseMessage.content;
    } catch (error) {
      console.error("❌ AIAgentService Fatal Error:", error.message);
      return "I'm having a technical glitch. My team is on it! Please ask again in a few seconds.";
    }
  }

  // Define tools in a separate method for cleanliness
  getToolDefinitions() {
    return [
      {
        type: "function",
        function: {
          name: "getFinancialSummary",
          description:
            "Get aggregated profit, revenue, and leakage data for a date range.",
          parameters: {
            type: "object",
            properties: {
              startDate: { type: "string", description: "Format: YYYY-MM-DD" },
              endDate: { type: "string", description: "Format: YYYY-MM-DD" },
            },
            required: ["startDate", "endDate"],
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getPerformanceSummary",
          description: "Get day-by-day stats to show trends (past X days).",
          parameters: {
            type: "object",
            properties: {
              days: { type: "number", description: "Default is 7." },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getProductAnalytics",
          description: "Get top 5 products by revenue and their profit.",
          parameters: {
            type: "object",
            properties: {
              startDate: { type: "string" },
              endDate: { type: "string" },
            },
          },
        },
      },
    ];
  }
}

module.exports = new AIAgentService();
