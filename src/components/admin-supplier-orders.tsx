"use client";
import {useCallback,useEffect,useMemo,useState,type FormEvent} from "react";

type Supplier={id:string;name:string};
type Job={id:string;job_number:string;title:string;status:string};
type WorkEntry={id:string;description:string;part_number:string|null;quantity_required:number;quantity_ordered:number;quantity_received:number;part_order_status:string;outstanding_quantity:number};
type OrderItem={id:string;work_entry_id:string|null;description:string;sku:string|null;quantity:number;quantity_received:number;unit_cost:number;tax_rate:number;line_total:number};
type Order={id:string;order_number:string;created_at:string;status:string;ordered_at:string|null;expected_at:string|null;received_at:string|null;subtotal:number;tax_amount:number;total:number;notes:string|null;supplier:{id:string;name:string}|null;job:{id:string;job_number:string;title:string}|null;items:OrderItem[]};
type Selection={selected:boolean;quantity:string;unitCost:string;taxRate:string};
const money=(value:number)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(value??0));
export default function AdminSupplierOrders({canManage}:{canManage:boolean}){
 const [orders,setOrders]=useState<Order[]>([]),[suppliers,setSuppliers]=useState<Supplier[]>([]),[jobs,setJobs]=useState<Job[]>([]);
 const [jobId,setJobId]=useState(""),[supplierId,setSupplierId]=useState(""),[expectedAt,setExpectedAt]=useState(""),[notes,setNotes]=useState("");
 const [entries,setEntries]=useState<WorkEntry[]>([]),[selection,setSelection]=useState<Record<string,Selection>>({});
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(""),[receiveValues,setReceiveValues]=useState<Record<string,string>>({});
 const refresh=useCallback(async()=>{const r=await fetch("/api/admin/supplier-orders");const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not load supplier orders.");setOrders(d.orders??[]);setSuppliers(d.suppliers??[]);setJobs(d.jobs??[]);},[]);
 useEffect(()=>{void refresh().catch(e=>setNotice(e.message));},[refresh]);
 useEffect(()=>{if(!jobId){setEntries([]);setSelection({});return;}void (async()=>{try{const r=await fetch("/api/admin/supplier-orders?jobId="+encodeURIComponent(jobId));const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not load Workcard parts.");setEntries(d.workEntries??[]);setSelection({});}catch(e){setNotice(e instanceof Error?e.message:"Could not load Workcard parts.");}})();},[jobId]);
 const selectedItems=useMemo(()=>entries.filter(e=>selection[e.id]?.selected),[entries,selection]);
 function updateSelection(id:string,patch:Partial<Selection>){setSelection(current=>({...current,[id]:{selected:current[id]?.selected??false,quantity:current[id]?.quantity??"1",unitCost:current[id]?.unitCost??"0",taxRate:current[id]?.taxRate??"10",...patch}}));}
 async function createOrder(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!canManage)return;setBusy(true);setNotice("");try{const r=await fetch("/api/admin/supplier-orders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({supplierId,jobId,expectedAt:expectedAt||null,notes,items:selectedItems.map(entry=>({workEntryId:entry.id,quantity:Number(selection[entry.id].quantity),unitCost:Number(selection[entry.id].unitCost),taxRate:Number(selection[entry.id].taxRate)}))})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not create supplier order.");setNotice("Draft "+d.order.order_number+" created. Place it with the supplier, then mark it ordered.");setSupplierId("");setJobId("");setExpectedAt("");setNotes("");setSelection({});setEntries([]);await refresh();}catch(e){setNotice(e instanceof Error?e.message:"Could not create supplier order.");}finally{setBusy(false);}}
 async function transition(order:Order,status:"ordered"|"cancelled"){setBusy(true);setNotice("");try{const r=await fetch("/api/admin/supplier-orders/"+order.id,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({status})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not update supplier order.");setNotice(status==="ordered"?"Order marked as placed with supplier.":"Supplier order cancelled.");await refresh();}catch(e){setNotice(e instanceof Error?e.message:"Could not update supplier order.");}finally{setBusy(false);}}
 async function receive(order:Order,item:OrderItem){setBusy(true);setNotice("");try{const quantity=Number(receiveValues[item.id]??(Number(item.quantity)-Number(item.quantity_received)));const r=await fetch("/api/admin/supplier-orders/"+order.id+"/receive",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({itemId:item.id,quantity})});const d=await r.json();if(!r.ok)throw new Error(d.error??"Could not record received goods.");setNotice("Goods received. The linked Workcard part has been updated.");setReceiveValues(current=>({...current,[item.id]:""}));await refresh();}catch(e){setNotice(e instanceof Error?e.message:"Could not record received goods.");}finally{setBusy(false);}}
 return <div className="admin-supplier-orders">
  {canManage&&<section className="portal-panel"><div className="portal-panel-heading"><div><span className="panel-kicker">WORKCARD PROCUREMENT</span><h2>Create supplier order</h2></div></div>
   <form className="auth-form" onSubmit={createOrder}>
    <div className="form-grid"><label>Supplier<select value={supplierId} onChange={e=>setSupplierId(e.target.value)} required><option value="">Select supplier</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
     <label>Workcard<select value={jobId} onChange={e=>setJobId(e.target.value)} required><option value="">Select Workcard</option>{jobs.map(j=><option key={j.id} value={j.id}>{j.job_number} · {j.title}</option>)}</select></label>
     <label>Expected delivery<input type="date" value={expectedAt} onChange={e=>setExpectedAt(e.target.value)}/></label>
    </div>
    {jobId&&<div className="portal-panel"><div className="portal-panel-heading"><div><span className="panel-kicker">OUTSTANDING PARTS</span><h3>Choose Workcard parts</h3></div></div>
     {entries.length?entries.map(entry=>{const selected=selection[entry.id]??{selected:false,quantity:"1",unitCost:"0",taxRate:"10"};return <div className="activity-item" key={entry.id}>
      <label style={{display:"flex",gap:10,alignItems:"center"}}><input type="checkbox" checked={selected.selected} onChange={e=>updateSelection(entry.id,{selected:e.target.checked})}/><strong>{entry.description}</strong></label>
      <span>{entry.part_number?("Part no. "+entry.part_number+" · "):""}{entry.outstanding_quantity} still required · {entry.quantity_received} received</span>
      {selected.selected&&<div className="form-grid"><label>Order quantity<input type="number" min="0.01" max={entry.outstanding_quantity} step="0.01" value={selected.quantity} onChange={e=>updateSelection(entry.id,{quantity:e.target.value})}/></label><label>Unit cost (ex GST)<input type="number" min="0" step="0.01" value={selected.unitCost} onChange={e=>updateSelection(entry.id,{unitCost:e.target.value})}/></label><label>Tax rate (%)<input type="number" min="0" max="100" step="0.01" value={selected.taxRate} onChange={e=>updateSelection(entry.id,{taxRate:e.target.value})}/></label></div>}
     </div>; }):<p className="panel-footnote">No outstanding parts remain on this Workcard.</p>}
    </div>}
    <label>Internal order notes<textarea rows={2} maxLength={3000} value={notes} onChange={e=>setNotes(e.target.value)}/></label>
    <p className="panel-footnote">Creating an order saves a draft only. It does not send an email or place an order with the supplier. Mark it ordered only after you have placed it externally.</p>
    <button className="button button-primary" disabled={busy||!supplierId||!jobId||selectedItems.length===0}>{busy?"Saving…":"Create draft purchase order →"}</button>
   </form>
  </section>}
  <section className="portal-panel"><div className="portal-panel-heading"><div><span className="panel-kicker">{orders.length} ORDERS</span><h2>Supplier order register</h2></div></div>
   {orders.length? <div className="activity-list">{orders.map(order=><article className="activity-item" key={order.id}>
    <div className="activity-date">{order.created_at?new Date(order.created_at).toLocaleDateString("en-AU"):"—"}</div>
    <div className="activity-copy"><strong>{order.order_number} · {order.supplier?.name??"Supplier"}</strong><span>{order.job?order.job.job_number+" · "+order.job.title:"Stock order"} · {order.expected_at?"Expected "+new Date(order.expected_at+"T00:00:00").toLocaleDateString("en-AU"):"No expected date"} · {money(Number(order.total))}</span>
     {order.items?.map(item=><small key={item.id}>{item.description} · {item.quantity_received}/{item.quantity} received · {money(Number(item.line_total))} ex tax</small>)}
     {order.notes&&<small>{order.notes}</small>}
     {canManage&&<div className="record-actions">
      {order.status==="draft"&&<button className="button button-secondary" disabled={busy} onClick={()=>void transition(order,"ordered")}>Mark ordered</button>}
      {["draft","ordered"].includes(order.status)&&<button className="button button-secondary" disabled={busy} onClick={()=>void transition(order,"cancelled")}>Cancel order</button>}
     </div>}
     {canManage&&["ordered","part_received"].includes(order.status)&&order.items?.filter(item=>Number(item.quantity_received)<Number(item.quantity)).map(item=><div className="form-grid" key={item.id}>
      <label>{item.description} · outstanding {Number(item.quantity)-Number(item.quantity_received)}<input type="number" min="0.01" max={Number(item.quantity)-Number(item.quantity_received)} step="0.01" value={receiveValues[item.id]??String(Number(item.quantity)-Number(item.quantity_received))} onChange={e=>setReceiveValues(current=>({...current,[item.id]:e.target.value}))}/></label>
      <button className="button button-secondary" disabled={busy} onClick={()=>void receive(order,item)}>Record received quantity</button>
     </div>)}
    </div><span className="status-pill">{order.status.replaceAll("_"," ")}</span>
   </article>)}</div>:<p className="panel-footnote">No supplier orders recorded.</p>}
  </section>
  {notice&&<p className="inline-notice" role="status">{notice}</p>}
 </div>;
}
