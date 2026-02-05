from sqlalchemy import (
    Column,
    Integer,
    String,
    Boolean,
    JSON,
    DateTime,
    ForeignKey,
    Text,
    Index,
)
from sqlalchemy.orm import relationship
from datetime import datetime
from .database import Base


class ImageItem(Base):
    __tablename__ = "image_items"

    id = Column(Integer, primary_key=True, index=True)
    file_path = Column(String, unique=True, index=True)
    file_type = Column(String)  # image, video

    # Relationships
    proposals = relationship("MaskProposal", back_populates="image")


class MaskProposal(Base):
    __tablename__ = "mask_proposals"

    id = Column(Integer, primary_key=True, index=True)
    image_id = Column(Integer, ForeignKey("image_items.id"), index=True)  # Add index

    prompt_text = Column(String)
    prompt_type = Column(String)  # txt, click, box

    # Mask data stored as JSON (RLE or Polygon) - for SQLite implies simple storage
    # In production, blobs or external files are better for masks
    mask_data = Column(JSON)

    score = Column(Integer)  # Confidence score 0-100

    status = Column(String, default="pending", index=True)  # Add index for faster queries

    is_exhaustive = Column(
        Boolean, default=False
    )  # If this mask completes the prompt for this image

    created_at = Column(DateTime, default=datetime.utcnow)

    image = relationship("ImageItem", back_populates="proposals")

    # Composite index for common query patterns
    __table_args__ = (
        Index('idx_proposal_status_image', 'status', 'image_id'),
    )

