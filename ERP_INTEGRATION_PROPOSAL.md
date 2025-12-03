# ERP Integration Proposal

## Overview
Add direct ERP system integrations to eliminate manual file uploads and enable automated billing data synchronization.

## Benefits

### User Experience
- ✅ **Zero manual steps**: Connect once, data flows automatically
- ✅ **Scheduled audits**: Run monthly/quarterly audits automatically
- ✅ **Real-time monitoring**: Detect discrepancies as they occur
- ✅ **Reduced errors**: No manual export/import mistakes

### Business Value
- ✅ **Enterprise-ready**: Meets enterprise procurement requirements
- ✅ **Competitive advantage**: Differentiates from manual-only competitors
- ✅ **Higher retention**: Automated workflows increase stickiness
- ✅ **Upsell opportunity**: Premium feature for enterprise tier

## Architecture

### High-Level Design

```
┌─────────────────┐
│   Frontend UI   │
│  (Connect ERP)  │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│   ERP Integration Service       │
│  ┌───────────────────────────┐  │
│  │  ERP Adapter Interface     │  │
│  └───────────────────────────┘  │
│  ┌──────┐ ┌──────┐ ┌──────┐      │
│  │NetSuite│ │ SAP │ │Oracle│    │
│  └──────┘ └──────┘ └──────┘      │
└────────┬─────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   Background Sync Workers       │
│  (Celery Tasks)                 │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│   Existing File Handler         │
│  (Reuse current pipeline)        │
└─────────────────────────────────┘
```

## Implementation Plan

### Phase 1: Foundation (Week 1-2)

#### 1.1 Database Schema
Add ERP connection tables:

```sql
-- ERP connections table
CREATE TABLE erp_connections (
    id UUID PRIMARY KEY,
    organization_id TEXT NOT NULL,
    erp_type TEXT NOT NULL, -- 'netsuite', 'sap', 'oracle', etc.
    connection_name TEXT NOT NULL,
    credentials JSONB NOT NULL, -- Encrypted OAuth tokens, API keys
    config JSONB DEFAULT '{}', -- Sync frequency, date ranges, filters
    status TEXT DEFAULT 'active', -- 'active', 'error', 'disconnected'
    last_sync_at TIMESTAMPTZ,
    last_sync_status TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ERP sync jobs table
CREATE TABLE erp_sync_jobs (
    id UUID PRIMARY KEY,
    connection_id UUID REFERENCES erp_connections(id),
    job_id UUID REFERENCES jobs(id), -- Links to audit job
    sync_type TEXT, -- 'manual', 'scheduled', 'triggered'
    status TEXT, -- 'queued', 'running', 'completed', 'failed'
    records_fetched INTEGER,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 1.2 Service Layer Structure

```
contractguard-api/app/services/
├── erp/
│   ├── __init__.py
│   ├── base_adapter.py          # Abstract base class
│   ├── netsuite_adapter.py      # NetSuite implementation
│   ├── sap_adapter.py           # SAP implementation
│   ├── oracle_adapter.py        # Oracle implementation
│   ├── dynamics_adapter.py      # Dynamics 365 implementation
│   └── connection_manager.py    # Manages connections & syncs
```

#### 1.3 Base Adapter Interface

```python
# contractguard-api/app/services/erp/base_adapter.py
from abc import ABC, abstractmethod
from typing import List, Dict, Any, Optional
from datetime import date, datetime

