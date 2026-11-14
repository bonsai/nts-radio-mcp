# NTS Radio MCP Server

A Model Context Protocol (MCP) server for NTS Radio that provides access to live broadcasts, infinite mixtapes, show information, stream URLs, and scrobbling to Last.fm / ListenBrainz.

## Features

- **Live Now** - Get currently playing shows on NTS Channel 1 and Channel 2 with show details, genres, moods, location, and upcoming shows
- **Infinite Mixtapes** - Access all 16 NTS Infinite Mixtapes with stream URLs (Icecast and HLS), artwork, and contributing shows
- **Stream URLs** - Direct stream URLs for both channels (Icecast and HLS)
- **Show Details** - Get detailed information about any NTS show including description, location, genres, moods, and recent episodes
- **Show Episodes** - Paginated episode listings for any show with audio sources, genres, moods, and artwork
- **Episode Tracklists** - Fetch tracklists for archived episodes with timestamps (when available)
- **Scrobbling** - Submit tracks to Last.fm and ListenBrainz (supports now playing + scrobbles)
- **Resources** - MCP resources for live broadcasts, mixtapes, and stream URLs

## Installation

```bash
npm install
npm run build
```

## Usage

### As an MCP Server

Add to your MCP client configuration:

```json
{
  "mcpServers": {
    "nts-radio": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "/path/to/nts-radio-mcp"
    }
  }
}
```

### Available Tools

| Tool | Description |
|------|-------------|
| `nts_live_now` | Get currently playing shows on both NTS channels |
| `nts_mixtapes` | Get all Infinite Mixtapes with stream URLs |
| `nts_stream_urls` | Get direct stream URLs (Icecast & HLS) |
| `nts_show_details` | Get show details and recent episodes (requires `alias`) |
| `nts_show_episodes` | Get paginated episodes for a show (requires `alias`, optional `page`) |
| `nts_search` | Search shows and episodes (limited functionality) |
| `nts_resolve_stream` | Resolve SoundCloud/Mixcloud URL to HLS (requires auth) |
| `nts_episode_tracklist` | Get tracklist for archived episode (requires `showAlias`, `episodeAlias`) |
| `nts_scrobble_lastfm` | Scrobble tracks to Last.fm (requires API key, secret, session key) |
| `nts_scrobble_listenbrainz` | Scrobble tracks to ListenBrainz (requires user token) |
| `nts_now_playing_lastfm` | Update Last.fm now playing status |
| `nts_now_playing_listenbrainz` | Update ListenBrainz now playing status |

### Available Resources

| URI | Description |
|-----|-------------|
| `nts://live` | Currently playing shows |
| `nts://mixtapes` | All Infinite Mixtapes |
| `nts://streams` | Direct stream URLs |

## Scrobbling Setup

### Last.fm (OAuth Flow)
1. Get API credentials: https://www.last.fm/api/account/create
2. **OAuth flow (recommended):**
   - Call `nts_lastfm_oauth_url` with your `apiKey` (and optional `callbackUrl`)
     - Or set `LASTFM_API_KEY` env var to skip passing it each time
   - Open the returned `authUrl` in browser
   - User authorizes the app
   - Last.fm redirects to callback with `token` parameter
   - Call `nts_lastfm_oauth_token` with `apiKey`, `apiSecret`, and `token` to get `sessionKey`
     - Or set `LASTFM_API_KEY` and `LASTFM_API_SECRET` env vars to skip passing them each time
   - Save the `sessionKey` for future use
     - Or set `LASTFM_SESSION_KEY` env var to skip passing it each time
3. Use `nts_scrobble_lastfm` / `nts_now_playing_lastfm` with `apiKey`, `apiSecret`, `sessionKey`
   - Or set the corresponding env vars `LASTFM_API_KEY`, `LASTFM_API_SECRET`, `LASTFM_SESSION_KEY` and omit them from the tool call

### ListenBrainz
1. Get user token: https://listenbrainz.org/settings/
2. Use `nts_scrobble_listenbrainz` / `nts_now_playing_listenbrainz` with `token` and track array

**Track object format:**
```json
{
  "artist": "Artist Name",
  "track": "Track Title",
  "timestamp": 1700000000,
  "album": "Album Name (optional)",
  "duration": 240,
  "mbid": "musicbrainz-recording-id (optional)",
  "chosenByUser": false
}
```

## API Endpoints Used

- `https://www.nts.live/api/v2/live` - Current live broadcasts
- `https://www.nts.live/api/v2/mixtapes` - Infinite Mixtapes
- `https://www.nts.live/api/v2/search?q=` - Search (limited)
- `https://www.nts.live/api/v2/shows/{alias}` - Show details
- `https://www.nts.live/api/v2/shows/{alias}/episodes` - Show episodes
- `https://www.nts.live/api/v2/shows/{alias}/episodes/{episodeAlias}/tracklist` - Episode tracklist
- `https://www.nts.live/api/v2/resolve-stream?url=` - Resolve stream (requires auth)

## Stream URLs

**Channel 1 (NTS 1)**
- Icecast: `https://stream-relay-geo.ntslive.net/stream`
- HLS: `https://streams.radiomast.io/nts1/hls.m3u8`

**Channel 2 (NTS 2)**
- Icecast: `https://stream-relay-geo.ntslive.net/stream2`
- HLS: `https://streams.radiomast.io/nts2/hls.m3u8`

**Mixtapes** - Each mixtape has its own stream endpoint (e.g., `https://stream-mixtape-geo.ntslive.net/mixtape4`)

## Example Usage

```javascript
// Get live now
await client.callTool('nts_live_now', {});

// Get mixtapes
await client.callTool('nts_mixtapes', {});

// Get show details
await client.callTool('nts_show_details', { alias: 'benedek' });

// Get show episodes
await client.callTool('nts_show_episodes', { alias: 'benedek', page: 1 });

// Get episode tracklist
await client.callTool('nts_episode_tracklist', { 
  showAlias: 'calm-roots', 
  episodeAlias: 'calm-roots-22nd-july-2024' 
});

// Last.fm OAuth flow
const authUrl = await client.callTool('nts_lastfm_oauth_url', { 
  apiKey: 'your-api-key' 
});
// Open authUrl.authUrl in browser, user authorizes, get token from callback
const sessionKey = await client.callTool('nts_lastfm_oauth_token', {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  token: 'token-from-callback'
});
// Save sessionKey.sessionKey for future use

// Scrobble to ListenBrainz
await client.callTool('nts_scrobble_listenbrainz', {
  token: 'your-listenbrainz-token',
  tracks: [{
    artist: 'Yoshio Machida',
    track: 'Tender Blues 5',
    timestamp: 1700000000,
    chosenByUser: false
  }]
});

// Update now playing on Last.fm (using sessionKey from OAuth)
await client.callTool('nts_now_playing_lastfm', {
  apiKey: 'your-api-key',
  apiSecret: 'your-api-secret',
  sessionKey: 'your-session-key',
  artist: 'Yoshio Machida',
  track: 'Tender Blues 5'
});
```

## Notes

- The NTS API is undocumented and may change without notice
- Search functionality returns empty results in current API version
- Stream resolution requires basic authentication
- Tracklist timestamps only available for Supporter episodes (2023+) via audio fingerprinting
- All data is fetched in real-time from NTS APIs
- No API key required for public endpoints
- For radio/DJ-selected tracks, set `chosenByUser: false`

## License

MIT