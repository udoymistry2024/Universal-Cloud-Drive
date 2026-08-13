"""
DataForge PostgreSQL Database Client
=====================================
Direct PostgreSQL connection to DataForge-managed database (u_claude_drive).
Implements the same .table().select().eq().execute() chaining API as the
previous Supabase/SQLite clients, so all route files remain untouched.
"""

import uuid
import jwt
import logging
import psycopg2
import psycopg2.extras
import psycopg2.pool
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from app.config import settings

logger = logging.getLogger("CloudDrive.Database")


# ─── SCHEMA AUTO-CREATION SQL ─────────────────────────────────────────
SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    storage_limit BIGINT DEFAULT 32212254720,
    used_storage BIGINT DEFAULT 0,
    is_banned BOOLEAN DEFAULT FALSE,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    is_trash BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT FALSE,
    share_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    size BIGINT NOT NULL,
    mime_type TEXT,
    telegram_message_id BIGINT NOT NULL,
    telegram_file_id TEXT NOT NULL,
    is_starred BOOLEAN DEFAULT FALSE,
    is_trash BOOLEAN DEFAULT FALSE,
    is_shared BOOLEAN DEFAULT FALSE,
    share_token TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);
CREATE INDEX IF NOT EXISTS idx_users_telegram_username ON users(telegram_username);
"""


class DataForgeClient:
    """
    PostgreSQL Database Client connected to DataForge-managed database.
    Provides the same .table().select().eq().execute() chaining interface
    as the previous Supabase/SQLite clients for drop-in compatibility.
    """

    def __init__(self):
        self.pool = psycopg2.pool.ThreadedConnectionPool(
            minconn=2,
            maxconn=20,
            host=settings.DATAFORGE_DB_HOST,
            port=settings.DATAFORGE_DB_PORT,
            database=settings.DATAFORGE_DB_NAME,
            user=settings.DATAFORGE_DB_USER,
            password=settings.DATAFORGE_DB_PASSWORD,
        )
        self._init_database()

    def _get_connection(self):
        conn = self.pool.getconn()
        conn.autocommit = False
        return conn

    def _put_connection(self, conn):
        try:
            self.pool.putconn(conn)
        except Exception:
            pass

    def _init_database(self):
        """Auto-create tables and indexes on startup using the schema SQL."""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute(SCHEMA_SQL)
            conn.commit()
            logger.info(f"[DATAFORGE] Database initialized: {settings.DATAFORGE_DB_NAME}@{settings.DATAFORGE_DB_HOST}:{settings.DATAFORGE_DB_PORT}")
        except Exception as e:
            if conn:
                conn.rollback()
            logger.error(f"[DATAFORGE_INIT_ERROR] {e}", exc_info=True)
        finally:
            if conn:
                self._put_connection(conn)

    def health_check(self) -> bool:
        """Ping the PostgreSQL database to verify connectivity."""
        conn = None
        try:
            conn = self._get_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT 1")
            conn.commit()
            return True
        except Exception as e:
            logger.error(f"[DATAFORGE] Health check failed: {e}")
            return False
        finally:
            if conn:
                self._put_connection(conn)

    class TableQueryBuilder:
        """
        Query builder that chains .select(), .insert(), .update(), .delete(),
        .eq(), .neq(), .is_(), .lt(), .gt(), .in_(), .order(), .lte(), .gte()
        and executes against PostgreSQL.
        """

        def __init__(self, db_client: 'DataForgeClient', table_name: str):
            self.db = db_client
            self.table_name = table_name
            self.action = "SELECT"
            self.select_cols = "*"
            self.where_clauses: List[str] = []
            self.params: List[Any] = []
            self.json_data: Optional[Dict] = None
            self.order_clause = ""

        def select(self, columns: str = "*"):
            self.action = "SELECT"
            self.select_cols = columns
            return self

        def insert(self, data: Any):
            self.action = "INSERT"
            self.json_data = data
            return self

        def update(self, data: Any):
            self.action = "UPDATE"
            self.json_data = data
            return self

        def delete(self):
            self.action = "DELETE"
            return self

        def _add_where(self, clause: str, value: Any = None):
            self.where_clauses.append(clause)
            if value is not None:
                self.params.append(value)

        def eq(self, column: str, value: Any):
            if value is None:
                self._add_where(f'"{column}" IS NULL')
            else:
                self._add_where(f'"{column}" = %s', value)
            return self

        def neq(self, column: str, value: Any):
            if value is None:
                self._add_where(f'"{column}" IS NOT NULL')
            else:
                self._add_where(f'"{column}" != %s', value)
            return self

        def is_(self, column: str, value: str):
            val_str = str(value).lower()
            if val_str in ("null", "none"):
                self._add_where(f'"{column}" IS NULL')
            elif val_str == "not_null":
                self._add_where(f'"{column}" IS NOT NULL')
            elif val_str in ("true", "false"):
                self._add_where(f'"{column}" = %s', val_str == "true")
            else:
                self._add_where(f'"{column}" = %s', value)
            return self

        def lt(self, column: str, value: Any):
            self._add_where(f'"{column}" < %s', value)
            return self

        def lte(self, column: str, value: Any):
            self._add_where(f'"{column}" <= %s', value)
            return self

        def gt(self, column: str, value: Any):
            self._add_where(f'"{column}" > %s', value)
            return self

        def gte(self, column: str, value: Any):
            self._add_where(f'"{column}" >= %s', value)
            return self

        def in_(self, column: str, list_values: List[Any]):
            if not list_values:
                self._add_where("FALSE")
                return self
            placeholders = ", ".join(["%s"] * len(list_values))
            self.where_clauses.append(f'"{column}" IN ({placeholders})')
            self.params.extend(list_values)
            return self

        def order(self, column: str, desc: bool = False):
            direction = "DESC" if desc else "ASC"
            self.order_clause = f' ORDER BY "{column}" {direction}'
            return self

        def execute(self):
            """Execute the built query and return a Result object with .data attribute."""

            class Res:
                def __init__(self, data):
                    self.data = data

            conn = None
            try:
                conn = self.db._get_connection()
                cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                where_sql = (" WHERE " + " AND ".join(self.where_clauses)) if self.where_clauses else ""

                if self.action == "SELECT":
                    query = f'SELECT {self.select_cols} FROM "{self.table_name}"{where_sql}{self.order_clause}'
                    cursor.execute(query, self.params)
                    rows = cursor.fetchall()
                    conn.commit()
                    result = [self._normalize_row(dict(r)) for r in rows]
                    return Res(result)

                elif self.action == "INSERT":
                    data_dict = dict(self.json_data) if isinstance(self.json_data, dict) else {}
                    if "id" not in data_dict or not data_dict["id"]:
                        data_dict["id"] = str(uuid.uuid4())

                    now_iso = datetime.now(timezone.utc).isoformat()
                    if "created_at" not in data_dict or not data_dict["created_at"]:
                        data_dict["created_at"] = now_iso
                    if self.table_name in ("folders", "files") and ("updated_at" not in data_dict or not data_dict["updated_at"]):
                        data_dict["updated_at"] = now_iso

                    cols = list(data_dict.keys())
                    vals = [data_dict[k] for k in cols]
                    col_names = ", ".join([f'"{c}"' for c in cols])
                    placeholders = ", ".join(["%s"] * len(cols))

                    query = f'INSERT INTO "{self.table_name}" ({col_names}) VALUES ({placeholders}) RETURNING *'
                    cursor.execute(query, vals)
                    row = cursor.fetchone()
                    conn.commit()
                    return Res([self._normalize_row(dict(row))] if row else [data_dict])

                elif self.action == "UPDATE":
                    data_dict = dict(self.json_data) if isinstance(self.json_data, dict) else {}
                    if not data_dict:
                        conn.commit()
                        return Res([])

                    if self.table_name in ("folders", "files") and "updated_at" not in data_dict:
                        data_dict["updated_at"] = datetime.now(timezone.utc).isoformat()

                    set_parts = []
                    update_params = []
                    for k, v in data_dict.items():
                        set_parts.append(f'"{k}" = %s')
                        update_params.append(v)

                    query = f'UPDATE "{self.table_name}" SET {", ".join(set_parts)}{where_sql} RETURNING *'
                    cursor.execute(query, update_params + self.params)
                    rows = cursor.fetchall()
                    conn.commit()
                    return Res([self._normalize_row(dict(r)) for r in rows])

                elif self.action == "DELETE":
                    # Fetch matching records before deletion
                    select_query = f'SELECT * FROM "{self.table_name}"{where_sql}'
                    cursor.execute(select_query, self.params)
                    matching_rows = [self._normalize_row(dict(r)) for r in cursor.fetchall()]

                    delete_query = f'DELETE FROM "{self.table_name}"{where_sql}'
                    cursor.execute(delete_query, self.params)
                    conn.commit()

                    return Res(matching_rows if matching_rows else [{"status": "success"}])

                conn.commit()
                return Res([])

            except Exception as err:
                if conn:
                    try:
                        conn.rollback()
                    except Exception:
                        pass
                logger.error(f"[DATAFORGE_QUERY_ERROR] Table {self.table_name} Action {self.action}: {err}", exc_info=True)
                return Res([])
            finally:
                if conn:
                    self.db._put_connection(conn)

        def _normalize_row(self, row: dict) -> dict:
            """Convert PostgreSQL row types to JSON-serializable Python types."""
            for key, value in row.items():
                if isinstance(value, datetime):
                    row[key] = value.isoformat()
                elif isinstance(value, uuid.UUID):
                    row[key] = str(value)
            return row

    def table(self, table_name: str):
        return self.TableQueryBuilder(self, table_name)


def decode_jwt_token(token: str) -> Optional[dict]:
    """Decode and verify a custom JWT token. Returns payload dict or None."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        logger.warning("JWT token has expired.")
        return None
    except jwt.InvalidTokenError as e:
        logger.warning(f"Invalid JWT token: {e}")
        return None


# ─── INITIALIZE GLOBAL DATABASE CLIENT ─────────────────────────────────
supabase_admin = DataForgeClient()
logger.info(f"⚡ Database Provider: DataForge PostgreSQL ({settings.DATAFORGE_DB_NAME}@{settings.DATAFORGE_DB_HOST}:{settings.DATAFORGE_DB_PORT})")