class ERPAdapter(ABC):
    """Base class for all ERP integrations."""
    
    @abstractmethod
    async def authenticate(self, credentials: Dict[str, Any]) -> bool:
        """Test connection and authenticate."""
        pass
    
    @abstractmethod
    async def fetch_invoices(
        self,
        start_date: date,
        end_date: date,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """
        Fetch invoice/billing data from ERP.
        
        Returns list of invoice records in standardized format:
        [
            {
                "invoice_date": "2024-01-15",
                "invoice_number": "INV-001",
                "customer": "Acme Corp",
                "description": "Monthly subscription",
                "amount": 10000.00,
                "currency": "USD",
                ...
            }
        ]
        """
        pass
    
    @abstractmethod
    def normalize_invoice(self, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        """Convert ERP-specific format to standard format."""
        pass
    
    @abstractmethod
    async def test_connection(self) -> Dict[str, Any]:
        """Test connection and return status."""
        pass
```

### Phase 2: NetSuite Integration (Week 2-3)

**Priority: HIGH** (already mentioned in codebase)

#### 2.1 NetSuite Adapter Implementation

```python
# contractguard-api/app/services/erp/netsuite_adapter.py
from app.services.erp.base_adapter import ERPAdapter
import httpx
from typing import List, Dict, Any

class NetSuiteAdapter(ERPAdapter):
    """
    NetSuite ERP integration using REST API.
    
    Authentication: OAuth 2.0 (Token-Based Authentication)
    API: NetSuite REST Web Services
    """
    
    def __init__(self, credentials: Dict[str, Any]):
        self.account_id = credentials.get("account_id")
        self.consumer_key = credentials.get("consumer_key")
        self.consumer_secret = credentials.get("consumer_secret")
        self.token_id = credentials.get("token_id")
        self.token_secret = credentials.get("token_secret")
        self.base_url = f"https://{account_id}.suitetalk.api.netsuite.com"
    
    async def fetch_invoices(
        self,
        start_date: date,
        end_date: date,
        filters: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        """Fetch invoices from NetSuite using REST API."""
        # Implementation using NetSuite REST API
        # Query Invoice records with date filters
        pass
    
    def normalize_invoice(self, raw_record: Dict[str, Any]) -> Dict[str, Any]:
        """Convert NetSuite Invoice record to standard format."""
        return {
            "invoice_date": raw_record.get("trandate"),
            "invoice_number": raw_record.get("tranid"),
            "customer": raw_record.get("entity", {}).get("name"),
            "description": raw_record.get("memo"),
            "amount": raw_record.get("amount"),
            "currency": raw_record.get("currency", {}).get("name"),
            "line_items": [
                {
                    "description": item.get("item", {}).get("name"),
                    "quantity": item.get("quantity"),
                    "rate": item.get("rate"),
                    "amount": item.get("amount"),
                }
                for item in raw_record.get("item", [])
            ],
        }
```

#### 2.2 API Routes

```python
# contractguard-api/app/routes/erp.py
from fastapi import APIRouter, Depends, HTTPException
from app.auth import require_user
from app.services.erp.connection_manager import ERPConnectionManager

router = APIRouter(prefix="/api/v1/erp", tags=["erp"])

@router.post("/connections")
async def create_connection(
    erp_type: str,
    connection_name: str,
    credentials: dict,
    current_user=Depends(require_user)
):
    """Create new ERP connection."""
    manager = ERPConnectionManager()
    connection = await manager.create_connection(
        organization_id=current_user.get("organization_id"),
        erp_type=erp_type,
        connection_name=connection_name,
        credentials=credentials
    )
    return connection

@router.post("/connections/{connection_id}/sync")
async def trigger_sync(
    connection_id: str,
    job_id: str,
    date_range: dict,
    current_user=Depends(require_user)
):
    """Manually trigger ERP sync for a job."""
    manager = ERPConnectionManager()
    sync_job = await manager.sync_to_job(
        connection_id=connection_id,
        job_id=job_id,
        start_date=date_range["start_date"],
        end_date=date_range["end_date"]
    )
    return sync_job
```

### Phase 3: Frontend Integration (Week 3-4)

#### 3.1 Upload Page Enhancement

Add ERP connection option to Upload page:

```tsx
// src/pages/Upload.tsx additions

const [erpConnections, setErpConnections] = useState<ERPConnection[]>([]);
const [showERPConnect, setShowERPConnect] = useState(false);

// Add ERP connection button next to file upload
<Button onClick={() => setShowERPConnect(true)}>
  <Link className="mr-2" /> Connect ERP System
</Button>

// ERP Connection Dialog
<Dialog open={showERPConnect}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Connect ERP System</DialogTitle>
    </DialogHeader>
    <ERPConnectionForm
      onSuccess={(connection) => {
        setErpConnections([...erpConnections, connection]);
        setShowERPConnect(false);
      }}
    />
  </DialogContent>
</Dialog>
```

#### 3.2 New Component: ERPConnectionForm

```tsx
// src/components/ERPConnectionForm.tsx
// Form to connect NetSuite, SAP, Oracle, etc.
// OAuth flow for supported ERPs
// API key input for others
```

### Phase 4: Background Sync Workers (Week 4-5)

#### 4.1 Celery Task for ERP Sync

```python
# contractguard-api/app/workers/tasks.py additions

@celery_app.task
def sync_erp_to_job(connection_id: str, job_id: str, start_date: str, end_date: str):
    """
    Background task to sync ERP data to audit job.
    """
    from app.services.erp.connection_manager import ERPConnectionManager
    
    manager = ERPConnectionManager()
    sync_job = manager.sync_to_job(
        connection_id=connection_id,
        job_id=job_id,
        start_date=date.fromisoformat(start_date),
        end_date=date.fromisoformat(end_date)
    )
    
    # Convert ERP data to CSV format (reuse existing pipeline)
    # Store as billing files
    # Trigger reconciliation
    
    return sync_job.id
```

#### 4.2 Scheduled Syncs

```python
# contractguard-api/app/workers/tasks.py

@celery_app.task
def run_scheduled_erp_syncs():
    """Run scheduled ERP syncs for all active connections."""
    from app.services.erp.connection_manager import ERPConnectionManager
    
    manager = ERPConnectionManager()
    connections = manager.get_active_connections()
    
    for connection in connections:
        if connection.should_sync_now():  # Based on sync frequency
            sync_erp_to_job.delay(
                connection_id=connection.id,
                job_id=connection.create_audit_job(),
                start_date=connection.get_last_sync_date(),
                end_date=date.today()
            )
```

## Priority ERP Systems

### Tier 1 (Implement First)
1. **NetSuite** ⭐ (Already mentioned in codebase)
   - Market: Mid-market to enterprise
   - API: REST Web Services (OAuth 2.0)
   - Complexity: Medium
   - ROI: High (many SaaS companies use NetSuite)

2. **SAP** ⭐
   - Market: Large enterprise
   - API: OData, REST API
   - Complexity: High (complex auth)
   - ROI: Very High (Fortune 500)

### Tier 2 (Implement Next)
3. **Oracle ERP Cloud**
   - Market: Large enterprise
   - API: REST API (OAuth 2.0)
   - Complexity: Medium-High

4. **Microsoft Dynamics 365 Finance**
   - Market: Mid-market to enterprise
   - API: OData, REST API
   - Complexity: Medium

### Tier 3 (Future)
5. **Sage Intacct**
6. **Workday Financial Management**
7. **Acumatica**

## Technical Considerations

### Security
- ✅ **Encrypt credentials**: Store OAuth tokens encrypted at rest
- ✅ **OAuth 2.0**: Use standard OAuth for supported ERPs
- ✅ **API keys**: Secure storage for API key-based auth
- ✅ **Scoped access**: Request minimal permissions needed

### Error Handling
- ✅ **Retry logic**: Exponential backoff for API failures
- ✅ **Rate limiting**: Respect ERP API rate limits
- ✅ **Connection health**: Monitor and alert on connection failures
- ✅ **Data validation**: Validate fetched data before processing

### Performance
- ✅ **Pagination**: Handle large datasets with pagination
- ✅ **Incremental sync**: Only fetch new/changed records
- ✅ **Async processing**: Use Celery for background syncs
- ✅ **Caching**: Cache connection status and metadata

### Data Format Standardization
- ✅ **Normalize early**: Convert ERP format to standard format immediately
- ✅ **Field mapping**: Allow users to map custom fields
- ✅ **Date handling**: Handle timezone and format differences
- ✅ **Currency conversion**: Support multi-currency

## Migration Path

### Backward Compatibility
- ✅ Keep existing file upload functionality
- ✅ Allow users to choose: "Upload File" or "Connect ERP"
- ✅ Support both methods in same job (merge data)

### Rollout Strategy
1. **Beta**: NetSuite integration for select customers
2. **GA**: NetSuite + SAP for enterprise tier
3. **Expansion**: Add more ERPs based on customer demand

## Success Metrics

- **Adoption**: % of enterprise customers using ERP integration
- **Time saved**: Reduction in manual upload time
- **Error reduction**: Fewer data import errors
- **Retention**: Higher retention for ERP-connected customers
- **Upsell**: Conversion from manual to automated workflows

## Estimated Effort

- **Phase 1 (Foundation)**: 2 weeks
- **Phase 2 (NetSuite)**: 2 weeks
- **Phase 3 (Frontend)**: 1 week
- **Phase 4 (Workers)**: 1 week
- **Testing & Polish**: 1 week

**Total: ~7 weeks for MVP (NetSuite only)**

## Next Steps

1. ✅ Review and approve architecture
2. ✅ Create database migrations
3. ✅ Implement base adapter interface
4. ✅ Build NetSuite adapter (MVP)
5. ✅ Add frontend connection UI
6. ✅ Test with beta customers
7. ✅ Expand to additional ERPs

