from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ConversationCreateResponse(BaseModel):
    conversation_id: int


class ConversationRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    created_at: datetime


class ConversationUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=120)


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    role: str
    content: str
    timestamp: datetime
    conversation_id: int


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
