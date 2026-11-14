import {
  LiveResponse,
  MixtapesResponse,
  SearchResponse,
  ShowDetails,
  ShowEpisodesResponse,
  ResolveStreamResponse,
  TracklistResponse,
  TracklistTrack,
  ScrobbleTrack,
  ScrobbleResult,
  LastFmOAuthResponse,
} from './types.js';
import { createHash } from 'crypto';

const BASE_URL = 'https://www.nts.live/api/v2';
const STREAM_BASE = 'https://stream-relay-geo.ntslive.net';
const HLS_BASE = 'https://streams.radiomast.io';

export class NTSApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'NTSApiError';
  }
}

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'nts-radio-mcp/1.0.0',
      'Accept': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new NTSApiError(
      `API request failed: ${response.status} ${response.statusText}`,
      response.status
    );
  }

  return response.json() as Promise<T>;
}

export async function getLiveBroadcasts(): Promise<LiveResponse> {
  return fetchJson<LiveResponse>(`${BASE_URL}/live`);
}

export async function getMixtapes(): Promise<MixtapesResponse> {
  return fetchJson<MixtapesResponse>(`${BASE_URL}/mixtapes`);
}

export async function searchShowsEpisodes(query: string): Promise<SearchResponse> {
  const encodedQuery = encodeURIComponent(query);
  return fetchJson<SearchResponse>(`${BASE_URL}/search?q=${encodedQuery}`);
}

export async function getShowDetails(alias: string): Promise<ShowDetails> {
  return fetchJson<ShowDetails>(`${BASE_URL}/shows/${alias}`);
}

export async function getShowEpisodes(alias: string, page = 1): Promise<ShowEpisodesResponse> {
  return fetchJson<ShowEpisodesResponse>(`${BASE_URL}/shows/${alias}/episodes?page=${page}`);
}

export async function resolveStream(url: string): Promise<ResolveStreamResponse> {
  const encodedUrl = encodeURIComponent(url);
  return fetchJson<ResolveStreamResponse>(`${BASE_URL}/resolve-stream?url=${encodedUrl}`);
}

export async function getEpisodeTracklist(showAlias: string, episodeAlias: string): Promise<TracklistResponse> {
  return fetchJson<TracklistResponse>(`${BASE_URL}/shows/${showAlias}/episodes/${episodeAlias}/tracklist`);
}

export function formatTracklistTrack(track: TracklistTrack, broadcastStart: string) {
  const startTime = new Date(broadcastStart).getTime() / 1000;
  const timestamp = track.offset ? startTime + track.offset : null;
  
  return {
    artist: track.artist,
    track: track.title,
    timestamp: timestamp ? Math.floor(timestamp) : null,
    duration: track.duration || track.duration_estimate,
    mbid: track.musicbrainz_track_id,
    isrc: track.isrc_id,
  };
}

export function getEnvLastFmApiKey(): string | undefined {
  return process.env.LASTFM_API_KEY;
}

export function getEnvLastFmApiSecret(): string | undefined {
  return process.env.LASTFM_API_SECRET;
}

export function getEnvLastFmSessionKey(): string | undefined {
  return process.env.LASTFM_SESSION_KEY;
}

