"""
Enhanced LLM Extraction with GPT-4o
Provides deep contract intelligence and generates audit rules automatically
"""

from __future__ import annotations

import json
from collections import Counter
from typing import Any, Dict, List

from openai import APIError, OpenAI, AsyncOpenAI

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
    """Prepare document data for LLM analysis."""
    payload: List[Dict[str, Any]] = []
    
    for doc in documents[:3]:
        doc_summary = {
            "filename": doc.get("filename"),
            "clauses": [],
            "fields": {},
            "gpt4o_contract_terms": doc.get("gpt4o_contract_terms", {})
        }
        
        # Include clause snippets
        for clause in doc.get("clauses", [])[:10]:
            doc_summary["clauses"].append({
                "label": clause.get("label"),
                "text": _shorten(clause.get("text", "")),
                "confidence": clause.get("confidence"),
                "gpt4o_validated": clause.get("gpt4o_validated")
            })
        
        # Include extracted fields
        doc_summary["fields"] = {
            name: value.get("value")
            for name, value in (doc.get("fields") or {}).items()
            if isinstance(value, dict) and value.get("value")
        }
        
        payload.append(doc_summary)
    
    return payload


def _extract_text_from_response(response) -> str | None:
    """Extract text from OpenAI response."""
    if not getattr(response, "output", None):
        # Standard chat completion format
        if hasattr(response, 'choices') and response.choices:
            return response.choices[0].message.content
        return None
    
    # Legacy format
    for item in response.output:
        for block in getattr(item, "content", []):
            if getattr(block, "type", None) == "text":
                content = getattr(block, "text", "").strip()
                if content:
                    return content
    return None


def _build_insights(clause_counts: Counter, documents: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Build insights from clause distribution."""
    insights: List[Dict[str, Any]] = []
    
    for label, count in clause_counts.items():
        if count == 0:
            continue
        impact = count * _IMPACT_MULTIPLIER.get(label, 4500)
        insights.append({
            "label": label,
            "title": _INSIGHT_TITLES.get(label, label.replace("_", " ").title()),
            "count": count,
            "estimated_value": impact,
            "detail": f"{count} clause references detected across uploaded contracts.",
        })
    
    if not insights and documents:
        insights.append({
            "label": "general_review",
            "title": "No critical variances detected",
            "count": 0,
            "estimated_value": 0,
            "detail": "Contracts parsed successfully; no risk keywords matched our rule set.",
        })
    
    return insights


def _extract_rules_from_gpt4o_terms(documents: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Extract audit rules from GPT-4o contract terms.
    This is the MAGIC that eliminates manual configuration!
    """
    rules = {
        "base_amount": None,
        "escalation_rate": None,
        "effective_start_date": None,
        "currency": "INR",
        "invoice_keywords": [],
        "exclusion_keywords": [],
        "sla_uptime": None,
        "service_credit_rate": None,
    }
    
    for doc in documents:
        gpt4o_terms = doc.get("gpt4o_contract_terms", {})
        
        if not gpt4o_terms:
            continue
        
        # Extract base pricing
        base_pricing = gpt4o_terms.get("base_pricing", {})
        if base_pricing.get("amount") and not rules["base_amount"]:
            rules["base_amount"] = base_pricing["amount"]
        if base_pricing.get("currency"):
            rules["currency"] = base_pricing["currency"]
        
        # Extract escalation terms
        escalation = gpt4o_terms.get("escalation", {})
        if escalation.get("rate") and not rules["escalation_rate"]:
            rules["escalation_rate"] = escalation["rate"]
        if escalation.get("effective_date") and not rules["effective_start_date"]:
            rules["effective_start_date"] = escalation["effective_date"]
        
        # Extract invoice identifiers
        invoice_ids = gpt4o_terms.get("invoice_identifiers", {})
        if invoice_ids.get("description_keywords"):
            rules["invoice_keywords"].extend(invoice_ids["description_keywords"])
        if invoice_ids.get("one_time_patterns"):
            rules["exclusion_keywords"].extend(invoice_ids["one_time_patterns"])
        
        # Extract SLA terms
        special_clauses = gpt4o_terms.get("special_clauses", {})
        if special_clauses.get("sla_uptime"):
            rules["sla_uptime"] = special_clauses["sla_uptime"]
        if special_clauses.get("service_credit_rate"):
            rules["service_credit_rate"] = special_clauses["service_credit_rate"]
    
    # Deduplicate keywords
    rules["invoice_keywords"] = list(set(rules["invoice_keywords"]))
    rules["exclusion_keywords"] = list(set(rules["exclusion_keywords"]))
    
    return rules


async def analyze_with_gpt4o_deep_insights(
    documents: List[Dict[str, Any]],
    clause_counts: Counter
) -> Dict[str, Any]:
    """
    Use GPT-4o to generate deep contract insights and risk analysis.
    This goes beyond simple clause detection to provide actionable intelligence.
    """
    api_key = settings.openai_api_key
    if not api_key:
        return {
            "summary": "GPT-4o analysis unavailable (missing API key)",
            "risk_assessment": {},
            "recommendations": []
        }
    
    try:
        client = AsyncOpenAI(api_key=api_key)
        
        # Prepare comprehensive contract data
        prompt_payload = _prepare_prompt_payload(documents)
        
        prompt = f"""You are ContractGuard AI, an expert contract analyst specializing in revenue leakage detection.

CONTRACTS ANALYZED:
{json.dumps(prompt_payload, indent=2, ensure_ascii=False)}

CLAUSE DISTRIBUTION:
{json.dumps(dict(clause_counts), indent=2)}

Provide a comprehensive analysis covering:

1. EXECUTIVE SUMMARY (2-3 sentences)
   - Key findings and overall risk level

2. CRITICAL RISKS (Top 3 revenue leakage risks)
   - For each risk: what it is, why it matters, estimated financial impact

3. PRICING & ESCALATION ANALYSIS
   - Base pricing structure
   - Escalation mechanisms and dates
   - Any gaps or ambiguities

4. BILLING AUDIT STRATEGY
   - What to check in invoices
   - Expected vs. actual amounts
   - Date ranges to focus on

5. RECOMMENDATIONS (Prioritized action items)
   - Immediate actions
   - Ongoing monitoring
   - Contract improvement opportunities

6. CONFIDENCE ASSESSMENT
   - How confident are you in the extracted terms?
   - Any missing information needed for accurate auditing?

Keep it concise but actionable. Focus on FINANCIAL IMPACT and NEXT STEPS.

Respond in well-formatted markdown."""

        response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "You are ContractGuard AI, a revenue assurance expert. Provide clear, actionable insights focused on preventing revenue leakage."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.3,
            max_tokens=2000
        )
        
        analysis_text = response.choices[0].message.content
        
        # Now extract structured recommendations
        structured_prompt = f"""Based on this contract analysis:

{analysis_text}

Extract structured data in JSON format:

{{
  "risk_level": "<high/medium/low>",
  "confidence_score": <0.0 to 1.0>,
  "key_risks": [
    {{
      "title": "<risk name>",
      "description": "<brief description>",
      "impact": <estimated $ amount>,
      "priority": "<high/medium/low>"
    }}
  ],
  "recommendations": [
    {{
      "action": "<what to do>",
      "priority": "<immediate/short_term/ongoing>",
      "category": "<audit/billing/legal/operational>"
    }}
  ],
  "audit_triggers": [
    "<specific dates or events to watch for>"
  ],
  "missing_information": [
    "<what data is needed for better accuracy>"
  ]
}}

Return ONLY valid JSON."""

        structured_response = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {
                    "role": "system",
                    "content": "Extract structured data from contract analysis. Return only valid JSON."
                },
                {
                    "role": "user",
                    "content": structured_prompt
                }
            ],
            temperature=0.1,
            max_tokens=1500
        )
        
        structured_text = structured_response.choices[0].message.content.strip()
        
        # Clean JSON
        if structured_text.startswith("```"):
            structured_text = structured_text.split("```")[1]
            if structured_text.startswith("json"):
                structured_text = structured_text[4:]
            structured_text = structured_text.strip()
        
        structured_data = json.loads(structured_text)
        
        return {
            "summary": analysis_text,
            "risk_level": structured_data.get("risk_level", "medium"),
            "confidence_score": structured_data.get("confidence_score", 0.7),
            "key_risks": structured_data.get("key_risks", []),
            "recommendations": structured_data.get("recommendations", []),
            "audit_triggers": structured_data.get("audit_triggers", []),
            "missing_information": structured_data.get("missing_information", [])
        }
        
    except Exception as e:
        return {
            "summary": f"GPT-4o deep analysis failed: {str(e)}",
            "risk_assessment": {},
            "recommendations": []
        }


