"""
Enhanced Natural Language Query Service for ContractGuard
Provides intelligent contract Q&A with source citations and page references.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, List, Optional

from app.config import get_settings
from app.services import job_manager, rag_store
from app.services.openai_rate_limit import check_openai_rate_limit

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

logger = logging.getLogger(__name__)
settings = get_settings()

_chat_client = None
if OpenAI and getattr(settings, "openai_api_key", None):
    try:
        _chat_client = OpenAI(api_key=settings.openai_api_key)
    except Exception:
        _chat_client = None


def _format_source_citation(context: Dict[str, Any]) -> str:
    """Format a source citation with page numbers and file references."""
    source_type = context.get("source_type", "unknown")
    reference = context.get("reference", "Unknown")
    metadata = context.get("metadata", {})
    page = metadata.get("page")
    
    citation_parts = []
    
    if source_type == "contract_clause":
        if page is not None:
            citation_parts.append(f"Page {page}")
        if reference:
            citation_parts.append(f"Section: {reference}")
    elif source_type == "contract_summary":
        citation_parts.append("Contract Terms Summary")
    elif source_type == "billing_discrepancy":
        citation_parts.append(f"Billing Analysis: {reference}")
    
    filename = metadata.get("filename") or reference
    if filename and filename != reference:
        citation_parts.append(f"File: {filename}")
    
    return " • ".join(citation_parts) if citation_parts else "Source"


def _build_enhanced_prompt(
    question: str,
    job: Any,
    contexts: List[Dict[str, Any]],
    conversation_history: Optional[List[Dict[str, str]]] = None
) -> str:
    """Build an enhanced prompt with better context formatting."""
    
    # Job context
    vendor_name = job.vendor_name
    recoverable_amount = job.metrics.get("recoverable_amount", 0)
    discrepancy_count = len(job.discrepancies)
    currency = job.metrics.get("currency", "INR")
    
    # Format contexts with citations
    context_blocks = []
    for idx, ctx in enumerate(contexts, 1):
        citation = _format_source_citation(ctx)
        text = ctx.get("text", "")
        similarity = ctx.get("similarity", 0)
        
        context_blocks.append(
            f"Source {idx} ({similarity:.0%} match) - {citation}:\n{text}\n"
        )
    
    # Build conversation history context
    history_context = ""
    if conversation_history:
        recent_history = conversation_history[-3:]  # Last 3 exchanges
        history_lines = []
        for exchange in recent_history:
            if exchange.get("role") == "user":
                history_lines.append(f"User: {exchange.get('content', '')}")
            elif exchange.get("role") == "assistant":
                history_lines.append(f"Assistant: {exchange.get('content', '')}")
        if history_lines:
            history_context = "\n\nPrevious conversation:\n" + "\n".join(history_lines) + "\n"
    
    prompt = f"""You are ContractGuard AI, an expert contract analysis assistant. Your role is to help finance and revenue operations teams understand their contracts and billing.

JOB CONTEXT:
- Vendor: {vendor_name}
- Total Recoverable Amount: {currency} {recoverable_amount:,.2f}
- Discrepancies Found: {discrepancy_count}
{history_context}
RELEVANT EVIDENCE FROM CONTRACTS:
{chr(10).join(context_blocks) if context_blocks else "No specific contract evidence found."}

USER QUESTION: {question}

INSTRUCTIONS:
1. Answer the question using the provided contract evidence
2. IMPORTANT: When referencing information from sources, use numbered citations in square brackets like [1], [2], [3] at the end of sentences. The first source is [1], second is [2], etc.
3. Do NOT include source details in parentheses like (filename.pdf, Page X). Instead, just use [1], [2], etc.
4. If the question is about pricing, escalation, or billing, provide specific numbers and dates
5. If you don't have enough information, say so clearly
6. Be concise but thorough
7. Format numbers with currency symbols ({currency})
8. Use markdown for formatting (bold, lists, etc.)

