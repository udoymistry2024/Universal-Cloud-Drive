import os
import math
import random
import asyncio
import time
import logging
from typing import AsyncGenerator, List, Dict
from telethon import TelegramClient, events, Button
from telethon.errors import FloodWaitError
from telethon.tl.functions.upload import SaveBigFilePartRequest, SaveFilePartRequest
from telethon.tl.types import InputFile, InputFileBig
from app.config import settings


logger = logging.getLogger("CloudDrive.Telegram")

def format_bytes_tg(bytes_num):
    if not bytes_num or bytes_num <= 0:
        return "0 B"
    if bytes_num >= 9000000000000000000:
        return "Unlimited"
    k = 1024
    sizes = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    num = float(bytes_num)
    while num >= k and i < len(sizes) - 1:
        num /= k
        i += 1
    return f"{num:.1f} {sizes[i]}"


class TelegramService:
    """Storage Bot Client — Dedicated for file uploads, downloads, channel storage, and Secret Admin Command Center."""
    def __init__(self):
        self.app = TelegramClient(
            "cloud_drive_telethon_session",
            settings.TELEGRAM_API_ID,
            settings.TELEGRAM_API_HASH,
            connection_retries=3,
            retry_delay=2
        )

        self._is_started = False
        self._is_events_registered = False
        self._processed_events = set()
        self.admin_pending_state = {}  # { admin_id: {"action": "...", "username": "..."} }
        self._download_semaphore = asyncio.Semaphore(40)
        self._upload_semaphore = asyncio.Semaphore(20)


    async def start(self):
        if not self._is_started:
            await self.app.start(bot_token=settings.TELEGRAM_BOT_TOKEN)
            self._is_started = True
            
            # Check if Telegram Bot handlers should be attached on this instance
            # Prevents duplicate bot menu replies when both Hugging Face Space and local dev run simultaneously
            should_attach = True
            enable_env = os.environ.get("ENABLE_TELEGRAM_BOT_LISTENER", "auto").lower()
            if enable_env == "false" or enable_env == "0":
                should_attach = False
            elif enable_env == "auto":
                is_hf_space = bool(os.environ.get("SPACE_ID") or os.environ.get("HF_SPACE_ID"))
                if not is_hf_space and os.environ.get("DISABLE_LOCAL_BOT_LISTENER", "true").lower() in ["true", "1"]:
                    should_attach = False

            if should_attach and not self._is_events_registered:
                self.app.add_event_handler(self._handle_admin_messages, events.NewMessage)
                self.app.add_event_handler(self._handle_admin_callbacks, events.CallbackQuery)
                self._is_events_registered = True
                print(f"[Admin Bot] Secret Admin Command Center listener attached to Storage Bot.")
            elif not should_attach:
                print(f"[Admin Bot] Standby instance: Bot listener suppressed (Primary instance is running on Cloud).")

            try:
                channel_id = int(settings.TELEGRAM_CHANNEL_ID)
                entity = await self.app.get_entity(channel_id)
                print(f"Storage Bot connected to Telegram channel: {getattr(entity, 'title', 'Private Channel')} ({channel_id})")
            except Exception as e:
                print(f"Warning: Could not fetch Telegram channel entity: {e}")

    async def stop(self):
        if self._is_started:
            await self.app.disconnect()
            self._is_started = False

    async def send_admin_alert(self, message_text: str):
        """Sends a storage request notification alert directly to ADMIN_TELEGRAM_ID."""
        await self.start()
        admin_id = settings.ADMIN_TELEGRAM_ID
        if not admin_id:
            print("Warning: ADMIN_TELEGRAM_ID not set in .env, skipping alert.")
            return False

        try:
            admin_peer = int(admin_id)
            entity = await self.app.get_entity(admin_peer)
            await self.app.send_message(entity, message_text, parse_mode="md")
            print(f"[Storage Bot] Sent admin storage upgrade alert to {admin_id}")
            return True
        except Exception as e:
            print(f"[Storage Bot] Failed to send alert via entity: {e}. Trying direct peer fallback...")
            try:
                await self.app.send_message(int(admin_id), message_text, parse_mode="md")
                return True
            except Exception as e2:
                print(f"[Storage Bot] Direct peer fallback send failed: {e2}")
                return False

    # ─── ADMIN BOT INTERACTIVE MENU HELPERS ──────────────────────────────

    async def _get_event_sender_id(self, event) -> int:
        sender_id = getattr(event, "sender_id", None)
        if not sender_id and hasattr(event, "user_id"):
            sender_id = event.user_id
        if not sender_id and hasattr(event, "query") and hasattr(event.query, "user_id"):
            sender_id = event.query.user_id
        if not sender_id:
            try:
                sender = await event.get_sender()
                if sender:
                    sender_id = sender.id
            except Exception:
                pass
        return sender_id

    def _is_admin(self, sender_id) -> bool:
        admin_id = settings.ADMIN_TELEGRAM_ID
        if not admin_id:
            return True  # Allow if ADMIN_TELEGRAM_ID not set
        if not sender_id:
            return True  # Fallback if sender_id couldn't be resolved
        try:
            return int(sender_id) == int(admin_id)
        except (ValueError, TypeError):
            return False

    async def _safe_edit(self, event, text, buttons=None):
        """Edits event message safely, suppressing MessageNotModifiedError."""
        try:
            await event.edit(text, buttons=buttons, parse_mode="md")
        except Exception as e:
            err_str = str(e).lower()
            if "not modified" not in err_str:
                print(f"[Admin Bot] Safe edit message error: {e}")

    async def _get_main_menu_payload(self):
        from app.system_config import is_signup_enabled, get_default_storage_limit
        signup_str = "🟢 Open" if is_signup_enabled() else "🔴 Paused"
        def_limit_str = format_bytes_tg(get_default_storage_limit())

        text = (
            "⚡ **Universal Cloud Drive — Secret Admin Control Center**\n\n"
            f"• **Signup Status:** {signup_str}\n"
            f"• **Default Quota:** `{def_limit_str}`\n\n"
            "Select an action below or search for a specific user:"
        )

        buttons = [
            [Button.inline("👥 Manage Users", data=b"menu:users"), Button.inline("🔍 Find User by Username", data=b"prompt_search_user")],
            [Button.inline("⚙️ System Settings", data=b"menu:settings"), Button.inline("📊 System Stats", data=b"menu:stats")],
            [Button.inline("🧹 Purge Channel & Reset DB", data=b"confirm_purge_channel")],
            [Button.inline("🔄 Refresh Menu", data=b"menu:main")]
        ]
        return text, buttons

    async def _get_users_list_payload(self):
        from app.supabase_client import supabase_admin
        res = supabase_admin.table("users").select("*").execute()
        users = res.data or []

        if not users:
            text = "👥 **Manage Users:** No users found in database."
            buttons = [
                [Button.inline("🔍 Find User by Username", data=b"prompt_search_user")],
                [Button.inline("« Back to Main Menu", data=b"menu:main")]
            ]
            return text, buttons

        text = f"👥 **Manage Users — Select a User ({len(users)} registered):**"
        buttons = []

        # Top search button
        buttons.append([Button.inline("🔍 Find User by Username", data=b"prompt_search_user")])

        for u in users:
            username = u.get("telegram_username", "unknown")
            used = format_bytes_tg(u.get("used_storage", 0))
            limit = format_bytes_tg(u.get("storage_limit", 32212254720))
            status_icon = "🔴" if u.get("is_banned") else "🟢"
            btn_label = f"{status_icon} @{username} — {used}/{limit}"
            buttons.append([Button.inline(btn_label, data=f"user:{username}".encode("utf-8"))])

        buttons.append([Button.inline("« Back to Main Menu", data=b"menu:main")])
        return text, buttons

    async def _get_user_detail_payload(self, username: str):
        clean_user = username.lstrip("@").lower().strip()
        from app.supabase_client import supabase_admin
        res = supabase_admin.table("users").select("*").eq("telegram_username", clean_user).execute()

        if not res.data:
            text = f"❌ User `@{clean_user}` not found in database."
            buttons = [
                [Button.inline("🔍 Search Another User", data=b"prompt_search_user")],
                [Button.inline("« Back to Users List", data=b"menu:users")]
            ]
            return text, buttons

        u = res.data[0]
        used_str = format_bytes_tg(u.get("used_storage", 0))
        limit_str = format_bytes_tg(u.get("storage_limit", 32212254720))
        is_banned = u.get("is_banned", False)
        status_str = "🔴 Banned" if is_banned else "🟢 Active"

        text = (
            f"👤 **User Profile: @{clean_user}**\n\n"
            f"• **User ID:** `{u.get('id')}`\n"
            f"• **Status:** {status_str}\n"
            f"• **Storage Used:** `{used_str}`\n"
            f"• **Storage Quota:** `{limit_str}`\n"
            f"• **Joined At:** `{u.get('created_at', 'N/A')}`\n"
            f"• **Last Activity:** `{u.get('last_login_at', 'N/A')}`"
        )

        ban_btn_label = "🟢 Unban User" if is_banned else "🔴 Ban User"
        ban_btn_data = f"toggle_ban:{clean_user}".encode("utf-8")

        buttons = [
            [Button.inline("📏 Change Storage Limit", data=f"set_limit_menu:{clean_user}".encode("utf-8"))],
            [Button.inline(ban_btn_label, data=ban_btn_data), Button.inline("🗑️ Delete Account", data=f"confirm_delete:{clean_user}".encode("utf-8"))],
            [Button.inline("🔍 Search Another User", data=b"prompt_search_user"), Button.inline("« Back to Users List", data=b"menu:users")]
        ]
        return text, buttons

    async def _get_set_limit_payload(self, username: str):
        clean_user = username.lstrip("@").lower().strip()
        from app.supabase_client import supabase_admin
        res = supabase_admin.table("users").select("storage_limit").eq("telegram_username", clean_user).execute()
        current_limit = format_bytes_tg(res.data[0].get("storage_limit", 0)) if res.data else "N/A"

        text = (
            f"📏 **Change Storage Limit for @{clean_user}**\n\n"
            f"Current Quota: `{current_limit}`\n\n"
            "Select a preset storage quota below, or click Custom to type in chat:"
        )

        buttons = [
            [Button.inline("10 GB", data=f"set_gb:{clean_user}:10".encode("utf-8")), Button.inline("30 GB", data=f"set_gb:{clean_user}:30".encode("utf-8")), Button.inline("50 GB", data=f"set_gb:{clean_user}:50".encode("utf-8"))],
            [Button.inline("100 GB", data=f"set_gb:{clean_user}:100".encode("utf-8")), Button.inline("500 GB", data=f"set_gb:{clean_user}:500".encode("utf-8")), Button.inline("♾️ Unlimited", data=f"set_gb:{clean_user}:unlimited".encode("utf-8"))],
            [Button.inline("✍️ Type Custom GB in Chat", data=f"prompt_custom_gb:{clean_user}".encode("utf-8"))],
            [Button.inline(f"« Back to @{clean_user} Profile", data=f"user:{clean_user}".encode("utf-8"))]
        ]
        return text, buttons

    async def _get_confirm_delete_payload(self, username: str):
        clean_user = username.lstrip("@").lower().strip()
        text = (
            f"⚠️ **CONFIRM PERMANENT ACCOUNT DELETION**\n\n"
            f"User: `@{clean_user}`\n\n"
            f"Are you sure you want to PERMANENTLY delete `@{clean_user}`?\n"
            f"• All files uploaded by `@{clean_user}` in Telegram channel will be **purged**.\n"
            f"• All database records, folders, and profile data will be **destroyed**.\n\n"
            f"⚠️ **This action is IRREVERSIBLE!**"
        )
        buttons = [
            [Button.inline("💥 YES, PERMANENTLY PURGE USER", data=f"do_delete:{clean_user}".encode("utf-8"))],
            [Button.inline("❌ Cancel & Go Back", data=f"user:{clean_user}".encode("utf-8"))]
        ]
        return text, buttons

    async def _get_settings_payload(self):
        from app.system_config import is_signup_enabled, get_default_storage_limit
        enabled = is_signup_enabled()
        status_str = "🟢 ACTIVE (Open for registration)" if enabled else "🔴 PAUSED (Registration blocked)"
        def_limit_str = format_bytes_tg(get_default_storage_limit())

        text = (
            "⚙️ **System Configuration Settings**\n\n"
            f"• **Signup Status:** {status_str}\n"
            f"• **Default Signup Quota:** `{def_limit_str}`\n\n"
            "Select an option to modify:"
        )

        signup_toggle_btn = Button.inline("🔴 Pause New Registrations", data=b"toggle_signup") if enabled else Button.inline("🟢 Resume New Registrations", data=b"toggle_signup")

        buttons = [
            [signup_toggle_btn],
            [Button.inline("📏 Change Default Signup Quota", data=b"menu:default_quota")],
            [Button.inline("« Back to Main Menu", data=b"menu:main")]
        ]
        return text, buttons

    async def _get_default_quota_payload(self):
        from app.system_config import get_default_storage_limit
        def_limit_str = format_bytes_tg(get_default_storage_limit())

        text = (
            "📏 **Change Default Signup Quota for New Users**\n\n"
            f"Current Default Quota: `{def_limit_str}`\n\n"
            "Select a preset below, or click Custom to type in chat:"
        )

        buttons = [
            [Button.inline("10 GB", data=b"set_def_gb:10"), Button.inline("20 GB", data=b"set_def_gb:20"), Button.inline("30 GB", data=b"set_def_gb:30")],
            [Button.inline("50 GB", data=b"set_def_gb:50"), Button.inline("100 GB", data=b"set_def_gb:100"), Button.inline("♾️ Unlimited", data=b"set_def_gb:unlimited")],
            [Button.inline("✍️ Type Custom Default GB", data=b"prompt_custom_def_gb")],
            [Button.inline("« Back to System Settings", data=b"menu:settings")]
        ]
        return text, buttons

    async def _get_stats_payload(self):
        from app.supabase_client import supabase_admin
        from app.system_config import is_signup_enabled, get_default_storage_limit

        res = supabase_admin.table("users").select("*").execute()
        users = res.data or []

        total_users = len(users)
        banned_users = sum(1 for u in users if u.get("is_banned"))
        active_users = total_users - banned_users
        total_storage_used = sum(u.get("used_storage", 0) for u in users)

        signup_str = "🟢 Open" if is_signup_enabled() else "🔴 Paused"
        def_limit_str = format_bytes_tg(get_default_storage_limit())

        text = (
            "📊 **System Statistics & Health Overview**\n\n"
            f"• **Total Registered Users:** `{total_users}`\n"
            f"• **Active Users:** `{active_users}`\n"
            f"• **Banned Users:** `{banned_users}`\n"
            f"• **Total Drive Storage Used:** `{format_bytes_tg(total_storage_used)}`\n"
            f"• **Signup Status:** {signup_str}\n"
            f"• **Default Signup Quota:** `{def_limit_str}`\n\n"
            f"📅 **Server Time:** `{time.strftime('%Y-%m-%d %H:%M:%S')}`"
        )

        buttons = [
            [Button.inline("🔄 Refresh Stats", data=b"menu:stats")],
            [Button.inline("« Back to Main Menu", data=b"menu:main")]
        ]
        return text, buttons

    async def _get_confirm_purge_channel_payload(self):
        channel_id = settings.TELEGRAM_CHANNEL_ID
        text = (
            f"💥 **ULTIMATE SYSTEM PURGE & RESET WARNING** 💥\n\n"
            f"• **Telegram Channel ID:** `{channel_id}`\n\n"
            f"⚠️ **Are you sure you want to PERMANENTLY PURGE everything?**\n"
            f"1. ALL file messages in Telegram Channel will be **purged**.\n"
            f"2. ALL database tables (`files`, `folders`, `users`) will be **cleared**.\n"
            f"3. System will be reset to a 100% **clean fresh state**.\n\n"
            f"🔴 **THIS ACTION IS ABSOLUTELY IRREVERSIBLE!**"
        )
        buttons = [
            [Button.inline("🔥 YES, PURGE ENTIRE CHANNEL & DB NOW", data=b"do_purge_channel")],
            [Button.inline("❌ Cancel & Go Back to Main Menu", data=b"menu:main")]
        ]
        return text, buttons

    # ─── EVENT LISTENER 1: TEXT MESSAGES & SLASH COMMANDS ────────────────

    async def _handle_admin_messages(self, event):
        """Handles incoming text messages, slash commands, user lookups, and pending text inputs."""
        sender_id = await self._get_event_sender_id(event)
        if not self._is_admin(sender_id):
            return

        # De-duplication check for message ID
        evt_key = (getattr(event, "chat_id", None), getattr(event, "id", None))
        if evt_key[0] and evt_key[1]:
            if evt_key in self._processed_events:
                return
            self._processed_events.add(evt_key)
            if len(self._processed_events) > 500:
                self._processed_events.clear()

        text = (event.raw_text or "").strip()

        # Check if Admin is in a pending text input state (e.g. search user, custom GB entry)
        if sender_id and sender_id in self.admin_pending_state and not text.startswith("/"):
            pending = self.admin_pending_state.pop(sender_id)
            action = pending.get("action")

            if action == "search_user":
                target = text.lstrip("@").lower().strip()
                txt, btn = await self._get_user_detail_payload(target)
                await event.reply(txt, buttons=btn, parse_mode="md")
                return

            elif action == "set_user_limit":
                username = pending.get("username")
                val_str = text.lower()
                if val_str == "unlimited":
                    new_limit = 9223372036854775807
                    disp = "Unlimited"
                else:
                    try:
                        gb = float(val_str.replace("gb", "").strip())
                        if gb <= 0:
                            raise ValueError()
                        new_limit = int(gb * 1024 * 1024 * 1024)
                        disp = f"{gb} GB"
                    except ValueError:
                        await event.reply("❌ Invalid format! Please type a positive number of GBs (e.g. 50 or 75) or `unlimited`.", parse_mode="md")
                        return

                from app.supabase_client import supabase_admin
                supabase_admin.table("users").update({"storage_limit": new_limit}).eq("telegram_username", username).execute()
                await event.reply(f"✅ Storage limit for `@{username}` successfully updated to **{disp}**!", parse_mode="md")

                # Show user profile menu
                txt, btn = await self._get_user_detail_payload(username)
                await self.app.send_message(event.chat_id, txt, buttons=btn, parse_mode="md")
                return

            elif action == "set_default_limit":
                val_str = text.lower()
                if val_str == "unlimited":
                    new_limit = 9223372036854775807
                    disp = "Unlimited"
                else:
                    try:
                        gb = float(val_str.replace("gb", "").strip())
                        if gb <= 0:
                            raise ValueError()
                        new_limit = int(gb * 1024 * 1024 * 1024)
                        disp = f"{gb} GB"
                    except ValueError:
                        await event.reply("❌ Invalid format! Please type a positive number of GBs (e.g. 30 or 50) or `unlimited`.", parse_mode="md")
                        return

                from app.system_config import set_default_storage_limit
                set_default_storage_limit(new_limit)
                await event.reply(f"⚙️ Default signup storage quota updated to **{disp}**!", parse_mode="md")

                txt, btn = await self._get_settings_payload()
                await self.app.send_message(event.chat_id, txt, buttons=btn, parse_mode="md")
                return

        if not text.startswith("/"):
            return

        parts = text.split()
        cmd = parts[0].lower()
        args = parts[1:]

        # Handle slash commands by opening button menus!
        if cmd in ["/start", "/help", "/admin"]:
            txt, btn = await self._get_main_menu_payload()
            await event.reply(txt, buttons=btn, parse_mode="md")

        elif cmd == "/users":
            txt, btn = await self._get_users_list_payload()
            await event.reply(txt, buttons=btn, parse_mode="md")

        elif cmd in ["/user", "/find", "/search"]:
            if not args:
                if sender_id: self.admin_pending_state[sender_id] = {"action": "search_user"}
                buttons = [[Button.inline("« Cancel", data=b"menu:main")]]
                await event.reply("🔍 **Search User by Username:**\n\nPlease type the @username in chat (e.g. `udoymistry`):", buttons=buttons, parse_mode="md")
                return
            target = args[0].lstrip("@").lower().strip()
            txt, btn = await self._get_user_detail_payload(target)
            await event.reply(txt, buttons=btn, parse_mode="md")

        elif cmd == "/setlimit":
            if len(args) < 2:
                await event.reply("⚠️ **Usage:** `/setlimit <username> <size_in_GB_or_unlimited>`\nExample: `/setlimit udoymistry 50`", parse_mode="md")
                return
            target = args[0].lstrip("@").lower().strip()
            val_str = args[1].lower()
            if val_str == "unlimited":
                new_limit = 9223372036854775807
                disp = "Unlimited"
            else:
                try:
                    gb = float(val_str)
                    new_limit = int(gb * 1024 * 1024 * 1024)
                    disp = f"{gb} GB"
                except ValueError:
                    await event.reply("❌ Invalid size format.", parse_mode="md")
                    return

            from app.supabase_client import supabase_admin
            supabase_admin.table("users").update({"storage_limit": new_limit}).eq("telegram_username", target).execute()
            await event.reply(f"✅ Storage limit for `@{target}` set to **{disp}**.", parse_mode="md")

            txt, btn = await self._get_user_detail_payload(target)
            await self.app.send_message(event.chat_id, txt, buttons=btn, parse_mode="md")

        elif cmd == "/ban":
            if not args: return
            target = args[0].lstrip("@").lower().strip()
            from app.supabase_client import supabase_admin
            supabase_admin.table("users").update({"is_banned": True}).eq("telegram_username", target).execute()
            await event.reply(f"🔴 User `@{target}` has been BANNED.", parse_mode="md")

            txt, btn = await self._get_user_detail_payload(target)
            await self.app.send_message(event.chat_id, txt, buttons=btn, parse_mode="md")

        elif cmd == "/unban":
            if not args: return
            target = args[0].lstrip("@").lower().strip()
            from app.supabase_client import supabase_admin
            supabase_admin.table("users").update({"is_banned": False}).eq("telegram_username", target).execute()
            await event.reply(f"🟢 User `@{target}` has been UNBANNED.", parse_mode="md")

            txt, btn = await self._get_user_detail_payload(target)
            await self.app.send_message(event.chat_id, txt, buttons=btn, parse_mode="md")

        elif cmd in ["/signup_off", "/signup_on", "/signup_status"]:
            txt, btn = await self._get_settings_payload()
            await event.reply(txt, buttons=btn, parse_mode="md")

        elif cmd in ["/purgechannel", "/wipechannel", "/resetall", "/purge"]:
            txt, btn = await self._get_confirm_purge_channel_payload()
            await event.reply(txt, buttons=btn, parse_mode="md")

    # ─── EVENT LISTENER 2: INLINE BUTTON CLICK CALLBACKS ─────────────────

    async def _handle_admin_callbacks(self, event):
        """Handles inline button clicks from the Admin Bot Control Center."""
        sender_id = await self._get_event_sender_id(event)
        if not self._is_admin(sender_id):
            try:
                await event.answer("⚠️ Unauthorized Action", alert=True)
            except Exception:
                pass
            return

        try:
            await event.answer()  # Acknowledge Telegram loading spinner
        except Exception:
            pass

        raw_data = getattr(event, "data", b"")
        data = raw_data.decode("utf-8") if isinstance(raw_data, bytes) else str(raw_data)

        # Router for menu callbacks
        if data == "menu:main":
            txt, btn = await self._get_main_menu_payload()
            await self._safe_edit(event, txt, btn)

        elif data == "prompt_search_user":
            if sender_id: self.admin_pending_state[sender_id] = {"action": "search_user"}
            prompt_text = (
                "🔍 **Search User by Username**\n\n"
                "Please type the @username of the user in this chat (e.g. `@udoymistry` or `udoymistry`):"
            )
            buttons = [[Button.inline("« Back to Main Menu", data=b"menu:main")]]
            await self._safe_edit(event, prompt_text, buttons)

        elif data == "menu:users":
            txt, btn = await self._get_users_list_payload()
            await self._safe_edit(event, txt, btn)

        elif data == "menu:settings":
            txt, btn = await self._get_settings_payload()
            await self._safe_edit(event, txt, btn)

        elif data == "menu:default_quota":
            txt, btn = await self._get_default_quota_payload()
            await self._safe_edit(event, txt, btn)

        elif data == "menu:stats":
            txt, btn = await self._get_stats_payload()
            await self._safe_edit(event, txt, btn)

        elif data == "confirm_purge_channel":
            txt, btn = await self._get_confirm_purge_channel_payload()
            await self._safe_edit(event, txt, btn)

        elif data == "do_purge_channel":
            await self._safe_edit(event, "⏳ **ULTIMATE PURGE IN PROGRESS...**\n\nScanning Telegram channel messages and clearing DataForge database. Please wait...", None)

            summary = await self.purge_entire_channel_and_db()

            report = (
                f"🧹 **ULTIMATE SYSTEM PURGE COMPLETE!**\n\n"
                f"• **Telegram Messages Purged:** `{summary.get('tg_messages_deleted', 0)}` / `{summary.get('tg_total_found', 0)}`\n"
                f"• **Files Table Cleared:** `{summary.get('db_deleted', {}).get('files', 0)}` rows\n"
                f"• **Folders Table Cleared:** `{summary.get('db_deleted', {}).get('folders', 0)}` rows\n"
                f"• **Users Table Cleared:** `{summary.get('db_deleted', {}).get('users', 0)}` rows\n\n"
                f"✅ **System has been reset to a 100% clean state.**"
            )
            buttons = [[Button.inline("« Back to Main Menu", data=b"menu:main")]]
            await self._safe_edit(event, report, buttons)

        elif data.startswith("user:"):
            username = data.split("user:")[1]
            txt, btn = await self._get_user_detail_payload(username)
            await self._safe_edit(event, txt, btn)

        elif data.startswith("set_limit_menu:"):
            username = data.split("set_limit_menu:")[1]
            txt, btn = await self._get_set_limit_payload(username)
            await self._safe_edit(event, txt, btn)

        elif data.startswith("set_gb:"):
            parts = data.split(":")
            username = parts[1]
            gb_val = parts[2]
            if gb_val == "unlimited":
                new_limit = 9223372036854775807
            else:
                new_limit = int(float(gb_val) * 1024 * 1024 * 1024)

            from app.supabase_client import supabase_admin
            supabase_admin.table("users").update({"storage_limit": new_limit}).eq("telegram_username", username).execute()

            txt, btn = await self._get_user_detail_payload(username)
            await self._safe_edit(event, txt, btn)

        elif data.startswith("prompt_custom_gb:"):
            username = data.split("prompt_custom_gb:")[1]
            if sender_id: self.admin_pending_state[sender_id] = {"action": "set_user_limit", "username": username}

            prompt_text = (
                f"✍️ **Custom Storage Quota Entry for @{username}**\n\n"
                f"Please type the new storage limit in **GB** as a reply in this chat (e.g. `25`, `75`, `150`, or `unlimited`):"
            )
            buttons = [[Button.inline(f"« Cancel & Back to @{username}", data=f"user:{username}".encode("utf-8"))]]
            await self._safe_edit(event, prompt_text, buttons)

        elif data.startswith("toggle_ban:"):
            username = data.split("toggle_ban:")[1]
            from app.supabase_client import supabase_admin
            res = supabase_admin.table("users").select("is_banned").eq("telegram_username", username).execute()
            if res.data:
                curr_banned = res.data[0].get("is_banned", False)
                supabase_admin.table("users").update({"is_banned": not curr_banned}).eq("telegram_username", username).execute()

            txt, btn = await self._get_user_detail_payload(username)
            await self._safe_edit(event, txt, btn)

        elif data.startswith("confirm_delete:"):
            username = data.split("confirm_delete:")[1]
            txt, btn = await self._get_confirm_delete_payload(username)
            await self._safe_edit(event, txt, btn)

        elif data.startswith("do_delete:"):
            username = data.split("do_delete:")[1]
            await self._safe_edit(event, f"⏳ **Purging user @{username}...** Deleting files, Telegram channel media, and database records...", None)

            from app.supabase_client import supabase_admin
            user_res = supabase_admin.table("users").select("*").eq("telegram_username", username).execute()
            if not user_res.data:
                await self._safe_edit(event, f"❌ User `@{username}` not found.", [[Button.inline("« Back to Users", data=b"menu:users")]])
                return

            u = user_res.data[0]
            u_id = u["id"]

            files_res = supabase_admin.table("files").select("id, telegram_message_id").eq("user_id", u_id).execute()
            user_files = files_res.data or []
            msg_ids = [f.get("telegram_message_id") for f in user_files if f.get("telegram_message_id")]

            tg_deleted_count = await self.delete_file_messages_batch(msg_ids)

            supabase_admin.table("files").delete().eq("user_id", u_id).execute()
            supabase_admin.table("folders").delete().eq("user_id", u_id).execute()
            supabase_admin.table("users").delete().eq("id", u_id).execute()

            report = (
                f"💥 **User & Data Permanently Destroyed!**\n\n"
                f"• **Username:** `@{username}`\n"
                f"• **Files Purged:** `{len(user_files)}` (Telegram messages deleted: `{tg_deleted_count}`)\n"
                f"• **Status:** Account, folders, and file records completely wiped."
            )
            buttons = [[Button.inline("« Back to Users List", data=b"menu:users")]]
            await self._safe_edit(event, report, buttons)

        elif data == "toggle_signup":
            from app.system_config import is_signup_enabled, set_signup_enabled
            curr = is_signup_enabled()
            set_signup_enabled(not curr)
            txt, btn = await self._get_settings_payload()
            await self._safe_edit(event, txt, btn)

        elif data.startswith("set_def_gb:"):
            val = data.split("set_def_gb:")[1]
            if val == "unlimited":
                new_limit = 9223372036854775807
            else:
                new_limit = int(float(val) * 1024 * 1024 * 1024)

            from app.system_config import set_default_storage_limit
            set_default_storage_limit(new_limit)

            txt, btn = await self._get_settings_payload()
            await self._safe_edit(event, txt, btn)

        elif data == "prompt_custom_def_gb":
            if sender_id: self.admin_pending_state[sender_id] = {"action": "set_default_limit"}
            prompt_text = (
                "✍️ **Custom Default Signup Quota Entry**\n\n"
                "Please type the new default storage quota in **GB** for new users as a reply in this chat (e.g. `15`, `30`, `50`, or `unlimited`):"
            )
            buttons = [[Button.inline("« Cancel & Back to Settings", data=b"menu:settings")]]
            await self._safe_edit(event, prompt_text, buttons)

    # ─── FILE STORAGE OPERATIONS ─────────────────────────────────────────

    async def upload_file(self, file_path: str, filename: str, progress_callback=None):
        """Uploads a local temp file (up to 2GB) to the private Telegram channel using parallel MTProto streams."""
        async with self._upload_semaphore:
            await self.start()
            channel_id = int(settings.TELEGRAM_CHANNEL_ID)

            try:
                file_size = os.path.getsize(file_path)
                if file_size > 2 * 1024 * 1024 * 1024:
                    raise Exception("File size exceeds 2GB limit.")

                # Small files (< 1MB) are sent directly
                if file_size < 1024 * 1024:
                    msg = await self.app.send_file(
                        channel_id,
                        file_path,
                        caption=f"📁 CloudDrive: {filename}",
                        force_document=True,
                        progress_callback=progress_callback
                    )
                    file_id_str = str(msg.id)
                    if msg.media and hasattr(msg.media, "document") and msg.media.document:
                        file_id_str = str(msg.media.document.id)
                    return {"message_id": msg.id, "file_id": file_id_str}

                # Fast Parallel MTProto Chunk Uploader (512KB part size, 12 concurrent workers)
                part_size = 512 * 1024
                part_count = math.ceil(file_size / part_size) if file_size > 0 else 1
                is_big = file_size > 10 * 1024 * 1024

                file_id = random.randint(-9223372036854775808, 9223372036854775807)
                uploaded_bytes = 0
                progress_lock = asyncio.Lock()

                async def upload_part(part_index, part_bytes):
                    nonlocal uploaded_bytes
                    if is_big:
                        req = SaveBigFilePartRequest(
                            file_id=file_id,
                            file_part=part_index,
                            file_total_parts=part_count,
                            bytes=part_bytes
                        )
                    else:
                        req = SaveFilePartRequest(
                            file_id=file_id,
                            file_part=part_index,
                            bytes=part_bytes
                        )

                    for attempt in range(5):
                        try:
                            await self.app(req)
                            break
                        except FloodWaitError as flood_err:
                            logger.warning(f"[TG_FLOOD] Telegram rate limit triggered. Waiting {flood_err.seconds}s...")
                            await asyncio.sleep(flood_err.seconds + 1)
                        except Exception:
                            if attempt == 4:
                                raise
                            await asyncio.sleep(0.5)

                    async with progress_lock:
                        uploaded_bytes += len(part_bytes)
                        if progress_callback:
                            try:
                                progress_callback(uploaded_bytes, file_size)
                            except Exception:
                                pass


                # Worker pool with concurrency limit
                semaphore = asyncio.Semaphore(12)

                async def worker(part_index, part_bytes):
                    async with semaphore:
                        await upload_part(part_index, part_bytes)

                tasks = []
                with open(file_path, "rb") as f:
                    for part_index in range(part_count):
                        part_bytes = f.read(part_size)
                        if not part_bytes:
                            break
                        tasks.append(worker(part_index, part_bytes))

                await asyncio.gather(*tasks)

                if is_big:
                    input_file = InputFileBig(id=file_id, parts=part_count, name=filename)
                else:
                    input_file = InputFile(id=file_id, parts=part_count, name=filename, md5_checksum="")

                msg = await self.app.send_file(
                    channel_id,
                    file=input_file,
                    caption=f"📁 CloudDrive: {filename}",
                    force_document=True
                )

                file_id_str = str(msg.id)
                if msg.media and hasattr(msg.media, "document") and msg.media.document:
                    file_id_str = str(msg.media.document.id)

                return {
                    "message_id": msg.id,
                    "file_id": file_id_str
                }
            except Exception as e:
                print(f"Telegram upload error detail: {e}")
                raise Exception(f"Failed to upload file to Telegram storage: {str(e)}")


    async def download_to_file(self, message_id: int, file_path: str):
        """Downloads media content from Telegram channel to a local file path.
        Uses iter_download + manual write for reliability (download_media fails silently for photos)."""
        logger.info(f"[TG_DOWNLOAD_TO_FILE] Starting download: message_id={message_id}, file_path={file_path}")
        async with self._download_semaphore:
            try:
                await self.start()
                channel_id = int(settings.TELEGRAM_CHANNEL_ID)
                logger.debug(f"[TG_DOWNLOAD_TO_FILE] channel_id={channel_id}, bot_started={self._is_started}")
                
                msg = await self.app.get_messages(channel_id, ids=message_id)
                logger.debug(f"[TG_DOWNLOAD_TO_FILE] get_messages result: msg_id={msg.id if msg else 'N/A'}, has_media={msg.media if msg else 'N/A'}")
                
                if not msg or not msg.media:
                    logger.error(f"[TG_DOWNLOAD_TO_FILE] File message not found: message_id={message_id}, channel_id={channel_id}")
                    raise Exception(f"File message not found in Telegram storage. message_id={message_id}")
                
                total_bytes = 0
                chunk_count = 0
                with open(file_path, "wb") as f:
                    async for chunk in self.app.iter_download(msg.media, request_size=8 * 1024 * 1024):
                        f.write(chunk)
                        total_bytes += len(chunk)
                        chunk_count += 1
                
                logger.info(f"[TG_DOWNLOAD_TO_FILE] Downloaded {total_bytes} bytes in {chunk_count} chunks to {file_path}")
                
                if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
                    file_size = os.path.getsize(file_path)
                    logger.info(f"[TG_DOWNLOAD_TO_FILE] SUCCESS: message_id={message_id}, file_size={file_size}, path={file_path}")
                else:
                    logger.error(f"[TG_DOWNLOAD_TO_FILE] File not created or empty after download: {file_path}")
                    raise Exception("Download completed but file was not created on disk.")
                    
            except Exception as e:
                logger.error(f"[TG_DOWNLOAD_TO_FILE] FAILED: message_id={message_id}, error={str(e)}", exc_info=True)
                if os.path.exists(file_path):
                    try:
                        os.remove(file_path)
                    except Exception:
                        pass
                raise

    async def download_thumbnail_fast(self, message_id: int, file_path: str, max_partial_bytes: int = 512 * 1024) -> bool:
        """Ultra-fast thumbnail downloader.
        First attempts downloading Telegram's embedded native thumbnail (~10ms).
        If unavailable, downloads only the first partial 512KB chunk instead of the full file."""
        await self.start()
        channel_id = int(settings.TELEGRAM_CHANNEL_ID)
        try:
            msg = await self.app.get_messages(channel_id, ids=message_id)
            if not msg or not msg.media:
                return False

            # 1. Try downloading Telegram native embedded thumbnail (~10ms)
            try:
                downloaded = await self.app.download_media(msg.media, file=file_path, thumb=-1)
                if downloaded and os.path.exists(file_path) and os.path.getsize(file_path) > 0:
                    return True
            except Exception:
                pass

            try:
                downloaded = await self.app.download_media(msg.media, file=file_path, thumb=0)
                if downloaded and os.path.exists(file_path) and os.path.getsize(file_path) > 0:
                    return True
            except Exception:
                pass

            # 2. Partial chunk download (only first 512KB)
            total_bytes = 0
            with open(file_path, "wb") as f:
                async for chunk in self.app.iter_download(msg.media, request_size=128 * 1024):
                    f.write(chunk)
                    total_bytes += len(chunk)
                    if total_bytes >= max_partial_bytes:
                        break

            return os.path.exists(file_path) and os.path.getsize(file_path) > 0
        except Exception as e:
            logger.warning(f"[TG_FAST_THUMB_FAIL] message_id={message_id}, error={e}")
            if os.path.exists(file_path):
                try: os.remove(file_path)
                except Exception: pass
            return False

    async def delete_file_message(self, message_id: int) -> bool:
        """Deletes a file document message permanently from the private Telegram Channel."""
        await self.start()
        channel_id = int(settings.TELEGRAM_CHANNEL_ID)
        try:
            await self.app.delete_messages(channel_id, message_ids=[int(message_id)])
            logger.info(f"[TG_DELETE_MSG] Successfully deleted message #{message_id} from Telegram Channel.")
            return True
        except Exception as e:
            logger.warning(f"[TG_DELETE_MSG_ERR] Could not delete message #{message_id}: {e}")
            return False

    async def delete_file_messages_batch(self, message_ids: List[int]) -> int:
        """Deletes multiple message IDs from Telegram channel in parallel chunks of 100."""
        if not message_ids:
            return 0
        await self.start()
        channel_id = int(settings.TELEGRAM_CHANNEL_ID)
        deleted_count = 0

        unique_ids = list(set([int(m) for m in message_ids if m]))

        for i in range(0, len(unique_ids), 100):
            chunk = unique_ids[i:i + 100]
            try:
                await self.app.delete_messages(channel_id, message_ids=chunk)
                deleted_count += len(chunk)
                logger.info(f"[TG_BATCH_DELETE] Purged chunk of {len(chunk)} messages from Telegram Channel.")
            except Exception as e:
                logger.warning(f"[TG_BATCH_DELETE_ERR] Failed chunk deletion: {e}")
        return deleted_count

    async def purge_entire_channel_and_db(self) -> dict:
        """
        Ultimate Reset: Scans and deletes ALL file messages from private Telegram Channel
        and completely clears files, folders, and users tables from DataForge Database.
        """
        await self.start()
        channel_id = int(settings.TELEGRAM_CHANNEL_ID)

        # 1. Collect all message IDs directly from Telegram channel
        all_tg_msg_ids = []
        try:
            async for msg in self.app.iter_messages(channel_id):
                if msg and msg.id:
                    all_tg_msg_ids.append(msg.id)
        except Exception as e:
            logger.error(f"[TG_PURGE_CHANNEL_ERR] Failed to iterate messages: {e}")

        # Also collect any message IDs recorded in Database
        from app.supabase_client import supabase_admin
        try:
            db_files = supabase_admin.table("files").select("telegram_message_id").execute()
            if db_files.data:
                for f in db_files.data:
                    m_id = f.get("telegram_message_id")
                    if m_id:
                        all_tg_msg_ids.append(int(m_id))
        except Exception:
            pass

        # 2. Batch purge Telegram channel messages
        deleted_tg_count = await self.delete_file_messages_batch(all_tg_msg_ids)

        # 3. Clear all DataForge DB tables
        deleted_db = {}
        for tbl in ["files", "folders", "users"]:
            try:
                res = supabase_admin.table(tbl).delete().neq("id", "00000000-0000-0000-0000-000000000000").execute()
                deleted_db[tbl] = len(res.data or [])
            except Exception as db_err:
                logger.error(f"[TG_PURGE_DB_ERR] Failed to clear table {tbl}: {db_err}")
                deleted_db[tbl] = 0

        return {
            "tg_messages_deleted": deleted_tg_count,
            "tg_total_found": len(set(all_tg_msg_ids)),
            "db_deleted": deleted_db
        }

    async def download_file_stream(self, message_id: int) -> AsyncGenerator[bytes, None]:

        """Streams media content from Telegram channel given the message_id."""
        await self.start()
        channel_id = int(settings.TELEGRAM_CHANNEL_ID)

        try:
            msg = await self.app.get_messages(channel_id, ids=message_id)
            if not msg or not msg.media:
                logger.error(f"[TG_STREAM] Message {message_id} or media not found in channel {channel_id}")
                return

            async for chunk in self.app.iter_download(msg.media):
                yield chunk
        except Exception as e:
            logger.error(f"[TG_STREAM] Error streaming message_id={message_id}: {e}")
            return


