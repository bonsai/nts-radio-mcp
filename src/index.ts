import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  getLiveBroadcasts,
  getMixtapes,
  searchShowsEpisodes,
  getShowDetails,
  getShowEpisodes,
  resolveStream,
  getStreamUrls,
  formatBroadcast,
  formatMixtape,
  getEpisodeTracklist,
  formatTracklistTrack,
  scrobbleToLastFm,
  scrobbleToListenBrainz,
  updateNowPlayingLastFm,
  updateNowPlayingListenBrainz,
  getLastFmAuthUrl,
  getLastFmSessionKey,
} from './api.js';
import { NTSApiError } from './api.js';

const server = new Server(
  {
    name: 'nts-radio-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

const SearchSchema = z.object({
  query: z.string().describe('Search query for shows or episodes'),
});

const ShowDetailsSchema = z.object({
  alias: z.string().describe('Show alias (from search results or URL)'),
});

const ShowEpisodesSchema = z.object({
  alias: z.string().describe('Show alias'),
  page: z.number().int().positive().optional().default(1).describe('Page number (default: 1)'),
});

const ResolveStreamSchema = z.object({
  url: z.string().url().describe('SoundCloud or Mixcloud URL to resolve to HLS stream'),
});

const TracklistSchema = z.object({
  showAlias: z.string().describe('Show alias (e.g., "benedek")'),
  episodeAlias: z.string().describe('Episode alias (e.g., "benedek-19th-august-2022")'),
  broadcastStart: z.string().optional().describe('Broadcast start timestamp (ISO 8601) for calculating track timestamps'),
});

const LastFmAuthSchema = z.object({
  apiKey: z.string().optional().describe('Last.fm API key (or set LASTFM_API_KEY env var)'),
  apiSecret: z.string().optional().describe('Last.fm API secret (or set LASTFM_API_SECRET env var)'),
  sessionKey: z.string().optional().describe('Last.fm session key (from auth, or set LASTFM_SESSION_KEY env var)'),
});

const ListenBrainzAuthSchema = z.object({
  token: z.string().describe('ListenBrainz user token (from https://listenbrainz.org/settings/)'),
});

const ScrobbleTrackSchema = z.object({
  artist: z.string(),
  track: z.string(),
  timestamp: z.number().describe('UNIX timestamp when track started playing'),
  album: z.string().optional(),
  duration: z.number().optional().describe('Track duration in seconds'),
  mbid: z.string().optional().describe('MusicBrainz recording ID'),
  chosenByUser: z.boolean().optional().default(false).describe('False for radio/DJ-selected tracks'),
});

const ScrobbleSchema = z.object({
  tracks: z.array(ScrobbleTrackSchema).min(1).max(50).describe('Tracks to scrobble (max 50)'),
});

const NowPlayingSchema = z.object({
  artist: z.string(),
  track: z.string(),
  album: z.string().optional(),
  duration: z.number().optional(),
  mbid: z.string().optional(),
});

const LastFmOAuthUrlSchema = z.object({
  apiKey: z.string().describe('Last.fm API key'),
  callbackUrl: z.string().url().optional().describe('Optional callback URL'),
});

const LastFmOAuthTokenSchema = z.object({
  apiKey: z.string().describe('Last.fm API key'),
  apiSecret: z.string().describe('Last.fm API secret'),
  token: z.string().describe('Token received from OAuth callback'),
});

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'nts_live_now',
      description: 'Get currently playing shows on NTS Radio Channel 1 and Channel 2',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'nts_mixtapes',
      description: 'Get all NTS Infinite Mixtapes with stream URLs',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'nts_search',
      description: 'Search NTS shows and episodes',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
        },
        required: ['query'],
      },
    },
    {
      name: 'nts_show_details',
      description: 'Get detailed information about a specific NTS show',
      inputSchema: {
        type: 'object',
        properties: {
          alias: { type: 'string', description: 'Show alias from search or URL' },
        },
        required: ['alias'],
      },
    },
    {
      name: 'nts_show_episodes',
      description: 'Get paginated episodes for a specific NTS show',
      inputSchema: {
        type: 'object',
        properties: {
          alias: { type: 'string', description: 'Show alias' },
          page: { type: 'number', description: 'Page number (default: 1)' },
        },
        required: ['alias'],
      },
    },
    {
      name: 'nts_resolve_stream',
      description: 'Resolve a SoundCloud/Mixcloud URL to an HLS stream URL',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'SoundCloud or Mixcloud episode URL' },
        },
        required: ['url'],
      },
    },
    {
      name: 'nts_stream_urls',
      description: 'Get direct stream URLs for NTS Channel 1 and Channel 2 (Icecast and HLS)',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'nts_episode_tracklist',
      description: 'Get tracklist for an archived NTS episode with timestamps',
      inputSchema: {
        type: 'object',
        properties: {
          showAlias: { type: 'string', description: 'Show alias (e.g., "benedek")' },
          episodeAlias: { type: 'string', description: 'Episode alias (e.g., "benedek-19th-august-2022")' },
          broadcastStart: { type: 'string', description: 'Broadcast start timestamp (ISO 8601) for calculating track timestamps' },
        },
        required: ['showAlias', 'episodeAlias'],
      },
    },
    {
      name: 'nts_scrobble_lastfm',
      description: 'Scrobble tracks to Last.fm (apiKey/apiSecret/sessionKey can be set via env vars LASTFM_API_KEY/LASTFM_API_SECRET/LASTFM_SESSION_KEY)',
      inputSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'Last.fm API key (or set LASTFM_API_KEY env var)' },
          apiSecret: { type: 'string', description: 'Last.fm API secret (or set LASTFM_API_SECRET env var)' },
          sessionKey: { type: 'string', description: 'Last.fm session key (from auth, or set LASTFM_SESSION_KEY env var)' },
          tracks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                artist: { type: 'string' },
                track: { type: 'string' },
                timestamp: { type: 'number', description: 'UNIX timestamp when track started playing' },
                album: { type: 'string' },
                duration: { type: 'number', description: 'Track duration in seconds' },
                mbid: { type: 'string', description: 'MusicBrainz recording ID' },
                chosenByUser: { type: 'boolean', default: false, description: 'False for radio/DJ-selected tracks' },
              },
              required: ['artist', 'track', 'timestamp'],
            },
            minItems: 1,
            maxItems: 50,
          },
        },
        required: ['tracks'],
      },
    },
    {
      name: 'nts_scrobble_listenbrainz',
      description: 'Scrobble tracks to ListenBrainz (requires user token)',
      inputSchema: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'ListenBrainz user token (from https://listenbrainz.org/settings/)' },
          tracks: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                artist: { type: 'string' },
                track: { type: 'string' },
                timestamp: { type: 'number', description: 'UNIX timestamp when track started playing' },
                album: { type: 'string' },
                duration: { type: 'number', description: 'Track duration in seconds' },
                mbid: { type: 'string', description: 'MusicBrainz recording ID' },
                chosenByUser: { type: 'boolean', default: false, description: 'False for radio/DJ-selected tracks' },
              },
              required: ['artist', 'track', 'timestamp'],
            },
            minItems: 1,
            maxItems: 50,
          },
        },
        required: ['token', 'tracks'],
      },
    },
    {
      name: 'nts_now_playing_lastfm',
      description: 'Update Last.fm now playing status (apiKey/apiSecret/sessionKey can be set via env vars)',
      inputSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'Last.fm API key (or set LASTFM_API_KEY env var)' },
          apiSecret: { type: 'string', description: 'Last.fm API secret (or set LASTFM_API_SECRET env var)' },
          sessionKey: { type: 'string', description: 'Last.fm session key (from auth, or set LASTFM_SESSION_KEY env var)' },
          artist: { type: 'string' },
          track: { type: 'string' },
          album: { type: 'string' },
          duration: { type: 'number' },
          mbid: { type: 'string' },
        },
        required: ['artist', 'track'],
      },
    },
    {
      name: 'nts_now_playing_listenbrainz',
      description: 'Update ListenBrainz now playing status',
      inputSchema: {
        type: 'object',
        properties: {
          token: { type: 'string', description: 'ListenBrainz user token (from https://listenbrainz.org/settings/)' },
          artist: { type: 'string' },
          track: { type: 'string' },
          album: { type: 'string' },
          duration: { type: 'number' },
          mbid: { type: 'string' },
        },
        required: ['token', 'artist', 'track'],
      },
    },
    {
      name: 'nts_lastfm_oauth_url',
      description: 'Get Last.fm OAuth authorization URL',
      inputSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'Last.fm API key' },
          callbackUrl: { type: 'string', description: 'Optional callback URL' },
        },
        required: ['apiKey'],
      },
    },
    {
      name: 'nts_lastfm_oauth_token',
      description: 'Exchange OAuth token for Last.fm session key (apiKey/apiSecret can be set via env vars)',
      inputSchema: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', description: 'Last.fm API key (or set LASTFM_API_KEY env var)' },
          apiSecret: { type: 'string', description: 'Last.fm API secret (or set LASTFM_API_SECRET env var)' },
          token: { type: 'string', description: 'Token received from OAuth callback' },
        },
        required: ['token'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'nts_live_now': {
        const live = await getLiveBroadcasts();
        const channels = live.results.map((ch) => formatBroadcast(ch, ch.channel_name as '1' | '2'));
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                channels,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_mixtapes': {
        const mixtapes = await getMixtapes();
        const formatted = mixtapes.results.map(formatMixtape);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                mixtapes: formatted,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_search': {
        const { query } = SearchSchema.parse(args);
        const results = await searchShowsEpisodes(query);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                query,
                timestamp: new Date().toISOString(),
                results: results.results,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_show_details': {
        const { alias } = ShowDetailsSchema.parse(args);
        const show = await getShowDetails(alias);
        const episodes = show.embeds?.episodes?.results || [];
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                alias,
                timestamp: new Date().toISOString(),
                show: {
                  name: show.name,
                  alias: show.alias,
                  description: show.description,
                  descriptionHtml: show.description_html,
                  location: show.location_long,
                  genres: show.genres.map(g => g.value),
                  moods: show.moods.map(m => m.value),
                  artwork: show.media.picture_large || show.media.picture_medium,
                  externalLinks: show.external_links,
                  recentEpisodes: episodes.slice(0, 5).map(ep => ({
                    alias: ep.alias,
                    title: ep.name,
                    broadcast: ep.broadcast,
                    artwork: ep.media.picture_large || ep.media.picture_medium,
                    mixcloud: ep.audio_sources.find(s => s.source === 'mixcloud')?.url || null,
                  })),
                },
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_show_episodes': {
        const { alias, page } = ShowEpisodesSchema.parse(args);
        const episodes = await getShowEpisodes(alias, page);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                alias,
                page,
                timestamp: new Date().toISOString(),
                episodes: episodes.results.map(ep => ({
                  alias: ep.alias,
                  title: ep.title,
                  broadcast: ep.broadcast,
                  description: ep.description,
                  artwork: ep.media.picture_large || ep.media.picture_medium,
                  mixcloud: ep.mixcloud,
                  audioSources: ep.audio_sources,
                  genres: ep.genres.map(g => g.value),
                  moods: ep.moods.map(m => m.value),
                })),
                nextPage: episodes.next,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_resolve_stream': {
        const { url } = ResolveStreamSchema.parse(args);
        const resolved = await resolveStream(url);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                originalUrl: url,
                timestamp: new Date().toISOString(),
                hlsUrl: resolved.hls_url,
                streamUrl: resolved.stream_url,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_stream_urls': {
        const streams = getStreamUrls();
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                streams,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_episode_tracklist': {
        const { showAlias, episodeAlias, broadcastStart } = TracklistSchema.parse(args);
        const tracklist = await getEpisodeTracklist(showAlias, episodeAlias);
        const startTime = broadcastStart || tracklist.results[0]?.offset ? undefined : undefined;
        
        // Get broadcast start from episode if not provided
        let broadcastStartTime = broadcastStart;
        if (!broadcastStartTime) {
          // Try to get from episode details
          try {
            const episode = await getShowEpisodes(showAlias, 1);
            const ep = episode.results.find(e => e.episode_alias === episodeAlias);
            if (ep) broadcastStartTime = ep.broadcast;
          } catch {}
        }
        
        const formatted = tracklist.results.map(t => formatTracklistTrack(t, broadcastStartTime || ''));
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                showAlias,
                episodeAlias,
                timestamp: new Date().toISOString(),
                trackCount: tracklist.metadata.resultset.count,
                tracks: formatted,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_scrobble_lastfm': {
        const parsed = z.object({
          apiKey: z.string().optional(),
          apiSecret: z.string().optional(),
          sessionKey: z.string().optional(),
          tracks: z.array(ScrobbleTrackSchema),
        }).parse(args);
        const result = await scrobbleToLastFm(parsed, parsed.tracks);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'lastfm',
                ...result,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_scrobble_listenbrainz': {
        const parsed = z.object({
          token: z.string(),
          tracks: z.array(ScrobbleTrackSchema),
        }).parse(args);
        const result = await scrobbleToListenBrainz(parsed.token, parsed.tracks);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'listenbrainz',
                ...result,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_now_playing_lastfm': {
        const parsed = z.object({
          apiKey: z.string().optional(),
          apiSecret: z.string().optional(),
          sessionKey: z.string().optional(),
          artist: z.string(),
          track: z.string(),
          album: z.string().optional(),
          duration: z.number().optional(),
          mbid: z.string().optional(),
        }).parse(args);
        await updateNowPlayingLastFm(parsed, { artist: parsed.artist, track: parsed.track, album: parsed.album, duration: parsed.duration, mbid: parsed.mbid, timestamp: Math.floor(Date.now() / 1000) });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'lastfm',
                status: 'now_playing_updated',
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_now_playing_listenbrainz': {
        const parsed = z.object({
          token: z.string(),
          artist: z.string(),
          track: z.string(),
          album: z.string().optional(),
          duration: z.number().optional(),
          mbid: z.string().optional(),
        }).parse(args);
        await updateNowPlayingListenBrainz(parsed.token, { artist: parsed.artist, track: parsed.track, album: parsed.album, duration: parsed.duration, mbid: parsed.mbid, timestamp: Math.floor(Date.now() / 1000) });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                service: 'listenbrainz',
                status: 'now_playing_updated',
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_lastfm_oauth_url': {
        const { apiKey, callbackUrl } = LastFmOAuthUrlSchema.parse(args);
        const authUrl = getLastFmAuthUrl(apiKey, callbackUrl);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                authUrl,
                instructions: '1. Open authUrl in browser 2. User authorizes app 3. Last.fm redirects to callback with token 4. Use nts_lastfm_oauth_token with the token',
              }, null, 2),
            },
          ],
        };
      }

      case 'nts_lastfm_oauth_token': {
        const { apiKey, apiSecret, token } = LastFmOAuthTokenSchema.parse(args);
        const sessionKey = await getLastFmSessionKey(apiKey, apiSecret, token);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                sessionKey,
                instructions: 'Save this sessionKey for use with nts_scrobble_lastfm and nts_now_playing_lastfm',
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    if (error instanceof NTSApiError) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'API Error',
              message: error.message,
              statusCode: error.statusCode,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
    
    if (error instanceof z.ZodError) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: 'Validation Error',
              issues: error.issues,
            }, null, 2),
          },
        ],
        isError: true,
      };
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            error: 'Internal Error',
            message: error instanceof Error ? error.message : String(error),
          }, null, 2),
        },
      ],
      isError: true,
    };
  }
});

