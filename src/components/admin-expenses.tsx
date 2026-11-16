"use client";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";
import {useRouter} from "next/navigation";
type Supplier={id:string;name:string};
type Job={id:string;job_number:string;title:string;status:string};
type SupplierOrder={id:string;order_number:string;status:string;total:number;supplier_id:string;job_id:string|null};
type Expense={id:string;job_id:string|null;supplier_id:string|null;supplier_order_id:string|null;category:string;description:string;amount_ex_tax:number;tax_amount:number;total:number;expense_date:string;approved_at:string|null;receipt_storage_path:string|null;receipt_url:string|null;supplier:{id:string;name:string}|null;job:{id:string;job_number:string;title:string}|null;supplierOrder:{id:string;order_number:string;status:string;total:number}|null};
const money=(v:number)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(v??0));
const localDate=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");};
export default function AdminExpenses({canManage}:{canManage:boolean}){
 const [expenses,setExpenses]=useState<Expense[]>([]),[suppliers,setSuppliers]=useState<Supplier[]>([]),[jobs,setJobs]=useState<Job[]>([]),[orders,setOrders]=useState<SupplierOrder[]>([]);
 const [category,setCategory]=useState("Parts and materials"),[description,setDescription]=useState(""),[amount,setAmount]=useState(""),[tax,setTax]=useState("0"),[date,setDate]=useState(localDate()),[supplierId,setSupplierId]=useState(""),[jobId,setJobId]=useState(""),[orderId,setOrderId]=useState("");
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState("");const router=useRouter();
 const refresh=useCallback(async()=>{const r=await fetch("/api/admin/expenses");const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not load expenses.");setExpenses(d.expenses??[]);setSuppliers(d.suppliers??[]);setJobs(d.jobs??[]);setOrders(d.supplierOrders??[]);},[]);
 useEffect(()=>{void refresh().catch(e=>setNotice(e.message));},[refresh]);
 const total=useMemo(()=>Math.round((Number(amount||0)+Number(tax||0))*100)/100,[amount,tax]);
 const selectedOrder=orders.find(o=>o.id===orderId);
 function chooseOrder(id:string){setOrderId(id);const order=orders.find(o=>o.id===id);if(order){setSupplierId(order.supplier_id);setJobId(order.job_id??"");}}
 async function create(event:FormEvent<HTMLFormElement>){event.preventDefault();setBusy(true);setNotice("");try{const r=await fetch("/api/admin/expenses",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({category,description,amountExTax:Number(amount),taxAmount:Number(tax),total,expenseDate:date,supplierId:supplierId||null,jobId:jobId||null,supplierOrderId:orderId||null})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not record expense.");setNotice("Expense recorded and added to the audit history.");setDescription("");setAmount("");setTax("0");setDate(localDate());setOrderId("");setSupplierId("");setJobId("");await refresh();router.refresh();}catch(e){setNotice(e instanceof Error?e.message:"Could not record expense.");}finally{setBusy(false);}}
 async function review(expense:Expense,approved:boolean){setBusy(true);setNotice("");try{const r=await fetch("/api/admin/expenses",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({id:expense.id,approved})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not update expense.");setNotice(approved?"Expense approved.":"Expense approval revoked.");await refresh();}catch(e){setNotice(e instanceof Error?e.message:"Could not update expense.");}finally{setBusy(false);}}
 async function attachReceipt(expense:Expense,event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const file=new FormData(form).get("file");if(!(file instanceof File)||!file.size){setNotice("Choose a receipt file.");return;}setBusy(true);setNotice("");try{const data=new FormData();data.set("file",file);const r=await fetch("/api/admin/expenses/"+expense.id+"/receipt",{method:"POST",body:data});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not attach receipt.");setNotice("Receipt securely attached.");form.reset();await refresh();}catch(e){setNotice(e instanceof Error?e.message:"Could not attach receipt.");}finally{setBusy(false);}}
 const approvedTotal=expenses.filter(x=>x.approved_at).reduce((sum,x)=>sum+Number(x.total),0);
 const pendingTotal=expenses.filter(x=>!x.approved_at).reduce((sum,x)=>sum+Number(x.total),0);
 return <div className="admin-expenses">
  <div className="portal-stat-grid"><article className="portal-stat"><span>APPROVED EXPENSES</span><strong>{money(approvedTotal)}</strong></article><article className="portal-stat"><span>AWAITING APPROVAL</span><strong>{money(pendingTotal)}</strong></article><article className="portal-stat"><span>RECORDS</span><strong>{expenses.length}</strong></article></div>
  {canManage&&<section className="portal-panel"><div className="portal-panel-heading"><div><span className="panel-kicker">BUSINESS COSTS</span><h2>Record an expense</h2></div></div>
   <form className="auth-form" onSubmit={create}>
    <div className="form-grid"><label>Category<input value={category} onChange={e=>setCategory(e.target.value)} required minLength={2} maxLength={80}/></label><label>Expense date<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
     <label>Supplier (optional)<select value={supplierId} onChange={e=>setSupplierId(e.target.value)}><option value="">No supplier linked</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <label>Workcard (optional)<select value={jobId} onChange={e=>setJobId(e.target.value)}><option value="">Business-wide expense</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.job_number} · {j.title}</option>)}</select></label>
     <label>Supplier order (optional)<select value={orderId} onChange={e=>chooseOrder(e.target.value)}><option value="">No supplier order linked</option>{orders.map(o=><option key={o.id} value={o.id}>{o.order_number} · {o.status} · {money(Number(o.total))}</option>)}</select></label>
     <label>Amount ex GST<input type="number" min="0" max="10000000" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} required/></label>
     <label>Tax amount<input type="number" min="0" max="10000000" step="0.01" value={tax} onChange={e=>setTax(e.target.value)} required/></label>
     <label>Total including tax<input value={money(total)} readOnly/></label>
    </div>
    {selectedOrder&&<p className="panel-footnote">Linked to {selectedOrder.order_number}. Supplier and Workcard are filled from the order; actual expense values must come from the supplier invoice or receipt.</p>}
    <label>Description<input value={description} onChange={e=>setDescription(e.target.value)} required minLength={3} maxLength={500}/></label>
    <button className="button button-primary" disabled={busy||total<=0}>{busy?"Saving…":"Record expense →"}</button>
   </form>
  </section>}
  <section className="portal-panel"><div className="portal-panel-heading"><div><span className="panel-kicker">{expenses.length} RECORDS</span><h2>Expense register</h2></div></div>
   {expenses.length?<div className="activity-list">{expenses.map(expense=><article className="activity-item" key={expense.id}>
    <div className="activity-date">{new Date(expense.expense_date+"T00:00:00").toLocaleDateString("en-AU")}</div>
    <div className="activity-copy"><strong>{expense.category} · {money(Number(expense.total))}</strong><span>{expense.description} · Ex GST {money(Number(expense.amount_ex_tax))} · Tax {money(Number(expense.tax_amount))}</span>
     <span>{expense.supplier?.name??"No supplier"}{expense.job?" · "+expense.job.job_number+" · "+expense.job.title:" · Business-wide"}{expense.supplierOrder?" · "+expense.supplierOrder.order_number:""}</span>
     {expense.receipt_url?<a className="text-link" href={expense.receipt_url} target="_blank" rel="noreferrer">Open receipt →</a>:<small>No receipt attached.</small>}
     {canManage&&<div className="record-actions">{expense.approved_at?<><span className="status-pill">Approved</span><button className="button button-secondary" disabled={busy} onClick={()=>void review(expense,false)}>Revoke approval</button></>:<button className="button button-primary" disabled={busy} onClick={()=>void review(expense,true)}>Approve expense</button>}</div>}
     {canManage&&<form className="auth-form" onSubmit={e=>void attachReceipt(expense,e)}><label>Attach receipt (PDF, JPEG, PNG or WebP; max 10 MB)<input name="file" type="file" accept=".pdf,image/jpeg,image/png,image/webp,application/pdf" required/></label><button className="button button-secondary" disabled={busy}>Upload receipt</button></form>}
    </div><span className="status-pill">{expense.approved_at?"Approved":"Pending"}</span>
   </article>)}</div>:<p className="panel-footnote">No expenses have been recorded.</p>}
  </section>
  {notice&&<p className="inline-notice" role="status">{notice}</p>}
 </div>;
}
