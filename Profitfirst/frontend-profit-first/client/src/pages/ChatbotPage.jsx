import { useState, useRef, useEffect } from "react";
import { FiSend, FiMic } from "react-icons/fi";
import { toast } from "react-toastify";
import logo from "../assets/logo.png";
import axiosInstance from "../../axios";
import { FiTrash2 } from "react-icons/fi";
const ChatbotPage = () => {
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState("Analyzing Database...");
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  // Markdown & Table Formatter
  const formatMessage = (text) => {
    if (!text) return "";

    let formatted = text;

    // 🟢 1. ROBUST TABLE FORMATTER (Logic Improved)
    const tableRegex = /((?:\|.*\|(?:\r?\n|$))+)/g;
    formatted = formatted.replace(tableRegex, (match) => {
      const rows = match.trim().split("\n");

      // Separator row (e.g., |---|---|) ko filter karke nikaal do
      const filteredRows = rows.filter((row) => !row.includes("---"));

      const htmlRows = filteredRows.map((row, index) => {
        // Pipes se split karo aur khali cells saaf karo
        const cells = row
          .split("|")
          .filter(
            (cell) =>
              cell.trim() !== "" || (row.startsWith("|") && cell === ""),
          );
        const tag = index === 0 ? "th" : "td";

        const cellHtml = cells
          .map(
            (c) =>
              `<${tag} class="${index === 0 ? "bg-green-500/20 text-green-400 font-black" : "text-gray-300"} border border-gray-700 px-4 py-2 font-mono text-[10px] md:text-xs">
            ${c.trim()}
          </${tag}>`,
          )
          .join("");

        return `<tr class="${index % 2 === 0 && index !== 0 ? "bg-white/5" : ""}">${cellHtml}</tr>`;
      });

      return `
        <div class="overflow-x-auto my-6 rounded-xl border border-gray-700 shadow-2xl">
          <table class="w-full border-collapse text-left">
            <tbody>${htmlRows.join("")}</tbody>
          </table>
        </div>`;
    });

    // 2. Bold Text (Green highlight)
    formatted = formatted.replace(
      /\*\*(.+?)\*\*/g,
      '<strong class="text-green-400 font-bold">$1</strong>',
    );

    // 3. Italic
    formatted = formatted.replace(
      /\*(.+?)\*/g,
      '<em class="text-gray-300">$1</em>',
    );

    // 4. Headers (Clean Green Style)
    formatted = formatted.replace(
      /^### (.+)$/gm,
      '<h3 class="text-lg font-black mt-6 mb-2 text-green-400 tracking-tight">$1</h3>',
    );
    formatted = formatted.replace(
      /^## (.+)$/gm,
      '<h2 class="text-xl font-black mt-6 mb-2 text-green-400 tracking-tight">$1</h2>',
    );

    // 5. Lists (Bullet & Numbered)
    formatted = formatted.replace(
      /^[\*\-] (.+)$/gm,
      '<div class="flex gap-2 ml-2 mb-1"><span class="text-green-500">•</span><span class="text-gray-300">$1</span></div>',
    );
    formatted = formatted.replace(
      /^\d+\. (.+)$/gm,
      '<div class="flex gap-2 ml-2 mb-1"><span class="text-green-500 font-bold">$&</span></div>',
    );

    // 6. Line Breaks (Double for paragraphs)
    formatted = formatted.replace(/\n\n/g, '<div class="h-4"></div>');
    formatted = formatted.replace(/\n/g, "<br/>");

    return formatted;
  };
  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isThinking]);

  // Load history
  useEffect(() => {
    const loadHistory = async () => {
      try {
        const res = await axiosInstance.get("/ai/history");

        if (res.data.success && res.data.history) {
          const mappedHistory = res.data.history.map((m) => ({
            id: `history-${Math.random()}`,
            text: m.content,
            sender: m.role === "user" ? "user" : "bot",
            timestamp: "Previous Chat",
          }));

          setMessages(mappedHistory);
        }
      } catch (err) {
        console.error("History load error:", err);
      }
    };

    loadHistory();
  }, []);

  const handleClearChat = async () => {
    if (
      window.confirm(
        "Are you Sure you want to clear the chat history? This cannot be undone.",
      )
    ) {
      try {
        const res = await axiosInstance.delete("/ai/clear");
        if (res.data.success) {
          setMessages([]); // 🟢 Screen saaf kar do
          toast.success("Chat history cleared!");
        }
      } catch (err) {
        toast.error("Failed to clear chat");
      }
    }
  };

  const handleSend = async (customPrompt = null) => {
    const textToSend = customPrompt || inputValue;

    if (!textToSend.trim()) return;

    const userMsg = {
      id: Date.now(),
      text: textToSend,
      sender: "user",
      timestamp: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputValue("");

    setIsThinking(true);
    setThinkingStatus("Analyzing Request...");

    const botMsgId = Date.now() + 1;

    setMessages((prev) => [
      ...prev,
      {
        id: botMsgId,
        text: "",
        sender: "bot",
        timestamp: new Date().toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
      },
    ]);

    try {
      const accessToken =
        localStorage.getItem("accessToken") || localStorage.getItem("token");

      const isDev =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";

      const API_BASE = isDev ? "http://localhost:3000/api" : "/api";

      const response = await fetch(`${API_BASE}/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ message: textToSend }),
      });

      if (!response.ok) throw new Error("API Offline");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = "";

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const rawData = line.replace("data: ", "").trim();

            if (rawData === "[DONE]") break;

            try {
              const parsed = JSON.parse(rawData);

              if (parsed.status) {
                setThinkingStatus(parsed.status);
                setIsThinking(true);
              }

              // if (parsed.text) {
              //   setIsThinking(false);
              //   accumulatedText += parsed.text;

              //   setMessages((prev) =>
              //     prev.map((m) =>
              //       m.id === botMsgId ? { ...m, text: accumulatedText } : m
              //     )
              //   );
              // }
              // loop ke andar jahan parse.text milta hai:
              if (parsed.text) {
                setIsThinking(false);
                // Ek-ek character ko thoda delay se dikhao (Only for visual feel)
                for (let char of parsed.text) {
                  await new Promise((r) => setTimeout(r, 10)); // 15ms typing speed
                  accumulatedText += char;
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === botMsgId ? { ...m, text: accumulatedText } : m,
                    ),
                  );
                }
              }
            } catch (e) {
              // ignore partial JSON
            }
          }
        }
      }
    } catch (err) {
      console.error("Stream error:", err);
      toast.error("AI connection lost. Please try again.");

      setMessages((prev) =>
        prev.map((m) =>
          m.id === botMsgId
            ? {
                ...m,
                text: "Sorry, my brain disconnected. Can you repeat that?",
              }
            : m,
        ),
      );
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="relative h-screen overflow-hidden bg-[#0D1D1E]">
      <style>{`
        .formatted-message strong {
          font-weight: 600;
          color: #10b981;
        }

        .formatted-message em {
          font-style: italic;
          color: #d1d5db;
        }

        .formatted-message li {
          margin-left: 1rem;
          margin-bottom: 0.25rem;
          line-height: 1.6;
        }

        .formatted-message h1,
        .formatted-message h2,
        .formatted-message h3 {
          color: #10b981;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }

        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }

        .typing-dot {
          width: 6px;
          height: 6px;
          background: #10b981;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out;
        }

        @keyframes bounce {
          0%, 80%, 100% {
            transform: scale(0);
          }
          40% {
            transform: scale(1);
          }
        }
      `}</style>

      <div className="relative h-full flex items-center justify-center p-8 2xl:p-12">
        <div className="w-full max-w-5xl 2xl:max-w-7xl h-[500px] 2xl:h-[650px] bg-gradient-to-br from-black via-[#0a1a1a] to-[#0d2d2d] rounded-3xl shadow-2xl flex flex-col relative overflow-hidden">
          {/* Logo */}
          <div className="absolute top-6 2xl:top-8 left-6 2xl:left-8 flex items-center gap-2 z-10">
            <img src={logo} alt="Logo" className="h-8 2xl:h-10 w-auto" />
          </div>

          {/* Chat Area */}
          <div className="flex-1 flex flex-col overflow-hidden pt-20 2xl:pt-24">
            {messages.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center px-6 2xl:px-8">
                <div className="w-full px-8 2xl:px-12">
                  <h1
                    className="text-4xl 2xl:text-5xl mb-8 2xl:mb-10 text-center"
                    style={{
                      fontFamily: "'Inter', sans-serif",
                      fontWeight: "900",
                      background:
                        "linear-gradient(90deg, #10b981 0%, #10b981 45%, #ffffff 50%, #ffffff 55%, #10b981 60%, #10b981 100%)",
                      WebkitBackgroundClip: "text",
                      backgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      textShadow: "0 0 30px rgba(16, 185, 129, 0.5)",
                    }}
                  >
                    PROFIT FIRST
                  </h1>

                  {/* Center Input */}
                  <div className="w-full max-w-xl 2xl:max-w-2xl mx-auto">
                    <div className="flex items-center gap-2 2xl:gap-3 bg-[#1a2a2a] rounded-full px-3 2xl:px-4 py-1.5 2xl:py-2 border border-gray-700">
                      {/* <button className="text-gray-400 hover:text-white transition-colors">
                        <span className="text-lg 2xl:text-xl">+</span>
                      </button> */}

                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask Anything"
                        className="flex-1 bg-transparent text-white placeholder-gray-400 outline-none text-sm 2xl:text-base"
                      />

                      {/* <button className="text-gray-400 hover:text-white transition-colors">
                        <FiMic className="w-4 h-4 2xl:w-[18px] 2xl:h-[18px]" />
                      </button> */}

                      <button
                        onClick={() => handleSend()}
                        disabled={isThinking || !inputValue.trim()}
                        className="bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full p-2 2xl:p-2.5 transition-colors"
                      >
                        <FiSend className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Messages */}
                <div
                  ref={chatContainerRef}
                  className="flex-1 overflow-y-auto px-6 2xl:px-8 py-6 2xl:py-8 scrollbar-hide"
                  style={{
                    scrollbarWidth: "none",
                    msOverflowStyle: "none",
                  }}
                >
                  <div className="w-full max-w-3xl 2xl:max-w-4xl mx-auto space-y-4 2xl:space-y-5 min-h-full">
                    {messages.map((message) => {
                      if (!message.text && message.sender === "bot") {
                        return null;
                      }

                      return (
                        <div
                          key={message.id}
                          className={`flex ${
                            message.sender === "user"
                              ? "justify-end"
                              : "justify-start"
                          }`}
                        >
                          <div
                            className={`max-w-[70%] rounded-lg px-4 2xl:px-5 py-3 2xl:py-4 ${
                              message.sender === "user"
                                ? "bg-green-500 text-white"
                                : "bg-[#1a2a2a] text-white border border-gray-700"
                            }`}
                          >
                            {message.sender === "user" ? (
                              <p className="text-sm 2xl:text-base whitespace-pre-wrap break-words">
                                {message.text}
                              </p>
                            ) : (
                              <div
                                className="text-sm 2xl:text-base break-words formatted-message"
                                dangerouslySetInnerHTML={{
                                  __html: formatMessage(message.text),
                                }}
                              />
                            )}

                            <span className="text-[10px] 2xl:text-xs opacity-70 mt-1 block">
                              {message.timestamp}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Thinking Indicator */}
                    {isThinking && (
                      <div className="flex justify-start">
                        <div className="bg-[#1a2a2a] text-white border border-gray-700 rounded-lg px-4 2xl:px-5 py-3 2xl:py-4 flex items-center gap-3">
                          <div className="flex gap-1">
                            <div
                              className="typing-dot"
                              style={{ animationDelay: "0s" }}
                            />
                            <div
                              className="typing-dot"
                              style={{ animationDelay: "0.2s" }}
                            />
                            <div
                              className="typing-dot"
                              style={{ animationDelay: "0.4s" }}
                            />
                          </div>

                          <span className="text-[10px] 2xl:text-xs opacity-70 uppercase tracking-widest">
                            {thinkingStatus}
                          </span>
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Bottom Input */}
                <div className="px-6 2xl:px-8 pb-6 2xl:pb-8 pt-2 bg-gradient-to-t from-black/50 to-transparent">
                  <div className="w-full max-w-3xl 2xl:max-w-4xl mx-auto">
                    <div className="flex items-center gap-2 2xl:gap-3 bg-[#1a2a2a] rounded-full px-4 2xl:px-5 py-2 2xl:py-2.5 border border-gray-700">
                      {/* <button className="text-gray-400 hover:text-white transition-colors">
                        <span className="text-lg 2xl:text-xl">+</span>
                      </button> */}

                      <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask Anything"
                        className="flex-1 bg-transparent text-white placeholder-gray-400 outline-none text-sm 2xl:text-base"
                      />

                      {/* <button className="text-gray-400 hover:text-white transition-colors">
                        <FiMic className="w-4 h-4 2xl:w-[18px] 2xl:h-[18px]" />
                      </button> */}
                      <button
                        onClick={handleClearChat}
                        className="p-2 hover:bg-red-500/10 text-gray-500 hover:text-red-500 rounded-lg transition-all"
                        title="Clear Conversation"
                      >
                        <FiTrash2 size={18} />
                      </button>

                      <button
                        onClick={() => handleSend()}
                        disabled={isThinking || !inputValue.trim()}
                        className="bg-green-500 hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-full p-2 2xl:p-2.5 transition-colors"
                      >
                        <FiSend className="w-3.5 h-3.5 2xl:w-4 2xl:h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatbotPage;
