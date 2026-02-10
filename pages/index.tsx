import { useEffect, useMemo, useRef, useState } from 'react';
import type { NextPage } from 'next';
import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Tooltip,
  Legend,
  type ChartData,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Tooltip, Legend);

type Reading = {
  deviceId?: string;
  timestamp?: string;
  pressure?: number;
  temp_or_status?: number | null;
  battery_v?: number | null;
  external_v?: number | null;
  gsm_pct?: number | null;
  raw?: string;
};

const BACKEND_HOST = '172.20.10.84:3001'; // <-- change me
const MAX_POINTS = 180;

function colorFor(deviceId: string): string {
  let hash = 0;
  for (let i = 0; i < deviceId.length; i++) {
    hash = (hash * 31 + deviceId.charCodeAt(i) *32 ) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

function parseDevices(s: string): string[] {
  return s.split(',').map((x) => x.trim()).filter(Boolean);
}

function fmt(n: unknown, digits = 3) {
  if (typeof n !== 'number' || Number.isNaN(n)) return '-';
  return n.toFixed(digits);
}

const Home: NextPage = () => {
  const [deviceText, setDeviceText] = useState('pi-001, pi-002');
  const [paused, setPaused] = useState(false);
  const [status, setStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');

  const [series, setSeries] = useState<Record<string, Reading[]>>({});
  const [latest, setLatest] = useState<Record<string, Reading>>({});

  const timeRef = useRef<string[]>([]);
  const devices = useMemo(() => parseDevices(deviceText), [deviceText]);

  useEffect(() => {
    if (paused) return;

    setStatus('connecting');
    const ws = new WebSocket(`ws://${BACKEND_HOST}/stream`);

    ws.onopen = () => setStatus('connected');
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('disconnected');

    ws.onmessage = (event: MessageEvent<string>) => {
      let msg: any;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg?.type === 'snapshot' && msg?.data) msg = msg.data;

      const deviceId: string | undefined = msg?.deviceId;
      const pressure: number | undefined = msg?.pressure;
      const timestamp: string = typeof msg?.timestamp === 'string' ? msg.timestamp : new Date().toISOString();

      if (!deviceId || typeof pressure !== 'number') return;
      if (!devices.includes(deviceId)) return;

      const reading: Reading = { ...msg, deviceId, timestamp };

      setLatest((prev) => ({ ...prev, [deviceId]: reading }));
      setSeries((prev) => {
        const next = { ...prev };
        const arr = next[deviceId] ? [...next[deviceId]] : [];
        arr.push(reading);
        next[deviceId] = arr.slice(-MAX_POINTS);
        return next;
      });

      timeRef.current = [...timeRef.current, timestamp].slice(-MAX_POINTS);
    };

    return () => ws.close();
  }, [devices.join('|'), paused]);

  const chartData: ChartData<'line'> = useMemo(() => {
    const labels = timeRef.current.map((t) => new Date(t).toLocaleTimeString());

    const datasets = devices.map((id) => {
      const c = colorFor(id);
      return {
        label: `Pressure (${id})`,
        data: (series[id] ?? []).map((r) => (typeof r.pressure === 'number' ? r.pressure : null)),
        borderColor: c,
        backgroundColor: c,
        pointBackgroundColor: c,
        pointBorderColor: c,
        tension: 0.3,
        pointRadius: 1.5,
      };
    });

    return { labels, datasets };
  }, [devices, series]);

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
      <h1 style={{ marginBottom: 10 }}>Multi Raspberry Pi Pressure Monitor</h1>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <label>
          Devices (comma-separated):&nbsp;
          <input
            value={deviceText}
            onChange={(e) => setDeviceText(e.target.value)}
            style={{ padding: 6, borderRadius: 8, border: '1px solid #ccc', minWidth: 300 }}
          />
        </label>

        <button
          onClick={() => setPaused((p) => !p)}
          style={{
            padding: '6px 14px',
            borderRadius: 12,
            border: '1px solid #333',
            cursor: 'pointer',
            background: paused ? '#4caf50' : '#f44336',
            color: 'white',
          }}
        >
          {paused ? '▶ Play' : '⏸ Pause'}
        </button>

        <span style={{ padding: '4px 10px', border: '1px solid #ddd', borderRadius: 999, fontSize: 12 }}>
          WS: {paused ? 'paused' : status}
        </span>

        <span style={{ fontSize: 12, color: '#666' }}>
          Backend: <code>{BACKEND_HOST}</code>
        </span>
      </div>

      <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 360px', gap: 18, alignItems: 'start' }}>
        <div style={{ maxWidth: 1200 }}>
          <Line data={chartData} />
        </div>

        <div style={{ border: '1px solid #e5e5e5', borderRadius: 14, padding: 14, background: '#fff' }}>
          <h3 style={{ margin: 0, marginBottom: 8 }}>Latest per device</h3>
          <p style={{ margin: 0, marginBottom: 12, fontSize: 12, color: '#666' }}>
            Colors are hash-based from <code>deviceId</code> so they match the chart.
          </p>

          {devices.map((id) => {
            const r = latest[id];
            const c = colorFor(id);
            return (
              <div key={id} style={{ border: `2px solid ${c}`, borderRadius: 12, padding: 10, marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 999, background: c, display: 'inline-block' }} />
                    <b style={{ color: c }}>{id}</b>
                  </div>
                  <span style={{ fontSize: 12, color: '#666' }}>
                    {r?.timestamp ? new Date(String(r.timestamp)).toLocaleTimeString() : '-'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 13, marginTop: 8 }}>
                  <div><span style={{ color: '#666' }}>Pressure</span><br /><b style={{ color: c }}>{fmt(r?.pressure, 6)}</b></div>
                  <div><span style={{ color: '#666' }}>Temp/Status</span><br /><b>{fmt(r?.temp_or_status, 0)}</b></div>
                  <div><span style={{ color: '#666' }}>Battery (V)</span><br /><b>{fmt(r?.battery_v, 2)}</b></div>
                  <div><span style={{ color: '#666' }}>External (V)</span><br /><b>{fmt(r?.external_v, 2)}</b></div>
                  <div><span style={{ color: '#666' }}>GSM (%)</span><br /><b>{fmt(r?.gsm_pct, 0)}</b></div>
                  <div><span style={{ color: '#666' }}>Raw</span><br /><span style={{ fontSize: 11, color: '#444' }}>{String(r?.raw ?? '-').slice(0, 18)}</span></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Home;
