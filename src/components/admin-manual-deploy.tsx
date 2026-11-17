"use client";
import {useState} from "react";
type Run={id:number;name:string;status:string;conclusion:string|null;url:string;createdAt:string};
type Snapshot={latestCommit:string|null;deploymentRun:Run|null;migrationRun:Run|null};
type Props={available:boolean;configured:boolean};
export default function AdminManualDeploy({available,configured}:Props){
 const [busy,setBusy]=useState("");const [refreshing,setRefreshing]=useState(false);const [snapshot,setSnapshot]=useState<Snapshot|null>(null);const [message,setMessage]=useState("");const [error,setError]=useState("");
 async function refresh(){if(refreshing)return;setRefreshing(true);setError("");try{const r=await fetch("/api/admin/deployment/status",{cache:"no-store"});const b=await r.json();if(!r.ok)throw Error(b.error||"Status refresh failed.");setSnapshot(b);}catch(e){setError(e instanceof Error?e.message:"Status refresh failed.");}finally{setRefreshing(false);}}
 async function dispatch(action:"scan_apply"|"deploy"){if(busy||!available)return;const label=action==="scan_apply"?"Scan and apply pending migrations to the dedicated Brandon RV V2 database":"Deploy the newest main commit and all merged history to Vercel Production";if(!window.confirm(label+"?"))return;setBusy(action);setMessage("");setError("");try{const r=await fetch("/api/admin/deployment/dispatch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action}),cache:"no-store"});const b=await r.json();if(!r.ok)throw Error(b.error||"Operation failed.");setMessage(b.message||"Queued. Refresh status to check progress.");}catch(e){setError(e instanceof Error?e.message:"Operation failed.");}finally{setBusy("");}}
 function runStatus(run:Run|null){if(!run)return "No run recorded";return <><a href={run.url} target="_blank" rel="noreferrer">{run.name} #{run.id}</a> · {run.status}{run.conclusion?" / "+run.conclusion:""} <small>{new Date(run.createdAt).toLocaleString("en-AU")}</small></>;}
 return <section className="deploy">
  <header><div><span>V2 SYSTEM OPERATIONS</span><h2>Manual operations</h2><p>These are independent workflows. Running one never starts the other. Both use the latest main branch and require explicit confirmation.</p></div><b>{available?"READY":"INACTIVE"}</b></header>
  <div className="operation-grid">
   <article className="operation">
    <div className="operation-heading"><span>APPLICATION RELEASE</span><h3>Deploy Latest Commit</h3></div>
    <p>Fetches the newest commit on main with full Git history, builds that exact source and deploys it to Vercel Production. All commits already merged into main are part of the deployed source.</p>
    <p className="target">Target: BrandonRV V2 · Vercel Production</p>
    <button disabled={!available||!!busy} onClick={()=>dispatch("deploy")}>{busy==="deploy"?"Queueing deployment…":"Deploy Latest Commit"}</button>
    <div className="run-status"><b>Last deployment</b><p>{snapshot?runStatus(snapshot.deploymentRun):"Press Refresh status to load."}</p></div>
   </article>
   <article className="operation">
    <div className="operation-heading"><span>DATABASE OPERATIONS</span><h3>Scan and Apply Migrations</h3></div>
    <p>Checks migration filenames and references, compares the complete migration history with the V2 database, previews pending SQL, then applies pending migrations only.</p>
    <p className="target">Target: Brandon RV V2 · Supabase project lciylmfpcefdpsouoqvm</p>
    <button disabled={!available||!!busy} onClick={()=>dispatch("scan_apply")}>{busy==="scan_apply"?"Queueing migration scan…":"Scan and Apply Migrations"}</button>
    <div className="run-status"><b>Last migration run</b><p>{snapshot?runStatus(snapshot.migrationRun):"Press Refresh status to load."}</p></div>
   </article>
  </div>
  <div className="status-bar"><p><b>Latest main commit:</b> <code>{snapshot?.latestCommit||"Not checked"}</code></p><button className="refresh" disabled={refreshing} onClick={refresh}>{refreshing?"Refreshing…":"↻ Refresh status"}</button></div>
  {message&&<p role="status">{message}</p>}{error&&<p role="alert" className="error">{error}</p>}
  {!available&&<p>{configured?"Manual operations are disabled by the activation flag.":"GitHub dispatch is not configured."}</p>}
  <p className="footnote">Manual trigger only. No automatic status polling. The migration workflow does not deploy the application; the deployment workflow does not apply database migrations.</p>
  <style jsx>{`.deploy{display:grid;gap:16px}.deploy header{display:flex;justify-content:space-between;gap:20px;padding:22px;border:1px solid #d9dee4;border-radius:12px;background:#fff}.deploy header span,.operation-heading span{font-size:10px;font-weight:800;letter-spacing:.12em;color:#64748b}.deploy h2{font-size:21px;margin:8px 0}.deploy p{font-size:13px;color:#697586;line-height:1.55}.deploy header b{align-self:flex-start;padding:6px 10px;border-radius:6px;background:#edf4fc;color:#155fba;font-size:11px}.operation-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.operation{display:flex;min-width:0;flex-direction:column;gap:12px;padding:20px;border:1px solid #d9e2ec;border-radius:12px;background:#fff}.operation-heading h3{margin:7px 0 0;font-size:18px;color:#142b43}.operation>p{margin:0}.operation .target{font-size:11px;font-weight:700;color:#34465b}.operation button,.status-bar button{align-self:flex-start;padding:11px 15px;border:0;border-radius:7px;background:#155fba;color:white;font-weight:750}.operation button:disabled,.status-bar button:disabled{opacity:.5}.run-status{margin-top:auto;padding-top:12px;border-top:1px solid #e4eaf0}.run-status b{font-size:12px;color:#142b43}.run-status p{margin:6px 0 0;overflow-wrap:anywhere}.run-status small{display:block;color:#8793a1;font-size:10px;margin-top:3px}.status-bar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 15px;border:1px solid #d9e2ec;border-radius:9px;background:#f7f9fc}.status-bar p{margin:0}.status-bar button.refresh{background:#e9edf1;color:#263442}.error{color:#a12828}.footnote{font-size:11px!important}`}</style>
 </section>;
}
