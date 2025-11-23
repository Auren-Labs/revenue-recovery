"""
Export service for generating CSV and PDF reports.
"""
from __future__ import annotations

import csv
import io
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from app.models import Job

logger = logging.getLogger(__name__)


def export_discrepancies_csv(job: Job) -> bytes:
    """
    Export discrepancies to CSV format.
    
    Returns:
        CSV file as bytes
    """
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow([
        "Vendor",
        "Issue",
        "Priority",
        "Value",
        "Due Date",
        "Invoice Date",
        "Invoice Number",
        "Customer",
        "Confidence",
        "Action",
    ])
    
    # Write data rows
    for disc in job.discrepancies:
        writer.writerow([
            job.vendor_name,
            disc.get("issue", ""),
            disc.get("priority", ""),
            disc.get("value", 0),
            disc.get("due", ""),
            disc.get("invoice_date", ""),
            disc.get("invoice_number", ""),
            disc.get("customer", ""),
            disc.get("confidence", 0),
            disc.get("action", ""),
        ])
    
    return output.getvalue().encode('utf-8-sig')  # UTF-8 with BOM for Excel compatibility


def export_metrics_summary_csv(job: Job) -> bytes:
    """
    Export metrics summary to CSV format.
    
    Returns:
        CSV file as bytes
    """
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Write header
    writer.writerow(["Metric", "Value"])
    
    # Write metrics
    metrics = job.metrics
    billing_summary = metrics.get("billing_summary", {})
    
    writer.writerow(["Vendor", job.vendor_name])
    writer.writerow(["Audit Date", job.created_at.strftime("%Y-%m-%d %H:%M:%S")])
    writer.writerow(["Status", job.status])
    writer.writerow(["", ""])  # Empty row
    
    writer.writerow(["Billing Summary", ""])
    writer.writerow(["Total Billed", billing_summary.get("total_billed", 0)])
    writer.writerow(["Invoice Count", billing_summary.get("invoice_count", 0)])
    writer.writerow(["Average Invoice", billing_summary.get("avg_invoice", 0)])
    writer.writerow(["Largest Invoice", billing_summary.get("largest_invoice", 0)])
    writer.writerow(["", ""])  # Empty row
    
    writer.writerow(["Revenue Recovery", ""])
    writer.writerow(["Recoverable Amount", metrics.get("recoverable_amount", 0)])
    writer.writerow(["Total Discrepancies", len(job.discrepancies)])
    
    # Count by priority
    priority_counts = {}
    for disc in job.discrepancies:
        priority = disc.get("priority", "unknown")
        priority_counts[priority] = priority_counts.get(priority, 0) + 1
    
    if priority_counts:
        writer.writerow(["", ""])  # Empty row
        writer.writerow(["Discrepancies by Priority", ""])
        for priority, count in priority_counts.items():
            writer.writerow([priority.title(), count])
    
    return output.getvalue().encode('utf-8-sig')


def export_full_report_pdf(job: Job) -> bytes:
    """
    Export full audit report as PDF.
    Note: This is a simplified version. For production, use a library like reportlab or weasyprint.
    
    Returns:
        PDF file as bytes (currently returns HTML that can be converted to PDF)
    """
    # For now, we'll generate HTML that can be converted to PDF on the frontend
    # Or use a library like reportlab for server-side PDF generation
    
    vendor_name = job.vendor_name
    audit_date = job.created_at.strftime("%B %d, %Y at %I:%M %p")
    status = job.status.replace('_', ' ').title()
    total_billed = job.metrics.get('billing_summary', {}).get('total_billed', 0)
    recoverable = job.metrics.get('recoverable_amount', 0)
    discrepancy_count = len(job.discrepancies)
    generated_date = datetime.utcnow().strftime("%B %d, %Y at %I:%M %p UTC")
    
    # Build discrepancies table rows
    discrepancy_rows = ""
    for disc in job.discrepancies:
        priority = disc.get("priority", "").lower()
        priority_class = priority if priority in ["critical", "high", "medium"] else ""
        issue = disc.get('issue', '').replace('"', '&quot;')
        priority_val = disc.get('priority', '')
        value = disc.get('value', 0)
        due = disc.get('due', '')
        invoice_date = disc.get('invoice_date', '')
        action = disc.get('action', '').replace('"', '&quot;')
        
        discrepancy_rows += f"""
                <tr>
                    <td>{issue}</td>
                    <td class="{priority_class}">{priority_val}</td>
                    <td>₹{value:,.2f}</td>
                    <td>{due}</td>
                    <td>{invoice_date}</td>
                    <td>{action}</td>
                </tr>
        """
    
    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>ContractGuard Audit Report - {vendor_name}</title>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 40px; line-height: 1.6; }}
            h1 {{ color: #1e3a5f; border-bottom: 3px solid #1e3a5f; padding-bottom: 10px; }}
            h2 {{ color: #2d4a6f; margin-top: 30px; }}
            table {{ width: 100%; border-collapse: collapse; margin: 20px 0; }}
            th, td {{ border: 1px solid #ddd; padding: 12px; text-align: left; }}
            th {{ background-color: #1e3a5f; color: white; }}
            tr:nth-child(even) {{ background-color: #f9f9f9; }}
            .metric {{ background: #f5f5f5; padding: 15px; margin: 10px 0; border-radius: 5px; }}
            .critical {{ color: #d32f2f; font-weight: bold; }}
            .high {{ color: #f57c00; font-weight: bold; }}
            .medium {{ color: #fbc02d; }}
        </style>
    </head>
    <body>
        <h1>ContractGuard Audit Report</h1>
        <p><strong>Vendor:</strong> {vendor_name}</p>
        <p><strong>Audit Date:</strong> {audit_date}</p>
        <p><strong>Status:</strong> {status}</p>
        
        <h2>Executive Summary</h2>
        <div class="metric">
            <p><strong>Total Billed:</strong> ₹{total_billed:,.2f}</p>
            <p><strong>Recoverable Amount:</strong> ₹{recoverable:,.2f}</p>
            <p><strong>Total Discrepancies:</strong> {discrepancy_count}</p>
        </div>
        
        <h2>Discrepancies</h2>
        <table>
            <thead>
                <tr>
                    <th>Issue</th>
                    <th>Priority</th>
                    <th>Value</th>
                    <th>Due Date</th>
                    <th>Invoice Date</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>
{discrepancy_rows}
            </tbody>
        </table>
        
        <h2>Recommendations</h2>
        <p>Review the discrepancies above and take appropriate action to recover the identified revenue leakage.</p>
        
        <footer style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ddd; color: #666; font-size: 12px;">
            <p>Generated by ContractGuard on {generated_date}</p>
        </footer>
    </body>
    </html>
    """
    
    # Return HTML for now - frontend can use browser print-to-PDF or we can add a PDF library later
    return html_content.encode('utf-8')

