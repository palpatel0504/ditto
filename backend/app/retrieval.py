from __future__ import annotations

import re
from collections import Counter

from app.models import Message

STOPWORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "how",
    "i",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "what",
    "with",
    "you",
    "your",
}


def _tokenize(text: str) -> list[str]:
    tokens = re.findall(r"[a-zA-Z0-9']+", text.lower())
    return [token for token in tokens if token not in STOPWORDS and len(token) > 2]


def _score_message(query_terms: Counter[str], message: Message) -> float:
    message_terms = Counter(_tokenize(message.content))
    if not message_terms:
      return 0.0

    overlap = sum(min(query_terms[token], message_terms[token]) for token in query_terms)
    if overlap == 0:
        return 0.0

    density = overlap / max(sum(message_terms.values()), 1)
    return overlap + density


def build_chat_context(messages_db: list[Message], latest_user_message: str) -> list[dict[str, str]]:
    recent_messages = messages_db[-6:]
    older_messages = messages_db[:-6]
    query_terms = Counter(_tokenize(latest_user_message))

    ranked_memories = sorted(
        older_messages,
        key=lambda message: _score_message(query_terms, message),
        reverse=True,
    )
    retrieved_memories = [message for message in ranked_memories[:4] if _score_message(query_terms, message) > 0]

    memory_lines = [
        f"{message.role.title()}: {message.content.strip()}"
        for message in sorted(retrieved_memories, key=lambda message: message.timestamp)
    ]

    messages: list[dict[str, str]] = [
        {
            "role": "system",
            "content": (
                "You are Ditto, a helpful assistant. Use the recent conversation plus retrieved "
                "memory snippets from this same chat when they are relevant. If the retrieved "
                "memory conflicts with the user's latest request, ask for clarification."
            ),
        }
    ]

    if memory_lines:
        messages.append(
            {
                "role": "system",
                "content": "Relevant chat memory:\n" + "\n".join(f"- {line}" for line in memory_lines),
            }
        )

    for message in recent_messages:
        messages.append({"role": message.role, "content": message.content})

    return messages
