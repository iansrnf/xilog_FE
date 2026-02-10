
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
  pressure?: number;
  timestamp?: string;
};

const BACKEND_HOST = '172.20.10.84:3001';
const MAX_POINTS = 120;

const colorMap: Record<string, string> = {};
function colorFor(deviceId: string) {
  if (!colorMap[deviceId]) {
    const hue = Math.floor(Math.random() * 360);
    colorMap[deviceId] = `hsl(${hue}, 70%, 50%)`;
  }
  return colorMap[deviceId];
}

const Home: NextPage = () => {
  const [deviceText, setDeviceText] = useState('pi-001, pi-002');
  const [series, setSeries] = useState<Record<string, Reading[]>>({});
  const [status, setStatus] = useState<'disconnected'|'connecting'|'connected'>('disconnected');
  const [paused, setPaused] = useState<boolean>(false);

  const timeRef = useRef<string[]>([]);
  const wsRef = useRef<WebSocket | null>(null);

  const devices = useMemo(
    () => deviceText.split(',').map(d=>d.trim()).filter(Boolean),
    [deviceText]
  );

  useEffect(() => {
    if (paused) return;

    setStatus('connecting');
    const ws = new WebSocket(`ws://${BACKEND_HOST}/stream`);
    wsRef.current = ws;

    ws.onopen = () => setStatus('connected');
    ws.onclose = () => setStatus('disconnected');
    ws.onerror = () => setStatus('disconnected');

    ws.onmessage = e => {
      let msg:any;
      try { msg = JSON.parse(e.data); } catch { return; }
      if (msg?.type === 'snapshot' && msg?.data) msg = msg.data;

      const { deviceId, pressure, timestamp } = msg;
      if (!deviceId || typeof pressure !== 'number') return;
      if (!devices.includes(deviceId)) return;

      const ts = timestamp ?? new Date().toISOString();

      setSeries(prev => {
        const next = { ...prev };
        const arr = next[deviceId] ? [...next[deviceId]] : [];
        arr.push({ deviceId, pressure, timestamp: ts });
        next[deviceId] = arr.slice(-MAX_POINTS);
        return next;
      });

      timeRef.current = [...timeRef.current, ts].slice(-MAX_POINTS);
    };

    return () => ws.close();
  }, [devices.join('|'), paused]);

  const chartData: ChartData<'line'> = useMemo(() => {
    const labels = timeRef.current.map(t => new Date(t).toLocaleTimeString());
    const datasets = devices.map(id => ({
      label: id,
      data: (series[id] ?? []).map(r => r.pressure ?? null),
      borderColor: colorFor(id),
      backgroundColor: colorFor(id),
      tension: 0.3,
    }));
    return { labels, datasets };
  }, [devices, series]);

  return (
    <div style={{ padding: 20 }}>
      <h1>Multi Raspberry Pi Pressure Monitor</h1>

      <div style={{ display:'flex', gap:12, alignItems:'center', flexWrap:'wrap' }}>
        <label>
          Devices:&nbsp;
          <input
            value={deviceText}
            onChange={e => setDeviceText(e.target.value)}
            style={{ padding:6, borderRadius:8, border:'1px solid #ccc', minWidth:260 }}
          />
        </label>

        <button
          onClick={() => setPaused(p => !p)}
          style={{
            padding:'6px 14px',
            borderRadius:12,
            border:'1px solid #333',
            cursor:'pointer',
            background: paused ? '#4caf50' : '#f44336',
            color:'white',
          }}
        >
          {paused ? '▶ Play' : '⏸ Pause'}
        </button>

        <span style={{ padding:'4px 10px', border:'1px solid #ddd', borderRadius:999 }}>
          WS: {paused ? 'paused' : status}
        </span>
      </div>

      <div style={{ maxWidth: 1200, marginTop: 18 }}>
        <Line data={chartData} />
      </div>
    </div>
  );
};

export default Home;
