import json
import os

SETTINGS_FILE = os.path.join(os.path.dirname(__file__), "system_settings.json")
DEFAULT_30_GB_BYTES = 30 * 1024 * 1024 * 1024  # 32,212,254,720 bytes

def load_system_settings() -> dict:
    default_settings = {
        "signup_enabled": True,
        "default_storage_limit": DEFAULT_30_GB_BYTES
    }
    if not os.path.exists(SETTINGS_FILE):
        save_system_settings(default_settings)
        return default_settings
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return {**default_settings, **data}
    except Exception as e:
        print(f"Error loading system settings: {e}")
        return default_settings

def save_system_settings(settings_dict: dict):
    try:
        with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
            json.dump(settings_dict, f, indent=2)
    except Exception as e:
        print(f"Error saving system settings: {e}")

def is_signup_enabled() -> bool:
    settings = load_system_settings()
    return settings.get("signup_enabled", True)

def set_signup_enabled(enabled: bool):
    settings = load_system_settings()
    settings["signup_enabled"] = enabled
    save_system_settings(settings)

def get_default_storage_limit() -> int:
    settings = load_system_settings()
    return int(settings.get("default_storage_limit", DEFAULT_30_GB_BYTES))

def set_default_storage_limit(limit_bytes: int):
    settings = load_system_settings()
    settings["default_storage_limit"] = int(limit_bytes)
    save_system_settings(settings)
