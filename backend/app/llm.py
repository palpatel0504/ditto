import requests
from app.config import OPENROUTER_API_KEY, BASE_URL, MODEL


def get_chat_response(messages):
    url = f"{BASE_URL}/chat/completions"

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }

    data = {
        "model": MODEL,
        "messages": messages
    }

    response = requests.post(url, headers=headers, json=data, timeout=60)

    if response.status_code != 200:
        return "Error from API"

    return response.json()["choices"][0]["message"]["content"]

def generate_title(message):
    prompt = [
        {"role": "system", "content": "Generate a short 3-5 word title for this conversation."},
        {"role": "user", "content": message}
    ]
    title = get_chat_response(prompt).strip()
    return title[:60] or "New Chat"


def stream_chat_response(messages):
    import requests
    import json
    from app.config import OPENROUTER_API_KEY, BASE_URL, MODEL

    url = f"{BASE_URL}/chat/completions"

    headers = {
        "Authorization": f"Bearer {OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }

    data = {
        "model": MODEL,
        "messages": messages,
        "stream": True
    }

    response = requests.post(url, headers=headers, json=data, stream=True, timeout=60)
    response.raise_for_status()

    for line in response.iter_lines():
        if line:
            decoded = line.decode("utf-8")

            if decoded.startswith("data: "):
                json_str = decoded.replace("data: ", "")

                if json_str == "[DONE]":
                    break

                try:
                    chunk = json.loads(json_str)
                    delta = chunk["choices"][0]["delta"]

                    if "content" in delta:
                        yield delta["content"]

                except Exception as e:
                    print("STREAM ERROR:", e)
                    continue
