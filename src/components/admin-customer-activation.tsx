"use client";
import {useState} from "react";
import {useRouter} from "next/navigation";
export default function AdminCustomerActivation({customerId}:{customerId:string}){
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState<{type:"success"|"error";text:string}|null>(null);
 const router=useRouter();
 async function activate(){
  setBusy(true);setNotice(null);
  try{
   const response=await fetch("/api/admin/customers/"+customerId+"/activate",{method:"POST"});
   const result=await response.json();
   if(!response.ok)throw new Error(result.error??"Could not activate customer account.");
   setNotice({type:"success",text:"Customer account activated successfully."});
   router.refresh();
  }catch(error){
   setNotice({type:"error",text:error instanceof Error?error.message:"Could not activate customer account."});
  }finally{setBusy(false);}
 }
 return <div className="customer-email-verification-action"><button className="button button-secondary" type="button" disabled={busy} onClick={()=>void activate()}>{busy?"Activating…":"Activate account"}</button>{notice&&<div className={"form-banner "+(notice.type==="success"?"form-banner-success":"form-banner-error")} role={notice.type==="success"?"status":"alert"}>{notice.text}</div>}</div>;
}
