const Groq = require("groq-sdk");
const tools = require("../agents/tools");
const { format } = require("date-fns");
const { searchKnowledge } = require("../agents/knowledge"); // 🟢 Imported correctly

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

class AIAgentService {
  async chatStream(merchantId, userMessage, chatHistory = [], contextStr = "") {
    try {
      const today = format(new Date(), "EEEE, MMMM do, yyyy");
      
      const systemMessage = {
  role: "system",
  content: `You are "ProfitFirst AI", a Senior D2C Business Consultant and Financial Analyst. 
    You are an expert in scaling Indian e-commerce brands on Shopify, Meta Ads, and Shiprocket.
    ${contextStr}

    PERSONALITY & TONE:
    - Confident, professional, and data-driven. 
    - Respond in "Hinglish" (Mix of Hindi and English) if the user speaks Hindi, to keep it natural and human-like.
    - NEVER mention internal tool names like 'getFinancialSummary' or 'searchBusinessStrategy' to the user.

    CORE OPERATING RULES:
    1. NUMBERS ARE SACRED: Use your data tools for any financial query. ALWAYS format currency and key metrics in **Bold** (e.g., **₹5,38,638** or **74.01% RTO**).
    2. DATA -> INSIGHT -> ACTION: Don't just give numbers. Tell them what it means. 
       (e.g., "Sir, aapka Net Profit negative hai because your **₹8,371** shipping cost is too high compared to your earned revenue.")
    3. DATE REFERENCE: Today is ${format(new Date(), "EEEE, MMMM do, yyyy")}.

    HANDLING UNKNOWN QUESTIONS (The Expert Way):
    - If a user asks something outside your data or knowledge base (e.g., personal advice or unrelated topics), do not say "I don't know."
    - Instead, pivot back to your expertise as a Business Analyst. 
    - Example: "As your D2C growth partner, my focus is on your business profitability. While I can't advise on [unrelated topic], I can tell you that focusing on fixing your current **74% RTO rate** is the most critical move for your business right now. Should we look at a strategy for that?"
    - Always sound like a CFO who is protective of the merchant's capital.

    FORMATTING:
    - Use Markdown tables for any comparison.
    - Use bullet points for action items.
    - Keep responses concise but high-impact.`
};

      // 🧠 Memory Management: Keep context but save tokens
      const limitedHistory = chatHistory.slice(-10);

      let messages = [
        systemMessage,
        ...limitedHistory,
        { role: "user", content: userMessage },
      ];

      // 🟢 STEP 1: INITIAL ANALYSIS (Non-Streaming)
      const initialResponse = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages,
        tools: this.getToolDefinitions(),
        tool_choice: "auto",
        temperature: 0,
      });

      const responseMessage = initialResponse.choices[0].message;
      const toolCalls = responseMessage.tool_calls;

      // 🟢 STEP 2: MULTI-TOOL EXECUTION
      if (toolCalls) {
        messages.push(responseMessage);
        const toolNames = toolCalls.map((tc) => tc.function.name);

        for (const toolCall of toolCalls) {
          const functionName = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments);

          let toolContent;
          try {
            if (functionName === "getFinancialSummary") {
              toolContent = await tools.getFinancialSummary(merchantId, args.startDate, args.endDate);
            } else if (functionName === "getPerformanceSummary") {
              toolContent = await tools.getPerformanceSummary(merchantId, args.days);
            } else if (functionName === "getProductAnalytics") {
              toolContent = await tools.getProductAnalytics(merchantId, args.startDate, args.endDate);
            } else if (functionName === "searchBusinessStrategy") {
              // 🟢 FIXED: Calling the imported function directly
              console.log(`🧠 AI searching Strategy for: ${args.query}`);
              toolContent = await searchKnowledge(args.query); 
            } else {
              toolContent = "Tool not found.";
            }
          } catch (err) {
            toolContent = `Error: ${err.message}`;
          }

          messages.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: functionName,
            content: toolContent,
          });
        }

        // 🟢 STEP 3: FINAL SYNTHESIS (Streaming)
        const stream = await groq.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages,
          stream: true,
          temperature: 0.2,
        });

        return { stream, usedTools: toolNames };
      }

      // 🟢 STEP 4: NO TOOL REQUIRED
      const stream = await groq.chat.completions.create({
        model: "llama-3.3-70b-versatile",
        messages: [systemMessage, ...limitedHistory, { role: "user", content: userMessage }],
        stream: true,
        temperature: 0.5,
      });

      return { stream, usedTools: [] };

    } catch (error) {
      console.error("❌ AIAgentService Fatal Error:", error.message);
      throw error;
    }
  }

  getToolDefinitions() {
    return [
      {
        type: "function",
        function: {
          name: "getFinancialSummary",
          description: "Get aggregated profit, revenue, and leakage data for a date range.",
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
            properties: { days: { type: "number", description: "Default 7." } },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "getProductAnalytics",
          description: "Get top 5 products by revenue and profit.",
          parameters: {
            type: "object",
            properties: {
              startDate: { type: "string" },
              endDate: { type: "string" },
            },
          },
        },
      },
      {
        type: "function",
        function: {
          name: "searchBusinessStrategy",
          description: "Search for expert advice on reducing RTO, improving profit, or marketing tips.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string", description: "The business problem (e.g. 'how to reduce RTO')" },
            },
            required: ["query"],
          },
        },
      },
    ];
  }
}

module.exports = new AIAgentService();