async def analyze(job, documents: List[Dict]) -> Dict:
    """
    Enhanced contract analysis with GPT-4o deep insights.
    """
    await job_manager.simulate_latency(0.2)
    
    # Count clauses from Azure extraction
    clause_counts: Counter = Counter()
    for doc in documents:
        for clause in doc.get("clauses", []):
            clause_counts[clause.get("label", "unknown")] += 1
    
    # 🔥 NEW: Extract audit rules from GPT-4o contract terms
    rules = _extract_rules_from_gpt4o_terms(documents)
    
    # Build basic insights
    insights = _build_insights(clause_counts, documents)
    
    # 🔥 NEW: Get deep GPT-4o analysis
    deep_analysis = await analyze_with_gpt4o_deep_insights(documents, clause_counts)
    
    # Combine with traditional insights
    if deep_analysis.get("key_risks"):
        for risk in deep_analysis["key_risks"]:
            insights.append({
                "label": "gpt4o_risk",
                "title": risk.get("title", "GPT-4o Identified Risk"),
                "count": 1,
                "estimated_value": risk.get("impact", 0),
                "detail": risk.get("description", ""),
                "priority": risk.get("priority", "medium")
            })
    
    summary = deep_analysis.get("summary", "No GPT-4o analysis available")
    
    # Store in job metrics
    job.metrics["llm_summary"] = summary
    job.metrics["llm_insights"] = insights
    job.metrics["clause_distribution"] = dict(clause_counts)
    job.metrics["gpt4o_analysis"] = deep_analysis
    job.metrics["gpt4o_rules"] = rules  # 🔥 Auto-extracted rules!
    
    return {
        "summary": summary,
        "insights": insights,
        "clause_distribution": dict(clause_counts),
        "rules": rules,  # 🔥 Pass rules to reconciliation
        "deep_analysis": deep_analysis
    }