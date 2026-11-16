"use client";
import {useEffect,useState} from "react";
type Entry={id:string;entry_type:string;started_at:string;job_id:string|null;work_entry_id:string|null};
type LabourEntry={id:string;description:string;quantity_used:number};
type WorkOption={id:string;job_number:string;title:string;labourEntries:LabourEntry[]};
export default function TimeClock(){
 const [active,setActive]=useState<Entry|null>(null),[workOptions,setWorkOptions]=useState<WorkOption[]>([]);
 const [jobId,setJobId]=useState(""),[workEntryId,setWorkEntryId]=useState("");
 const [notice,setNotice]=useState(""),[busy,setBusy]=useState(false);
 async function load(){try{const r=await fetch("/api/staff/time");const d=await r.json();if(r.ok){setActive(d.active??null);setWorkOptions(d.workOptions??[]);}else setNotice(d.error??"Time clock unavailable.");}catch{setNotice("Time clock unavailable.");}}
 useEffect(()=>{void load();},[]);
 async function act(action:"start"|"stop"){setBusy(true);setNotice("");try{const r=await fetch("/api/staff/time",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,jobId:jobId||null,workEntryId:workEntryId||null})});const d=await r.json();if(!r.ok){setNotice(d.error??"Could not update time.");return;}setNotice(action==="start"?"Time entry started.":"Time entry stopped. Awaiting manager approval before Workcard actual hours are updated.");await load();}catch{setNotice("Could not update time.");}finally{setBusy(false);}}
 const selectedJob=workOptions.find(job=>job.id===jobId);
 const activeJob=workOptions.find(job=>job.id===active?.job_id);
 const activeTask=activeJob?.labourEntries.find(entry=>entry.id===active?.work_entry_id);
 return <section className="portal-panel"><span className="panel-kicker">TIME CLOCK</span><h2>{active?"You are clocked on":"Start a work entry"}</h2>
  {active?<><p>Started {new Date(active.started_at).toLocaleString("en-AU")} · {active.entry_type}{activeJob?" · "+activeJob.job_number+" "+activeJob.title:""}{activeTask?" · "+activeTask.description:""}</p><button className="button button-primary" disabled={busy} onClick={()=>void act("stop")}>{busy?"Saving…":"Finish time entry"}</button></>:<>
   <label>Assigned Workcard (optional)<select value={jobId} onChange={e=>{setJobId(e.target.value);setWorkEntryId("");}}><option value="">General business time</option>{workOptions.map(job=><option key={job.id} value={job.id}>{job.job_number} · {job.title}</option>)}</select></label>
   {selectedJob&&<label>Labour task (optional)<select value={workEntryId} onChange={e=>setWorkEntryId(e.target.value)}><option value="">General Workcard time</option>{selectedJob.labourEntries.map(entry=><option key={entry.id} value={entry.id}>{entry.description}</option>)}</select></label>}
   <button className="button button-primary" disabled={busy} onClick={()=>void act("start")}>{busy?"Starting…":"Start work time"}</button>
  </>}
  {notice&&<p className="inline-notice" role="status">{notice}</p>}
 </section>;
}
