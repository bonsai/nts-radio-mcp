// NTS TUI Radio - terminal radio player for NTS (live ch1/ch2 + infinite mixtapes)
// Plays via ffplay (ffmpeg). Keys: ↑/k ↓/j move, Enter/Space play-stop, r refresh, q quit
import { spawn, ChildProcess } from 'child_process';
import { getLiveBroadcasts, getMixtapes, getStreamUrls, updateNowPlayingLastFm } from './api.js';
import { appendPlay, readHistory } from './history.js';
import { fetchIcecastMetadata, IcecastMetadata } from './icecast.js';

interface Station {
  kind: 'live' | 'mixtape';
  name: string;
  subtitle: string;
  url: string;
}

const state = {
  stations: [] as Station[],
  cursor: 0,
  playing: -1,
  player: null as ChildProcess | null,
  volume: 80,
  status: 'loading...',
  liveInfo: '' as string,
  offset: 0,
  view: 'list' as 'list' | 'viz',
  identifying: false,
  identifiedTrack: null as IcecastMetadata | null,
};

function decode(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

const ANSI = {
  clear: '\x1B[2J\x1B[H',
  hide: '\x1B[?25l',
  show: '\x1B[?25h',
  dim: '\x1B[2m',
  bold: '\x1B[1m',
  cyan: '\x1B[36m',
  green: '\x1B[32m',
  magenta: '\x1B[35m',
  yellow: '\x1B[33m',
  red: '\x1B[31m',
  reset: '\x1B[0m',
};

async function buildStations(): Promise<void> {
  const streams = getStreamUrls();
  const stations: Station[] = [
    { kind: 'live', name: 'NTS 1', subtitle: 'loading...', url: streams.channel1.icecast },
    { kind: 'live', name: 'NTS 2', subtitle: 'loading...', url: streams.channel2.icecast },
  ];
  try {
    const live = await getLiveBroadcasts();
    live.results.forEach((ch, i) => {
      const d = ch.now.embeds.details;
      if (stations[i]) {
        stations[i].subtitle = `${decode(ch.now.broadcast_title)} — ${d.name} [${d.genres.map(g => g.value).join(', ')}]`;
      }
    });
    state.liveInfo = live.results.map((ch, i) => `NTS ${i + 1}: ${decode(ch.now.broadcast_title)}`).join('  |  ');
  } catch {
    stations[0].subtitle = stations[1].subtitle = '(live info unavailable)';
  }
  try {
    const mixtapes = await getMixtapes();
    for (const m of mixtapes.results) {
      stations.push({
        kind: 'mixtape',
        name: `∞ ${decode(m.title)}`,
        subtitle: `${decode(m.subtitle)} — ${m.credits.map(c => c.name).join(', ')}`,
        url: m.audio_stream_endpoint,
      });
    }
  } catch {
    state.status = 'mixtape fetch failed';
  }
  state.stations = stations;
}

function stopPlayer(): void {
  if (state.player) {
    try { state.player.kill(); } catch {}
    state.player = null;
  }
  state.playing = -1;
}

function play(index: number): void {
  const st = state.stations[index];
  if (!st) return;
  stopPlayer();
  state.playing = index;
  state.status = `playing: ${st.name}`;
  state.identifiedTrack = null;
  try {
    state.player = spawn('ffplay', ['-nodisp', '-loglevel', 'quiet', '-autoexit', '-volume', String(state.volume), st.url], { stdio: 'ignore' });
    state.player.on('exit', () => {
      if (state.playing >= 0) { state.playing = -1; state.status = 'stopped'; render(); }
    });
    state.player.on('error', () => { state.playing = -1; state.status = 'ffplay not found (scoop install ffmpeg)'; render(); });
  } catch {
    state.playing = -1;
    state.status = 'player spawn failed';
  }
  // Now Playing to Last.fm (uses LASTFM_* env vars; silent on failure)
  updateNowPlayingLastFm({}, { artist: 'NTS Radio', track: st.name + ' — ' + st.subtitle, album: 'nts-radio-mcp TUI', timestamp: Math.floor(Date.now() / 1000) })
    .catch(() => {});
  // 履歴記録
  appendPlay({ stationIndex: index, stationName: st.name, stationKind: st.kind, subtitle: st.subtitle });
  render();
}

function renderViz(): void {
  const history = readHistory();
  const cols = process.stdout.columns || 80;
  const rows = process.stdout.rows || 24;

  // 集計: 放送局別再生回数
  const byStation = new Map<string, number>();
  for (const h of history) {
    byStation.set(h.stationName, (byStation.get(h.stationName) || 0) + 1);
  }
  const stationRanking = Array.from(byStation.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);

  // 集計: 時間帯別（0-23時）
  const byHour = new Array(24).fill(0);
  for (const h of history) {
    const hour = new Date(h.ts).getHours();
    byHour[hour]++;
  }
  const maxHour = Math.max(...byHour) || 1;
  const maxStation = Math.max(...stationRanking.map(([, c]) => c)) || 1;

  const out: string[] = [];
  out.push(ANSI.clear + ANSI.hide);
  out.push(`${ANSI.bold}${ANSI.magenta} NTS RADION — 視聴可視化 ${ANSI.reset}${ANSI.dim}v で一覧に戻る  q で終了 ${ANSI.reset}`);
  out.push(`${ANSI.dim} 総再生回数: ${history.length}  ${ANSI.reset}`);
  out.push('');

  // 放送局別棒グラフ
  out.push(`${ANSI.bold}■ 放送局別再生回数${ANSI.reset}`);
  for (const [name, count] of stationRanking) {
    const barLen = Math.floor((count / maxStation) * 40);
    const bar = '█'.repeat(barLen);
    const padded = name.padEnd(22);
    out.push(`  ${ANSI.dim}${padded}${ANSI.reset} ${ANSI.green}${bar}${ANSI.reset} ${ANSI.bold}${count}${ANSI.reset}`);
  }
  out.push('');

  // 時間帯別棒グラフ
  out.push(`${ANSI.bold}■ 時間帯別再生回数${ANSI.reset}`);
  for (let h = 0; h < 24; h += 3) {
    const block = byHour.slice(h, h + 3);
    const blockSum = block.reduce((a, b) => a + b, 0);
    const barLen = Math.floor((blockSum / maxHour) * 40);
    const bar = '█'.repeat(barLen);
    const label = `${String(h).padStart(2, '0')}:00–${String(h + 2).padStart(2, '0')}:00`.padEnd(14);
    out.push(`  ${ANSI.dim}${label}${ANSI.reset} ${ANSI.yellow}${bar}${ANSI.reset} ${ANSI.bold}${blockSum}${ANSI.reset}`);
  }
  out.push('');

  // 直近 10 件
  out.push(`${ANSI.bold}■ 直近再生${ANSI.reset}`);
  const recent = history.slice(-10).reverse();
  for (const h of recent) {
    const when = new Date(h.ts).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
    out.push(`  ${ANSI.dim}${when}${ANSI.reset}  ${h.stationName}`);
  }
  out.push('');

  out.push(` ${ANSI.bold}${state.status}${ANSI.reset}   ${ANSI.dim}vol: ${state.volume}${ANSI.reset}`);
  process.stdout.write(out.join('\r\n') + '\r\n');
}

function render(): void {
  if (state.view === 'viz') {
    renderViz();
    return;
  }
  const rows = process.stdout.rows || 24;
  const listH = Math.max(5, rows - 7);
  // keep cursor visible
  if (state.cursor < state.offset) state.offset = state.cursor;
  if (state.cursor >= state.offset + listH) state.offset = state.cursor - listH + 1;

  const out: string[] = [];
  out.push(ANSI.clear + ANSI.hide);
  out.push(`${ANSI.bold}${ANSI.magenta} NTS RADIO ${ANSI.reset}${ANSI.dim}tui  |  ↑↓ move  Enter play/stop  r refresh  i icecast  v viz  q quit  ${ANSI.reset}`);
  out.push(`${ANSI.dim} ${state.liveInfo || ''}${ANSI.reset}`);
  out.push('');
  for (let i = state.offset; i < Math.min(state.offset + listH, state.stations.length); i++) {
    const s = state.stations[i];
    const sel = i === state.cursor;
    const now = i === state.playing;
    const marker = now ? `${ANSI.green}▶${ANSI.reset}` : ' ';
    const pointer = sel ? `${ANSI.cyan}>${ANSI.reset}` : ' ';
    const name = (sel ? ANSI.bold + ANSI.cyan : '') + s.name.padEnd(24) + ANSI.reset;
    const line = ` ${pointer}${marker} ${name} ${ANSI.dim}${s.subtitle.slice(0, Math.max(10, process.stdout.columns || 80) - 34)}${ANSI.reset}`;
    out.push(line);
  }
  out.push('');
  // 現在曲推定結果
  if (state.identifiedTrack) {
    const t = state.identifiedTrack;
    out.push(`${ANSI.bold}■ 現在曲 (Icecast)${ANSI.reset}`);
    out.push(`  ${ANSI.cyan}${t.title ?? 'Unknown'}${ANSI.reset} / ${ANSI.magenta}${t.artist ?? 'Unknown'}${ANSI.reset}`);
    out.push('');
  }
  out.push(` ${ANSI.bold}${state.status}${ANSI.reset}   ${ANSI.dim}vol: ${state.volume}${ANSI.reset}`);
  process.stdout.write(out.join('\r\n') + '\r\n');
}

function onKey(buf: Buffer): void {
  const s = buf.toString();
  if (s === 'q' || s === 'Q' || s === '\x03' || s === '\x1B\x1B' || s === '\x1B') { shutdown(0); return; }
  if (s === '\x1B[A' || s === 'k') { state.cursor = (state.cursor - 1 + state.stations.length) % state.stations.length; render(); return; }
  if (s === '\x1B[B' || s === 'j') { state.cursor = (state.cursor + 1) % state.stations.length; render(); return; }
  if (s === '\x1B[C' || s === '+') { state.volume = Math.min(100, state.volume + 5); if (state.playing >= 0) play(state.playing); else render(); return; }
  if (s === '\x1B[D' || s === '-') { state.volume = Math.max(0, state.volume - 5); if (state.playing >= 0) play(state.playing); else render(); return; }
  if (s === 'r' || s === 'R') { state.status = 'refreshing...'; render(); buildStations().then(() => { state.status = state.playing >= 0 ? `playing: ${state.stations[state.playing].name}` : 'ready'; render(); }); return; }
  if (s === 'v' || s === 'V') { state.view = state.view === 'list' ? 'viz' : 'list'; render(); return; }
  if (s === 'i' || s === 'I') {
    const st = state.stations[state.playing];
    if (!st || st.kind !== 'live') { state.status = 'live チャンネルのみ識別対象'; render(); return; }
    const streams = getStreamUrls();
    const url = state.playing === 0 ? streams.channel1.icecast : streams.channel2.icecast;
    state.identifying = true;
    state.status = 'Icecast メタデータ取得中…';
    render();
    fetchIcecastMetadata(url).then((meta) => {
      state.identifying = false;
      if (meta && (meta.title || meta.artist)) {
        state.identifiedTrack = meta;
        state.status = `現在曲: ${meta.artist ?? ''} - ${meta.title ?? ''}`;
      } else {
        state.identifiedTrack = null;
        state.status = 'メタデータ取得不可 (Icecast タイトル未設定)';
      }
      render();
    }).catch(() => {
      state.identifying = false;
      state.status = 'メタデータ取得エラー';
      render();
    });
    return;
  }
  if (s === '\r' || s === '\n' || s === ' ') {
    if (state.playing === state.cursor) { stopPlayer(); state.status = 'stopped'; render(); }
    else play(state.cursor);
    return;
  }
  // number keys 1-9 quick play live/mixtape
  const n = parseInt(s, 10);
  if (!isNaN(n) && n >= 1 && n <= 9 && state.stations[n - 1]) { state.cursor = n - 1; play(n - 1); return; }
}

function shutdown(code: number): void {
  stopPlayer();
  process.stdout.write(ANSI.show + '\x1B[0m');
  try { process.stdin.setRawMode(false); } catch {}
  process.stdin.pause();
  process.exit(code);
}

async function main(): Promise<void> {
  if (process.stdin.isTTY) process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', onKey);
  process.stdout.on('resize', render);
  process.on('SIGINT', () => shutdown(0));
  await buildStations();
  state.status = 'ready — Enter to play';
  render();
}

main().catch((e) => { shutdown(1); console.error(e); });
