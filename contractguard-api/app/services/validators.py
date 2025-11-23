"""
File and data validation services.
"""
from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional, Tuple
from fastapi import UploadFile, HTTPException, status
import openpyxl
import csv
import io

logger = logging.getLogger(__name__)

# File size limits (in bytes)
MAX_CONTRACT_FILE_SIZE = 50 * 1024 * 1024  # 50 MB
MAX_BILLING_FILE_SIZE = 10 * 1024 * 1024  # 10 MB
MAX_TOTAL_SIZE = 100 * 1024 * 1024  # 100 MB total

# Allowed file extensions
ALLOWED_CONTRACT_EXTENSIONS = {".pdf", ".doc", ".docx"}
ALLOWED_BILLING_EXTENSIONS = {".csv", ".xlsx", ".xls"}

# Flexible field name variations (matching reconciliation.py)
_AMOUNT_FIELDS = ["amount", "Amount", "value", "Value", "total", "Total", "charge", "Charge", "billed", "Billed", "Amount Billed", "Billed Amount"]
_INVOICE_DATE_FIELDS = ["Invoice_Date", "invoice_date", "Date", "date", "InvoiceDate", "Invoice Date", "Transaction Date", "Billing Date"]
_INVOICE_FIELDS = ["InvoiceNumber", "invoiceNumber", "Invoice", "invoice", "Number", "number", "Id", "ID", "Invoice_No", "Invoice #", "Invoice No", "Ref", "Reference"]
_DESC_FIELDS = ["Item_Desc", "item_desc", "Description", "description", "Memo", "memo", "Activity", "Item Description", "Line Description", "Service", "Product"]
_RATE_FIELDS = ["Rate", "rate", "Unit Price", "unit_price", "Price", "Unit Rate"]

# Minimum required: at least one amount field and one date field
# Description and invoice number are nice-to-have but not strictly required


class FileValidator:
    """Validates uploaded files."""

    @staticmethod
    def validate_contract_file(file: UploadFile) -> Tuple[bool, Optional[str]]:
        """
        Validate a contract file.
        
        Returns:
            (is_valid, error_message)
        """
        # Check file extension
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in ALLOWED_CONTRACT_EXTENSIONS:
            return False, f"Invalid file type. Allowed: {', '.join(ALLOWED_CONTRACT_EXTENSIONS)}"
        
        # Check file size
        if file.size and file.size > MAX_CONTRACT_FILE_SIZE:
            return False, f"File too large. Maximum size: {MAX_CONTRACT_FILE_SIZE / (1024*1024):.0f} MB"
        
        # Check if file is empty
        if file.size == 0:
            return False, "File is empty"
        
        return True, None

    @staticmethod
    def validate_billing_file(file: UploadFile) -> Tuple[bool, Optional[str]]:
        """
        Validate a billing file.
        
        Returns:
            (is_valid, error_message)
        """
        # Check file extension
        file_ext = Path(file.filename).suffix.lower()
        if file_ext not in ALLOWED_BILLING_EXTENSIONS:
            return False, f"Invalid file type. Allowed: {', '.join(ALLOWED_BILLING_EXTENSIONS)}"
        
        # Check file size
        if file.size and file.size > MAX_BILLING_FILE_SIZE:
            return False, f"File too large. Maximum size: {MAX_BILLING_FILE_SIZE / (1024*1024):.0f} MB"
        
        # Check if file is empty
        if file.size == 0:
            return False, "File is empty"
        
        return True, None

    @staticmethod
    async def validate_contract_files(files: List[UploadFile]) -> None:
        """Validate multiple contract files and raise HTTPException if invalid."""
        if not files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one contract file is required"
            )
        
        total_size = 0
        for file in files:
            is_valid, error = FileValidator.validate_contract_file(file)
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid file '{file.filename}': {error}"
                )
            
            if file.size:
                total_size += file.size
        
        if total_size > MAX_TOTAL_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total file size exceeds limit: {MAX_TOTAL_SIZE / (1024*1024):.0f} MB"
            )

    @staticmethod
    async def validate_billing_files(files: List[UploadFile]) -> None:
        """Validate multiple billing files and raise HTTPException if invalid."""
        if not files:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="At least one billing file is required"
            )
        
        total_size = 0
        for file in files:
            is_valid, error = FileValidator.validate_billing_file(file)
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid file '{file.filename}': {error}"
                )
            
            if file.size:
                total_size += file.size
        
        if total_size > MAX_TOTAL_SIZE:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Total file size exceeds limit: {MAX_TOTAL_SIZE / (1024*1024):.0f} MB"
            )


