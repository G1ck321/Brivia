"""
Bills router: provider-facing bill management endpoints.
"""

from fastapi import APIRouter, Depends, HTTPException, status

from app.routers.auth import get_current_user
from app.schema.schemas import BillCreate, BillResponse, BillShareResponse
from app.services.bill_service import (
    create_bill,
    get_bills_for_provider,
    get_bill_by_id,
    get_bills_for_patient,
    create_share_link,
)

router = APIRouter(prefix="/bills", tags=["Bills"])


@router.post("", response_model=BillResponse, status_code=status.HTTP_201_CREATED)
@router.post("/", response_model=BillResponse, status_code=status.HTTP_201_CREATED, include_in_schema=False)
async def create_new_bill(
    data: BillCreate,
    user: dict = Depends(get_current_user),
):
    """Create a new healthcare bill. Only providers can create bills."""
    if user["role"] != "provider":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only healthcare providers can create bills.",
        )
    return await create_bill(provider_id=user["id"], data=data)


@router.get("", response_model=list[BillResponse])
@router.get("/", response_model=list[BillResponse], include_in_schema=False)
async def list_my_bills(user: dict = Depends(get_current_user)):
    """List bills for the authenticated user."""
    if user["role"] == "provider":
        return await get_bills_for_provider(user["id"])
    return await get_bills_for_patient(user["name"])


@router.get("/{bill_id}", response_model=BillResponse)
async def get_bill(bill_id: str, user: dict = Depends(get_current_user)):
    """Get a specific bill by ID."""
    bill = await get_bill_by_id(bill_id)
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found.")
    return bill


@router.post("/{bill_id}/share", response_model=BillShareResponse)
async def share_bill(bill_id: str, user: dict = Depends(get_current_user)):
    """Generate a shareable link for a bill."""
    bill = await get_bill_by_id(bill_id)
    if not bill:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bill not found.")
    if bill.provider_id != user["id"] and user["role"] != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only share bills you created.",
        )
    return await create_share_link(bill_id)
