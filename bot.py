#!/usr/bin/env python3
"""
bot.py - Sathya Sai Prema Kuteeram Telegram Bot
=========================================================
Features:
  - /start       : Welcome message
  - /menu        : Interactive Main Menu with comprehensive inline keyboard features:
                     * 🗓 View Events (inline pagination)
                     * 🖼 Browse Gallery (inline category switches)
                     * 🕉 Daily Sai Quote (uses Gemini AI with inline '🔄 Refresh' button)
                     * 📞 Contact SSPK (contact information)
  - /gallery     : Browse and download gallery images
  - /addgallery  : Admin-only — upload a photo directly to Supabase + website
  - /events      : View upcoming events from Supabase
  - /info        : Get AI-powered spiritual guidance via Gemini
  - /help        : List all commands
  - Global Inline Query Search:
                     * Type '@bot_username <search>' in any Telegram chat
                     * Instantly search events and gallery items
                     * Share gorgeous custom styled cards into any group
  - Any text     : Gemini AI answers in the context of Sai Trust
  - Media        : Received and sent back as downloadable file

Run:
  python bot.py

Requirements:
  pip install -r requirements.txt
"""

import os
import io
import time
import zipfile
import uuid
import asyncio
import logging
from datetime import datetime
from dotenv import load_dotenv

from telegram import (
    Update,
    InlineKeyboardButton,
    InlineKeyboardMarkup,
    InlineQueryResultArticle,
    InputTextMessageContent,
    InlineQueryResultPhoto,
    InputMediaPhoto,
)
from telegram.ext import (
    Application,
    CommandHandler,
    MessageHandler,
    CallbackQueryHandler,
    ConversationHandler,
    InlineQueryHandler,
    filters,
    ContextTypes,
)

import google.generativeai as genai
from supabase import create_client, Client

# ── Load environment ──────────────────────────────────────────────────────────
load_dotenv()

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN")
GEMINI_API_KEY     = os.getenv("GEMINI_API_KEY")
SUPABASE_URL       = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY  = os.getenv("SUPABASE_ANON_KEY")

if not TELEGRAM_BOT_TOKEN or TELEGRAM_BOT_TOKEN == "YOUR_TELEGRAM_BOT_TOKEN_HERE":
    raise EnvironmentError(
        "❌ TELEGRAM_BOT_TOKEN is not set. Edit your .env file and add your token from @BotFather."
    )

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger(__name__)

# ── Gemini AI setup ───────────────────────────────────────────────────────────
genai.configure(api_key=GEMINI_API_KEY)
gemini_model = genai.GenerativeModel(
    model_name="gemini-3.5-flash",
    system_instruction=(
        "You are a compassionate and knowledgeable spiritual assistant for "
        "Sathya Sai Prema Kuteeram (SSPK), a spiritual Trust dedicated to the "
        "teachings of Sri Sathya Sai Baba. "
        "Answer questions about Sai Baba's teachings, the Trust's activities "
        "(bhajans, seva, study circles, celebrations), and spiritual guidance. "
        "Be warm, respectful, and concise. Use 'Sai Ram 🙏' as a greeting. "
        "If asked about events or gallery, tell the user to use /events or /gallery commands."
    ),
)

# ── Supabase setup ────────────────────────────────────────────────────────────
try:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
except Exception as e:
    logger.error("Failed to initialize Supabase client!")
    print("\n" + "="*80)
    print("ERROR: INVALID SUPABASE CREDENTIALS IN .env")
    print("Your SUPABASE_ANON_KEY is either mock or invalid.")
    print("Please set your real Supabase URL and Anon Key in your .env file.")
    print("Get your credentials from: https://supabase.com/dashboard/project/_/settings/api")
    print("="*80 + "\n")
    import sys
    sys.exit(1)

STORAGE_BUCKET = "gallery-images"

# ── Constants ─────────────────────────────────────────────────────────────────
TRUST_NAME = "Sathya Sai Prema Kuteeram"
CATEGORY_EMOJIS = {
    "bhajan":      "🎵",
    "seva":        "🤲",
    "study":       "📚",
    "celebration": "🎉",
    "event":       "📌",
    "community":   "🤝",
}
VALID_CATEGORIES = list(CATEGORY_EMOJIS.keys())

# ConversationHandler states for /addalbum
AWAIT_ALBUM_EVENT, AWAIT_ALBUM_PHOTOS = range(2)

# Authorized Admins
ADMIN_IDS = [8250992325, 8646965285]


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════


async def upload_to_supabase_storage(file_bytes: bytes, filename: str) -> str | None:
    """Upload raw image bytes to Supabase Storage bucket."""
    try:
        path = f"telegram/{filename}"
        supabase.storage.from_(STORAGE_BUCKET).upload(
            path,
            file_bytes,
            {"content-type": "image/jpeg", "upsert": "true"},
        )
        url_response = supabase.storage.from_(STORAGE_BUCKET).get_public_url(path)
        public_url = url_response if isinstance(url_response, str) else url_response.get("publicUrl")
        return public_url, path
    except Exception as e:
        logger.error(f"Supabase Storage upload error: {e}")
        return None, None


async def save_gallery_record(src_url: str | None, storage_path: str | None, caption: str, category: str, telegram_file_id: str | None = None, event_id: str | None = None) -> bool:
    """Insert a record into the Supabase gallery table."""
    try:
        # If no src_url is provided but we have a telegram_file_id, download and upload to Supabase storage
        if not src_url and telegram_file_id:
            try:
                from telegram import Bot
                bot = Bot(TELEGRAM_BOT_TOKEN)
                logger.info(f"📥 Automatically downloading Telegram file {telegram_file_id} for public web preview...")
                file_obj = await bot.get_file(telegram_file_id)
                file_bytes = await file_obj.download_as_bytearray()
                
                # Upload to Supabase Storage
                filename = f"{uuid.uuid4()}.jpg"
                public_url, path = await upload_to_supabase_storage(bytes(file_bytes), filename)
                if public_url:
                    src_url = public_url
                    storage_path = path
                    logger.info(f"📤 Uploaded to Supabase Storage. Public URL: {src_url}")
            except Exception as dl_err:
                logger.error(f"Failed to automatically upload Telegram photo to Supabase storage: {dl_err}")

        data = {
            "caption":      caption,
            "category":     category,
            "source":       "telegram",
        }
        if src_url:
            data["src_url"] = src_url
        if storage_path:
            data["storage_path"] = storage_path
        if telegram_file_id:
            data["telegram_file_id"] = telegram_file_id
        if event_id:
            data["event_id"] = event_id
            
        supabase.table("gallery").insert(data).execute()
        return True
    except Exception as e:
        logger.error(f"Gallery DB insert error: {e}")
        return False