class DataValidator:
    """Validates data content of files."""

    @staticmethod
    def _find_field(headers: List[str], field_variations: List[str]) -> Optional[str]:
        """Find a field in headers using flexible matching."""
        headers_lower = {h.lower().strip(): h for h in headers if h}
        for variation in field_variations:
            if variation.lower() in headers_lower:
                return headers_lower[variation.lower()]
        return None

    @staticmethod
    async def validate_billing_data(file: UploadFile) -> Tuple[bool, Optional[str]]:
        """
        Validate billing file data structure with flexible field matching.
        Only requires amount and date fields - description and invoice number are optional.
        
        Returns:
            (is_valid, error_message)
        """
        try:
            file_ext = Path(file.filename).suffix.lower()
            content = await file.read()
            await file.seek(0)  # Reset file pointer
            
            if file_ext == ".csv":
                # Validate CSV
                try:
                    text_content = content.decode('utf-8-sig')  # Handle BOM
                    reader = csv.DictReader(io.StringIO(text_content))
                    headers = reader.fieldnames or []
                    
                    if not headers:
                        return False, "CSV file has no headers"
                    
                    # Check for essential fields (amount and date)
                    amount_field = DataValidator._find_field(headers, _AMOUNT_FIELDS)
                    date_field = DataValidator._find_field(headers, _INVOICE_DATE_FIELDS)
                    
                    if not amount_field:
                        return False, f"Missing amount column. Looking for: {', '.join(_AMOUNT_FIELDS[:5])}..."
                    
                    if not date_field:
                        return False, f"Missing date column. Looking for: {', '.join(_INVOICE_DATE_FIELDS[:5])}..."
                    
                    # Check if file has data rows
                    row_count = sum(1 for _ in reader)
                    if row_count == 0:
                        return False, "Billing file contains no data rows"
                    
                    # Optional fields (just log if missing, don't fail)
                    desc_field = DataValidator._find_field(headers, _DESC_FIELDS)
                    invoice_field = DataValidator._find_field(headers, _INVOICE_FIELDS)
                    
                    if not desc_field:
                        logger.warning(f"Optional description column not found in {file.filename}")
                    if not invoice_field:
                        logger.warning(f"Optional invoice number column not found in {file.filename}")
                    
                    return True, None
                except Exception as e:
                    return False, f"Invalid CSV format: {str(e)}"
            
            elif file_ext in {".xlsx", ".xls"}:
                # Validate Excel
                try:
                    workbook = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
                    sheet = workbook.active
                    
                    if sheet.max_row < 2:  # Header + at least one data row
                        return False, "Billing file contains no data rows"
                    
                    # Get headers from first row
                    headers = [str(cell.value).strip() if cell.value else "" 
                              for cell in sheet[1] if cell.value]
                    
                    if not headers:
                        return False, "Excel file has no headers"
                    
                    # Check for essential fields (amount and date)
                    amount_field = DataValidator._find_field(headers, _AMOUNT_FIELDS)
                    date_field = DataValidator._find_field(headers, _INVOICE_DATE_FIELDS)
                    
                    if not amount_field:
                        return False, f"Missing amount column. Looking for: {', '.join(_AMOUNT_FIELDS[:5])}..."
                    
                    if not date_field:
                        return False, f"Missing date column. Looking for: {', '.join(_INVOICE_DATE_FIELDS[:5])}..."
                    
                    # Optional fields (just log if missing, don't fail)
                    desc_field = DataValidator._find_field(headers, _DESC_FIELDS)
                    invoice_field = DataValidator._find_field(headers, _INVOICE_FIELDS)
                    
                    if not desc_field:
                        logger.warning(f"Optional description column not found in {file.filename}")
                    if not invoice_field:
                        logger.warning(f"Optional invoice number column not found in {file.filename}")
                    
                    return True, None
                except Exception as e:
                    return False, f"Invalid Excel format: {str(e)}"
            
            return False, "Unsupported file format for validation"
            
        except Exception as e:
            logger.error(f"Error validating billing data: {e}")
            return False, f"Error reading file: {str(e)}"

    @staticmethod
    async def validate_billing_files_data(files: List[UploadFile]) -> None:
        """Validate billing files data and raise HTTPException if invalid."""
        for file in files:
            is_valid, error = await DataValidator.validate_billing_data(file)
            if not is_valid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid billing data in '{file.filename}': {error}"
                )
