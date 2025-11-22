import asyncio
from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.schemas import AnalysisSummary, JobStatus, ChatRequest, ChatResponse
from app.services import job_manager, rag_store
from app.config import get_settings

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None

settings = get_settings()

_chat_client = None
if OpenAI and getattr(settings, "openai_api_key", None):
    try:
        _chat_client = OpenAI(api_key=settings.openai_api_key)
    except Exception:
        _chat_client = None

router = APIRouter()


@router.get("/{job_id}/summary", response_model=AnalysisSummary)
async def analysis_summary(job_id: str, current_user=Depends(require_user)) -> AnalysisSummary:
    job = job_manager.get_job(job_id, current_user.get("organization_id"))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    job_status = JobStatus(
        job_id=job.id,
        created_at=job.created_at,
        status=job.status,
        message=job.message,
        stages=job.stages,
        metrics=job.metrics,
    )
    return AnalysisSummary(job=job_status, discrepancies=job.discrepancies)


@router.post("/{job_id}/chat", response_model=ChatResponse)
async def insights_chat(job_id: str, payload: ChatRequest, current_user=Depends(require_user)) -> ChatResponse:
    job = job_manager.get_job(job_id, current_user.get("organization_id"))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    context_summary = f"Vendor: {job.vendor_name}\nRecoverable amount: {job.metrics.get('recoverable_amount', 0)}\nDiscrepancies: {len(job.discrepancies)}"
    llm_summary = job.metrics.get("llm_summary")
    if llm_summary:
        context_summary += f"\nInsight summary: {llm_summary[:500]}"

    contexts = await rag_store.query_context(job.id, payload.question, top_k=4)
    context_block = "\n".join(
        f"Source {idx + 1}: {ctx.get('text')} (type: {ctx.get('source_type')}, reference: {ctx.get('reference')})"
        for idx, ctx in enumerate(contexts)
    )

    base_answer = "Here's what I know so far:\n" + f"{context_summary}\n"
    if contexts:
        base_answer += "\nRelevant evidence:\n" + context_block

    answer = base_answer
    if _chat_client:
        prompt = (
            "You are ContractGuard Copilot. Answer questions about contract audits using the provided context. "
            "Cite the relevant source when possible.\n\n"
            f"Context summary:\n{context_summary}\n\n"
            f"Top evidence chunks:\n{context_block or 'None'}\n\n"
            f"Discrepancies:\n{job.discrepancies[:5]}\n\n"
            f"Question: {payload.question}\n"
            "Answer for a finance / revenue operations lead."
        )

        loop = asyncio.get_running_loop()

        try:
            response = await loop.run_in_executor(
                None,
                lambda: _chat_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {"role": "system", "content": "You are a revenue recovery assistant."},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.2,
                    max_tokens=500,
                ),
            )
            answer = response.choices[0].message.content.strip()
        except Exception:
            answer = base_answer + "\n\n(I could not reach the AI service, so here is the contextual summary instead.)"

    return ChatResponse(answer=answer, context_summary=context_summary, sources=contexts if contexts else None)

