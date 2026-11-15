"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function AdminCreateSupplier() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setNotice("");
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(
      ["name", "contact_name", "email", "phone", "account_reference", "website", "notes"]
        .map(key => [key, String(form.get(key) ?? "")])
    );
    try {
      const response = await fetch("/api/admin/suppliers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        setNotice(data.error ?? "Could not create supplier.");
        return;
      }
      event.currentTarget.reset();
      setOpen(false);
      router.refresh();
    } catch {
      setNotice("Could not create supplier.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="portal-panel admin-create-customer">
      <div className="portal-panel-heading">
        <div><span className="panel-kicker">SUPPLIER DIRECTORY</span><h2>Supplier records</h2></div>
        <button type="button" className="button button-primary" onClick={() => setOpen(value => !value)} aria-expanded={open}>
          {open ? "Close form" : "＋ Add supplier"}
        </button>
      </div>
      {open && <form className="auth-form" onSubmit={submit}>
        <div className="form-grid">
          <label>Supplier / business name<input name="name" required maxLength={160} /></label>
          <label>Contact name<input name="contact_name" maxLength={120} /></label>
          <label>Email<input name="email" type="email" maxLength={254} /></label>
          <label>Phone<input name="phone" type="tel" maxLength={40} /></label>
          <label>Account reference<input name="account_reference" maxLength={120} /></label>
          <label>Website<input name="website" type="url" maxLength={500} placeholder="https://" /></label>
        </div>
        <label>Internal notes<textarea name="notes" rows={3} maxLength={5000} /></label>
        <p className="panel-footnote">This creates a contact record only. No supplier account connection, order transmission or automatic synchronisation is configured.</p>
        <button className="button button-primary" disabled={busy}>{busy ? "Saving…" : "Save supplier →"}</button>
        {notice && <p role="alert" className="inline-notice">{notice}</p>}
      </form>}
    </section>
  );
}
