"""
Email notification service for audit completion and failures.
"""
from __future__ import annotations

import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class EmailService:
    """Service for sending email notifications."""

    def __init__(self):
        self.smtp_host = settings.smtp_host
        self.smtp_port = settings.smtp_port
        self.smtp_user = settings.smtp_user
        self.smtp_password = settings.smtp_password
        self.smtp_from = settings.smtp_from
        self.smtp_to = settings.smtp_to

    def _is_configured(self) -> bool:
        """Check if email is configured."""
        return all([
            self.smtp_host,
            self.smtp_user,
            self.smtp_password,
            self.smtp_from,
        ])

    def _send_email(
        self,
        to_email: str,
        subject: str,
        html_body: str,
        text_body: Optional[str] = None,
    ) -> bool:
        """Send an email."""
        if not self._is_configured():
            logger.warning("Email not configured, skipping notification")
            return False

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"] = self.smtp_from
            msg["To"] = to_email

            # Add text and HTML parts
            if text_body:
                text_part = MIMEText(text_body, "plain")
                msg.attach(text_part)

            html_part = MIMEText(html_body, "html")
            msg.attach(html_part)

            # Send email
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                server.starttls()
                server.login(self.smtp_user, self.smtp_password)
                server.send_message(msg)

            logger.info(f"Email sent successfully to {to_email}")
            return True
        except Exception as e:
            logger.error(f"Failed to send email to {to_email}: {e}")
            return False

    def send_audit_complete_notification(
        self,
        user_email: str,
        user_name: str,
        vendor_name: str,
        job_id: str,
        recoverable_amount: float,
        discrepancy_count: int,
        dashboard_url: Optional[str] = None,
    ) -> bool:
        """Send email notification when audit completes."""
        subject = f"✅ Audit Complete: {vendor_name} - {recoverable_amount:,.0f} at risk"

        # Format currency
        currency_symbol = "₹"  # Default to INR
        formatted_amount = f"{currency_symbol}{recoverable_amount:,.0f}"

        dashboard_link = dashboard_url or f"http://localhost:8080/dashboard?job={job_id}"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: linear-gradient(135deg, #1e3a5f, #2d4a6f); color: white; padding: 30px; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }}
                .button {{ display: inline-block; background: #1e3a5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
                .metric {{ background: white; padding: 15px; border-radius: 6px; margin: 10px 0; }}
                .metric-label {{ font-size: 12px; color: #666; text-transform: uppercase; }}
                .metric-value {{ font-size: 24px; font-weight: bold; color: #d32f2f; margin-top: 5px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>🎉 Audit Complete!</h1>
                    <p>Your contract audit for <strong>{vendor_name}</strong> has finished processing.</p>
                </div>
                <div class="content">
                    <h2>Key Findings</h2>
                    
                    <div class="metric">
                        <div class="metric-label">Recoverable Amount</div>
                        <div class="metric-value">{formatted_amount}</div>
                    </div>
                    
                    <div class="metric">
                        <div class="metric-label">Discrepancies Found</div>
                        <div class="metric-value">{discrepancy_count}</div>
                    </div>
                    
                    <p>Review the full audit report and take action on the identified discrepancies.</p>
                    
                    <a href="{dashboard_link}" class="button">View Full Report</a>
                    
                    <p style="margin-top: 30px; font-size: 12px; color: #666;">
                        This is an automated notification from ContractGuard.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

        text_body = f"""
        Audit Complete: {vendor_name}
        
        Your contract audit has finished processing.
        
        Key Findings:
        - Recoverable Amount: {formatted_amount}
        - Discrepancies Found: {discrepancy_count}
        
        View the full report: {dashboard_link}
        """

        return self._send_email(user_email, subject, html_body, text_body)

    def send_audit_failed_notification(
        self,
        user_email: str,
        user_name: str,
        vendor_name: str,
        job_id: str,
        error_message: str,
        dashboard_url: Optional[str] = None,
    ) -> bool:
        """Send email notification when audit fails."""
        subject = f"❌ Audit Failed: {vendor_name}"

        dashboard_link = dashboard_url or f"http://localhost:8080/dashboard?job={job_id}"

        html_body = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                .header {{ background: #d32f2f; color: white; padding: 30px; border-radius: 8px 8px 0 0; }}
                .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }}
                .button {{ display: inline-block; background: #1e3a5f; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin-top: 20px; }}
                .error-box {{ background: #ffebee; border-left: 4px solid #d32f2f; padding: 15px; margin: 20px 0; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>⚠️ Audit Failed</h1>
                    <p>Your contract audit for <strong>{vendor_name}</strong> encountered an error.</p>
                </div>
                <div class="content">
                    <div class="error-box">
                        <strong>Error:</strong><br>
                        {error_message}
                    </div>
                    
                    <p>Please review the error and try again. If the issue persists, contact support.</p>
                    
                    <a href="{dashboard_link}" class="button">View Details</a>
                    
                    <p style="margin-top: 30px; font-size: 12px; color: #666;">
                        This is an automated notification from ContractGuard.
                    </p>
                </div>
            </div>
        </body>
        </html>
        """

        text_body = f"""
        Audit Failed: {vendor_name}
        
        Your contract audit encountered an error:
        
        {error_message}
        
        View details: {dashboard_link}
        """

        return self._send_email(user_email, subject, html_body, text_body)


def get_email_service() -> EmailService:
    """Get email service instance."""
    return EmailService()

