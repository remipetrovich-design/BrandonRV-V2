"use client";

import { useState } from "react";

type Props = { available: boolean; configured: boolean };

export default function AdminManualDeploy({ available, configured }: Props) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function deploy() {
    if (busy || !available) return;
    const confirmed = window.confirm(
      "This will build Brandon RV V2, apply pending migrations to the dedicated V2 Supabase project, and deploy the application to Vercel Production. Continue?"
    );
    if (!confirmed) return;

    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/admin/deployment/manual-deploy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        cache: "no-store"
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Could not queue the deployment.");
      setMessage(body.message || "Manual deployment and migration workflow queued.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not queue the deployment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="manual-deploy">
      <section className={"manual-deploy-status" + (available ? " ready" : "")}>
        <div>
          <span className="eyebrow">V2 DEPLOYMENT CONTROL</span>
          <h2>Manual deploy + database migrations</h2>
          <p>
            This action builds the application, previews pending V2 migrations, applies them,
            then deploys the build to Vercel Production. It does not run on ordinary pushes
            or automatic deployments.
          </p>
        </div>
        <strong>{available ? "READY" : "INACTIVE"}</strong>
      </section>

      <div className="manual-deploy-actions">
        <button type="button" onClick={deploy} disabled={!available || busy}>
          {busy ? "Queueing deployment…" : "Manual Deploy + Migrate"}
        </button>
        <a href="https://github.com/remipetrovich-design/BrandonRV-V2/actions/workflows/manual-deploy-migrate.yml" target="_blank" rel="noreferrer">
          View deployment workflow ↗
        </a>
      </div>

      {!available && (
        <p className="manual-deploy-note">
          {configured
            ? "The manual deployment activation flag is off. This control is intentionally dormant."
            : "The manual deployment control is dormant. Its server-side GitHub dispatch connection and activation flag are not configured."}
        </p>
      )}
      {message && <p role="status" className="manual-deploy-message">{message}</p>}
      {error && <p role="alert" className="manual-deploy-error">{error}</p>}
      <p className="manual-deploy-note">
        Restricted to Owner and Website Developer accounts. The workflow is separately gated
        in GitHub Actions and targets only Supabase project lciylmfpcefdpsouoqvm.
      </p>

      <style jsx>{`
        .manual-deploy{display:grid;gap:18px}
        .manual-deploy-status{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:24px;border:1px solid #e1c28a;background:#fffaf0;border-radius:14px;color:#684c20}
        .manual-deploy-status.ready{border-color:#a5d3b3;background:#f3fbf5;color:#225b35}
        .eyebrow{font-size:11px;font-weight:800;letter-spacing:.13em;opacity:.75}
        h2{font-size:22px;margin:7px 0}.manual-deploy-status p{margin:0;font-size:14px;line-height:1.55;max-width:720px}
        .manual-deploy-status>strong{font-size:12px;letter-spacing:.1em}
        .manual-deploy-actions{display:flex;align-items:center;gap:18px;flex-wrap:wrap}
        .manual-deploy-actions button{border:0;border-radius:8px;background:#1674b8;color:#fff;padding:12px 17px;font-weight:750;cursor:pointer}
        .manual-deploy-actions button:disabled{opacity:.45;cursor:not-allowed}
        .manual-deploy-actions a{font-size:13px;color:#315b76;font-weight:700}
        .manual-deploy-note{font-size:12px;line-height:1.6;color:#707b85}
        .manual-deploy-message{font-size:13px;color:#225b35}.manual-deploy-error{font-size:13px;color:#a12828}
        @media(max-width:600px){.manual-deploy-status{flex-direction:column}}
      `}</style>
    </div>
  );
}
