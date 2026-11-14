# Handover - NTS Radio MCP Server

**Date**: 2026-11-14  
**Project**: nts-radio-mcp  
**Location**: `C:\Users\dance\nts-radio-mcp`

---

## Summary

Built a complete MCP (Model Context Protocol) server for NTS Radio with:
- Live broadcast info (Channel 1 & 2)
- All 16 Infinite Mixtapes with stream URLs
- Show/episode details and tracklists
- **Scrobbling to Last.fm (OAuth) and ListenBrainz**
- MCP resources for live/mixtapes/streams

---

## Current Status

✅ **Complete & Working**
- All tools functional (13 tools, 3 resources)
- TypeScript builds cleanly
- Tested: live now, mixtapes, tracklists, OAuth URL generation

📁 **Project Structure**
```
nts-radio-mcp/
├── src/
│   ├── index.ts      # MCP server + tool handlers
│   ├── api.ts        # NTS API + scrobbling logic
│   └── types.ts      # TypeScript interfaces
├── dist/             # Compiled JS
├── package.json
├── tsconfig.json
└── README.md
```

---

## Immediate Next Tasks

### 1. Configure MCP Client (Claude Desktop / Cursor / etc.)

Add to client config:
```json
{
  "mcpServers": {
    "nts-radio": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "C:\\Users\\dance\\nts-radio-mcp"
    }
  }
}
```

### 2. Last.fm OAuth Setup (when ready)

```bash
# 1. Get API credentials at https://www.last.fm/api/account/create
# 2. Run via MCP:
#    - nts_lastfm_oauth_url { apiKey: "YOUR_KEY" }
#    - Open returned authUrl in browser → authorize
#    - nts_lastfm_oauth_token { apiKey, apiSecret, token }
# 3. Save sessionKey for scrobbling
```

### 3. ListenBrainz Token (simpler alternative)

```bash
# Get token at https://listenbrainz.org/settings/
# Use with nts_scrobble_listenbrainz / nts_now_playing_listenbrainz
```

---

## Available Tools (13)

| Category | Tools |
|----------|-------|
| **Live** | `nts_live_now`, `nts_stream_urls` |
| **Mixtapes** | `nts_mixtapes` |
| **Shows** | `nts_show_details`, `nts_show_episodes`, `nts_episode_tracklist` |
| **Search** | `nts_search` (limited), `nts_resolve_stream` |
| **Scrobble** | `nts_scrobble_lastfm`, `nts_scrobble_listenbrainz` |
| **Now Playing** | `nts_now_playing_lastfm`, `nts_now_playing_listenbrainz` |
| **OAuth** | `nts_lastfm_oauth_url`, `nts_lastfm_oauth_token` |

---

## Resources (3)

- `nts://live` - Current broadcasts
- `nts://mixtapes` - All mixtapes
- `nts://streams` - Direct stream URLs

---

## Key API Endpoints Used

- `https://www.nts.live/api/v2/live`
- `https://www.nts.live/api/v2/mixtapes`
- `https://www.nts.live/api/v2/shows/{alias}`
- `https://www.nts.live/api/v2/shows/{alias}/episodes`
- `https://www.nts.live/api/v2/shows/{alias}/episodes/{episodeAlias}/tracklist`

---

## Notes

- NTS API is undocumented, may change
- Tracklist timestamps only for Supporter episodes (2023+)
- Search endpoint returns empty in current API version
- Last.fm OAuth flow implemented (desktop-friendly)
- ListenBrainz is simpler (just token, no OAuth)
- **Last.fm env vars**: Set `LASTFM_API_KEY`, `LASTFM_API_SECRET`, `LASTFM_SESSION_KEY` environment variables to avoid passing credentials in each tool call

---

## Commands

```bash
cd C:\Users\dance\nts-radio-mcp
npm run build   # Compile TypeScript
npm start       # Run server (stdio)
```