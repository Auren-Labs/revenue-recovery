"""
Enhanced Natural Language Query API Endpoints
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional, Dict

from app.auth import require_user
from app.services import contract_chat

router = APIRouter(prefix="/api/v1/chat", tags=["chat"])


class ChatMessage(BaseModel):
    """A single chat message."""
    role: str = Field(..., description="'user' or 'assistant'")
    content: str = Field(..., description="Message content")


class ChatQueryRequest(BaseModel):
    """Request for natural language query."""
    job_id: str = Field(..., description="Job ID to query")
    question: str = Field(..., description="User's question")
    conversation_history: Optional[List[ChatMessage]] = Field(
        None,
        description="Previous conversation messages for context"
    )


class ChatQueryResponse(BaseModel):
    """Response from natural language query."""
    answer: str = Field(..., description="AI-generated answer")
    sources: List[Dict] = Field(..., description="Source citations with page references")
    metadata: Dict = Field(..., description="Additional metadata")


@router.post("/query", response_model=ChatQueryResponse)
async def query_contracts(
    request: ChatQueryRequest,
    current_user=Depends(require_user)
):
    """
    Natural language query interface for contracts.
    
    Ask questions about your contracts in plain English:
    - "What's my escalation rate with AWS?"
    - "When does the renewal notice period start?"
    - "How much can I recover from billing errors?"
    """
    customer_id = current_user.get("organization_id") or current_user.get("customer_id")
    
    # Convert conversation history format
    history = None
    if request.conversation_history:
        history = [
            {"role": msg.role, "content": msg.content}
            for msg in request.conversation_history
        ]
    
    try:
        result = await contract_chat.query_contract(
            job_id=request.job_id,
            question=request.question,
            customer_id=customer_id,
            conversation_history=history
        )
        return ChatQueryResponse(**result)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Query failed: {str(e)}")

