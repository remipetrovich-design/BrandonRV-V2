"use client";
import {useState} from "react";
export default function QuoteApprovalOverride({quoteId}:{quoteId:string}){
 const [allowed,setAllowed]=useState(false),[available,setAvailable]=useState(false),[reason,setReason]=useState(""),[notice,setNotice]=useState(""),[busy,setBusy]=useState(false),[loaded,setLoaded]=useState(false);
 async function load(){
  setBusy(true);
  try{const r=await fetch("/api/admin/quotes/"+quoteId+"/approval-override",{cache:"no-store"}),d=await r.json();if(r.ok){setAllowed(Boolean(d.canBypass));setAvailable(d.quote?.status==="sent"&&d.quote?.quote_kind==="standard"&&!d.quote?.customer_approval_bypassed_at);}else setNotice(d.error??"Could not check approval override.");}
  catch{setNotice("Could not check approval override.");}
  finally{setLoaded(true);setBusy(false);}
 }
 async function submit(){setBusy(true);setNotice("");try{const r=await fetch("/api/admin/quotes/"+quoteId+"/approval-override",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({reason})}),d=await r.json();if(!r.ok)throw new Error(d.error??"Could not bypass quote approval.");setNotice("Management bypass recorded. The quote can now progress to Workcard preparation; customer approval was not recorded.");setAvailable(false);setReason("");}catch(e){setNotice(e instanceof Error?e.message:"Could not bypass quote approval.");}finally{setBusy(false);}}
 if(loaded&&(!allowed||!available))return null;
 return <details className="brv-admin-quote-tools" onToggle={event=>{if(event.currentTarget.open&&!loaded&&!busy)void load();}}>
  <summary>Management approval override</summary>
  <div className="brv-admin-quote-tools-content">
   {!loaded?<p className="panel-footnote" role="status">{busy?"Checking override availability…":"Open to check override availability."}</p>:<><p className="panel-footnote">This advances the quote without recording customer consent. It is an audited management decision.</p><label>Reason for bypass<textarea rows={2} maxLength={2000} value={reason} onChange={e=>setReason(e.target.value)} placeholder="Why is this quote progressing without customer approval?"/></label><button type="button" className="button button-secondary" disabled={busy||reason.trim().length<5} onClick={()=>void submit()}>{busy?"Recording…":"Bypass customer approval"}</button></>}
   {notice&&<p className="inline-notice" role="status">{notice}</p>}
  </div>
 </details>;
}