class OTPTelegramService:
    """Dedicated OTP Bot Client — Handles sending verification codes to users."""
    def __init__(self):
        self.app = TelegramClient(
            "cloud_drive_otp_telethon_session",
            settings.TELEGRAM_API_ID,
            settings.TELEGRAM_API_HASH,
            connection_retries=3,
            retry_delay=2
        )

        self._is_started = False

    async def start(self):
        if not self._is_started:
            await self.app.start(bot_token=settings.OTP_TELEGRAM_BOT_TOKEN)
            self._is_started = True
            try:
                me = await self.app.get_me()
                print(f"OTP Bot connected: @{getattr(me, 'username', 'OTP Bot')}")
            except Exception as e:
                print(f"Warning: OTP Bot connected, could not fetch profile: {e}")

    async def stop(self):
        if self._is_started:
            await self.app.disconnect()
            self._is_started = False

    async def send_otp_message(self, telegram_username: str, otp_code: str):
        """
        Sends an OTP verification code to a Telegram user's DM via the dedicated OTP bot.
        The user MUST have started a conversation with the OTP bot first (/start).
        """
        await self.start()
        clean_username = telegram_username.lstrip("@")

        try:
            entity = await self.app.get_entity(clean_username)
            message_text = (
                f"🔐 **Universal Cloud Drive — Verification Code**\n\n"
                f"Your code is: `{otp_code}`\n\n"
                f"Expires in 5 minutes. Do not share this code with anyone."
            )
            await self.app.send_message(entity, message_text, parse_mode="md")
            print(f"[OTP Bot] Sent verification code to @{clean_username}")
            return True
        except Exception as e:
            print(f"[OTP Bot] Failed to send OTP to @{clean_username}: {e}")
            raise Exception(
                f"Could not send OTP to @{clean_username}. "
                f"Please make sure you have searched for our OTP Verification Bot on Telegram and pressed /start first, then try again."
            )


