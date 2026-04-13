"""initial schema 8 tables

Revision ID: 0001
Revises:
Create Date: 2026-04-13 08:12:51.902425

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '0001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Users
    op.create_table(
        'users',
        sa.Column('id', sa.UUID(), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('email', sa.String(255), nullable=False),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('role', sa.String(50), nullable=False),
        sa.Column('password_hash', sa.String(255), nullable=False),
        sa.Column('telegram_chat_id', sa.BigInteger(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('email'),
    )

    # Patients
    op.create_table(
        'patients',
        sa.Column('id', sa.UUID(), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('external_id', sa.String(100), nullable=True),
        sa.Column('name', sa.String(255), nullable=False),
        sa.Column('phone', sa.String(50), nullable=True),
        sa.Column('email', sa.String(255), nullable=True),
        sa.Column('birth_date', sa.Date(), nullable=True),
        sa.Column('source_channel', sa.String(50), nullable=True),
        sa.Column('is_new_patient', sa.Boolean(), server_default=sa.text('true'), nullable=False),
        sa.Column('last_visit_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('total_revenue', sa.Numeric(12, 2), server_default=sa.text('0'), nullable=False),
        sa.Column('ltv_score', sa.Integer(), nullable=True),
        sa.Column('tags', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('raw_1denta_data', postgresql.JSONB(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('external_id'),
    )
    op.create_index('idx_patients_phone', 'patients', ['phone'])
    op.create_index('idx_patients_external', 'patients', ['external_id'])

    # Communications
    op.create_table(
        'communications',
        sa.Column('id', sa.UUID(), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('patient_id', sa.UUID(), nullable=True),
        sa.Column('channel', sa.String(50), nullable=False),
        sa.Column('direction', sa.String(20), nullable=False),
        sa.Column('type', sa.String(30), nullable=False),
        sa.Column('content', sa.Text(), nullable=True),
        sa.Column('media_url', sa.String(500), nullable=True),
        sa.Column('duration_sec', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(30), server_default=sa.text("'new'"), nullable=False),
        sa.Column('priority', sa.String(20), server_default=sa.text("'normal'"), nullable=False),
        sa.Column('ai_tags', postgresql.ARRAY(sa.Text()), nullable=True),
        sa.Column('ai_summary', sa.Text(), nullable=True),
        sa.Column('ai_next_action', sa.Text(), nullable=True),
        sa.Column('external_id', sa.String(100), nullable=True),
        sa.Column('assigned_to', sa.UUID(), nullable=True),
        sa.Column('responded_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['assigned_to'], ['users.id']),
    )
    op.create_index('idx_communications_patient', 'communications', ['patient_id'])
    op.create_index('idx_communications_status', 'communications', ['status'])
    op.create_index('idx_communications_created', 'communications', ['created_at'], postgresql_using='btree')

    # Deals
    op.create_table(
        'deals',
        sa.Column('id', sa.UUID(), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('patient_id', sa.UUID(), nullable=True),
        sa.Column('title', sa.String(255), nullable=False),
        sa.Column('stage', sa.String(50), server_default=sa.text("'new'"), nullable=False),
        sa.Column('amount', sa.Numeric(12, 2), nullable=True),
        sa.Column('service', sa.String(255), nullable=True),
        sa.Column('doctor_name', sa.String(255), nullable=True),
        sa.Column('branch', sa.String(255), nullable=True),
        sa.Column('assigned_to', sa.UUID(), nullable=True),
        sa.Column('source_channel', sa.String(50), nullable=True),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('lost_reason', sa.String(255), nullable=True),
        sa.Column('stage_changed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('closed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['assigned_to'], ['users.id']),
    )
    op.create_index('idx_deals_stage', 'deals', ['stage'])
    op.create_index('idx_deals_patient', 'deals', ['patient_id'])

    # Deal Stage History
    op.create_table(
        'deal_stage_history',
        sa.Column('id', sa.UUID(), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('deal_id', sa.UUID(), nullable=False),
        sa.Column('from_stage', sa.String(50), nullable=True),
        sa.Column('to_stage', sa.String(50), nullable=True),
        sa.Column('changed_by', sa.UUID(), nullable=True),
        sa.Column('comment', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id']),
        sa.ForeignKeyConstraint(['changed_by'], ['users.id']),
    )

    # Appointments
    op.create_table(
        'appointments',
        sa.Column('id', sa.UUID(), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('external_id', sa.String(100), nullable=True),
        sa.Column('patient_id', sa.UUID(), nullable=True),
        sa.Column('doctor_name', sa.String(255), nullable=True),
        sa.Column('doctor_id', sa.String(100), nullable=True),
        sa.Column('service', sa.String(255), nullable=True),
        sa.Column('branch', sa.String(255), nullable=True),
        sa.Column('scheduled_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('duration_min', sa.Integer(), server_default=sa.text('30'), nullable=False),
        sa.Column('status', sa.String(30), nullable=True),
        sa.Column('no_show_risk', sa.Integer(), nullable=True),
        sa.Column('revenue', sa.Numeric(12, 2), nullable=True),
        sa.Column('synced_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('external_id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
    )
    op.create_index('idx_appointments_scheduled', 'appointments', ['scheduled_at'])

    # Tasks
    op.create_table(
        'tasks',
        sa.Column('id', sa.UUID(), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('patient_id', sa.UUID(), nullable=True),
        sa.Column('deal_id', sa.UUID(), nullable=True),
        sa.Column('comm_id', sa.UUID(), nullable=True),
        sa.Column('assigned_to', sa.UUID(), nullable=True),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('type', sa.String(50), nullable=True),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('due_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('done_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('is_done', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['patient_id'], ['patients.id']),
        sa.ForeignKeyConstraint(['deal_id'], ['deals.id']),
        sa.ForeignKeyConstraint(['comm_id'], ['communications.id']),
        sa.ForeignKeyConstraint(['assigned_to'], ['users.id']),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
    )

    # Notifications
    op.create_table(
        'notifications',
        sa.Column('id', sa.UUID(), nullable=False, default=sa.text('gen_random_uuid()')),
        sa.Column('user_id', sa.UUID(), nullable=True),
        sa.Column('type', sa.String(50), nullable=True),
        sa.Column('title', sa.String(255), nullable=True),
        sa.Column('body', sa.Text(), nullable=True),
        sa.Column('link', sa.String(500), nullable=True),
        sa.Column('is_read', sa.Boolean(), server_default=sa.text('false'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
    )


def downgrade() -> None:
    op.drop_table('notifications')
    op.drop_table('tasks')
    op.drop_table('appointments')
    op.drop_table('deal_stage_history')
    op.drop_table('deals')
    op.drop_table('communications')
    op.drop_table('patients')
    op.drop_table('users')
