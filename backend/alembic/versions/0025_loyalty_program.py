"""Patient loyalty program: bonus balance + referral code on patients,
loyalty_transactions ledger and patient_reviews tables.

Revision ID: 0025_loyalty_program
Revises: 0024_patient_representative
Create Date: 2026-07-18
"""

from alembic import op

revision = "0025_loyalty_program"
down_revision = "0024_patient_representative"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- patients: bonus balance + referral code ---
    op.execute(
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS bonus_balance INTEGER NOT NULL DEFAULT 0"
    )
    op.execute(
        "ALTER TABLE patients ADD COLUMN IF NOT EXISTS referral_code VARCHAR(16) NULL"
    )
    op.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS ix_patients_referral_code "
        "ON patients (referral_code)"
    )

    # --- patient_reviews (created first: loyalty_transactions FKs to it) ---
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS patient_reviews (
            id UUID PRIMARY KEY,
            patient_id UUID NULL REFERENCES patients(id) ON DELETE SET NULL,
            channel VARCHAR(20) NULL,
            image_url VARCHAR(500) NOT NULL,
            status VARCHAR(20) NOT NULL DEFAULT 'pending',
            points_awarded INTEGER NULL,
            reviewed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            reviewed_at TIMESTAMPTZ NULL
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_patient_reviews_patient_id ON patient_reviews (patient_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_patient_reviews_status ON patient_reviews (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_patient_reviews_created_at ON patient_reviews (created_at)")

    # --- loyalty_transactions (points ledger) ---
    op.execute(
        """
        CREATE TABLE IF NOT EXISTS loyalty_transactions (
            id UUID PRIMARY KEY,
            patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
            action_type VARCHAR(50) NOT NULL,
            points INTEGER NOT NULL,
            description VARCHAR(500) NULL,
            source_appointment_id UUID NULL REFERENCES appointments(id) ON DELETE SET NULL,
            review_id UUID NULL REFERENCES patient_reviews(id) ON DELETE SET NULL,
            created_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        )
        """
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_loyalty_transactions_patient_id ON loyalty_transactions (patient_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_loyalty_transactions_source_appointment_id ON loyalty_transactions (source_appointment_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_loyalty_transactions_created_at ON loyalty_transactions (created_at)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS loyalty_transactions")
    op.execute("DROP TABLE IF EXISTS patient_reviews")
    op.execute("DROP INDEX IF EXISTS ix_patients_referral_code")
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS referral_code")
    op.execute("ALTER TABLE patients DROP COLUMN IF EXISTS bonus_balance")
