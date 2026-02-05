"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";

type PressureMessage = {
  type: "pressure";
  timestamp: string;   // ISO string
  pressure: number;
  temp_or_status?: number | null;
  battery_v?: number | null;
  external_v?: number | null;
  gsm_pct?: number | null;
};

type ErrorMessage = {
  type: "error";
  timestamp: string;
  message: string;
};

type HelloMessage = {
  type: "hello";
  ts: string;
  message: string;
};

type AnyMsg = PressureMessage | ErrorMessage | HelloMessage | Record<string, any>;

type Point = {
  t: number;       // epoch ms
  label: string;   // HH:MM:SS
  pressure: number;        // calibrated
  pressure_raw: number;    // raw from device
};

function formatHMS(d: Date) {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

export default function Home() {
  const [wsUrl, setWsUrl] = useState("ws://100.66.42.65:8765");
  const [status, setStatus] = useState<"disconnected" | "connecting" | "connected" | "error">("disconnected");
  const [lastError, setLastError] = useState<string | null>(null);

  const [points, setPoints] = useState<Point[]>([]);
  const [latest, setLatest] = useState<PressureMessage | null>(null);

  // Calibration: pressure_calibrated = pressure_raw + offset
  const [calibrationOffset, setCalibrationOffset] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const maxPoints = 600;

  const connect = () => {
    setLastError(null);
    setStatus("connecting");

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setStatus("connected");

      ws.onclose = () => {
        wsRef.current = null;
        setStatus("disconnected");
      };

      ws.onerror = () => {
        setStatus("error");
        setLastError("WebSocket error. Check server URL, firewall, and that the server is running.");
      };

      ws.onmessage = (evt) => {
        let msg: AnyMsg;
        try {
          msg = JSON.parse(evt.data);
        } catch {
          return;
        }

        if (msg?.type === "error") {
          const em = msg as ErrorMessage;
          setStatus("error");
          setLastError(em.message);
          return;
        }

        if (msg?.type === "pressure") {
          const pm = msg as PressureMessage;
          setLatest(pm);

          const t = Date.parse(pm.timestamp);
          if (!Number.isFinite(t) || typeof pm.pressure !== "number") return;

          const d = new Date(t);
          const calibrated = pm.pressure + calibrationOffset;

          const p: Point = { t, label: formatHMS(d), pressure: calibrated, pressure_raw: pm.pressure };

          setPoints((prev) => {
            const next = [...prev, p];
            if (next.length > maxPoints) next.splice(0, next.length - maxPoints);
            return next;
          });
        }
      };
    } catch (e: any) {
      setStatus("error");
      setLastError(e?.message ?? "Failed to create WebSocket.");
    }
  };

  const disconnect = () => {
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("disconnected");
  };

  const clear = () => setPoints([]);

  useEffect(() => {
    // auto-connect once on load
    connect();
    return () => disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const dotClass = useMemo(() => {
    if (status === "connected") return "dot ok";
    if (status === "connecting") return "dot warn";
    if (status === "error") return "dot bad";
    return "dot";
  }, [status]);

  const latestPressureRaw = latest?.pressure ?? null;
  const latestPressureCal = (latest?.pressure ?? null) !== null ? (latest!.pressure + calibrationOffset) : null;
  const latestTs = latest?.timestamp ? new Date(latest.timestamp) : null;

  return (
    <div className="row">
      <div className="card">
        <h1 className="h1">Pressure Graph</h1>
        <p className="muted">
          Live data from WebSocket, plotted with timestamps.
        </p>

        <div className="controls">
          <span className="badge">
            <span className={dotClass} />
            <span>Status: {status}</span>
          <span className="badge" title="pressure_calibrated = pressure_raw + offset">
  <span className="dot" />
  <span>Calibration offset</span>
  <input
    type="number"
    step="0.0001"
    value={calibrationOffset}
    onChange={(e) => setCalibrationOffset(Number(e.target.value))}
    style={{
      width: 140,
      padding: "6px 8px",
      border: "1px solid #ddd",
      borderRadius: 10,
      fontSize: 13,
      marginLeft: 8
    }}
  />
</span>

          </span>

          <input
            type="text"
            value={wsUrl}
            onChange={(e) => setWsUrl(e.target.value)}
            placeholder="ws://127.0.0.1:8765"
            spellCheck={false}
          />

          {status !== "connected" ? (
            <button onClick={connect}>Connect</button>
          ) : (
            <button onClick={disconnect}>Disconnect</button>
          )}

          <button onClick={clear}>Clear</button>
        </div>

        {lastError && (
          <p className="small" style={{ marginTop: 10 }}>
            <b>Error:</b> {lastError}
          </p>
        )}

        <div style={{ width: "100%", height: 420, marginTop: 14 }}>
          <ResponsiveContainer>
            <LineChart data={points} margin={{ top: 10, right: 18, left: 0, bottom: 10 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 12 }}
                minTickGap={20}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                width={46}
              />
              <Tooltip
                formatter={(value: any, name: any) => {
                  if (name === "pressure") return [value, "pressure (calibrated)"];
                  if (name === "pressure_raw") return [value, "pressure (raw)"];
                  return [value, name];
                }}
                labelFormatter={(label) => `time: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="pressure"
                dot={false}
                strokeWidth={2}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="pressure_raw"
                dot={false}
                strokeWidth={1}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <p className="muted" style={{ marginTop: 10 }}>
          Tip: if you open this page from another device, replace <code>127.0.0.1</code> with your server PC/RPi LAN IP.
        </p>
      </div>

      <div className="card">
        <h2 className="h1" style={{ fontSize: 18 }}>Latest Reading</h2>
        <p className="muted">Most recent message of type <code>pressure</code>.</p>

        <div className="kv">
          <div>Timestamp</div>
          <div>{latestTs ? latestTs.toLocaleString() : "—"}</div>

          <div>Pressure (cal)</div>
          <div>{latestPressureCal ?? "—"}</div>

          <div>Pressure (raw)</div>
          <div>{latestPressureRaw ?? "—"}</div>

          <div>Offset</div>
          <div>{calibrationOffset}</div>

          <div>Temp/Status</div>
          <div>{latest?.temp_or_status ?? "—"}</div>

          <div>Battery (V)</div>
          <div>{latest?.battery_v ?? "—"}</div>

          <div>External (V)</div>
          <div>{latest?.external_v ?? "—"}</div>

          <div>GSM (%)</div>
          <div>{latest?.gsm_pct ?? "—"}</div>

          <div>Points</div>
          <div>{points.length}</div>
        </div>

        <p className="muted" style={{ marginTop: 14 }}>
          If your browser shows mixed-content issues (HTTPS page connecting to WS), run the site on HTTP in dev mode or use WSS behind a proxy.
        </p>
      </div>
    </div>
  );
}