ANSWER:"""
    
    return prompt


async def query_contract(
    job_id: str,
    question: str,
    customer_id: Optional[str] = None,
    conversation_history: Optional[List[Dict[str, str]]] = None
) -> Dict[str, Any]:
    """
    Enhanced natural language query with source citations.
    
    Args:
        job_id: The job ID to query
        question: User's question
        customer_id: Optional customer ID for rate limiting
        conversation_history: Optional conversation history for context
        
    Returns:
        Dict with answer, sources, and metadata
    """
    # Load job
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        raise ValueError(f"Job {job_id} not found")
    
    # Check rate limit
    if customer_id:
        is_allowed, error_msg = check_openai_rate_limit(customer_id, job_id)
        if not is_allowed:
            logger.warning(f"Rate limit hit for customer {customer_id}: {error_msg}")
            return {
                "answer": "I'm currently rate-limited. Please try again in a moment.",
                "sources": [],
                "metadata": {"rate_limited": True}
            }
    
    # Query RAG for relevant contexts
    logger.info(f"Querying RAG for job {job_id}: {question[:100]}")
    contexts = await rag_store.query_context(job_id, question, top_k=5)
    
    # Log diagnostic information
    logger.info(f"RAG query returned {len(contexts)} contexts for job {job_id}")
    if not contexts:
        logger.warning("No RAG contexts found for job %s", job_id)
        
        # Provide a helpful fallback answer using job data
        fallback_info = []
        if job.vendor_name:
            fallback_info.append(f"Vendor: {job.vendor_name}")
        if job.discrepancies:
            fallback_info.append(f"Found {len(job.discrepancies)} discrepancies")
        if job.metrics.get("recoverable_amount"):
            currency = job.metrics.get("currency", "INR")
            fallback_info.append(f"Total recoverable: {currency} {job.metrics.get('recoverable_amount', 0):,.2f}")
        
        # Try to extract basic info from documents if available
        documents = job.metrics.get("documents", [])
        if documents:
            total_clauses = sum(doc.get("totals", {}).get("clause_hits", 0) for doc in documents)
            if total_clauses > 0:
                fallback_info.append(f"Extracted {total_clauses} contract clauses")
        
        answer = "I couldn't find specific contract details in the indexed data for this question."
        if fallback_info:
            answer += " However, I can see that:\n\n" + "\n".join(f"• {info}" for info in fallback_info)
        answer += "\n\n**Possible reasons:**\n" + \
                 "• Contracts may not be fully processed yet\n" + \
                 "• RAG indexing may not be configured (requires Supabase and OpenAI API keys)\n" + \
                 "• Try asking about specific discrepancies or billing information\n\n" + \
                 "Please check the backend logs for more details about RAG indexing status."
        
        return {
            "answer": answer,
            "sources": [],
            "metadata": {"no_context": True, "fallback_used": True}
        }
    
    # Build enhanced prompt
    prompt = _build_enhanced_prompt(question, job, contexts, conversation_history)
    
    # Generate answer with GPT-4o
    answer = ""
    if _chat_client:
        try:
            loop = asyncio.get_running_loop()
            response = await loop.run_in_executor(
                None,
                lambda: _chat_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": "You are ContractGuard AI, a helpful contract analysis assistant. When referencing sources, use numbered citations in square brackets like [1], [2], [3] etc. at the end of sentences where you reference information. Do NOT include the source details in parentheses - just use the numbered citation. The sources are numbered in order: first source is [1], second is [2], etc."
                        },
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.2,
                    max_tokens=800,
                ),
            )
            answer = response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Failed to generate answer: {e}")
            answer = "I encountered an error while generating an answer. Please try again."
    else:
        # Fallback answer
        answer = f"Based on the contract analysis for {job.vendor_name}, I found {len(contexts)} relevant sources. However, AI processing is currently unavailable."
    
    # Format sources with citations
    formatted_sources = []
    for ctx in contexts:
        formatted_sources.append({
            "text": ctx.get("text", ""),
            "citation": _format_source_citation(ctx),
            "source_type": ctx.get("source_type"),
            "similarity": ctx.get("similarity", 0),
            "filename": ctx.get("filename"),  # Include filename for PDF viewer
            "reference": ctx.get("reference"),  # Include reference for label
            "metadata": ctx.get("metadata", {})
        })
    
    return {
        "answer": answer,
        "sources": formatted_sources,
        "metadata": {
            "vendor": job.vendor_name,
            "sources_found": len(contexts),
            "job_id": job_id
        }
    }

