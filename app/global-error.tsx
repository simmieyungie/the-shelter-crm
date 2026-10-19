"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en-NG">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#F8F9FA", color: "#1E293B", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ maxWidth: 360, padding: 24, background: "#fff", border: "1px solid #E2E8F0", borderRadius: 16, textAlign: "center" }}>
          <h1 style={{ fontSize: 18 }}>Something went wrong</h1>
          <p style={{ fontSize: 14, color: "#64748B" }}>Reload the page to try again.</p>
          <button onClick={reset} style={{ marginTop: 12, height: 44, padding: "0 16px", borderRadius: 10, border: 0, background: "#180C62", color: "#fff" }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
