from __future__ import annotations

import json
from collections import Counter
from typing import Any, Dict, List

from openai import APIError, OpenAI

from app.config import get_settings
from app.services import job_manager

settings = get_settings()

_IMPACT_MULTIPLIER = {
    "cpi_uplift": 15000,
    "discount_floor": 9000,
    "renewal_notice": 6000,
    "service_credits": 7000,
    "billing_cap": 5000,
}

_INSIGHT_TITLES = {
    "cpi_uplift": "CPI uplift missing in invoices",
    "discount_floor": "Discount drift vs. contract floor",
    "renewal_notice": "Renewal window at risk",
    "service_credits": "Service credits not tracked",
    "billing_cap": "Spend cap nearing limit",
}


def _shorten(text: str, limit: int = 320) -> str:
    if len(text) <= limit:
        return text
    return f"{text[:limit].rstrip()}…"


def _prepare_prompt_payload(documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    payload: List[Dict[str, Any]] = []
    for doc in documents[:3]:
        payload.append(
            {
                "filename": doc.get("filename"),
                "clauses": [{"label": clause.get("label"), "text": _shorten(clause.get("text", ""))} for clause in doc.get("clauses", [])[:5]],
                "fields": {name: value.get("value") for name, value in (doc.get("fields") or {}).items() if isinstance(value, dict) and value.get("value")},
            }
        )
    return payload


def _extract_text_from_response(response) -> str | None:
    if not getattr(response, "output", None):
        return None
    for item in response.output:
        for block in getattr(item, "content", []):
            if getattr(block, "type", None) == "text":
                content = getattr(block, "text", "").strip()
                if content:
                    return content
    return None


def _build_insights(clause_counts: Counter, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    insights: List[Dict[str, Any]] = []
    for label, count in clause_counts.items():
        if count == 0:
            continue
        impact = count * _IMPACT_MULTIPLIER.get(label, 4500)
        insights.append(
            {
                "label": label,
                "title": _INSIGHT_TITLES.get(label, label.replace("_", " ").title()),
                "count": count,
                "estimated_value": impact,
                "detail": f"{count} clause references detected across uploaded contracts.",
            }
        )
    if not insights and documents:
        insights.append(
            {
                "label": "general_review",
                "title": "No critical variances detected",
                "count": 0,
                "estimated_value": 0,
                "detail": "Contracts parsed successfully; no risk keywords matched our rule set.",
            }
        )
    return insights


async def analyze(job, documents: List[Dict]) -> Dict:
    """
    Analyze extracted clauses with OpenAI and attach structured insights.
    """
    await job_manager.simulate_latency(0.2)
    clause_counts: Counter = Counter()
    for doc in documents:
        for clause in doc.get("clauses", []):
            clause_counts[clause.get("label", "unknown")] += 1

    summary = "No contract clauses available to analyze."
    prompt_payload = _prepare_prompt_payload(documents)

    api_key = settings.openai_api_key
    if api_key and prompt_payload:
        client = OpenAI(api_key=api_key)
        messages = [
            {"role": "system", "content": "You are ContractGuard, an LLM that spots revenue leakage signals inside enterprise contracts."},
            {
                "role": "user",
                "content": (
                    "Given these clause snippets, highlight the top revenue risks in <200 words "
                    "and mention the clauses to double-check:\n"
                    f"{json.dumps(prompt_payload, ensure_ascii=False)}"
                ),
            },
        ]
        try:
            response = client.responses.create(model=settings.openai_model, input=messages)
            summary_text = _extract_text_from_response(response)
            if summary_text:
                summary = summary_text
            else:
                summary = "LLM response did not include text output."
        except APIError as exc:
            summary = f"LLM analysis failed: {exc.__class__.__name__}"
    elif api_key and not prompt_payload:
        summary = "Contracts parsed but no clause snippets were captured for LLM review."
    elif prompt_payload:
        summary = "LLM analysis unavailable (missing OPENAI_API_KEY)."

    insights = _build_insights(clause_counts, documents)

    job.metrics["llm_summary"] = summary
    job.metrics["llm_insights"] = insights
    job.metrics["clause_distribution"] = dict(clause_counts)
    return {"summary": summary, "insights": insights, "clause_distribution": dict(clause_counts)}


