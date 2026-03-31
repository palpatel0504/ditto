import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";

type Role = "user" | "assistant";

type Message = {
  id?: number;
  role: Role;
  content: string;
  timestamp?: string;
  conversation_id?: number;
};

type Conversation = {
  id: number;
  title: string;
  created_at: string;
};

const API = import.meta.env.VITE_API_URL ?? "http://127.0.0.1:8000";

const starterPrompts = [
  "Plan a launch strategy for a student AI startup.",
  "Turn my rough notes into a clean meeting summary.",
  "Explain a Python backend architecture in simple words.",
  "Brainstorm a bold landing page concept for a chat app.",
];

function formatRelativeDate(value: string) {
  const date = new Date(value);

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function formatTime(value?: string) {
  if (!value) return "";

  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function App() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [conversationId, setConversationId] = useState<number | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [error, setError] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [renamingConversationId, setRenamingConversationId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeConversation = useMemo(
    () => conversations.find((conversation) => conversation.id === conversationId) ?? null,
    [conversationId, conversations],
  );
  const showHero = messages.length === 0 && !booting;
  const lastUserMessage = useMemo(
    () => [...messages].reverse().find((entry) => entry.role === "user")?.content ?? "",
    [messages],
  );

  useEffect(() => {
    void initialize();
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    void loadMessages(conversationId);
  }, [conversationId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  async function initialize() {
    try {
      await loadConversations();
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load conversations.");
    } finally {
      setBooting(false);
    }
  }

  async function loadConversations(selectId?: number | null) {
    const response = await fetch(`${API}/conversations`);

    if (!response.ok) {
      throw new Error("Could not reach the chat service.");
    }

    const data = (await response.json()) as Conversation[];
    setConversations(data);

    if (typeof selectId === "number") {
      setConversationId(selectId);
      return;
    }

    if (!conversationId && data.length > 0) {
      setConversationId(data[0].id);
    }
  }

  async function loadMessages(targetConversationId: number) {
    setError("");

    const response = await fetch(`${API}/messages/${targetConversationId}`);
    if (!response.ok) {
      setError("This conversation could not be opened.");
      return;
    }

    const data = (await response.json()) as Message[];
    setMessages(data);
  }

  async function createConversation() {
    setError("");
    const response = await fetch(`${API}/conversation`, { method: "POST" });

    if (!response.ok) {
      throw new Error("Could not create a new conversation.");
    }

    const data = (await response.json()) as { conversation_id: number };
    setConversationId(data.conversation_id);
    setMessages([]);
    setSidebarOpen(false);
    await loadConversations(data.conversation_id);
    return data.conversation_id;
  }

  async function ensureConversation() {
    if (conversationId) return conversationId;
    return createConversation();
  }

  async function renameConversation(targetConversationId: number, title: string) {
    const nextTitle = title.trim();
    if (!nextTitle) return;

    const response = await fetch(`${API}/conversation/${targetConversationId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: nextTitle }),
    });

    if (!response.ok) {
      throw new Error("Could not rename this conversation.");
    }

    await loadConversations(targetConversationId);
    setRenamingConversationId(null);
    setRenameValue("");
  }

  async function deleteConversation(targetConversationId: number) {
    const confirmed = window.confirm("Delete this conversation? This cannot be undone.");
    if (!confirmed) return;

    const response = await fetch(`${API}/conversation/${targetConversationId}`, {
      method: "DELETE",
    });

    if (!response.ok) {
      throw new Error("Could not delete this conversation.");
    }

    const remainingConversations = conversations.filter(
      (conversation) => conversation.id !== targetConversationId,
    );
    const nextConversationId = remainingConversations[0]?.id ?? null;

    setConversations(remainingConversations);
    setConversationId(nextConversationId);
    setMessages(nextConversationId ? messages : []);
    if (nextConversationId) {
      await loadMessages(nextConversationId);
    } else {
      setMessages([]);
    }
  }

  async function sendMessage(prefilled?: string) {
    const content = (prefilled ?? message).trim();
    if (!content || loading) return;

    try {
      setError("");
      const targetConversationId = await ensureConversation();
      const optimisticUserMessage: Message = {
        role: "user",
        content,
        timestamp: new Date().toISOString(),
        conversation_id: targetConversationId,
      };

      setMessages((previous) => [...previous, optimisticUserMessage]);
      setMessage("");
      setLoading(true);

      const response = await fetch(`${API}/chat/${targetConversationId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: content }),
      });

      if (!response.ok || !response.body) {
        throw new Error("The assistant could not answer right now.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiText = "";

      setMessages((previous) => [
        ...previous,
        {
          role: "assistant",
          content: "",
          timestamp: new Date().toISOString(),
          conversation_id: targetConversationId,
        },
      ]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        aiText += decoder.decode(value, { stream: true });

        setMessages((previous) => {
          const nextMessages = [...previous];
          const lastMessage = nextMessages[nextMessages.length - 1];

          if (lastMessage?.role === "assistant") {
            nextMessages[nextMessages.length - 1] = {
              ...lastMessage,
              content: aiText,
            };
          }

          return nextMessages;
        });
      }

      await loadConversations(targetConversationId);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  function startRename(conversation: Conversation) {
    setRenamingConversationId(conversation.id);
    setRenameValue(conversation.title);
  }

  async function handleRetry() {
    if (!lastUserMessage || loading) return;

    const trimmedMessages = [...messages];
    while (trimmedMessages.length > 0 && trimmedMessages[trimmedMessages.length - 1]?.role === "assistant") {
      trimmedMessages.pop();
    }

    setMessages(trimmedMessages);
    await sendMessage(lastUserMessage);
  }

  async function copyMessage(content: string, index: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageIndex(index);
      window.setTimeout(() => setCopiedMessageIndex(null), 1200);
    } catch {
      setError("Clipboard access was blocked.");
    }
  }

  function onComposerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  function onComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void sendMessage();
    }
  }

  return (
    <div className="shell">
      <div className="shell__gradient shell__gradient--one" />
      <div className="shell__gradient shell__gradient--two" />

      <aside className={`sidebar ${sidebarOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <div className="brand__mark">D</div>
          <div>
            <p className="brand__eyebrow">AI Workspace</p>
            <h1>Ditto</h1>
          </div>
        </div>

        <button
          className="new-chat-button"
          type="button"
          onClick={() => {
            void createConversation();
          }}
        >
          Start new thread
        </button>

        <div className="sidebar__section">
          <p className="sidebar__label">Recent</p>
          <div className="conversation-list">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`conversation-card ${
                  conversation.id === conversationId ? "conversation-card--active" : ""
                }`}
              >
                {renamingConversationId === conversation.id ? (
                  <form
                    className="conversation-card__edit"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void renameConversation(conversation.id, renameValue);
                    }}
                  >
                    <input
                      value={renameValue}
                      onChange={(event) => setRenameValue(event.target.value)}
                      onBlur={() => {
                        void renameConversation(conversation.id, renameValue);
                      }}
                      autoFocus
                    />
                  </form>
                ) : (
                  <button
                    type="button"
                    className="conversation-card__main"
                    onClick={() => {
                      setConversationId(conversation.id);
                      setSidebarOpen(false);
                    }}
                  >
                    <span>{conversation.title}</span>
                    <small>{formatRelativeDate(conversation.created_at)}</small>
                  </button>
                )}

                <div className="conversation-card__actions">
                  <button type="button" className="icon-button" onClick={() => startRename(conversation)}>
                    Rename
                  </button>
                  <button
                    type="button"
                    className="icon-button icon-button--danger"
                    onClick={() => {
                      void deleteConversation(conversation.id);
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="sidebar__footer">
          <p>Python backend</p>
          <span>Connected database • streaming replies • retrieval memory</span>
        </div>
      </aside>

      <main className="app">
        <header className="topbar">
          <div className="topbar__left">
            <button
              className="ghost-button ghost-button--menu"
              type="button"
              onClick={() => setSidebarOpen((current) => !current)}
            >
              Menu
            </button>
            <div>
              <p className="topbar__eyebrow">Creative assistant</p>
              <h2>{activeConversation?.title ?? "New conversation"}</h2>
            </div>
          </div>

          <div className="topbar__actions">
            {activeConversation ? (
              <button
                className="ghost-button ghost-button--header"
                type="button"
                onClick={() => startRename(activeConversation)}
              >
                Rename thread
              </button>
            ) : null}
            <div className="status-pill">
              <span className="status-pill__dot" />
              Live via OpenRouter
            </div>
          </div>
        </header>

        {showHero ? (
          <section className="hero">
            <div>
              <p className="hero__eyebrow">A calmer way to think with AI</p>
              <h3>Beautiful, focused conversations without the generic chatbot look.</h3>
            </div>
            <p className="hero__body">
              Ditto keeps the familiar chat workflow, but wraps it in a brighter workspace with
              streaming answers, saved threads, markdown support, and a connected Python backend.
            </p>
          </section>
        ) : null}

        <section className="chat-panel">
          {booting ? (
            <div className="empty-state">
              <h3>Loading your workspace…</h3>
            </div>
          ) : messages.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state__badge">Start with an idea</div>
              <h3>What would you like Ditto to help you shape today?</h3>
              <p>
                Choose a prompt to kick things off, or write your own message below. A fresh
                thread will be created automatically.
              </p>

              <div className="prompt-grid">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    className="prompt-card"
                    onClick={() => {
                      void sendMessage(prompt);
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="messages">
              {messages.map((entry, index) => (
                <article
                  key={`${entry.role}-${entry.timestamp ?? index}-${index}`}
                  className={`message message--${entry.role}`}
                >
                  <div className="message__meta">
                    <span>{entry.role === "user" ? "You" : "Ditto"}</span>
                    <small>{formatTime(entry.timestamp)}</small>
                  </div>
                  <div className="message__bubble">
                    <ReactMarkdown
                      components={{
                        pre(props) {
                          return <pre className="markdown-block" {...props} />;
                        },
                        code({ className, children }: { className?: string; children?: ReactNode }) {
                          const content = String(children).replace(/\n$/, "");
                          const isBlock = content.includes("\n") || Boolean(className);
                          if (!isBlock) {
                            return (
                              <code className={className}>
                                {children}
                              </code>
                            );
                          }

                          return (
                            <div className="code-shell">
                              <div className="code-shell__bar">
                                <span>{className?.replace("language-", "") ?? "code"}</span>
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() => {
                                    void copyMessage(content, index);
                                  }}
                                >
                                  {copiedMessageIndex === index ? "Copied" : "Copy code"}
                                </button>
                              </div>
                              <code className={className}>
                                {children}
                              </code>
                            </div>
                          );
                        },
                        table({ children }) {
                          return (
                            <div className="table-wrap">
                              <table>{children as ReactNode}</table>
                            </div>
                          );
                        },
                      }}
                    >
                      {entry.content}
                    </ReactMarkdown>
                  </div>
                  {entry.role === "assistant" ? (
                    <div className="message__actions">
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => {
                          void copyMessage(entry.content, index);
                        }}
                      >
                        {copiedMessageIndex === index ? "Copied" : "Copy"}
                      </button>
                      {index === messages.length - 1 && lastUserMessage ? (
                        <button type="button" className="icon-button" onClick={() => void handleRetry()}>
                          Regenerate
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}

              {loading ? (
                <div className="typing-indicator">
                  <span />
                  <span />
                  <span />
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>
          )}
        </section>

        <footer className="composer-wrap">
          <form className="composer" onSubmit={onComposerSubmit}>
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              onKeyDown={onComposerKeyDown}
              placeholder="Message Ditto..."
              rows={1}
            />

            <div className="composer__actions">
              <p>Press Enter to send • Shift + Enter for a new line</p>
              <button className="send-button" type="submit" disabled={loading || !message.trim()}>
                Send
              </button>
            </div>
          </form>

          {error ? <div className="error-banner">{error}</div> : null}
        </footer>
      </main>
    </div>
  );
}

export default App;
