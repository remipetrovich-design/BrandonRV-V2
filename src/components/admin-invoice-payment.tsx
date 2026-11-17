"use client";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {useRouter} from "next/navigation";

type Payment={id:string;amount:number;method:string|null;reference:string|null;status:string;paid_at:string|null;payment_type:string;refundedAmount:number;availableToRefund:number};
type Refund={id:string;payment_id:string;amount:number;method:string;reference:string|null;reason:string;status:string;created_at:string};
type Credit={id:string;credit_number:string;amount:number;reason:string;status:string;created_at:string};
type Ledger={payments:Payment[];refunds:Refund[];credits:Credit[];creditTotal:number;balance:number};

export default function AdminInvoicePayment({invoiceId,total,amountPaid,status}:{invoiceId:string;total:number;amountPaid:number;status:string}){
 const router=useRouter();
 const [ledger,setLedger]=useState<Ledger|null>(null),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const [amount,setAmount]=useState(""),[method,setMethod]=useState("bank_transfer"),[paymentType,setPaymentType]=useState("part_payment"),[reference,setReference]=useState(""),[paymentKey,setPaymentKey]=useState("");
 const [refundPaymentId,setRefundPaymentId]=useState(""),[refundAmount,setRefundAmount]=useState(""),[refundMethod,setRefundMethod]=useState("bank_transfer"),[refundReference,setRefundReference]=useState(""),[refundReason,setRefundReason]=useState(""),[refundKey,setRefundKey]=useState("");
 const [creditAmount,setCreditAmount]=useState(""),[creditReason,setCreditReason]=useState(""),[creditKey,setCreditKey]=useState("");
 const load=useCallback(async()=>{setLoading(true);try{const r=await fetch("/api/admin/invoices/"+invoiceId+"/payments",{cache:"no-store"}),d=await r.json();if(!r.ok){setNotice(d.error??"Could not load invoice transactions.");return;}setLedger(d);const available=(d.payments??[]).find((p:Payment)=>Number(p.availableToRefund)>0);if(available)setRefundPaymentId((current)=>current||available.id);}catch{setNotice("Could not load invoice transactions.");}finally{setLoading(false);}},[invoiceId]);
 useEffect(()=>{void load();},[load]);
 const balance=ledger?.balance??Math.max(0,total-amountPaid);
 const availablePayments=(ledger?.payments??[]).filter(p=>p.availableToRefund>0);
 async function recordPayment(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setNotice("");const key=paymentKey||crypto.randomUUID();setPaymentKey(key);try{const r=await fetch("/api/admin/invoices/"+invoiceId+"/payments",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:Number(amount),method,reference,paymentType,idempotencyKey:key})}),d=await r.json();if(!r.ok){setNotice(d.error??"Could not record payment.");return;}setNotice(d.already_recorded?"Payment request was already recorded.":"Payment recorded.");setPaymentKey("");setAmount("");setReference("");await load();router.refresh();}catch{setNotice("Payment could not be confirmed. Retry using the same request details.");}finally{setBusy(false);}}
 async function recordRefund(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setNotice("");const key=refundKey||crypto.randomUUID();setRefundKey(key);try{const r=await fetch("/api/admin/invoices/"+invoiceId+"/refunds",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({paymentId:refundPaymentId,amount:Number(refundAmount),method:refundMethod,reference:refundReference,reason:refundReason,idempotencyKey:key})}),d=await r.json();if(!r.ok){setNotice(d.error??"Could not record refund.");return;}setNotice(d.already_recorded?"Refund request was already recorded.":"Refund recorded. No payment-provider transfer was initiated.");setRefundKey("");setRefundAmount("");setRefundReference("");setRefundReason("");await load();router.refresh();}catch{setNotice("Refund could not be confirmed. Retry using the same request details.");}finally{setBusy(false);}}
 async function recordCredit(e:FormEvent<HTMLFormElement>){e.preventDefault();setBusy(true);setNotice("");const key=creditKey||crypto.randomUUID();setCreditKey(key);try{const r=await fetch("/api/admin/invoices/"+invoiceId+"/credits",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({amount:Number(creditAmount),reason:creditReason,idempotencyKey:key})}),d=await r.json();if(!r.ok){setNotice(d.error??"Could not issue credit note.");return;}setNotice(d.already_recorded?"Credit request was already recorded.":"Credit note "+d.credit.credit_number+" issued.");setCreditKey("");setCreditAmount("");setCreditReason("");await load();router.refresh();}catch{setNotice("Credit note could not be confirmed. Retry using the same request details.");}finally{setBusy(false);}}
 if(status==="draft"||status==="void")return null;
 return <section className="auth-form">
  <h4>Payments, refunds & credits</h4>
  <p className="panel-footnote">Net paid: ${Number(ledger?.payments?amountPaid:amountPaid).toFixed(2)} · Credits: ${Number(ledger?.creditTotal??0).toFixed(2)} · Outstanding: ${Number(balance).toFixed(2)}</p>
  {loading?<p className="panel-footnote">Loading transaction history…</p>:<div className="panel-footnote">
   <strong>Transaction history</strong>
   {!(ledger?.payments.length||ledger?.refunds.length||ledger?.credits.length)&&<p>No payments, refunds or credits recorded.</p>}
   <ul>{(ledger?.payments??[]).map(p=><li key={p.id}>Payment · {p.payment_type.replaceAll("_"," ")} · ${Number(p.amount).toFixed(2)} · {p.method??"other"} · {p.status}{p.reference?" · "+p.reference:""}{p.refundedAmount>0?" · refunded "+Number(p.refundedAmount).toFixed(2):""}</li>)}
   {(ledger?.refunds??[]).map(r=><li key={r.id}>Refund · ${Number(r.amount).toFixed(2)} · {r.method} · {r.reason}</li>)}
   {(ledger?.credits??[]).map(c=><li key={c.id}>Credit note {c.credit_number} · ${Number(c.amount).toFixed(2)} · {c.reason}</li>)}</ul>
  </div>}
  {["issued","part_paid","overdue"].includes(status)&&balance>0.005&&<form onSubmit={recordPayment}>
   <h5>Record a deposit or payment</h5>
   <label>Payment amount<input type="number" min="0.01" max={balance.toFixed(2)} step="0.01" required value={amount} onChange={e=>setAmount(e.target.value)}/></label>
   <label>Payment type<select value={paymentType} onChange={e=>setPaymentType(e.target.value)}><option value="deposit">Deposit</option><option value="part_payment">Part payment</option><option value="final_payment">Final payment (exact balance)</option><option value="other">Other</option></select></label>
   <label>Method<select value={method} onChange={e=>setMethod(e.target.value)}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card (record only)</option><option value="other">Other</option></select></label>
   <label>Reference (optional)<input value={reference} onChange={e=>setReference(e.target.value)} maxLength={120}/></label>
   <button className="button button-primary" disabled={busy||!amount}>{busy?"Recording…":"Record payment →"}</button>
  </form>}
  {availablePayments.length>0&&<form onSubmit={recordRefund}>
   <h5>Record a refund</h5>
   <label>Original payment<select value={refundPaymentId} onChange={e=>setRefundPaymentId(e.target.value)}>{availablePayments.map(p=><option key={p.id} value={p.id}>{p.payment_type.replaceAll("_"," ")} · ${Number(p.amount).toFixed(2)} · available ${Number(p.availableToRefund).toFixed(2)}</option>)}</select></label>
   <label>Refund amount<input type="number" min="0.01" max={Number(availablePayments.find(p=>p.id===refundPaymentId)?.availableToRefund??0).toFixed(2)} step="0.01" required value={refundAmount} onChange={e=>setRefundAmount(e.target.value)}/></label>
   <label>Refund method<select value={refundMethod} onChange={e=>setRefundMethod(e.target.value)}><option value="bank_transfer">Bank transfer</option><option value="cash">Cash</option><option value="card">Card (record only)</option><option value="other">Other</option></select></label>
   <label>Reference (optional)<input value={refundReference} onChange={e=>setRefundReference(e.target.value)} maxLength={120}/></label>
   <label>Reason<textarea rows={2} required minLength={3} value={refundReason} onChange={e=>setRefundReason(e.target.value)} maxLength={1000}/></label>
   <button className="button button-secondary" disabled={busy||!refundAmount||!refundReason.trim()}>Record refund →</button>
  </form>}
  {["issued","part_paid","overdue"].includes(status)&&balance>0.005&&<form onSubmit={recordCredit}>
   <h5>Issue a credit note</h5>
   <label>Credit amount<input type="number" min="0.01" max={balance.toFixed(2)} step="0.01" required value={creditAmount} onChange={e=>setCreditAmount(e.target.value)}/></label>
   <label>Reason<textarea rows={2} required minLength={3} value={creditReason} onChange={e=>setCreditReason(e.target.value)} maxLength={1000}/></label>
   <button className="button button-secondary" disabled={busy||!creditAmount||!creditReason.trim()}>Issue credit note →</button>
  </form>}
  <p className="panel-footnote">Refunds and credit notes are accounting records only. They do not initiate a bank transfer, card refund or payment-provider transaction.</p>
  {notice&&<p role="status" className="form-notice">{notice}</p>}
 </section>;
}
