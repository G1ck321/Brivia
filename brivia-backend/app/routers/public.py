"""
Public router: unauthenticated endpoints for bill sharing and contributor payments.
"""

from fastapi import APIRouter, HTTPException, status

from app.schema.schemas import (
    PublicBillResponse,
    PaymentCreate,
    PaymentResponse,
)
from app.services.bill_service import get_public_bill_by_token
from app.services.payment_service import initiate_contribution

router = APIRouter(prefix="/public", tags=["Public"])


@router.get("/bills/{share_token}", response_model=PublicBillResponse)
async def get_public_bill(share_token: str):
    """
    Get limited bill information via a share token.
    This is the endpoint contributors hit when they open a shared link.
    No authentication required.
    """
    result = await get_public_bill_by_token(share_token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This bill link is invalid or has expired.",
        )
    return result[0]


@router.post("/bills/{share_token}/pay", response_model=PaymentResponse, status_code=status.HTTP_201_CREATED)
async def contribute_to_bill(share_token: str, data: PaymentCreate):
    """
    Make a contribution to a bill via its share token.
    No authentication required for contributors.
    """
    result = await get_public_bill_by_token(share_token)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="This bill link is invalid or has expired.",
        )

    _, bill_id = result

    try:
        return await initiate_contribution(
            bill_id=bill_id,
            data=data,
            contributor_id=None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
