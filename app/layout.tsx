import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pressure WS Graph",
  description: "WebSocket pressure viewer with timestamped graph",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="container">
          {children}
        </div>
      </body>
    </html>
  );
}
