// NTS TUI Radio — Icecast メタデータ取得 (現在曲情報)
// 外部ツール不要。NTS の Icecast ストリームから StreamTitle を読み取る。
import * as http from 'node:http';
import * as https from 'node:https';

export interface IcecastMetadata {
  title?: string;
  artist?: string;
}

function parseMetadataString(raw: string): { title?: string; artist?: string } {
  const m = /StreamTitle='([^']*)'/.exec(raw);
  if (!m) return {};
  const full = m[1].replace(/';.*$/, '').trim();
  if (!full || full === '') return {};

  // "Artist - Title" 形式を分割
  const sep = full.indexOf(' - ');
  if (sep > 0) {
    return { artist: full.slice(0, sep).trim(), title: full.slice(sep + 3).trim() };
  }
  return { title: full };
}

/** Icecast ストリームから現在のメタデータを取得 (最大 30 秒タイムアウト) */
export async function fetchIcecastMetadata(
  url: string,
  timeoutMs = 30_000,
): Promise<IcecastMetadata | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), timeoutMs);
    const client = url.startsWith('https:') ? https : http;

    const req = client.get(
      url,
      {
        headers: {
          'Icy-Metadata': '1',
          'User-Agent': 'nts-radio-mcp/1.0.0',
          Accept: '*/*',
          Connection: 'close',
        },
      },
      (res) => {
        const metaintRaw = res.headers['icy-metaint'];
        if (!metaintRaw) {
          clearTimeout(timer);
          res.resume();
          resolve(null);
          return;
        }
        const metaint = parseInt(String(metaintRaw), 10);
        if (!metaint || metaint <= 0) {
          clearTimeout(timer);
          res.resume();
          resolve(null);
          return;
        }

        let skipped = 0;
        let metaChunks: Buffer[] = [];
        let inMeta = false;
        let metaLen = 0;
        let done = false;

        const finish = (meta: IcecastMetadata | null) => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          try { res.destroy(); } catch {}
          resolve(meta);
        };

        res.on('data', (chunk: Buffer) => {
          if (done) return;
          if (inMeta) {
            metaChunks.push(chunk);
            const total = Buffer.concat(metaChunks).length;
            if (total >= metaLen) {
              const raw = Buffer.concat(metaChunks).slice(0, metaLen).toString('latin1');
              finish(parseMetadataString(raw));
            }
            return;
          }

          skipped += chunk.length;
          if (skipped >= metaint) {
            const over = skipped - metaint;
            const metaLenByte = chunk[chunk.length - over - 1] ?? 0;
            metaLen = metaLenByte * 16;
            if (metaLen === 0) {
              skipped = over;
              return;
            }
            inMeta = true;
            metaChunks = [];
            const metaStart = chunk.length - over;
            if (metaStart < chunk.length) {
              metaChunks.push(chunk.slice(metaStart));
            }
          }
        });

        res.on('end', () => {
          if (!done) finish(null);
        });

        res.on('error', () => {
          if (!done) finish(null);
        });
      },
    );

    req.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}
