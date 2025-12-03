from __future__ import annotations

from pathlib import Path
from datetime import datetime, date, time

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse

from app.auth import require_user
from app.services import job_manager

try:
    import openpyxl  # type: ignore
except ImportError:
    openpyxl = None

router = APIRouter()


def _find_local_file(job_id: str, filename: str, category: str, organization_id: str | None) -> Path | None:
    job = job_manager.get_job(job_id, organization_id)
    if not job:
        return None

    entries = []
    if category == "contracts":
        entries = job.metrics.get("contract_files", []) if isinstance(job.metrics, dict) else []
        entries = entries or job.contracts
    elif category == "billing":
        entries = job.metrics.get("billing_files", []) if isinstance(job.metrics, dict) else []
        entries = entries or job.billing_records

    for entry in entries or []:
        if entry.get("filename") == filename:
            local_path = entry.get("local_path")
            if local_path:
                path = Path(local_path)
                if path.exists():
                    return path
    return None


@router.get("/jobs/{job_id}/contracts/{filename}")
def download_contract(job_id: str, filename: str, current_user=Depends(require_user)):
    path = _find_local_file(job_id, filename, "contracts", current_user.get("organization_id"))
    if not path:
        raise HTTPException(status_code=404, detail="Contract file not found.")
    return FileResponse(path, filename=filename, media_type="application/pdf")


@router.get("/jobs/{job_id}/billing/{filename}")
def download_billing(job_id: str, filename: str, current_user=Depends(require_user)):
    path = _find_local_file(job_id, filename, "billing", current_user.get("organization_id"))
    if not path:
        raise HTTPException(status_code=404, detail="Billing file not found.")
    
    # Determine media type based on file extension
    media_type = "application/octet-stream"
    if filename.lower().endsWith(".csv"):
        media_type = "text/csv"
    elif filename.lower().endsWith((".xls", ".xlsx")):
        media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    
    return FileResponse(path, filename=filename, media_type=media_type)


def _read_excel_data(path: Path) -> dict:
    """Read Excel file and return as JSON with headers and rows."""
    if not openpyxl:
        raise HTTPException(status_code=500, detail="Excel support not available (openpyxl not installed)")
    
    workbook = None
    try:
        workbook = openpyxl.load_workbook(path, data_only=True)
        sheet = workbook.active
        rows = []
        
        header_row = next(sheet.iter_rows(min_row=1, max_row=1), None)
        if not header_row:
            return {"headers": [], "rows": []}
        
        headers = [
            str(cell.value).strip() if cell.value is not None else f"column_{idx}"
            for idx, cell in enumerate(header_row, start=1)
        ]
        
        for excel_row in sheet.iter_rows(min_row=2, values_only=True):
            record = {}
            if excel_row:
                for idx in range(min(len(headers), len(excel_row))):
                    val = excel_row[idx]
                    if isinstance(val, (datetime, date)):
                        val = val.isoformat()
                    elif isinstance(val, time):
                        val = val.strftime("%H:%M:%S")
                    elif val is None:
                        val = ""
                    else:
                        val = str(val)
                    record[headers[idx]] = val
            rows.append(record)
        
        return {"headers": headers, "rows": rows}
    finally:
        if workbook:
            workbook.close()


def _read_csv_data(path: Path) -> dict:
    """Read CSV file and return as JSON with headers and rows."""
    import csv
    
    headers = []
    rows = []
    
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        if reader.fieldnames:
            headers = list(reader.fieldnames)
        
        for row in reader:
            # Convert all values to strings
            clean_row = {k: str(v) if v is not None else "" for k, v in row.items()}
            rows.append(clean_row)
    
    return {"headers": headers, "rows": rows}


@router.get("/jobs/{job_id}/billing/{filename}/data")
def get_billing_data(job_id: str, filename: str, current_user=Depends(require_user)):
    """Get billing file data as JSON (for Excel/CSV files)."""
    path = _find_local_file(job_id, filename, "billing", current_user.get("organization_id"))
    if not path:
        raise HTTPException(status_code=404, detail="Billing file not found.")
    
    try:
        filename_lower = filename.lower()
        if filename_lower.endswith(".csv"):
            data = _read_csv_data(path)
        elif filename_lower.endswith((".xls", ".xlsx")):
            data = _read_excel_data(path)
        else:
            raise HTTPException(status_code=400, detail="File type not supported for data extraction")
        
        return JSONResponse(content=data)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read file: {str(e)}")

