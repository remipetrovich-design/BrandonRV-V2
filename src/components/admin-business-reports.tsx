"use client";
import {useCallback,useEffect,useState} from "react";
type Summary={invoiced:number;cash_received:number;outstanding:number;approved_expenses:number;pending_expenses:number;supplier_commitments:number;supplier_orders_received:number;completed_workcards:number;actual_hours:number;new_quote_requests:number};
type Report={from:string;to:string;summary:Summary;invoices:any[];payments:any[];expenses:any[];supplier_orders:any[];workcards:any[]};
const money=(value:number)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(value??0));
const date=(value:string)=>value?new Date(value.length===10?value+"T00:00:00":value).toLocaleDateString("en-AU"):"—";
export default function AdminBusinessReports({initialFrom,initialTo}:{initialFrom:string;initialTo:string}){
 const [from,setFrom]=useState(initialFrom),[to,setTo]=useState(initialTo),[report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const load=useCallback(async(start:string,end:string)=>{setBusy(true);setNotice("");try{const r=await fetch("/api/admin/reports?from="+encodeURIComponent(start)+"&to="+encodeURIComponent(end));const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not load reports.");setReport(d);}catch(e){setNotice(e instanceof Error?e.message:"Could not load reports.");}finally{setBusy(false);}},[]);
 useEffect(()=>{void load(initialFrom,initialTo);},[initialFrom,initialTo,load]);
 const summary=report?.summary;
 const metrics=[
  ["INVOICED",money(summary?.invoiced??0),"Issued invoice value in the selected period"],
  ["CASH RECEIVED",money(summary?.cash_received??0),"Recorded payments received in the selected period"],
  ["OUTSTANDING",money(summary?.outstanding??0),"Current balance on issued invoices through the end date"],
  ["APPROVED EXPENSES",money(summary?.approved_expenses??0),"Approved costs dated in the selected period"],
  ["PENDING EXPENSES",money(summary?.pending_expenses??0),"Unapproved costs dated in the selected period"],
  ["SUPPLIER COMMITMENTS",money(summary?.supplier_commitments??0),"Orders placed and not yet fully received in the selected period"],
  ["GOODS RECEIVED",money(summary?.supplier_orders_received??0),"Supplier orders marked received in the selected period"],
  ["COMPLETED WORKCARDS",String(summary?.completed_workcards??0),"Workcards completed in the selected period"],
  ["ACTUAL HOURS",Number(summary?.actual_hours??0).toFixed(2),"Approved actual hours recorded on completed Workcards"],
  ["NEW QUOTE REQUESTS",String(summary?.new_quote_requests??0),"Customer Jobcards created in the selected period"]
 ];
 return <div className="admin-business-reports">
  <section className="portal-panel"><div className="portal-panel-heading"><div><span className="panel-kicker">REPORT PERIOD</span><h2>Choose dates</h2></div></div><div className="form-grid"><label>From<input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)}/></label><label>To<input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)}/></label><div style={{display:"flex",alignItems:"end"}}><button className="button button-primary" disabled={busy||!from||!to||from>to} onClick={()=>void load(from,to)}>{busy?"Loading…":"Update report"}</button></div></div></section>
  {summary&&<><div className="portal-stat-grid">{metrics.map(([label,value,detail])=><article className="portal-stat" key={label}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>)}</div>
   <section className="portal-panel"><div className="portal-panel-heading"><div><span className="panel-kicker">CUSTOMER MONEY</span><h2>Invoices and payments</h2></div></div>{report?.invoices.length?<div className="activity-list">{report.invoices.map(invoice=><article className="activity-item" key={invoice.id}><div className="activity-date">{date(invoice.issue_date)}</div><div className="activity-copy"><strong>{invoice.invoice_number} · {money(invoice.total)}</strong><span>{invoice.status.replaceAll("_"," ")} · Paid {money(invoice.amount_paid)} · Balance {money(Number(invoice.total)-Number(invoice.amount_paid))}</span></div><span className="status-pill">{invoice.status}</span></article>)}</div>:<p className="panel-footnote">No issued invoices in this period.</p>}
    {report?.payments.length>0&&<><h3>Recorded payments</h3><div className="activity-list">{report.payments.map(payment=><article className="activity-item" key={payment.id}><div className="activity-date">{date(payment.paid_at)}</div><div className="activity-copy"><strong>{payment.invoice_number??"Invoice payment"} · {money(payment.amount)}</strong><span>{payment.method??"Method not recorded"}</span></div></article>)}</div></>}
   </section>
   <section className="portal-panel"><div className="portal-panel-heading"><div><span className="panel-kicker">BUSINESS COSTS</span><h2>Expenses and purchasing</h2></div></div>{report?.expenses.length?<div className="activity-list">{report.expenses.map(expense=><article className="activity-item" key={expense.id}><div className="activity-date">{date(expense.expense_date)}</div><div className="activity-copy"><strong>{expense.category} · {money(expense.total)}</strong><span>{expense.description} · {expense.approved?"Approved":"Awaiting approval"}{expense.supplier_order_id?" · Linked to supplier order":""}{expense.job_id?" · Linked to Workcard":""}</span></div><span className="status-pill">{expense.approved?"Approved":"Pending"}</span></article>)}</div>:<p className="panel-footnote">No expenses in this period.</p>}
    {report?.supplier_orders.length>0&&<><h3>Supplier orders</h3><div className="activity-list">{report.supplier_orders.map(order=><article className="activity-item" key={order.id}><div className="activity-date">{date(order.created_at)}</div><div className="activity-copy"><strong>{order.order_number} · {money(order.total)}</strong><span>{order.status.replaceAll("_"," ")}</span></div><span className="status-pill">{order.status}</span></article>)}</div></>}
   </section>
   <section className="portal-panel"><div className="portal-panel-heading"><div><span className="panel-kicker">WORKSHOP OUTPUT</span><h2>Completed Workcards</h2></div></div>{report?.workcards.length?<div className="activity-list">{report.workcards.map(job=><article className="activity-item" key={job.id}><div className="activity-date">{date(job.completed_at)}</div><div className="activity-copy"><strong>{job.job_number} · {job.title}</strong><span>{Number(job.actual_hours??0).toFixed(2)} actual hours</span></div></article>)}</div>:<p className="panel-footnote">No completed Workcards in this period.</p>}</section>
   <p className="panel-footnote">Report values are drawn from recorded V2 business data. Invoiced value is not the same as cash received. Supplier commitments are not treated as paid expenses. Payroll tax, superannuation, award calculations and STP lodgement are not calculated here.</p>
  </>}
  {notice&&<p className="inline-notice" role="status">{notice}</p>}
 </div>;
}
