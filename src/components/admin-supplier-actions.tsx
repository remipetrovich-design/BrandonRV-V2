"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type Supplier = {
  id: string;
  name: string;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  account_reference?: string | null;
  website?: string | null;
  notes?: string | null;
  is_active: boolean;
};

export default function AdminSupplierActions({ supplier }: { supplier: Supplier }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const payload = Object.fromEntries(
      ["name", "contact_name", "email", "phone", "account_reference", "website", "notes"]
        .map(key => [key, String(form.get(key) ?? "")])
    );
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/admin/suppliers/" + supplier.id, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await response.json();
      if (!response.ok) {
        setNotice(data.error ?? "Could not update supplier.");
        return;
      }
      setNotice("Supplier details saved.");
      router.refresh();
    } catch {
      setNotice("Could not update supplier.");
    } finally {
      setBusy(false);
    }
  }

  return <details className="admin-supplier-edit">
    <summary>Edit supplier details</summary>
    <form className="auth-form" onSubmit={submit}>
      <div className="form-grid">
        <label>Supplier name<input name="name" defaultValue={supplier.name} required maxLength={160} /></label>
        <label>Contact name<input name="contact_name" defaultValue={supplier.contact_name ?? ""} maxLength={120} /></label>
        <label>Email<input name="email" type="email" defaultValue={supplier.email ?? ""} maxLength={254} /></label>
        <label>Phone<input name="phone" type="tel" defaultValue={supplier.phone ?? ""} maxLength={40} /></label>
        <label>Account reference<input name="account_reference" defaultValue={supplier.account_reference ?? ""} maxLength={120} /></label>
        <label>Website<input name="website" type="url" defaultValue={supplier.website ?? ""} maxLength={500} /></label>
      </div>
      <label>Internal notes<textarea name="notes" rows={3} defaultValue={supplier.notes ?? ""} maxLength={5000} /></label>
      <button className="button button-secondary" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
      {notice && <small role="status">{notice}</small>}
    </form>
  </details>;
}
