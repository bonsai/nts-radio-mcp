// NTS TUI Radio — 現在曲推定 (Shazam API 直接リクエスト)
// ffmpeg でライブストリームを 10 秒録音 → WAV → Shazam API POST で識別
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { createReadStream } from 'node:fs';
import { getStreamUrls } from './api.js';

const exec = promisify(execFile);

export interface IdentifiedTrack {
  title: string;
  artist: string;
  album?: string;
  source: string; // 'shazam' | 'none'
  raw?: unknown;
}

const FFMPEG_PATH = process.env.FFMPEG_PATH ?? 'ffmpeg';
const SHAZAM_API_URL =
  process.env.SHAZAM_API_URL ?? 'https://amp-api.edge.shazam.com/v1/discover/songs';

/** ffmpeg で NTS ライブストリームを seconds 秒録音し、WAV ファイルパスを返す */
async function recordStream(channel: '1' | '2', seconds = 10): Promise<string> {
  const streams = getStreamUrls();
  const url = channel === '1' ? streams.channel1.icecast : streams.channel2.icecast;
  const outPath = join(tmpdir(), `nts-identify-${channel}-${Date.now()}.wav`);

  await exec(
    FFMPEG_PATH,
    [
      '-y',
      '-t', String(seconds),
      '-i', url,
      '-ac', '1',
      '-ar', '44100',
      '-sample_fmt', 's16',
      outPath,
    ],
    { timeout: (seconds + 10) * 1000, windowsHide: true, maxBuffer: 1024 * 1024 },
  );

  return outPath;
}

/** multipart/form-data ボディを構築 */
function buildMultipart(fields: Record<string, string>, filePath: string): {
  body: string;
  boundary: string;
} {
  const boundary = `----ShazamFormBoundary${Date.now()}`;
  const parts: string[] = [];

  for (const [key, value] of Object.entries(fields)) {
    parts.push(`--${boundary}`);
    parts.push(`Content-Disposition: form-data; name="${key}"`);
    parts.push('');
    parts.push(value);
  }

  parts.push(`--${boundary}`);
  parts.push(
    `Content-Disposition: form-data; name="audio"; filename="nts.wav"`,
  );
  parts.push('Content-Type: audio/wav');
  parts.push('');

  const header = parts.join('\r\n') + '\r\n';
  const footer = `\r\n--${boundary}--\r\n`;

  return { body: header + footer, boundary };
}

/** WAV ファイルを Shazam API に POST して識別結果を返す */
async function identifyWithShazam(wavPath: string): Promise<IdentifiedTrack | null> {
  try {
    const fields = {
      time: String(Math.floor(Date.now() / 1000)),
      sampRate: '44100',
      sampling: '1',
      regions: 'US',
      locale: 'ja-JP',
    };

    const { body, boundary } = buildMultipart(fields, wavPath);

    const response = await fetch(SHAZAM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        Accept: 'application/json',
        'User-Agent': 'nts-radio-mcp/1.0.0',
      },
      body,
    });

    if (!response.ok) {
      throw new Error(`Shazam API error: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as unknown;
    const track = extractTrack(data);
    if (!track) return null;

    return {
      title: track.title ?? 'Unknown',
      artist: track.artist ?? 'Unknown',
      album: track.album,
      source: 'shazam',
      raw: data,
    };
  } catch {
    return null;
  }
}

/** Shazam レスポンスからトラック情報を抽出 */
function extractTrack(data: unknown): { title?: string; artist?: string; album?: string } | null {
  if (!data || typeof data !== 'object') return null;
  const obj = data as Record<string, unknown>;

  // Shazam API のレスポンス構造に合わせて探索
  const candidates: unknown[] = [];

  if (obj.track) candidates.push(obj.track);
  if (obj.results && Array.isArray(obj.results)) candidates.push(...obj.results);
  if (obj.data && Array.isArray(obj.data)) candidates.push(...obj.data);
  if (obj.matches && Array.isArray(obj.matches)) candidates.push(...obj.matches);
  if (obj.track_sections && Array.isArray(obj.track_sections)) {
    for (const s of obj.track_sections) {
      if (typeof s === 'object' && s !== null && (s as Record<string, unknown>).track) {
        candidates.push((s as Record<string, unknown>).track);
      }
    }
  }

  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const t = c as Record<string, unknown>;
    const title =
      t.title ?? t.track ?? t.name ?? (t.sections ? undefined : undefined);
    const artist =
      t.subtitle ?? t.artist ?? t.subtitle_name ?? (t.artist_name as string | undefined);
    if (title || artist) {
      return { title: title as string | undefined, artist: artist as string | undefined, album: t.album as string | undefined };
    }
  }

  return null;
}

/** 現在流れている曲を推定 (シャザム API) */
export async function identifyCurrentTrack(channel: '1' | '2'): Promise<IdentifiedTrack> {
  let wavPath: string | null = null;
  try {
    wavPath = await recordStream(channel, 10);

    const result = await identifyWithShazam(wavPath);
    if (result) return result;

    return {
      title: 'Unknown',
      artist: 'Unknown',
      source: 'none',
      raw: { note: 'No match found by Shazam API.' },
    };
  } catch (error) {
    return {
      title: 'Error',
      artist: 'Identification failed',
      source: 'none',
      raw: { error: error instanceof Error ? error.message : String(error) },
    };
  } finally {
    if (wavPath && existsSync(wavPath)) {
      try { unlinkSync(wavPath); } catch {}
    }
  }
}
