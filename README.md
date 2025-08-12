# RamanaTalks

A modern web app to explore and practice Sri Ramana Maharshi's teachings with:
- Knowledge-base grounded chat (Supabase + Gemini)
- Satsang rooms (list/create + live room UI, recordings to Supabase Storage)
- Podcasts page (embedded audio)

## Tech
- Frontend: React + Vite
- Styling: CSS (mobile-first, accessible)
- Backend: Netlify Functions (chat, TTS, STT, LiveKit token, recording upload)
- Data: Supabase (auth, RLS, storage, RPCs: `match_chunks`, `room_member_counts`, `room_recording_counts`)
- Realtime: LiveKit

## Quick start (local)
1. Install:
   ```bash
   npm i
   ```
2. Environment:
   - Copy `.env.example` → `.env.local` and fill values
3. Run dev:
   ```bash
   npm run netlify:serve
   ```
   - Frontend: http://localhost:5173 (or next free port)
   - Functions: http://localhost:8888 (proxy at /api/*)

## Environment variables (.env.example)
See `.env.example`. Required:
- VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
- GEMINI_API_KEY or GOOGLE_API_KEY
- LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET

Optional (diagnostics):
- SUPABASE_DB_URL (for MCP tooling)

## Supabase
- Run SQL from `supabase/*.sql` in this order when bootstrapping:
  1) `schema.sql` (conversations/messages)
  2) `policies.sql`
  3) `satsang.sql` (rooms/members/messages, storage bucket, RPCs)
- Confirm RPCs exist:
  - `room_member_counts()`
  - `room_recording_counts()`
  - `match_chunks(query_embedding vector, match_threshold float8, match_count int)`

## Development notes
- Hash routes:
  - `#chat`, `#satsang`, `#satsang/<roomId>`, `#podcasts`
- Satsang UI split:
  - `SatsangList` (list/create/enter/share)
  - `Satsang` (room only; left sidebar removed; back button present)
- Time zone: room creation supports selecting a time zone; times display with zone labels
- STT:
  - Server: `/api/stt-google` (Google STT); expects base64 audio and `mime`
  - Client falls back to Web Speech API on unsupported recorders
- TTS:
  - Server: `/api/tts-google` (Google TTS); voice cached per language
  - Client caches last successful `voiceName` per language and reuses

## Mobile & Accessibility
- Mobile-first CSS with safe-area support
- Larger input font on iOS to avoid zoom
- Sticky offsets tunable with CSS variables: `--sticky-1`, `--sticky-2`, `--sticky-banner`
- Keyboard-friendly buttons and focus states (browser default)

## Large files & Git LFS
This repo uses Git LFS for:
- `public/*.wav`
- `knowledge-base-enhanced.json`
- `public/knowledge-base-enhanced.json`

If cloning or pushing:
- Install LFS: https://git-lfs.com
- `git lfs install`

## Deploy
- Netlify: `netlify.toml` proxies `/api/*` to functions
- Build: `npm run build`
- Publish: `dist/`

## Troubleshooting
- 404 on `/api/*`: ensure Netlify dev is running and `netlify.toml` uses relative paths
- STT failing on Safari: falls back to browser SpeechRecognition
- TTS errors: ensure API key; server logs show details

---

© RamanaTalks