# ══════════════════════════════════════════════════════════════════════════════
# INTERACTIVE MAIN MENU (INLINE HANDLERS)
# ══════════════════════════════════════════════════════════════════════════════

def get_main_menu_keyboard() -> InlineKeyboardMarkup:
    """Returns the markup for the primary interactive dashboard."""
    keyboard = [
        [
            InlineKeyboardButton("🗓 View Events", callback_data="menu_events"),
            InlineKeyboardButton("🖼 Browse Gallery", callback_data="menu_gallery"),
        ],
        [
            InlineKeyboardButton("📞 Contact SSPK", callback_data="menu_contact"),
        ]
    ]
    return InlineKeyboardMarkup(keyboard)


async def menu_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Presents the elegant inline main menu."""
    msg = (
        "🙏 *Sai Ram! Welcome to SSPK Interactive Menu*\n"
        "Explore services, quotes, events, and gallery dynamically below:\n\n"
        "━━━━━━━━━━━━━━━━━━━━━━━━"
    )
    await update.message.reply_text(
        msg,
        reply_markup=get_main_menu_keyboard(),
        parse_mode="Markdown"
    )


async def menu_callback_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Manages menu dynamic state changes in-place (no new messages)."""
    query = update.callback_query
    await query.answer()

    data = query.data

    if data == "menu_main":
        msg = (
            "🙏 *Sai Ram! Welcome to SSPK Interactive Menu*\n"
            "Explore services, quotes, events, and gallery dynamically below:\n\n"
            "━━━━━━━━━━━━━━━━━━━━━━━━"
        )
        await query.edit_message_text(
            text=msg,
            reply_markup=get_main_menu_keyboard(),
            parse_mode="Markdown"
        )



    elif data == "menu_events":
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            res = supabase.table("events").select("*").gte("date", today).order("date", desc=False).limit(3).execute()
            events = res.data
            
            if not events:
                msg = "📅 *Events Menu*\n\nNo upcoming events scheduled at this moment."
            else:
                msg = "📅 *Upcoming Events at SSPK:*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
                for idx, evt in enumerate(events, 1):
                    emoji = CATEGORY_EMOJIS.get(evt.get("category", ""), "📌")
                    msg += (
                        f"*{idx}. {evt.get('title')}*\n"
                        f"🗓 {evt.get('date')} | ⏰ {evt.get('time', 'TBA')}\n"
                        f"📍 {evt.get('venue')}\n\n"
                    )
            
            keyboard = [
                [InlineKeyboardButton("📂 Full Tabular List", callback_data="menu_full_events")],
                [InlineKeyboardButton("⬅ Back to Menu", callback_data="menu_main")]
            ]
            await query.edit_message_text(
                text=msg,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="Markdown"
            )
        except Exception as e:
            logger.error(f"Menu events err: {e}")
            await query.edit_message_text("❌ Failed to fetch events.", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅ Back", callback_data="menu_main")]]))

    elif data == "menu_full_events":
        try:
            today = datetime.now().strftime("%Y-%m-%d")
            res = supabase.table("events").select("*").gte("date", today).order("date", desc=False).execute()
            events = res.data
            if not events:
                msg = "📅 No events found."
            else:
                msg = "📅 *All SSPK Scheduled Events:*\n\n"
                for evt in events:
                    emoji = CATEGORY_EMOJIS.get(evt.get("category", ""), "📌")
                    msg += f"{emoji} *{evt.get('title')}* — {evt.get('date')} ({evt.get('venue')})\n"
            
            keyboard = [[InlineKeyboardButton("⬅ Back", callback_data="menu_events")]]
            await query.edit_message_text(text=msg, reply_markup=InlineKeyboardMarkup(keyboard), parse_mode="Markdown")
        except Exception as e:
            await query.edit_message_text("❌ Error listing all events.", reply_markup=InlineKeyboardMarkup([[InlineKeyboardButton("⬅ Back", callback_data="menu_events")]]))

    elif data == "menu_gallery":
        await gallery_command(update, context)
        return

    elif data == "menu_contact":
        msg = (
            "📞 *Sathya Sai Prema Kuteeram Contact*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            "📍 *Address:*\nSri Sathya Sai Prema Kuteeram,\nKancheepuram, Tamil Nadu, India\n\n"
            "📞 *Phone Support:* +91-9876543210\n"
            "✉ *Email:* support@sspk.org\n\n"
            "🌐 *Website:* [Sathya Sai Portal](https://saidharmasamrakshanapremakuteeram.qzz.io)\n\n"
            "_Feel free to visit us during bhajans or community seva drives!_"
        )
        keyboard = [[InlineKeyboardButton("⬅ Back to Menu", callback_data="menu_main")]]
        await query.edit_message_text(
            text=msg,
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="Markdown",
            disable_web_page_preview=True
        )


# ══════════════════════════════════════════════════════════════════════════════
# GLOBAL INLINE QUERY MODE (GLOBAL CHAT SEARCH)
# ══════════════════════════════════════════════════════════════════════════════

async def inline_query_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """
    Handles global search queries like '@your_bot_name bhajan'.
    Pulls live data from Supabase and lists clickable cards users can send anywhere.
    """
    query = update.inline_query.query.strip().lower()
    results = []

    try:
        # 1. Pull events matching the query
        events_res = supabase.table("events").select("*").order("date", desc=False).execute()
        events = events_res.data or []

        # 2. Pull gallery matching the query
        gallery_res = supabase.table("gallery").select("*").order("created_at", desc=True).execute()
        gallery = gallery_res.data or []

        # Match Events
        for evt in events:
            title = evt.get("title", "")
            desc = evt.get("description", "")
            venue = evt.get("venue", "")
            date = evt.get("date", "")
            category = evt.get("category", "")
            
            if not query or query in title.lower() or query in desc.lower() or query in category.lower():
                emoji = CATEGORY_EMOJIS.get(category, "📌")
                card_content = (
                    f"📅 *Sathya Sai Trust Event Card*\n"
                    f"━━━━━━━━━━━━━━━━━━\n\n"
                    f"{emoji} *{title}*\n"
                    f"📆 Date: {date} | ⏰ Time: {evt.get('time', 'TBA')}\n"
                    f"📍 Venue: {venue}\n"
                    f"👤 Contact: {evt.get('coordinator', 'Admin')} ({evt.get('contact', '')})\n\n"
                    f"_{desc}_"
                )
                results.append(
                    InlineQueryResultArticle(
                        id=str(uuid.uuid4()),
                        title=f"📅 Event: {title}",
                        description=f"SSPK Event on {date} at {venue}",
                        input_message_content=InputTextMessageContent(
                            message_text=card_content,
                            parse_mode="Markdown"
                        )
                    )
                )

        # Match Gallery
        for img in gallery:
            caption = img.get("caption", "SSPK Photo")
            category = img.get("category", "event")
            src_url = img.get("src_url")

            if src_url and (not query or query in caption.lower() or query in category.lower()):
                emoji = CATEGORY_EMOJIS.get(category, "📌")
                results.append(
                    InlineQueryResultPhoto(
                        id=str(uuid.uuid4()),
                        photo_url=src_url,
                        thumbnail_url=src_url,
                        title=f"📸 {caption}",
                        caption=(
                            f"🙏 *{caption}*\n"
                            f"📂 SSPK Gallery: {emoji} {category.title()}\n"
                            f"🌐 Visit: [Sathya Sai Portal](https://saidharmasamrakshanapremakuteeram.qzz.io)"
                        ),
                        parse_mode="Markdown"
                    )
                )



    except Exception as e:
        logger.error(f"Inline query error: {e}")

    # Return top 25 results
    await update.inline_query.answer(results[:25], cache_time=10)


# ══════════════════════════════════════════════════════════════════════════════
# STANDARD COMMANDS
# ══════════════════════════════════════════════════════════════════════════════

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Welcome message & Deep Link Handler."""
    
    # 1. Deep Link Handler (t.me/bot?start=event_123)
    if context.args and context.args[0].startswith("event_"):
        event_id = context.args[0].replace("event_", "")
        await update.message.reply_text(f"🔍 Fetching photos for Event #{event_id} from Telegram's secure vault...", parse_mode="HTML")
        try:
            res = supabase.table("gallery").select("telegram_file_id, caption").eq("event_id", event_id).execute()
            photos = [item for item in res.data if item.get("telegram_file_id")]
            
            if not photos:
                await update.message.reply_text("❌ No photos found for this event yet.")
                return
                
            from telegram import InputMediaPhoto
            media_group = []
            for photo in photos:
                media_group.append(InputMediaPhoto(media=photo["telegram_file_id"], caption=photo.get("caption", "")))
                
            # Send in chunks of 10 (Telegram's MediaGroup limit)
            for i in range(0, len(media_group), 10):
                await update.message.reply_media_group(media=media_group[i:i+10])
                
            return
        except Exception as e:
            logger.error(f"Deep link error: {e}")
            await update.message.reply_text("⚠️ Failed to load event photos.")
            return

    # 2. Normal Welcome & Event Summary
    user = update.effective_user
    name = user.first_name if user else "Devotee"
    
    # Fetch events summary
    try:
        events_res = supabase.table("events").select("title, date").order("date", desc=True).limit(5).execute()
        events_text = "\n\n<b>📅 Recent & Upcoming Events:</b>\n"
        for ev in events_res.data:
            events_text += f"• {ev['title']} ({ev['date']})\n"
    except Exception as e:
        events_text = ""

    msg = (
        f"🙏 <b>Sai Ram, {name}!</b>\n\n"
        f"Welcome to the official bot of <b>{TRUST_NAME}</b>.\n\n"
        "A spiritual trust dedicated to the teachings of Sri Sathya Sai Baba — "
        "<b>Love All, Serve All.</b>"
        f"{events_text}\n\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "📋 <b>What I can do:</b>\n"
        "📱 /menu — Interactive inline dashboard menu\n"
        "🖼 /gallery — Browse Event photos\n"
        "📅 /events — View upcoming events\n"
        "❓ /help — Show all commands\n\n"
        "<i>Use the menu to easily navigate!</i>"
    )
    await update.message.reply_text(msg, parse_mode="HTML")


async def help_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show help menu with all available commands."""
    msg = (
        "❓ *Sathya Sai Prema Kuteeram Bot Help*\n"
        "━━━━━━━━━━━━━━━━━━━━━━\n\n"
        "Here are the commands you can use to interact with me:\n\n"
        "📱 /menu — Open the interactive dashboard main menu\n"
        "🖼 /gallery — View and browse photos by event\n"
        "📅 /events — Get details of upcoming scheduled events\n"
        "❓ /help — Show this help message\n\n"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")


async def gallery_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Browse Event Galleries."""
    try:
        res = supabase.table("events").select("id, title, date").order("date", desc=True).limit(10).execute()
        events = res.data
        
        if not events:
            msg = "📭 No events found yet."
            if update.callback_query:
                await update.callback_query.edit_message_text(msg)
            else:
                await update.message.reply_text(msg)
            return

        keyboard = []
        for ev in events:
            title = ev['title'][:30] + "..." if len(ev['title']) > 30 else ev['title']
            keyboard.append([InlineKeyboardButton(f"📅 [{ev['date']}] {title}", callback_data=f"gal_{ev['id']}")])
            
        if update.callback_query:
            keyboard.append([InlineKeyboardButton("⬅ Back to Menu", callback_data="menu_main")])
            
        reply_markup = InlineKeyboardMarkup(keyboard)
        msg_text = "🖼 <b>Select an Event to view its Gallery:</b>"
        
        if update.callback_query:
            await update.callback_query.edit_message_text(msg_text, reply_markup=reply_markup, parse_mode="HTML")
        else:
            await update.message.reply_text(msg_text, reply_markup=reply_markup, parse_mode="HTML")
            
    except Exception as e:
        logger.error(f"Gallery events fetch error: {e}")
        error_msg = "❌ Failed to fetch events."
        if update.callback_query:
            await update.callback_query.edit_message_text(error_msg)
        else:
            await update.message.reply_text(error_msg)

async def gallery_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle gallery event selection → fetch URLs from Supabase → send photos or request."""
    query = update.callback_query
    event_id = query.data.replace("gal_", "")

    try:
        res = supabase.table("gallery").select("telegram_file_id, caption").eq("event_id", event_id).execute()
        photos = [item for item in res.data if item.get("telegram_file_id")]

        if not photos:
            keyboard = [[InlineKeyboardButton("📸 Request Photos from Admin", callback_data=f"req_photos_{event_id}")]]
            await query.edit_message_text(
                "📭 <b>Photos for this event are not yet available.</b>\n\n"
                "Would you like to request the admins to upload them?",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="HTML"
            )
            return

        await query.edit_message_text(f"📸 Found <b>{len(photos)}</b> photo(s) for this event. Sending...", parse_mode="HTML")

        from telegram import InputMediaPhoto
        media_group = []
        for photo in photos:
            media_group.append(InputMediaPhoto(media=photo["telegram_file_id"], caption=photo.get("caption", "")))
            
        for i in range(0, len(media_group), 10):
            await context.bot.send_media_group(chat_id=query.message.chat_id, media=media_group[i:i+10])
            
        # Add the Download All button
        dl_keyboard = [[InlineKeyboardButton("📥 Download All Photos (.zip)", callback_data=f"dl_album_{event_id}")]]
        await context.bot.send_message(
            chat_id=query.message.chat_id,
            text="Enjoying these photos? Download the full album below!",
            reply_markup=InlineKeyboardMarkup(dl_keyboard)
        )
            
    except Exception as e:
        logger.error(f"Gallery fetch error: {e}")
        await query.edit_message_text("❌ Failed to fetch gallery photos.")

async def request_photos_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle photo requests."""
    query = update.callback_query
    event_id = query.data.replace("req_photos_", "")
    user = update.effective_user
    
    # Send notification to admins
    for admin_id in ADMIN_IDS:
        try:
            await context.bot.send_message(
                chat_id=admin_id,
                text=f"🔔 <b>Photo Request!</b>\n\nUser <b>{user.first_name}</b> requested photos for Event ID <b>{event_id}</b>.\nPlease upload them ASAP via /addalbum!",
                parse_mode="HTML"
            )
        except Exception:
            pass
            
    await query.edit_message_text("✅ Your request has been sent to the admins! Please check back later.")

async def download_album_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle Download All Photos button: fetches files, zips them, and sends."""
    query = update.callback_query
    event_id = query.data.replace("dl_album_", "")
    
    await query.answer()
    status_msg = await query.edit_message_text("⏳ Generating your ZIP file... Please wait.")

    try:
        res = supabase.table("gallery").select("telegram_file_id, caption").eq("event_id", event_id).execute()
        photos = [item for item in res.data if item.get("telegram_file_id")]
        
        if not photos:
            await status_msg.edit_text("❌ Photos no longer available.")
            return
            
        zip_buffer = io.BytesIO()
        
        # Async function to download a single photo
        async def fetch_photo(photo, idx):
            file_id = photo["telegram_file_id"]
            try:
                tg_file = await context.bot.get_file(file_id, read_timeout=60)
                file_bytes = await tg_file.download_as_bytearray()
                ext = tg_file.file_path.split('.')[-1] if tg_file.file_path else "jpg"
                caption = photo.get('caption')
                filename_base = f"{caption[:20]}_{idx}" if caption else f"photo_{idx}"
                filename_base = "".join(c for c in filename_base if c.isalnum() or c in (' ', '_')).rstrip()
                return (f"{filename_base}.{ext}", file_bytes)
            except Exception as dl_err:
                logger.warning(f"Failed to download photo {file_id} for zip: {dl_err}")
                return None
                
        # Fetch all photos concurrently
        results = await asyncio.gather(*[fetch_photo(p, i) for i, p in enumerate(photos)], return_exceptions=True)
        
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            for result in results:
                if result and not isinstance(result, Exception):
                    filename, file_bytes = result
                    zip_file.writestr(filename, file_bytes)
                    
        zip_buffer.seek(0)
        
        await status_msg.edit_text("✅ ZIP file generated! Uploading...")
        await context.bot.send_document(
            chat_id=query.message.chat_id,
            document=zip_buffer,
            filename=f"Event_{event_id}_Photos.zip",
            caption=f"📥 Here is the complete album for Event {event_id}!",
            read_timeout=120,
            write_timeout=120,
            connect_timeout=120
        )
        await status_msg.delete()
        
    except Exception as e:
        logger.error(f"ZIP generation error: {e}")
        await status_msg.edit_text("❌ Failed to generate ZIP file. It might be too large.")



async def events_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Show upcoming events from Supabase."""
    await update.message.reply_text("⏳ Fetching upcoming events from Supabase...")

    try:
        today = datetime.now().strftime("%Y-%m-%d")
        response = (
            supabase.table("events")
            .select("*")
            .gte("date", today)
            .order("date", desc=False)
            .limit(10)
            .execute()
        )
        events = response.data

        if not events:
            await update.message.reply_text(
                "📅 *No upcoming events at the moment.*\n\n"
                "_Check back soon or visit our website for updates._",
                parse_mode="Markdown",
            )
            return

        msg = "📅 *Upcoming Events — Sathya Sai Prema Kuteeram*\n"
        msg += "━━━━━━━━━━━━━━━━━━\n\n"

        for evt in events:
            emoji = CATEGORY_EMOJIS.get(evt.get("category", ""), "📌")
            desc = evt.get("description", "")
            desc_short = desc[:120] + "..." if len(desc) > 120 else desc
            msg += (
                f"{emoji} *{evt.get('title', 'Event')}*\n"
                f"📆 {evt.get('date', '')}  |  ⏰ {evt.get('time', 'TBA')}\n"
                f"📍 {evt.get('venue', 'SSPK Hall')}\n"
                f"👤 {evt.get('coordinator', 'N/A')} — {evt.get('contact', '')}\n"
                f"_{desc_short}_\n\n"
            )

        await update.message.reply_text(msg, parse_mode="Markdown")

    except Exception as e:
        logger.error(f"Events fetch error: {e}")
        await update.message.reply_text("❌ Could not fetch events.")





async def addalbum_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancel the upload process."""
    await update.message.reply_text("❌ Upload cancelled.")
    context.user_data.clear()
    return ConversationHandler.END


# ══════════════════════════════════════════════════════════════════════════════
# /addalbum CONVERSATION (INTERACTIVE BULK UPLOAD)
# ══════════════════════════════════════════════════════════════════════════════

async def addalbum_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Step 1: Ask admin to select an event."""
    if update.effective_user.id not in ADMIN_IDS:
        await update.message.reply_text("⛔️ Access Denied. Only authorized admins can use this command.")
        return ConversationHandler.END

    try:
        # Fetch top 10 recent events
        res = supabase.table("events").select("id, title, date").order("date", desc=True).limit(10).execute()
        events = res.data
        if not events:
            await update.message.reply_text("❌ No events found in the database.")
            return ConversationHandler.END
            
        keyboard = []
        for ev in events:
            keyboard.append([InlineKeyboardButton(f"📅 {ev['title']} ({ev['date']})", callback_data=f"alb_{ev['id']}")])
        keyboard.append([InlineKeyboardButton("❌ Cancel", callback_data="alb_cancel")])
        
        await update.message.reply_text(
            "📸 <b>Interactive Album Upload</b>\n\n"
            "Please select the event you want to attach photos to:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="HTML"
        )
        return AWAIT_ALBUM_EVENT
    except Exception as e:
        logger.error(f"addalbum error: {e}")
        await update.message.reply_text("❌ Error fetching events.")
        return ConversationHandler.END

async def addalbum_event_selected(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Step 2: Event chosen — ask for photos."""
    query = update.callback_query
    await query.answer()
    data = query.data
    
    if data == "alb_cancel":
        await query.edit_message_text("❌ Upload cancelled.")
        return ConversationHandler.END
        
    event_id = data.replace("alb_", "")
    context.user_data["album_event_id"] = event_id
    context.user_data["album_photo_count"] = 0
    
    await query.edit_message_text(
        f"✅ <b>Event Selected!</b>\n\n"
        f"Now, forward or upload as many photos as you want to this chat.\n"
        f"You can send an entire album at once.\n\n"
        f"When you are completely finished, type /done.",
        parse_mode="HTML"
    )
    return AWAIT_ALBUM_PHOTOS

async def addalbum_receive_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Step 3: Receive photo and save to DB silently."""
    event_id = context.user_data.get("album_event_id")
    if not event_id:
        return ConversationHandler.END
        
    photo = update.message.photo[-1]
    file_id = photo.file_id
    
    try:
        await save_gallery_record(src_url=None, storage_path=None, caption="", category="event", telegram_file_id=file_id, event_id=event_id)
        context.user_data["album_photo_count"] = context.user_data.get("album_photo_count", 0) + 1
    except Exception as e:
        logger.error(f"Failed to save album photo: {e}")
        
    # We do NOT reply to every photo to avoid spam
    return AWAIT_ALBUM_PHOTOS
    
async def addalbum_done(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Step 4: Admin types /done to finish."""
    count = context.user_data.get("album_photo_count", 0)
    await update.message.reply_text(
        f"🎉 <b>Upload Complete!</b>\n\n"
        f"Successfully saved <b>{count} photos</b> to the database.\n"
        f"These photos cost 0 bytes of server storage and are now live!",
        parse_mode="HTML"
    )
    context.user_data.clear()
    return ConversationHandler.END


# ══════════════════════════════════════════════════════════════════════════════
# /deletealbum / /deletephotos / /delete COMMANDS & CALLBACKS
# ══════════════════════════════════════════════════════════════════════════════

async def delete_photos_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Start interactive album deletion flow for admins."""
    if update.effective_user.id not in ADMIN_IDS:
        await update.message.reply_text("⛔️ Access Denied. Only authorized admins can use this command.")
        return

    try:
        # Fetch events that have photos in the gallery
        res = supabase.table("events").select("id, title, date").order("date", desc=True).limit(20).execute()
        events = res.data
        if not events:
            await update.message.reply_text("❌ No events found in the database.")
            return

        keyboard = []
        for ev in events:
            keyboard.append([InlineKeyboardButton(f"📅 {ev['title']} ({ev['date']})", callback_data=f"delalb_choose_{ev['id']}")])
        
        await update.message.reply_text(
            "🗑️ <b>Delete Event Album / Photos</b>\n\n"
            "Please select the event you want to manage:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="HTML"
        )
    except Exception as e:
        logger.error(f"delete_photos_command error: {e}")
        await update.message.reply_text("❌ Error fetching events.")

async def delete_reply_handler(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Fast-track deletion: Admin replies to a photo in private chat with /delete."""
    if update.effective_user.id not in ADMIN_IDS:
        await update.message.reply_text("⛔️ Access Denied. Only authorized admins can use this command.")
        return

    message = update.message
    if not message.reply_to_message:
        await message.reply_text(
            "ℹ️ <b>How to delete a single photo quickly:</b>\n"
            "Reply to any photo message in this chat and type <code>/delete</code>.",
            parse_mode="HTML"
        )
        return

    replied = message.reply_to_message
    if not replied.photo:
        await message.reply_text("❌ The replied message does not contain a photo.")
        return

    file_id = replied.photo[-1].file_id

    try:
        # Query gallery table for this file_id
        res = supabase.table("gallery").select("id, storage_path").eq("telegram_file_id", file_id).execute()
        records = res.data
        
        if not records:
            await message.reply_text("❌ This photo was not found in the gallery database.")
            return

        record = records[0]
        gallery_id = record["id"]
        storage_path = record.get("storage_path")

        # Delete from storage if present
        if storage_path:
            try:
                supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
                logger.info(f"Deleted storage file: {storage_path}")
            except Exception as e:
                logger.warning(f"Could not delete storage file: {e}")

        # Delete from DB
        supabase.table("gallery").delete().eq("id", gallery_id).execute()
        await message.reply_text("✅ <b>Photo deleted successfully!</b>", parse_mode="HTML")

    except Exception as e:
        logger.error(f"delete_reply_handler error: {e}")
        await message.reply_text("❌ Error deleting photo from the database.")


async def delete_photos_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handles deletion menu callback buttons."""
    query = update.callback_query
    if query.from_user.id not in ADMIN_IDS:
        await query.answer("⛔️ Access Denied.", show_alert=True)
        return

    await query.answer()
    data = query.data

    if data.startswith("delalb_choose_"):
        event_id = data.replace("delalb_choose_", "")
        try:
            # Get event title
            ev_res = supabase.table("events").select("title").eq("id", event_id).execute()
            if not ev_res.data:
                await query.edit_message_text("❌ Event not found.")
                return
            event_title = ev_res.data[0]["title"]

            # Count photos
            photo_res = supabase.table("gallery").select("id").eq("event_id", event_id).execute()
            photo_count = len(photo_res.data)

            keyboard = [
                [
                    InlineKeyboardButton("🗑️ Delete Entire Album", callback_data=f"delalb_confall_{event_id}"),
                    InlineKeyboardButton("🖼️ Manage Individually", callback_data=f"delalb_manage_{event_id}_0")
                ],
                [InlineKeyboardButton("⬅️ Back to Events", callback_data="delalb_back")]
            ]

            await query.edit_message_text(
                f"📅 <b>Event Selected:</b> {event_title}\n\n"
                f"This event currently has <b>{photo_count}</b> photos in the gallery.\n\n"
                "What action would you like to perform?",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="HTML"
            )
        except Exception as e:
            logger.error(f"delalb_choose error: {e}")
            await query.edit_message_text("❌ Error loading event details.")

    elif data == "delalb_back":
        # Return to events list
        try:
            res = supabase.table("events").select("id, title, date").order("date", desc=True).limit(20).execute()
            events = res.data
            keyboard = []
            for ev in events:
                keyboard.append([InlineKeyboardButton(f"📅 {ev['title']} ({ev['date']})", callback_data=f"delalb_choose_{ev['id']}")])
            
            await query.edit_message_text(
                "🗑️ <b>Delete Event Album / Photos</b>\n\n"
                "Please select the event you want to manage:",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="HTML"
            )
        except Exception as e:
            logger.error(f"delalb_back error: {e}")
            await query.edit_message_text("❌ Error fetching events.")

    elif data.startswith("delalb_confall_"):
        event_id = data.replace("delalb_confall_", "")
        try:
            ev_res = supabase.table("events").select("title").eq("id", event_id).execute()
            event_title = ev_res.data[0]["title"] if ev_res.data else "Event"

            # Confirmation buttons
            keyboard = [
                [
                    InlineKeyboardButton("🔥 Yes, Delete EVERYTHING", callback_data=f"delalb_deleteall_{event_id}"),
                    InlineKeyboardButton("❌ Cancel", callback_data=f"delalb_choose_{event_id}")
                ]
            ]
            await query.edit_message_text(
                f"⚠️ <b>WARNING! BULK DELETION</b>\n\n"
                f"Are you absolutely sure you want to delete <b>ALL photos</b> for the event: <i>{event_title}</i>?\n"
                "This action cannot be undone!",
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="HTML"
            )
        except Exception as e:
            logger.error(f"delalb_confall error: {e}")
            await query.edit_message_text("❌ Error preparing confirmation.")

    elif data.startswith("delalb_deleteall_"):
        event_id = data.replace("delalb_deleteall_", "")
        try:
            # Query all records to delete from storage first
            res = supabase.table("gallery").select("id, storage_path").eq("event_id", event_id).execute()
            records = res.data
            
            deleted_storage_count = 0
            for r in records:
                storage_path = r.get("storage_path")
                if storage_path:
                    try:
                        supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
                        deleted_storage_count += 1
                    except Exception as e:
                        logger.warning(f"Could not delete storage file {storage_path}: {e}")

            # Delete from DB
            db_res = supabase.table("gallery").delete().eq("event_id", event_id).execute()
            deleted_db_count = len(records)

            await query.edit_message_text(
                f"✅ <b>Bulk Deletion Complete!</b>\n\n"
                f"Successfully deleted <b>{deleted_db_count}</b> gallery database records.\n"
                f"Removed <b>{deleted_storage_count}</b> files from Supabase Storage.",
                parse_mode="HTML"
            )
        except Exception as e:
            logger.error(f"delalb_deleteall error: {e}")
            await query.edit_message_text("❌ Error occurred during bulk deletion.")

    elif data.startswith("delalb_manage_"):
        # Format: delalb_manage_<event_id>_<index>
        parts = data.split("_")
        event_id = parts[2]
        index = int(parts[3])
        
        await show_single_photo_management(query, event_id, index)

    elif data.startswith("del_s_"):
        # Format: del_s_<gallery_id>_<index>
        parts = data.split("_")
        gallery_id = parts[2]
        index = int(parts[3])

        try:
            # Query gallery item to get event_id and storage_path
            res = supabase.table("gallery").select("event_id, storage_path").eq("id", gallery_id).execute()
            if not res.data:
                await query.answer("❌ Photo not found in database.", show_alert=True)
                return
                
            item = res.data[0]
            event_id = item["event_id"]
            storage_path = item.get("storage_path")

            if storage_path:
                try:
                    supabase.storage.from_(STORAGE_BUCKET).remove([storage_path])
                except Exception as e:
                    logger.warning(f"Could not delete storage file {storage_path}: {e}")

            # Delete DB record
            supabase.table("gallery").delete().eq("id", gallery_id).execute()

            # Refresh and show next photo at the same index
            await show_single_photo_management(query, event_id, index, deleted=True)

        except Exception as e:
            logger.error(f"del_s error: {e}")
            await query.edit_message_text("❌ Error deleting photo.")

    elif data.startswith("delalb_done_"):
        # Finished individual management
        chat_id = query.message.chat_id
        message_id = query.message.message_id
        try:
            await context.bot.delete_message(chat_id=chat_id, message_id=message_id)
        except Exception:
            pass
        await context.bot.send_message(
            chat_id=chat_id,
            text="✅ <b>Finished photo management.</b>",
            parse_mode="HTML"
        )


async def show_single_photo_management(query, event_id: str, index: int, deleted: bool = False) -> None:
    """Helper to display or edit the message to show a single photo with delete/nav keys."""
    try:
        # Fetch event title
        ev_res = supabase.table("events").select("title").eq("id", event_id).execute()
        event_title = ev_res.data[0]["title"] if ev_res.data else "Event"

        # Fetch all photos for this event
        photo_res = supabase.table("gallery").select("id, telegram_file_id, src_url, caption").eq("event_id", event_id).execute()
        photos = photo_res.data
        total_photos = len(photos)

        if total_photos == 0:
            msg = f"✅ All photos managed for event: <b>{event_title}</b>"
            if query.message.photo:
                try:
                    await query.message.delete()
                except Exception:
                    pass
                await query.message.reply_text(msg, parse_mode="HTML")
            else:
                await query.edit_message_text(msg, parse_mode="HTML")
            return

        # Ensure index is bounds-safe
        if index < 0:
            index = 0
        if index >= total_photos:
            index = total_photos - 1

        photo_item = photos[index]
        gallery_id = photo_item["id"]
        file_id_or_url = photo_item.get("telegram_file_id") or photo_item.get("src_url")
        caption = photo_item.get("caption") or "(No Caption)"

        # Prepare caption text
        caption_text = (
            f"🖼️ <b>Event Album Photo {index + 1}/{total_photos}</b>\n"
            f"📅 <b>Event:</b> {event_title}\n"
            f"📝 <b>Caption:</b> {caption}\n\n"
            "Use the buttons below to navigate or delete this photo."
        )

        keyboard = []
        nav_row = []
        if index > 0:
            nav_row.append(InlineKeyboardButton("⬅️ Prev", callback_data=f"delalb_manage_{event_id}_{index - 1}"))
        
        # Delete photo button (del_s_<gallery_id>_<index>)
        nav_row.append(InlineKeyboardButton("🗑️ Delete", callback_data=f"del_s_{gallery_id}_{index}"))

        if index < total_photos - 1:
            nav_row.append(InlineKeyboardButton("Next ➡️", callback_data=f"delalb_manage_{event_id}_{index + 1}"))

        keyboard.append(nav_row)
        keyboard.append([
            InlineKeyboardButton("❌ Done", callback_data=f"delalb_done_{event_id}"),
            InlineKeyboardButton("🔙 Back to Menu", callback_data=f"delalb_choose_{event_id}")
        ])

        # Render message
        if query.message.photo:
            await query.edit_message_media(
                media=InputMediaPhoto(media=file_id_or_url, caption=caption_text, parse_mode="HTML"),
                reply_markup=InlineKeyboardMarkup(keyboard)
            )
        else:
            try:
                await query.message.delete()
            except Exception:
                pass
            await query.message.reply_photo(
                photo=file_id_or_url,
                caption=caption_text,
                reply_markup=InlineKeyboardMarkup(keyboard),
                parse_mode="HTML"
            )
    except Exception as e:
        logger.error(f"show_single_photo_management error: {e}")
        await query.message.reply_text("❌ Error displaying photo.")


# ══════════════════════════════════════════════════════════════════════════════
# MEDIA & TEXT HANDLERS
# ══════════════════════════════════════════════════════════════════════════════

# Format: { chat_id: {"event_id": "123", "timestamp": 171000000} }
ACTIVE_EVENTS_CACHE = {}
UPLOAD_TIMEOUT_SECONDS = 120  # 2 minutes window for bulk uploads

# Format: { chat_id: [ {"file_id": "xyz", "caption": "abc", "timestamp": 171000000}, ... ] }
ORPHAN_PHOTOS_CACHE = {}
ORPHAN_TIMEOUT_SECONDS = 60 # 60 seconds waiting room

async def handle_channel_post(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Listen to private channel and save photos automatically to events.
       To trigger, post a photo with caption 'Event: 123' (or 'Event_123').
       If it's a large album, all photos sent within 2 minutes will be grouped.
    """
    message = update.channel_post
    if not message or not message.photo:
        return
        
    chat_id = message.chat_id
    caption = message.caption or ""
    file_id = message.photo[-1].file_id
    
    event_id = None
    current_time = time.time()
    
    import re
    
    # Robust parsing of Event ID (must be digits) in the caption
    event_id = None
    
    # 1. Match patterns like "event: 12", "event_12", "event 12"
    match = re.search(r'event[_\s:]*([0-9]+)', caption, re.IGNORECASE)
    if match:
        event_id = match.group(1)
        
    # 2. If not found, match pattern "#12"
    if not event_id:
        match = re.search(r'#([0-9]+)', caption)
        if match:
            event_id = match.group(1)
            
    # 3. If not found, check if the clean caption itself is just a number
    if not event_id:
        clean_caption = caption.strip()
        if clean_caption.isdigit():
            event_id = clean_caption
            
    if event_id:
        # We found a caption! Set this as the active event for this chat.
        ACTIVE_EVENTS_CACHE[chat_id] = {
            "event_id": event_id,
            "timestamp": current_time
        }
        
        # Save the captioned photo immediately
        try:
            await save_gallery_record(src_url=None, storage_path=None, caption=caption, category="event", telegram_file_id=file_id, event_id=event_id)
            logger.info(f"✅ Saved captioned channel photo to Event {event_id}")
        except Exception as e:
            logger.error(f"Failed to save captioned channel photo: {e}")

        # Retroactively process any orphans that arrived before this caption!
        orphans = ORPHAN_PHOTOS_CACHE.get(chat_id, [])
        if orphans:
            saved_orphans = 0
            for orphan in orphans:
                if current_time - orphan["timestamp"] <= ORPHAN_TIMEOUT_SECONDS:
                    try:
                        await save_gallery_record(src_url=None, storage_path=None, caption=orphan["caption"], category="event", telegram_file_id=orphan["file_id"], event_id=event_id)
                        saved_orphans += 1
                    except Exception as e:
                        logger.error(f"Failed to save orphan photo: {e}")
            logger.info(f"✅ Recovered and saved {saved_orphans} orphan photos to Event {event_id}!")
            # Clear the orphan buffer for this chat
            ORPHAN_PHOTOS_CACHE[chat_id] = []
            
    else:
        # No caption. Check if there's an active event in the last 2 minutes.
        active_cache = ACTIVE_EVENTS_CACHE.get(chat_id)
        if active_cache and (current_time - active_cache["timestamp"] <= UPLOAD_TIMEOUT_SECONDS):
            event_id = active_cache["event_id"]
            active_cache["timestamp"] = current_time # refresh timeout
            try:
                await save_gallery_record(src_url=None, storage_path=None, caption=caption, category="event", telegram_file_id=file_id, event_id=event_id)
                logger.info(f"✅ Saved channel photo to Event {event_id}")
            except Exception as e:
                logger.error(f"Failed to save channel photo: {e}")
        else:
            # No active event and no caption! This might be an early arrival.
            # Put it in the orphan buffer waiting room.
            if chat_id not in ORPHAN_PHOTOS_CACHE:
                ORPHAN_PHOTOS_CACHE[chat_id] = []
            ORPHAN_PHOTOS_CACHE[chat_id].append({
                "file_id": file_id,
                "caption": caption,
                "timestamp": current_time
            })
            
            # Keep orphan buffer clean (remove very old orphans)
            ORPHAN_PHOTOS_CACHE[chat_id] = [o for o in ORPHAN_PHOTOS_CACHE[chat_id] if current_time - o["timestamp"] <= ORPHAN_TIMEOUT_SECONDS]
            logger.info(f"⏳ Added uncaptioned photo to Orphan Buffer (Total orphans: {len(ORPHAN_PHOTOS_CACHE[chat_id])})")

async def handle_media(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send back media as a downloadable document."""
    message = update.message
    if message.photo:
        photo = message.photo[-1]
        await context.bot.send_document(chat_id=message.chat_id, document=photo.file_id)
    elif message.document:
        await message.reply_document(document=message.document.file_id)
    elif message.video:
        await message.reply_video(video=message.video.file_id)





# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

async def post_init(application: Application) -> None:
    """Register commands dynamically with Telegram on startup."""
    from telegram import BotCommand
    commands = [
        BotCommand("start", "Welcome message & description"),
        BotCommand("menu", "SSPK interactive dashboard menu"),
        BotCommand("gallery", "Browse Event photos"),
        BotCommand("events", "View upcoming scheduled events"),
        BotCommand("deletealbum", "Manage/Delete event albums (Admin)"),
        BotCommand("delete", "Delete replied photo (Admin)"),
        BotCommand("help", "Show all available commands"),
    ]
    try:
        await application.bot.set_my_commands(commands)
        logger.info("✅ Bot commands registered dynamically with Telegram.")
    except Exception as e:
        logger.error(f"Failed to register commands with Telegram: {e}")


def main() -> None:
    """Starts the bot."""
    # Ensure active event loop is registered on modern Python versions (e.g. 3.12, 3.13, 3.14)
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    logger.info(f"🚀 Starting {TRUST_NAME} Telegram Bot...")

    app = Application.builder().token(TELEGRAM_BOT_TOKEN).post_init(post_init).build()

    # /addalbum conversation
    addalbum_conv = ConversationHandler(
        entry_points=[CommandHandler("addalbum", addalbum_start)],
        states={
            AWAIT_ALBUM_EVENT: [
                CallbackQueryHandler(addalbum_event_selected, pattern="^alb_"),
            ],
            AWAIT_ALBUM_PHOTOS: [
                MessageHandler(filters.PHOTO, addalbum_receive_photo),
                CommandHandler("done", addalbum_done),
            ],
        },
        fallbacks=[CommandHandler("cancel", addalbum_cancel), CommandHandler("done", addalbum_done)],
    )

    app.add_handler(CommandHandler("start",   start))
    app.add_handler(CommandHandler("menu",    menu_command))
    app.add_handler(CommandHandler("gallery", gallery_command))
    app.add_handler(CommandHandler("events",  events_command))
    app.add_handler(CommandHandler("help",    help_command))
    app.add_handler(CommandHandler("deletealbum", delete_photos_command))
    app.add_handler(CommandHandler("deletephotos", delete_photos_command))
    app.add_handler(CommandHandler("delete", delete_reply_handler))
    app.add_handler(addalbum_conv)

    # Private Channel Bulk Upload Listener
    app.add_handler(MessageHandler(filters.ChatType.CHANNEL & filters.PHOTO, handle_channel_post))

    # Callback queries for interactive menu (prefix 'menu_') and category selections (prefix 'gal_')
    app.add_handler(CallbackQueryHandler(menu_callback_handler, pattern="^menu_"))
    app.add_handler(CallbackQueryHandler(gallery_callback, pattern="^gal_"))
    app.add_handler(CallbackQueryHandler(request_photos_callback, pattern="^req_photos_"))
    app.add_handler(CallbackQueryHandler(download_album_callback, pattern="^dl_album_"))
    app.add_handler(CallbackQueryHandler(delete_photos_callback, pattern="^(delalb_|del_s_)"))

    # Global Inline Queries search
    app.add_handler(InlineQueryHandler(inline_query_handler))

    # Media handling (outside conversation)
    app.add_handler(MessageHandler(filters.PHOTO,        handle_media))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_media))
    app.add_handler(MessageHandler(filters.VIDEO,        handle_media))

    logger.info("✅ Bot is running. Press Ctrl+C to stop.")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
