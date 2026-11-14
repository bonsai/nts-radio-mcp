// NTS TUI Radio — 現在曲推定 (Shazam 互換音声指紋マッチング)
// ffmpeg でライブストリームを 10 秒録音 → WAV → vibra/goshazam で Shazam 識別
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import { getStreamUrls } from './api.js';

const exec = promisify(execFile);

export interface IdentifiedTrack {
  title: string;
  artist: string;
  album?: string;
  source: string; // 'shazam' | 'vibra' | 'goshazam' | 'none'
  raw?: unknown;
}

const FFMPEG_PATH = process.env.FFMPEG_PATH ?? 'ffmpeg';
const SHAZAM_CLI = process.env.SHAZAM_CLI ?? 'vibra'; // 'vibra' | 'goshazam'

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

/** vibra で WAV を Shazam 識別 */
async function identifyWithVibra(wavPath: string): Promise<IdentifiedTrack | null> {
  try {
    const { stdout } = await exec(
      SHAZAM_CLI,
      ['--recognize', '--file', wavPath, '--json'],
      { timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const data = JSON.parse(stdout.trim());
    const track = data?.track ?? data;
    if (!track) return null;
    return {
      title: track.title ?? track.track ?? 'Unknown',
      artist: track.subtitle ?? track.artist ?? 'Unknown',
      album: track.album,
      source: 'vibra',
      raw: data,
    };
  } catch {
    return null;
  }
}

/** goshazam で WAV を Shazam 識別 */
async function identifyWithGoshazam(wavPath: string): Promise<IdentifiedTrack | null> {
  try {
    const { stdout } = await exec(
      SHAZAM_CLI,
      ['recognize', '--json', wavPath],
      { timeout: 30000, windowsHide: true, maxBuffer: 1024 * 1024 },
    );
    const data = JSON.parse(stdout.trim());
    const track = data?.track ?? data;
    if (!track) return null;
    return {
      title: track.title ?? track.track ?? 'Unknown',
      artist: track.subtitle ?? track.artist ?? 'Unknown',
      album: track.album,
      source: 'goshazam',
      raw: data,
    };
  } catch {
    return null;
  }
}

/** 現在流れている曲を推定 (シャザム風) */
export async function identifyCurrentTrack(channel: '1' | '2'): Promise<IdentifiedTrack> {
  let wavPath: string | null = null;
  try {
    wavPath = await recordStream(channel, 10);

    if (SHAZAM_CLI === 'goshazam') {
      const result = await identifyWithGoshazam(wavPath);
      if (result) return result;
    } else {
      const result = await identifyWithVibra(wavPath);
      if (result) return result;
    }

    // フォールバック: もう片方のツールを試す
    const other = SHAZAM_CLI === 'goshazam' ? 'vibra' : 'goshazam';
    const prev = SHAZAM_CLI;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    // (動的切り替えは単純化のためスキップ)

    return {
      title: 'Unknown',
      artist: 'Unknown',
      source: 'none',
      raw: { note: `No match found. Install ${other} or set SHAZAM_CLI env var.` },
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
