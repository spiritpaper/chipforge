"""Alembic environment: migrations run from the app (db.migrate) or the CLI."""

from alembic import context
from sqlalchemy import create_engine

from app.db import Base

config = context.config
url = config.get_main_option("sqlalchemy.url")


def run() -> None:
    args = {"check_same_thread": False} if url.startswith("sqlite") else {}
    engine = create_engine(url, connect_args=args)
    with engine.connect() as connection:
        # Batch mode lets SQLite alter tables in later migrations.
        context.configure(
            connection=connection, target_metadata=Base.metadata, render_as_batch=True
        )
        with context.begin_transaction():
            context.run_migrations()


run()