class TicketTelegramService:
    """Dedicated 3rd Bot Client — Handles sending storage upgrade request notifications to Admin."""
    def __init__(self):
        self.app = TelegramClient(
            "cloud_drive_ticket_telethon_session",
            settings.TELEGRAM_API_ID,
            settings.TELEGRAM_API_HASH,
            connection_retries=3,
            retry_delay=2
        )

        self._is_started = False

    async def start(self):
        if not self._is_started:
            await self.app.start(bot_token=settings.TICKET_TELEGRAM_BOT_TOKEN)
            self._is_started = True
            try:
                me = await self.app.get_me()
                print(f"Ticket Bot connected: @{getattr(me, 'username', 'Ticket Bot')}")
            except Exception as e:
                print(f"Warning: Ticket Bot connected, could not fetch profile: {e}")

    async def stop(self):
        if self._is_started:
            await self.app.disconnect()
            self._is_started = False

    async def send_admin_alert(self, message_text: str):
        """Sends a storage request notification alert directly to ADMIN_TELEGRAM_ID via Ticket Bot."""
        await self.start()
        admin_id = settings.ADMIN_TELEGRAM_ID
        if not admin_id:
            print("Warning: ADMIN_TELEGRAM_ID not set in .env, skipping ticket alert.")
            return False

        try:
            admin_peer = int(admin_id)
            entity = await self.app.get_entity(admin_peer)
            await self.app.send_message(entity, message_text, parse_mode="md")
            print(f"[Ticket Bot] Sent storage upgrade ticket alert to admin {admin_id}")
            return True
        except Exception as e:
            print(f"[Ticket Bot] Failed to send alert via entity: {e}. Trying direct peer fallback...")
            try:
                await self.app.send_message(int(admin_id), message_text, parse_mode="md")
                return True
            except Exception as e2:
                print(f"[Ticket Bot] Direct peer fallback send failed: {e2}")
                return False


telegram_service = TelegramService()
otp_telegram_service = OTPTelegramService()
ticket_telegram_service = TicketTelegramService()