export async function scrobbleToLastFm(
  auth: { apiKey?: string; apiSecret?: string; sessionKey?: string },
  tracks: ScrobbleTrack[]
): Promise<ScrobbleResult> {
  const apiKey = auth.apiKey || getEnvLastFmApiKey();
  const apiSecret = auth.apiSecret || getEnvLastFmApiSecret();
  const sessionKey = auth.sessionKey || getEnvLastFmSessionKey();

  if (!apiKey || !apiSecret || !sessionKey) {
    throw new Error('Last.fm credentials not provided. Set LASTFM_API_KEY, LASTFM_API_SECRET, LASTFM_SESSION_KEY env vars, or pass them in the tool call.');
  }

  const params = new URLSearchParams();
  params.append('method', 'track.scrobble');
  params.append('api_key', apiKey);
  params.append('sk', sessionKey);
  params.append('format', 'json');

  tracks.forEach((track, i) => {
    params.append(`artist[${i}]`, track.artist);
    params.append(`track[${i}]`, track.track);
    params.append(`timestamp[${i}]`, track.timestamp.toString());
    if (track.album) params.append(`album[${i}]`, track.album);
    if (track.duration) params.append(`duration[${i}]`, track.duration.toString());
    if (track.mbid) params.append(`mbid[${i}]`, track.mbid);
    params.append(`chosenByUser[${i}]`, track.chosenByUser ? '1' : '0');
  });

  const apiSig = generateLastFmSig(params, auth.apiSecret!);
  params.append('api_sig', apiSig);

  const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json() as { error?: number; message?: string; scrobbles?: { '@attr'?: { accepted?: number; ignored?: number } } };
  
  if (data.error) {
    throw new Error(`Last.fm error: ${data.message}`);
  }

  return {
    accepted: data.scrobbles?.['@attr']?.accepted || 0,
    ignored: data.scrobbles?.['@attr']?.ignored || 0,
    errors: [],
  };
}

export async function scrobbleToListenBrainz(
  token: string,
  tracks: ScrobbleTrack[]
): Promise<ScrobbleResult> {
  const listens = tracks.map(track => ({
    listened_at: track.timestamp,
    track_metadata: {
      track_name: track.track,
      artist_name: track.artist,
      release_name: track.album || '',
      additional_info: {
        submission_client: 'nts-radio-mcp',
        duration: track.duration,
        recording_mbid: track.mbid,
      },
    },
  }));

  const response = await fetch('https://api.listenbrainz.org/1/submit-listens', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ listen_type: 'single', payload: listens }),
  });

  if (!response.ok) {
    const error = await response.json() as { error?: string };
    throw new Error(`ListenBrainz error: ${error.error || response.statusText}`);
  }

  return {
    accepted: tracks.length,
    ignored: 0,
    errors: [],
  };
}

export async function updateNowPlayingLastFm(
  auth: { apiKey?: string; apiSecret?: string; sessionKey?: string },
  track: ScrobbleTrack
): Promise<void> {
  const apiKey = auth.apiKey || getEnvLastFmApiKey();
  const apiSecret = auth.apiSecret || getEnvLastFmApiSecret();
  const sessionKey = auth.sessionKey || getEnvLastFmSessionKey();

  if (!apiKey || !apiSecret || !sessionKey) {
    throw new Error('Last.fm credentials not provided. Set LASTFM_API_KEY, LASTFM_API_SECRET, LASTFM_SESSION_KEY env vars, or pass them in the tool call.');
  }

  const params = new URLSearchParams();
  params.append('method', 'track.updateNowPlaying');
  params.append('api_key', apiKey);
  params.append('sk', sessionKey);
  params.append('artist', track.artist);
  params.append('track', track.track);
  params.append('format', 'json');
  if (track.album) params.append('album', track.album);
  if (track.duration) params.append('duration', track.duration.toString());
  if (track.mbid) params.append('mbid', track.mbid);

  const apiSig = generateLastFmSig(params, apiSecret!);
  params.append('api_sig', apiSig);

  const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json() as { error?: number; message?: string };
  if (data.error) {
    throw new Error(`Last.fm now playing error: ${data.message}`);
  }
}

export async function updateNowPlayingListenBrainz(
  token: string,
  track: ScrobbleTrack
): Promise<void> {
  const listen = {
    track_metadata: {
      track_name: track.track,
      artist_name: track.artist,
      release_name: track.album || '',
      additional_info: {
        submission_client: 'nts-radio-mcp',
        duration: track.duration,
        recording_mbid: track.mbid,
      },
    },
  };

  const response = await fetch('https://api.listenbrainz.org/1/playing-now', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(listen),
  });

  if (!response.ok) {
    const error = await response.json() as { error?: string };
    throw new Error(`ListenBrainz now playing error: ${error.error || response.statusText}`);
  }
}

