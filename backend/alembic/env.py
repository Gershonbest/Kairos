"""Alembic migration environment and database connection setup."""

from logging.config import fileConfig
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from alembic import context
from sqlalchemy import engine_from_config, pool

from app.core.config import get_settings
from app.infra.models import Base


def migration_database_url(database_url: str) -> str:
    """Convert async app URLs into a sync driver URL for Alembic."""
    sync_url = database_url.replace("+asyncpg", "").replace("+aiosqlite", "")
    if not sync_url.startswith("postgresql"):
        return sync_url

    parsed = urlparse(sync_url)
    query = [
        (key, value)
        for key, value in parse_qsl(parsed.query, keep_blank_values=True)
        if key != "channel_binding"
    ]
    return urlunparse(parsed._replace(query=urlencode(query)))


config = context.config
settings = get_settings()
config.set_main_option("sqlalchemy.url", migration_database_url(settings.database_url))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata, compare_type=True)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
