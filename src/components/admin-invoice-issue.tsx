"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export default function AdminInvoiceIssue({invoiceId,invoiceNumber}:{invoiceId:string;invoiceNumber:string}){
 const router=useRouter(),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 async function issue(){setBusy(true);setNotice("");try{const r=await fetch("/api/admin/invoices/"+invoiceId+"/issue",{method:"POST"}),d=await r.json();if(!r.ok){setNotice(d.error??"Invoice could not be issued.");return;}setNotice("Invoice "+invoiceNumber+" issued. Its financial details are now locked.");router.refresh();}catch{setNotice("Invoice could not be issued.");}finally{setBusy(false);}}
 return <div className="auth-form"><p className="panel-footnote">Issue only after Workcard senior approval and customer approval. Issued invoice lines and totals cannot be edited; use a credit note for adjustments.</p><button type="button" className="button button-primary" disabled={busy} onClick={()=>void issue()}>{busy?"Issuing invoice…":"Issue invoice →"}</button>{notice&&<p role="status" className="form-notice">{notice}</p>}</div>;
}
