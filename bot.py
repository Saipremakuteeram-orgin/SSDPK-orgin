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
    match = re.search(r'event[_\s:]*([a-zA-Z0-9\-]+)', caption, re.IGNORECASE)
    
    if match:
        # We found a caption! Set this as the active event for this chat.
        event_id = match.group(1)
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
    app.add_handler(addalbum_conv)

    # Private Channel Bulk Upload Listener
    app.add_handler(MessageHandler(filters.ChatType.CHANNEL & filters.PHOTO, handle_channel_post))

    # Callback queries for interactive menu (prefix 'menu_') and category selections (prefix 'gal_')
    app.add_handler(CallbackQueryHandler(menu_callback_handler, pattern="^menu_"))
    app.add_handler(CallbackQueryHandler(gallery_callback, pattern="^gal_"))
    app.add_handler(CallbackQueryHandler(request_photos_callback, pattern="^req_photos_"))
    app.add_handler(CallbackQueryHandler(download_album_callback, pattern="^dl_album_"))

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
