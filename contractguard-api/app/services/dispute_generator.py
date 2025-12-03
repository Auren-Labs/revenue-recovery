"""
Automated Dispute Letter Generation Service
Generates professional dispute letters from discrepancy findings.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.config import get_settings
from app.services import job_manager
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


def _format_currency(amount: float, currency: str = "INR") -> str:
    """Format currency amount."""
    if currency == "INR":
        return f"₹{amount:,.2f}"
    elif currency == "USD":
        return f"${amount:,.2f}"
    else:
        return f"{amount:,.2f} {currency}"


def _get_document_type(user_type: str) -> str:
    """Return appropriate document type based on user perspective."""
    if user_type == "vendor":
        return "corrective_invoice"
    return "dispute_letter"


def _get_subject_line(user_type: str, invoice_ref: str, issue: str) -> str:
    """Generate appropriate subject line based on user type."""
    if user_type == "vendor":
        return f"Billing Correction Notice - Invoice {invoice_ref}"
    return f"Billing Discrepancy - Invoice {invoice_ref}"


def _extract_contract_evidence(discrepancy: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Extract contract evidence from discrepancy."""
    evidence = []
    for ev in discrepancy.get("evidence", []):
        if ev.get("type") == "contract_clause":
            evidence.append({
                "text": ev.get("text", ""),
                "label": ev.get("label", ""),
                "page": ev.get("page"),
                "file": ev.get("file", ""),
            })
    return evidence


def _build_dispute_letter_prompt(
    discrepancy: Dict[str, Any],
    job: Any,
    vendor_contact: Optional[str] = None,
    user_type: str = "customer"
) -> str:
    """Build prompt for dispute letter or corrective invoice generation."""
    
    issue = discrepancy.get("issue", "Billing discrepancy")
    value = discrepancy.get("value", 0)
    currency = job.metrics.get("currency", "INR")
    invoice_date = discrepancy.get("invoice_date")
    invoice_reference = discrepancy.get("invoice_reference", "N/A")
    customer = discrepancy.get("customer", "Our organization")
    
    contract_evidence = _extract_contract_evidence(discrepancy)
    evidence_text = ""
    if contract_evidence:
        evidence_text = "\n".join([
            f"- {ev.get('label', 'Clause')}: {ev.get('text', '')[:200]}"
            f" (Page {ev.get('page', 'N/A')}, {ev.get('file', 'Contract')})"
            for ev in contract_evidence[:3]
        ])
    
    confidence = discrepancy.get("confidence", 0)
    finding_status = discrepancy.get("finding_status", "needs_review")
    
    is_vendor = user_type == "vendor"
    
    if is_vendor:
        # Vendor mode: Generate corrective invoice/billing adjustment notice
        prompt = f"""Generate a professional billing correction notice (corrective invoice) for revenue recovery.

BILLING CORRECTION DETAILS:
- Issue: {issue}
- Original Invoice Date: {invoice_date or "N/A"}
- Original Invoice Number: {invoice_reference}
- Under-billed Amount: {_format_currency(value, currency)}
- Customer: {customer}
- Vendor: {job.vendor_name}
- Confidence Level: {confidence:.0%} ({finding_status})

CONTRACT EVIDENCE:
{evidence_text if evidence_text else "Contract terms support this correction."}

CUSTOMER CONTACT: {vendor_contact or "accounts@customer.com"}

REQUIREMENTS:
1. Professional and clear tone
2. Clear statement of the billing correction needed
3. Reference to contract terms that justify the correction
4. Request for payment/adjustment
5. Offer to provide supporting documentation
6. Professional closing

Generate the billing correction notice in the following format:

Subject: Billing Correction Notice - Invoice {invoice_reference}

Dear [Customer Accounts Team],

[Opening paragraph - introduce the billing correction]

CORRECTION DETAILS:
[Bullet points with specific details about what was under-billed]

CONTRACT REFERENCE:
[Reference to relevant contract terms that justify the correction]

REQUEST:
[Clear request for payment/adjustment of the under-billed amount]

[Closing paragraph - offer to provide documentation and answer questions]

Best regards,
[{job.vendor_name} Billing Team]

Generate the notice now:"""
    else:
        # Customer mode: Generate dispute letter
        prompt = f"""Generate a professional, courteous dispute letter for a billing discrepancy.

DISCREPANCY DETAILS:
- Issue: {issue}
- Invoice Date: {invoice_date or "N/A"}
- Invoice Number: {invoice_reference}
- Billed Amount: {_format_currency(value, currency)}
- Customer: {customer}
- Vendor: {job.vendor_name}
- Confidence Level: {confidence:.0%} ({finding_status})

CONTRACT EVIDENCE:
{evidence_text if evidence_text else "Contract terms support this finding."}

VENDOR CONTACT: {vendor_contact or "accounts@vendor.com"}

REQUIREMENTS:
1. Professional and courteous tone (not accusatory)
2. Clear statement of the discrepancy
3. Reference to contract terms
4. Request for credit/adjustment
5. Offer to provide supporting documentation
6. Professional closing

Generate the dispute letter in the following format:

Subject: [Appropriate subject line]

Dear [Vendor Accounts Team],

[Opening paragraph - introduce the issue]

DISCREPANCY DETAILS:
[Bullet points with specific details]

CONTRACT REFERENCE:
[Reference to relevant contract terms]

REQUEST:
[Clear request for credit/adjustment]

[Closing paragraph - offer to provide documentation]

Best regards,
[Customer Name]

Generate the letter now:"""

    return prompt


