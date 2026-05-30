# Graph Report - .  (2026-05-30)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 119 nodes · 174 edges · 22 communities (15 shown, 7 thin omitted)
- Extraction: 97% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 5 edges (avg confidence: 0.89)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `eb409937`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 21|Community 21]]

## God Nodes (most connected - your core abstractions)
1. `Update` - 16 edges
2. `DEFAULT_TYPE` - 16 edges
3. `menu_callback_handler()` - 8 edges
4. `renderAdminDashboard()` - 8 edges
5. `addgallery_receive_caption()` - 7 edges
6. `ask_gemini()` - 6 edges
7. `get_sai_quote()` - 6 edges
8. `addgallery_start()` - 6 edges
9. `upload_to_supabase_storage()` - 5 edges
10. `save_gallery_record()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `Sathya Sai Baba Image` --references--> `Sathya Sai Baba - 100 Quotes`  [INFERRED]
  images/sathya_sai_baba.png → quote/sathya_sai_baba_100_quotes.txt
- `Maha Periyava Portrait` --semantically_similar_to--> `Maha Periyava AI Generated Image`  [INFERRED] [semantically similar]
  image_for_quote/Maha Periyava.jpg → images/maha_periyava.png
- `Events Page` --references--> `Supabase Client`  [EXTRACTED]
  events.html → js/supabase-client.js
- `Gallery Page` --references--> `Supabase Client`  [EXTRACTED]
  gallery.html → js/supabase-client.js
- `Member Dashboard` --references--> `Supabase Client`  [EXTRACTED]
  dashboard.html → js/supabase-client.js

## Communities (22 total, 7 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.19
Nodes (16): checkAuthState(), displayRandomQuote(), formatJoinedDate(), getLimitData(), loadCategories(), populateEventCategoryDropdown(), populateGalleryEventDropdown(), renderAdminCategories() (+8 more)

### Community 1 - "Community 1"
Cohesion: 0.18
Nodes (13): bool, bytes, addgallery_receive_caption(), ask_gemini(), get_sai_quote(), Query the Gemini AI model and return a formatted response., Generate a high-quality spiritual quote using Gemini AI., Upload raw image bytes to Supabase Storage bucket. (+5 more)

### Community 2 - "Community 2"
Cohesion: 0.17
Nodes (11): About Page, Member Dashboard, Events Page, Gallery Page, Home Page, Login Page, Maha Periyava, Sri Sathya Sai Baba (+3 more)

### Community 3 - "Community 3"
Cohesion: 0.25
Nodes (8): Ahimsa (Non-violence), Dharma, Love and Service, Google Generative AI, Kanchi Kamakoti Peetham, Kanchi Maha Periyava - 100 Quotes, Sathya Sai Baba - 100 Quotes, Sathya Sai Baba Image

### Community 4 - "Community 4"
Cohesion: 0.29
Nodes (7): events_command(), gallery_callback(), handle_media(), Handle gallery category selection → fetch URLs from Supabase → send photos., Show upcoming events from Supabase., Send back media as a downloadable document., Update

### Community 5 - "Community 5"
Cohesion: 0.33
Nodes (6): Application, help_command(), main(), post_init(), Show help menu with all available commands., Register commands dynamically with Telegram on startup.

### Community 6 - "Community 6"
Cohesion: 0.33
Nodes (7): InlineKeyboardMarkup, gallery_command(), get_main_menu_keyboard(), menu_callback_handler(), Returns the markup for the primary interactive dashboard., Manages menu dynamic state changes in-place (no new messages)., Browse gallery categories.

### Community 8 - "Community 8"
Cohesion: 0.33
Nodes (6): DEFAULT_TYPE, info_command(), menu_command(), Presents the elegant inline main menu., Send Gemini AI spiritual info., start()

### Community 9 - "Community 9"
Cohesion: 0.33
Nodes (6): int, addgallery_cancel(), addgallery_receive_photo(), addgallery_start(), Step 1: Ask admin to select category., Step 3: Photo received — ask for caption.

### Community 11 - "Community 11"
Cohesion: 0.67
Nodes (4): Google C2PA Provenance Data, Maha Periyava (Chandrashekarendra Saraswati), Maha Periyava Portrait, Maha Periyava AI Generated Image

### Community 13 - "Community 13"
Cohesion: 0.50
Nodes (3): cleanUrls, framework, rewrites

## Knowledge Gaps
- **19 isolated node(s):** `bytes`, `bool`, `Application`, `cleanUrls`, `framework` (+14 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Supabase Client` connect `Community 2` to `Community 5`?**
  _High betweenness centrality (0.087) - this node is a cross-community bridge._
- **Why does `Update` connect `Community 4` to `Community 1`, `Community 5`, `Community 6`, `Community 8`, `Community 9`, `Community 15`, `Community 16`, `Community 17`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **What connects `bytes`, `bool`, `Application` to the rest of the system?**
  _41 weakly-connected nodes found - possible documentation gaps or missing edges._