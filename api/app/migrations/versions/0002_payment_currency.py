"""Payments in any currency: decimal amounts and a currency per payment (for BTCPay).

Revision ID: 0002
Revises: 0001
"""

import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("payments") as batch:
        batch.alter_column("amount", type_=sa.String(32), existing_type=sa.Integer())
        # Every payment before this was through ZarinPal, in Rial.
        batch.add_column(sa.Column("currency", sa.String(8), nullable=False, server_default="IRR"))


def downgrade() -> None:
    with op.batch_alter_table("payments") as batch:
        batch.drop_column("currency")
        batch.alter_column("amount", type_=sa.Integer(), existing_type=sa.String(32))