server.setRequestHandler(ListResourcesRequestSchema, async () => ({
  resources: [
    {
      uri: 'nts://live',
      name: 'NTS Live Now',
      description: 'Currently playing shows on NTS Channel 1 and 2',
      mimeType: 'application/json',
    },
    {
      uri: 'nts://mixtapes',
      name: 'NTS Infinite Mixtapes',
      description: 'All NTS Infinite Mixtapes with stream URLs',
      mimeType: 'application/json',
    },
    {
      uri: 'nts://streams',
      name: 'NTS Stream URLs',
      description: 'Direct stream URLs for NTS channels (Icecast and HLS)',
      mimeType: 'application/json',
    },
  ],
}));

server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const { uri } = request.params;

  try {
    switch (uri) {
      case 'nts://live': {
        const live = await getLiveBroadcasts();
        const channels = live.results.map((ch) => formatBroadcast(ch, ch.channel_name as '1' | '2'));
        
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                channels,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts://mixtapes': {
        const mixtapes = await getMixtapes();
        const formatted = mixtapes.results.map(formatMixtape);
        
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                mixtapes: formatted,
              }, null, 2),
            },
          ],
        };
      }

      case 'nts://streams': {
        const streams = getStreamUrls();
        
        return {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({
                timestamp: new Date().toISOString(),
                streams,
              }, null, 2),
            },
          ],
        };
      }

      default:
        throw new Error(`Unknown resource: ${uri}`);
    }
  } catch (error) {
    if (error instanceof NTSApiError) {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({
              error: 'API Error',
              message: error.message,
              statusCode: error.statusCode,
            }, null, 2),
          },
        ],
      };
    }

    throw error;
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('NTS Radio MCP server running on stdio');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});