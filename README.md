# Ditto

Ditto is a full-stack AI chat app with a polished custom UI, a Python backend, database-backed conversation history, and retrieval-based memory across long chats.

It keeps the feel of a modern GPT-style assistant, but with its own visual identity:
- bright glassmorphism-inspired interface
- saved conversations with rename and delete
- streaming AI responses
- markdown and code block rendering
- copy and regenerate actions
- retrieval over older chat history so long threads remember relevant context better

## What Ditto Does

Ditto lets you start threaded AI conversations, store them in a database, and continue them later without losing context.

Instead of only sending the last few messages to the model, Ditto also retrieves relevant older messages from the same conversation and feeds them back into the prompt. That gives it a lightweight RAG-style memory layer for chat history.

## Tech Stack

- Frontend: React, TypeScript, Vite
- Backend: FastAPI, SQLAlchemy, Requests
- Database: PostgreSQL
- LLM gateway: OpenRouter
- Migrations: Alembic

## Project Structure

```text
chat-clone/
├── backend/
│   ├── alembic/
│   ├── app/
│   │   ├── main.py
│   │   ├── routes/chat.py
│   │   ├── retrieval.py
│   │   └── ...
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.tsx
│   │   └── styles.css
│   └── package.json
└── README.md
```

## Environment Variables

Create `backend/.env` with:

```env
OPENROUTER_API_KEY=your_openrouter_api_key
DATABASE_URL=postgresql://username:password@localhost/chat_clone
```

## How To Run

### 1. Start the backend

```bash
cd /Users/palrpatel/Desktop/chat-clone/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --reload
```

Backend runs on:

```text
http://127.0.0.1:8000
```

### 2. Start the frontend

Open a second terminal:

```bash
cd /Users/palrpatel/Desktop/chat-clone/frontend
npm install
npm run dev
```

Frontend runs on:

```text
http://127.0.0.1:5173
```

## Core Features

- Create new AI chat threads
- Persist conversations in PostgreSQL
- Rename and delete threads
- Stream assistant responses in real time
- Render markdown, tables, and code blocks
- Copy replies and regenerate the latest assistant answer
- Retrieve older relevant chat context for stronger memory

## API Overview

Main backend endpoints:

- `POST /conversation` create a new conversation
- `GET /conversations` list saved conversations
- `PATCH /conversation/{conversation_id}` rename a conversation
- `DELETE /conversation/{conversation_id}` delete a conversation
- `GET /messages/{conversation_id}` load messages for a conversation
- `POST /chat/{conversation_id}` send a message and stream the assistant reply

## Notes

- `backend/.env` is ignored by Git and should never be pushed.
- If PostgreSQL is not running, the backend will not be able to create or read conversations.
- For production, you can replace the current retrieval logic with embeddings for stronger semantic memory.

## Future Ideas

- Document upload RAG with PDFs and text files
- User authentication
- Multi-user memory
- Vector search with embeddings
- Model selector and system prompt controls

---

Built as a custom GPT-style assistant experience with a Python backend and retrieval-based memory.
