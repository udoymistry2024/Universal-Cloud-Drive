import os
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    TELEGRAM_API_ID: int
    TELEGRAM_API_HASH: str
    TELEGRAM_BOT_TOKEN: str
    OTP_TELEGRAM_BOT_TOKEN: str
    TICKET_TELEGRAM_BOT_TOKEN: str
    TELEGRAM_CHANNEL_ID: int
    ADMIN_TELEGRAM_ID: Optional[int] = None

    # DataForge PostgreSQL Database Connection
    DATAFORGE_DB_HOST: str = "localhost"
    DATAFORGE_DB_PORT: int = 5432
    DATAFORGE_DB_NAME: str = "u_claude_drive"
    DATAFORGE_DB_USER: str = "postgres"
    DATAFORGE_DB_PASSWORD: str = "dataforge_secure_2026"

    JWT_SECRET_KEY: str = "0f9c56d1aba6662cd4ae907179bb59ae95af9fe4c626d6320da66df1730e2f4d"

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(os.path.dirname(__file__)), ".env"),
        env_file_encoding="utf-8",
        extra="ignore"
    )

settings = Settings()