function generateLastFmSig(params: URLSearchParams, apiSecret: string): string {
  // Last.fm spec: format and callback params are excluded from the signature
  const sorted = Array.from(params.entries())
    .filter(([k]) => k !== 'api_sig' && k !== 'format' && k !== 'callback')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([k, v]) => `${k}${v}`)
    .join('');

  return createHash('md5').update(sorted + apiSecret, 'utf8').digest('hex');
}

export function getStreamUrls() {
  return {
    channel1: {
      icecast: `${STREAM_BASE}/stream`,
      hls: `${HLS_BASE}/nts1/hls.m3u8`,
    },
    channel2: {
      icecast: `${STREAM_BASE}/stream2`,
      hls: `${HLS_BASE}/nts2/hls.m3u8`,
    },
  };
}

export function formatBroadcast(broadcast: LiveResponse['results'][0], channel: '1' | '2') {
  const now = broadcast.now;
  const details = now.embeds.details;
  
  return {
    channel,
    title: now.broadcast_title,
    showName: details.name,
    description: details.description,
    genres: details.genres.map(g => g.value),
    moods: details.moods.map(m => m.value),
    location: details.location_long,
    startTime: now.start_timestamp,
    endTime: now.end_timestamp,
    artwork: details.media.picture_large || details.media.picture_medium,
    mixcloud: details.mixcloud,
    audioSources: details.audio_sources,
    nextShow: {
      title: broadcast.next.broadcast_title,
      startTime: broadcast.next.start_timestamp,
      endTime: broadcast.next.end_timestamp,
    },
  };
}

export function formatMixtape(mixtape: MixtapesResponse['results'][0]) {
  return {
    title: mixtape.title,
    alias: mixtape.mixtape_alias,
    subtitle: mixtape.subtitle,
    description: mixtape.description,
    credits: mixtape.credits.map(c => c.name),
    artwork: mixtape.media.picture_large || mixtape.media.picture_medium,
    streamUrl: mixtape.audio_stream_endpoint,
    streamUrlHlsAac: mixtape.audio_stream_endpoint_hls_aac,
    streamUrlHlsMp3: mixtape.audio_stream_endpoint_hls_mp3,
  };
}

export function getLastFmAuthUrl(apiKey: string, callbackUrl?: string): string {
  const params = new URLSearchParams();
  params.append('api_key', apiKey);
  if (callbackUrl) params.append('cb', callbackUrl);
  return `https://www.last.fm/api/auth/?${params.toString()}`;
}

export async function getLastFmSessionKey(apiKey?: string, apiSecret?: string, token?: string): Promise<string> {
  const key = apiKey || getEnvLastFmApiKey();
  const secret = apiSecret || getEnvLastFmApiSecret();
  const t = token; // token is required from OAuth callback, don't fallback to env

  if (!key) {
    throw new Error('Last.fm API key not provided. Set LASTFM_API_KEY env var or pass it in the tool call.');
  }
  if (!secret) {
    throw new Error('Last.fm API secret not provided. Set LASTFM_API_SECRET env var or pass it in the tool call.');
  }

  const params = new URLSearchParams();
  params.append('method', 'auth.getSession');
  params.append('api_key', key);
  params.append('token', t!);
  params.append('format', 'json');

  const apiSig = generateLastFmSig(params, apiSecret!);
  params.append('api_sig', apiSig);

  const response = await fetch('https://ws.audioscrobbler.com/2.0/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json() as LastFmOAuthResponse;
  
  if (data.error || !data.session) {
    throw new Error(`Last.fm auth error: ${data.message || 'Failed to get session key'}`);
  }

  return data.session.key;
}