async def generate_dispute_letter(
    job_id: str,
    discrepancy_id: str,
    customer_id: Optional[str] = None,
    vendor_contact: Optional[str] = None
) -> Dict[str, Any]:
    """
    Generate a dispute letter (customer) or corrective invoice (vendor) for a discrepancy.
    
    Args:
        job_id: Job ID
        discrepancy_id: Discrepancy ID or index
        customer_id: Customer ID for rate limiting
        vendor_contact: Optional vendor/customer contact email
        
    Returns:
        Dict with letter content, metadata, and attachments info
    """
    # Load job
    job = job_manager.get_job(job_id, customer_id)
    if not job:
        raise ValueError(f"Job {job_id} not found")
    
    # Get user_type from job
    user_type = getattr(job, 'user_type', 'customer')
    
    # Find discrepancy
    discrepancy = None
    if discrepancy_id.isdigit():
        idx = int(discrepancy_id)
        if 0 <= idx < len(job.discrepancies):
            discrepancy = job.discrepancies[idx]
        else:
            raise ValueError(f"Discrepancy index {discrepancy_id} out of range (0-{len(job.discrepancies)-1})")
    else:
        # Try to match by ID field first
        for disc in job.discrepancies:
            if disc.get("id") == discrepancy_id:
                discrepancy = disc
                break
        
        # If not found by ID, try to parse format like "Customer-0" to extract index
        if not discrepancy and "-" in discrepancy_id:
            parts = discrepancy_id.rsplit("-", 1)
            if parts[1].isdigit():
                idx = int(parts[1])
                if 0 <= idx < len(job.discrepancies):
                    discrepancy = job.discrepancies[idx]
    
    if not discrepancy:
        raise ValueError(f"Discrepancy {discrepancy_id} not found. Available: {len(job.discrepancies)} discrepancies (use index 0-{len(job.discrepancies)-1})")
    
    # Check rate limit
    if customer_id:
        is_allowed, error_msg = check_openai_rate_limit(customer_id, job_id)
        if not is_allowed:
            logger.warning(f"Rate limit hit: {error_msg}")
            raise Exception(f"Rate limit exceeded: {error_msg}")
    
    # Build prompt with user_type
    prompt = _build_dispute_letter_prompt(discrepancy, job, vendor_contact, user_type=user_type)
    
    # Determine document type and system message
    document_type = _get_document_type(user_type)
    is_vendor = user_type == "vendor"
    
    system_message = (
        "You are a professional business communication assistant. Generate clear, courteous, and professional "
        "billing correction notices for revenue recovery." if is_vendor else
        "You are a professional business communication assistant. Generate clear, courteous, and professional dispute letters."
    )
    
    # Generate letter
    letter_content = ""
    if _chat_client:
        try:
            import asyncio
            loop = asyncio.get_running_loop()
            response = await loop.run_in_executor(
                None,
                lambda: _chat_client.chat.completions.create(
                    model="gpt-4o-mini",
                    messages=[
                        {
                            "role": "system",
                            "content": system_message
                        },
                        {"role": "user", "content": prompt}
                    ],
                    temperature=0.3,
                    max_tokens=1000,
                ),
            )
            letter_content = response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"Failed to generate {document_type}: {e}")
            raise Exception(f"Failed to generate {document_type}: {str(e)}")
    else:
        # Fallback template - mode-aware
        if is_vendor:
            letter_content = f"""Subject: Billing Correction Notice - Invoice {discrepancy.get('invoice_reference', 'N/A')}

Dear Accounts Team,

We have identified a billing correction needed for invoice {discrepancy.get('invoice_reference', 'N/A')} dated {discrepancy.get('invoice_date', 'N/A')}.

CORRECTION DETAILS:
- Issue: {discrepancy.get('issue', 'Under-billing error')}
- Under-billed Amount: {_format_currency(discrepancy.get('value', 0), job.metrics.get('currency', 'INR'))}

We request payment or adjustment for this under-billed amount per our contract terms. Please let us know if you need any additional documentation.

Best regards,
{job.vendor_name} Billing Team"""
        else:
            letter_content = f"""Subject: Billing Discrepancy - Invoice {discrepancy.get('invoice_reference', 'N/A')}

Dear Accounts Team,

We have identified a billing discrepancy in invoice {discrepancy.get('invoice_reference', 'N/A')} dated {discrepancy.get('invoice_date', 'N/A')}.

DISCREPANCY DETAILS:
- Issue: {discrepancy.get('issue', 'Billing error')}
- Amount: {_format_currency(discrepancy.get('value', 0), job.metrics.get('currency', 'INR'))}

We request a credit or adjustment for this amount. Please let us know if you need any additional documentation.

Best regards,
Customer Accounts Team"""
    
    # Extract metadata
    currency = job.metrics.get("currency", "INR")
    value = discrepancy.get("value", 0)
    
    return {
        "letter": letter_content,
        "document_type": document_type,
        "metadata": {
            "job_id": job_id,
            "discrepancy_id": discrepancy_id,
            "vendor": job.vendor_name,
            "customer": discrepancy.get("customer"),
            "amount": value,
            "currency": currency,
            "invoice_date": discrepancy.get("invoice_date"),
            "invoice_reference": discrepancy.get("invoice_reference"),
            "generated_at": datetime.utcnow().isoformat(),
            "user_type": user_type,
            "subject": _get_subject_line(user_type, discrepancy.get("invoice_reference", "N/A"), discrepancy.get("issue", "")),
        },
        "attachments": {
            "contract_evidence": _extract_contract_evidence(discrepancy),
            "invoice_details": {
                "date": discrepancy.get("invoice_date"),
                "number": discrepancy.get("invoice_reference"),
                "amount": value,
            }
        }
    }

