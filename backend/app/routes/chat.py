from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import SessionLocal, init_db
from app.llm import generate_title, stream_chat_response
from app.models import Conversation, Message
from app.retrieval import build_chat_context
from app.schemas import (
    ChatRequest,
    ConversationCreateResponse,
    ConversationRead,
    ConversationUpdate,
    MessageRead,
)

router = APIRouter()


def get_db():
    init_db()
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_conversation_or_404(conversation_id: int, db: Session) -> Conversation:
    convo = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not convo:
        raise HTTPException(status_code=404, detail="Conversation not found")
    return convo


@router.post("/conversation", response_model=ConversationCreateResponse)
def create_conversation(db: Session = Depends(get_db)):
    convo = Conversation()
    db.add(convo)
    db.commit()
    db.refresh(convo)
    return {"conversation_id": convo.id}


@router.get("/conversations", response_model=list[ConversationRead])
def get_conversations(db: Session = Depends(get_db)):
    return (
        db.query(Conversation)
        .order_by(Conversation.created_at.desc())
        .all()
    )


@router.get("/messages/{conversation_id}", response_model=list[MessageRead])
def get_messages(conversation_id: int, db: Session = Depends(get_db)):
    get_conversation_or_404(conversation_id, db)

    return (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.timestamp.asc())
        .all()
    )


@router.patch("/conversation/{conversation_id}", response_model=ConversationRead)
def update_conversation(
    conversation_id: int,
    payload: ConversationUpdate,
    db: Session = Depends(get_db),
):
    convo = get_conversation_or_404(conversation_id, db)
    convo.title = payload.title.strip()
    db.commit()
    db.refresh(convo)
    return convo


@router.delete("/conversation/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(conversation_id: int, db: Session = Depends(get_db)):
    convo = get_conversation_or_404(conversation_id, db)
    db.delete(convo)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/chat/{conversation_id}")
def chat(conversation_id: int, req: ChatRequest, db: Session = Depends(get_db)):
    message = req.message.strip()
    convo = get_conversation_or_404(conversation_id, db)

    if convo.title == "New Chat":
        title = generate_title(message)
        convo.title = title
        db.commit()

    user_msg = Message(
        role="user",
        content=message,
        conversation_id=conversation_id,
    )
    db.add(user_msg)
    db.commit()

    messages_db = (
        db.query(Message)
        .filter(Message.conversation_id == conversation_id)
        .order_by(Message.timestamp.asc())
        .all()
    )

    messages = build_chat_context(messages_db, message)

    def generate():
        full_response = ""

        try:
            for chunk in stream_chat_response(messages):
                full_response += chunk
                yield chunk
        except Exception:
            full_response = "I hit an upstream error while generating that reply. Please try again."
            yield full_response

        ai_msg = Message(
            role="assistant",
            content=full_response,
            conversation_id=conversation_id,
        )
        db.add(ai_msg)
        db.commit()

    return StreamingResponse(generate(), media_type="text/plain")
