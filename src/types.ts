export interface Link {
  rel: string;
  href: string;
  type: string;
}

export interface BroadcastMedia {
  background_large: string | null;
  background_medium_large: string | null;
  background_medium: string | null;
  background_small: string | null;
  background_thumb: string | null;
  picture_large: string | null;
  picture_medium_large: string | null;
  picture_medium: string | null;
  picture_small: string | null;
  picture_thumb: string | null;
}

export interface Genre {
  id: string;
  value: string;
}

export interface Mood {
  id: string;
  value: string;
}

export interface AudioSource {
  url: string;
  source: string;
}

export interface Details {
  status: string;
  updated: string;
  name: string;
  description: string;
  description_html: string;
  external_links: string[];
  moods: Mood[];
  genres: Genre[];
  location_short: string | null;
  location_long: string | null;
  intensity: string | null;
  media: BroadcastMedia;
  episode_alias: string;
  show_alias: string;
  broadcast: string;
  mixcloud: string | null;
  audio_sources: AudioSource[];
  brand: Record<string, unknown>;
  embeds: Record<string, unknown>;
  links: Link[];
}

export interface Embeds {
  details: Details;
}

export interface NowBroadcast {
  broadcast_title: string;
  start_timestamp: string;
  end_timestamp: string;
  embeds: Embeds;
}

export interface NextBroadcast {
  broadcast_title: string;
  start_timestamp: string;
  end_timestamp: string;
}

export interface ChannelLive {
  channel_name: string;
  now: NowBroadcast;
  next: NextBroadcast;
}

export interface LiveResponse {
  results: ChannelLive[];
}

export interface MixtapeCredit {
  name: string;
  path: string;
}

export interface MixtapeMedia {
  animation_large_landscape: string | null;
  animation_large_portrait: string | null;
  animation_thumb: string | null;
  icon_black: string | null;
  icon_white: string | null;
  picture_large: string | null;
  picture_medium: string | null;
  picture_medium_large: string | null;
  picture_small: string | null;
  picture_thumb: string | null;
}

export interface Mixtape {
  mixtape_alias: string;
  title: string;
  subtitle: string;
  description: string;
  description_html: string;
  audio_stream_endpoint: string;
  audio_stream_endpoint_hls_aac: string;
  audio_stream_endpoint_hls_mp3: string;
  credits: MixtapeCredit[];
  media: MixtapeMedia;
  now_playing_topic: string;
  links: Link[];
}

export interface MixtapesResponse {
  metadata: unknown;
  results: Mixtape[];
  links: Link[];
}

export interface SearchResult {
  type: 'show' | 'episode';
  title: string;
  alias: string;
  description: string;
  media: BroadcastMedia;
  genres: Genre[];
  moods: Mood[];
  location_long: string | null;
  broadcast: string;
}

export interface SearchResponse {
  metadata: {
    popular_terms: string[];
  };
  results: SearchResult[];
  links: Link[];
}

export interface ShowDetails {
  alias: string;
  name: string;
  description: string;
  description_html: string;
  location_short: string | null;
  location_long: string | null;
  media: BroadcastMedia;
  genres: Genre[];
  moods: Mood[];
  external_links: string[];
  brand: Record<string, unknown>;
  links: Link[];
  embeds: {
    episodes: {
      results: Episode[];
    };
    nts_picks: {
      results: Episode[];
    };
  };
}

export interface Episode {
  alias: string;
  episode_alias: string;
  title: string;
  name: string;
  broadcast: string;
  media: BroadcastMedia;
  description: string;
  mixcloud: string | null;
  audio_sources: AudioSource[];
  genres: Genre[];
  moods: Mood[];
  show_alias: string;
  status: string;
  updated: string;
  external_links: string[];
  intensity: string | null;
  brand: Record<string, unknown>;
  embeds: Record<string, unknown>;
  links: Link[];
}

export interface ShowEpisodesResponse {
  results: Episode[];
  next: string | null;
}

export interface ResolveStreamResponse {
  hls_url: string;
  stream_url: string;
}

export interface TracklistTrack {
  artist: string;
  title: string;
  uid: string;
  offset: number | null;
  duration: number | null;
  offset_estimate: number | null;
  duration_estimate: number | null;
  acr_id: string | null;
  deezer_track_id: string | null;
  isrc_id: string | null;
  musicbrainz_track_id: string | null;
}

export interface TracklistResponse {
  metadata: {
    resultset: {
      count: number;
      offset: number;
      limit: number;
    };
  };
  results: TracklistTrack[];
  links: Link[];
}

export interface LastFmAuth {
  apiKey?: string;
  apiSecret?: string;
  sessionKey?: string;
}

export interface LastFmOAuthResponse {
  session?: {
    name: string;
    key: string;
    subscriber: number;
  };
  error?: number;
  message?: string;
}

export interface ListenBrainzAuth {
  token: string;
}

export interface ScrobbleTrack {
  artist: string;
  track: string;
  timestamp: number;
  album?: string;
  duration?: number;
  mbid?: string;
  chosenByUser?: boolean;
}

export interface ScrobbleResult {
  accepted: number;
  ignored: number;
  errors: string[];
}