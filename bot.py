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
    model_name="gemini-2.0-flash",
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

# ConversationHandler states for /addgallery
AWAIT_PHOTO, AWAIT_CAPTION = range(2)


# ══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ══════════════════════════════════════════════════════════════════════════════

async def ask_gemini(prompt: str) -> str:
    """Query the Gemini AI model and return a formatted response."""
    try:
        response = gemini_model.generate_content(prompt)
        return response.text
    except Exception as e:
        logger.error(f"Gemini API error: {e}")
        return (
            "🙏 *Sai Ram!*\n\n"
            "I'm unable to process your question right now. "
            "Please try again in a moment.\n\n"
            "_Sai's grace is always with you._"
        )


async def get_sai_quote() -> str:
    """Generate a high-quality spiritual quote using Gemini AI."""
    prompt = (
        "Generate an inspiring, short spiritual quote by Sri Sathya Sai Baba on love, peace, or service. "
        "Do not include explanation, just the quote and '— Sri Sathya Sai Baba'. Keep it under 200 characters."
    )
    return await ask_gemini(prompt)


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


async def save_gallery_record(src_url: str, storage_path: str, caption: str, category: str) -> bool:
    """Insert a record into the Supabase gallery table."""
    try:
        supabase.table("gallery").insert({
            "src_url":      src_url,
            "storage_path": storage_path,
            "caption":      caption,
            "category":     category,
            "source":       "telegram",
        }).execute()
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
            InlineKeyboardButton("🕉 Daily Sai Quote", callback_data="menu_quote"),
            InlineKeyboardButton("📞 Contact SSPK", callback_data="menu_contact"),
        ],
        [
            InlineKeyboardButton("💬 Ask AI", callback_data="menu_ai_info"),
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

    elif data == "menu_ai_info":
        msg = (
            "💬 *SSPK Spiritual AI Support*\n\n"
            "Simply send *any spiritual question* directly in the chat, "
            "and our Gemini AI engine will provide guidance immediately!\n\n"
            "Example: _How do I achieve inner peace?_"
        )
        keyboard = [[InlineKeyboardButton("⬅ Back to Menu", callback_data="menu_main")]]
        await query.edit_message_text(
            text=msg,
            reply_markup=InlineKeyboardMarkup(keyboard),
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
        keyboard = [
            [
                InlineKeyboardButton("🎵 Bhajans", callback_data="mg_bhajan"),
                InlineKeyboardButton("🤲 Seva", callback_data="mg_seva"),
            ],
            [
                InlineKeyboardButton("🎉 Celebrations", callback_data="mg_celebration"),
                InlineKeyboardButton("🤝 Community", callback_data="mg_community"),
            ],
            [InlineKeyboardButton("⬅ Back to Menu", callback_data="menu_main")]
        ]
        await query.edit_message_text(
            text="🖼 *Gallery Categories*\nSelect a category to view directly in chat:",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="Markdown"
        )

    elif data.startswith("mg_"):
        category = data.replace("mg_", "")
        await query.edit_message_text("⏳ Loading category photos...")
        # Direct fallback triggers the normal gallery response
        query.data = f"gal_{category}"
        await gallery_callback(update, context)

    elif data == "menu_quote":
        await query.edit_message_text("🕉 *Tuning to Swami's message...*")
        quote = await get_sai_quote()
        keyboard = [
            [InlineKeyboardButton("🔄 Refresh Quote", callback_data="menu_quote")],
            [InlineKeyboardButton("⬅ Back to Menu", callback_data="menu_main")]
        ]
        await query.edit_message_text(
            text=f"🕉 *Sai's Message for You:*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n_{quote}_",
            reply_markup=InlineKeyboardMarkup(keyboard),
            parse_mode="Markdown"
        )

    elif data == "menu_contact":
        msg = (
            "📞 *Sathya Sai Prema Kuteeram Contact*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n"
            "📍 *Address:*\nSri Sathya Sai Prema Kuteeram,\nKancheepuram, Tamil Nadu, India\n\n"
            "📞 *Phone Support:* +91-9876543210\n"
            "✉ *Email:* support@sspk.org\n\n"
            "🌐 *Website:* [Sathya Sai Portal](https://sspk.org)\n\n"
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
                            f"🌐 Visit: [Sathya Sai Portal](https://sspk.org)"
                        ),
                        parse_mode="Markdown"
                    )
                )

        # 3. Add a default Gemini Spiritual Quote if query is empty or asking for wisdom
        if not query or "quote" in query or "wisdom" in query or "sai" in query:
            quote = await get_sai_quote()
            results.append(
                InlineQueryResultArticle(
                    id=str(uuid.uuid4()),
                    title="🕉 Daily Sai Quote",
                    description="Share Sri Sathya Sai Baba's spiritual wisdom card",
                    input_message_content=InputTextMessageContent(
                        message_text=f"🕉 *Sai's Message for You:*\n━━━━━━━━━━━━━━━━━━━━━━━━\n\n_{quote}_",
                        parse_mode="Markdown"
                    )
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
    """Welcome message."""
    user = update.effective_user
    name = user.first_name if user else "Devotee"
    msg = (
        f"🙏 *Sai Ram, {name}!*\n\n"
        f"Welcome to the official bot of *{TRUST_NAME}*.\n\n"
        "A spiritual trust dedicated to the teachings of Sri Sathya Sai Baba — "
        "*Love All, Serve All.*\n\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "📋 *What I can do:*\n"
        "📱 /menu — Interactive inline dashboard menu\n"
        "🖼 /gallery — Browse & download gallery images\n"
        "📅 /events — View upcoming events\n"
        "💬 /info — Spiritual guidance via AI\n"
        "❓ /help — Show all commands\n\n"
        "_Try typing `@bot_username bhajan` in any chat to search events/photos!_"
    )
    await update.message.reply_text(msg, parse_mode="Markdown")


async def gallery_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Browse gallery categories."""
    keyboard = [
        [
            InlineKeyboardButton("🎵 Bhajans",   callback_data="gal_bhajan"),
            InlineKeyboardButton("🤲 Seva",       callback_data="gal_seva"),
        ],
        [
            InlineKeyboardButton("📌 Events",     callback_data="gal_event"),
            InlineKeyboardButton("🤝 Community",  callback_data="gal_community"),
        ],
        [InlineKeyboardButton("📂 All Photos", callback_data="gal_all")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "🖼 *Gallery — Choose a category to browse:*",
        reply_markup=reply_markup,
        parse_mode="Markdown",
    )


async def gallery_callback(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Handle gallery category selection → fetch URLs from Supabase → send photos."""
    query = update.callback_query
    category = query.data.replace("gal_", "")

    try:
        sb_query = (
            supabase.table("gallery")
            .select("id, caption, category, src_url, placeholder, source")
            .order("created_at", desc=True)
        )
        if category != "all":
            sb_query = sb_query.eq("category", category)

        response = sb_query.execute()
        items = response.data

        if not items:
            await query.edit_message_text(
                "📭 No images found in this category yet.\n\n"
                "Admin can upload via /addgallery or through the website dashboard!"
            )
            return

        real_images = [i for i in items if i.get("src_url")]
        placeholders = [i for i in items if not i.get("src_url")]

        await query.edit_message_text(
            f"📸 Found *{len(real_images)}* photo(s) in *{category.title()}*. Sending...",
            parse_mode="Markdown",
        )

        for item in real_images:
            source_tag = "📱 via Telegram" if item.get("source") == "telegram" else "🖥 via Dashboard"
            caption_text = (
                f"🙏 *{item.get('caption', 'SSPK Gallery')}*\n"
                f"📂 {CATEGORY_EMOJIS.get(item.get('category',''), '📌')} {item.get('category','').title()}\n"
                f"{source_tag}\n\n"
                f"_Tap ⬇ Download to save the original photo._"
            )
            try:
                await context.bot.send_photo(
                    chat_id=query.message.chat_id,
                    photo=item["src_url"],
                    caption=caption_text,
                    parse_mode="Markdown",
                )
            except Exception as img_err:
                logger.warning(f"Could not send photo {item['id']}: {img_err}")

        if placeholders:
            names = ", ".join(p.get("caption", "?") for p in placeholders)
            await context.bot.send_message(
                chat_id=query.message.chat_id,
                text=f"📋 *{len(placeholders)}* placeholder items: _{names}_",
                parse_mode="Markdown",
            )

    except Exception as e:
        logger.error(f"Gallery fetch error: {e}")
        await query.edit_message_text("❌ Failed to fetch gallery.")


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


async def info_command(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send Gemini AI spiritual info."""
    question = " ".join(context.args) if context.args else None
    if not question:
        await update.message.reply_text(
            "💬 *Ask a spiritual question!*\n\n"
            "Usage: `/info Who is Sathya Sai Baba?`\n\n"
            "_Or just type your question directly in the chat._",
            parse_mode="Markdown",
        )
        return
    await update.message.reply_text("🧠 Thinking with Swami's grace...")
    response_text = await ask_gemini(question)
    await update.message.reply_text(response_text, parse_mode="Markdown")


# ══════════════════════════════════════════════════════════════════════════════
# /addgallery CONVERSATION
# ══════════════════════════════════════════════════════════════════════════════

async def addgallery_start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Step 1: Ask admin to select category."""
    keyboard = [
        [
            InlineKeyboardButton("🎵 Bhajan",     callback_data="ag_bhajan"),
            InlineKeyboardButton("🤲 Seva",       callback_data="ag_seva"),
        ],
        [
            InlineKeyboardButton("🎉 Celebration",callback_data="ag_celebration"),
            InlineKeyboardButton("🤝 Community",  callback_data="ag_community"),
        ],
        [
            InlineKeyboardButton("📌 Event",      callback_data="ag_event"),
            InlineKeyboardButton("📚 Study",      callback_data="ag_study"),
        ],
        [InlineKeyboardButton("❌ Cancel",        callback_data="ag_cancel")],
    ]
    await update.message.reply_text(
        "📤 *Add Photo to Gallery*\n\n"
        "Step 1: Select the category for this photo:",
        reply_markup=InlineKeyboardMarkup(keyboard),
        parse_mode="Markdown",
    )
    return AWAIT_PHOTO


async def addgallery_category_selected(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Step 2: Category chosen — now ask for the photo."""
    query = update.callback_query
    await query.answer()

    if query.data == "ag_cancel":
        await query.edit_message_text("❌ Upload cancelled.")
        return ConversationHandler.END

    category = query.data.replace("ag_", "")
    context.user_data["gallery_category"] = category
    emoji = CATEGORY_EMOJIS.get(category, "📌")

    await query.edit_message_text(
        f"✅ Category: {emoji} *{category.title()}*\n\n"
        f"Step 2: Now *send the photo* you want to add to the gallery.\n\n"
        f"_The image will be uploaded to Supabase Storage and appear on the website automatically._",
        parse_mode="Markdown",
    )
    return AWAIT_PHOTO


async def addgallery_receive_photo(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Step 3: Photo received — ask for caption."""
    if not update.message.photo:
        await update.message.reply_text("⚠️ Please send a *photo*.", parse_mode="Markdown")
        return AWAIT_PHOTO

    photo = update.message.photo[-1]
    context.user_data["gallery_file_id"] = photo.file_id

    await update.message.reply_text(
        "📝 Step 3: Send the *caption* for this photo.\n\n"
        "Example: `Evening Bhajans at SSPK Hall`",
        parse_mode="Markdown",
    )
    return AWAIT_CAPTION


async def addgallery_receive_caption(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Step 4: Caption received → Download photo → Upload to Supabase Storage → Save URL."""
    caption   = update.message.text.strip()
    file_id   = context.user_data.get("gallery_file_id")
    category  = context.user_data.get("gallery_category", "event")

    if not file_id:
        await update.message.reply_text("❌ No photo found. Start again with /addgallery.")
        return ConversationHandler.END

    status_msg = await update.message.reply_text("⏳ Syncing image with Supabase Cloud...")

    try:
        # Download
        tg_file = await context.bot.get_file(file_id)
        file_bytes_io = io.BytesIO()
        await tg_file.download_to_memory(file_bytes_io)
        file_bytes = file_bytes_io.getvalue()

        # Upload Storage
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename  = f"{category}_{timestamp}.jpg"
        public_url, storage_path = await upload_to_supabase_storage(file_bytes, filename)

        if not public_url:
            await status_msg.edit_text("❌ Failed to upload to Supabase Storage.")
            return ConversationHandler.END

        # Save Table row
        saved = await save_gallery_record(public_url, storage_path, caption, category)

        if saved:
            emoji = CATEGORY_EMOJIS.get(category, "📌")
            await status_msg.edit_text(
                f"✅ *Photo added to gallery successfully!*\n\n"
                f"📂 Category: {emoji} {category.title()}\n"
                f"📝 Caption: {caption}\n"
                f"🔗 Stored as URL in Supabase Storage\n\n"
                f"_The photo will now appear on the website dynamically._",
                parse_mode="Markdown",
            )
        else:
            await status_msg.edit_text("⚠️ Upload succeeded, but DB insert failed.")

    except Exception as e:
        logger.error(f"addgallery error: {e}")
        await status_msg.edit_text(f"❌ Upload failed: {str(e)}")

    context.user_data.clear()
    return ConversationHandler.END


async def addgallery_cancel(update: Update, context: ContextTypes.DEFAULT_TYPE) -> int:
    """Cancel upload."""
    context.user_data.clear()
    await update.message.reply_text("❌ Upload cancelled.")
    return ConversationHandler.END


# ══════════════════════════════════════════════════════════════════════════════
# MEDIA & TEXT HANDLERS
# ══════════════════════════════════════════════════════════════════════════════

async def handle_media(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Send back media as a downloadable document."""
    message = update.message
    if message.photo:
        photo = message.photo[-1]
        await message.reply_text("📥 received. Use /addgallery to upload to website.")
        await context.bot.send_document(chat_id=message.chat_id, document=photo.file_id)
    elif message.document:
        await message.reply_document(document=message.document.file_id)
    elif message.video:
        await message.reply_video(video=message.video.file_id)


async def handle_text(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Respond to text with Gemini AI."""
    user_text = update.message.text
    await update.message.reply_text("🙏 *Sai Ram!* Answering with Swami's grace...", parse_mode="Markdown")
    response_text = await ask_gemini(user_text)
    await update.message.reply_text(response_text, parse_mode="Markdown")


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main() -> None:
    """Starts the bot."""
    # Ensure active event loop is registered on modern Python versions (e.g. 3.12, 3.13, 3.14)
    try:
        asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    logger.info(f"🚀 Starting {TRUST_NAME} Telegram Bot...")

    app = Application.builder().token(TELEGRAM_BOT_TOKEN).build()

    # /addgallery conversation
    addgallery_conv = ConversationHandler(
        entry_points=[CommandHandler("addgallery", addgallery_start)],
        states={
            AWAIT_PHOTO: [
                CallbackQueryHandler(addgallery_category_selected, pattern="^ag_"),
                MessageHandler(filters.PHOTO, addgallery_receive_photo),
                MessageHandler(filters.TEXT & ~filters.COMMAND, addgallery_receive_photo),
            ],
            AWAIT_CAPTION: [
                MessageHandler(filters.TEXT & ~filters.COMMAND, addgallery_receive_caption),
            ],
        },
        fallbacks=[CommandHandler("cancel", addgallery_cancel)],
    )

    # Handlers
    app.add_handler(CommandHandler("start",   start))
    app.add_handler(CommandHandler("menu",    menu_command))
    app.add_handler(CommandHandler("gallery", gallery_command))
    app.add_handler(CommandHandler("events",  events_command))
    app.add_handler(CommandHandler("info",    info_command))
    app.add_handler(addgallery_conv)

    # Callback queries for interactive menu (prefix 'menu_') and category selections (prefix 'gal_')
    app.add_handler(CallbackQueryHandler(menu_callback_handler, pattern="^menu_"))
    app.add_handler(CallbackQueryHandler(menu_callback_handler, pattern="^mg_"))
    app.add_handler(CallbackQueryHandler(gallery_callback, pattern="^gal_"))

    # Global Inline Queries search
    app.add_handler(InlineQueryHandler(inline_query_handler))

    # Media handling (outside conversation)
    app.add_handler(MessageHandler(filters.PHOTO,        handle_media))
    app.add_handler(MessageHandler(filters.Document.ALL, handle_media))
    app.add_handler(MessageHandler(filters.VIDEO,        handle_media))

    # Catch-all AI guidance handler
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_text))

    logger.info("✅ Bot is running. Press Ctrl+C to stop.")
    app.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()
