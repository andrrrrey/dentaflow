"""Add discount, payment_amount, services_data to appointments

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("appointments", sa.Column("discount", sa.Numeric(10, 2), nullable=True))
    op.add_column("appointments", sa.Column("payment_amount", sa.Numeric(12, 2), nullable=True))
    op.add_column("appointments", sa.Column("services_data", JSONB(), nullable=True))


def downgrade() -> None:
    op.drop_column("appointments", "discount")
    op.drop_column("appointments", "payment_amount")
    op.drop_column("appointments", "services_data")
