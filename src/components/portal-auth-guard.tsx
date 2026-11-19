"use client";
import {useRouter} from "next/navigation";
import {ReactNode,useEffect,useState} from "react";

const publicPages=["/portal/sign-in","/portal/register","/portal/verify-email","/portal/forgot-password","/portal/reset-password","/portal/accept-staff-invitation"];

export default function PortalAuthGuard({children}:{children:ReactNode}){
 const router=useRouter();
 const [verified,setVerified]=useState(false);
 const [ready,setReady]=useState(false);

 useEffect(()=>{
  if(verified||ready)return;
  let active=true;
  fetch("/api/auth/me",{cache:"no-store"}).then(async response=>{
   if(!active)return;
   if(response.ok){setVerified(true);setReady(true);return;}
   const path=window.location.pathname;
   if(publicPages.includes(path)){setReady(true);return;}
   router.replace("/portal/sign-in");
  }).catch(()=>{
   if(!active)return;
   if(publicPages.includes(window.location.pathname))setReady(true);
   else router.replace("/portal/sign-in");
  });
  return()=>{active=false;};
 },[ready,router,verified]);

 // Once verified, keep the portal shell mounted across route changes. Each
 // server page still authorizes its own data and mutations; this is only a
 // client-side loading gate, never an access-control boundary.
 if(verified||ready)return <>{children}</>;
 return <div className="auth-wrap" role="status">Checking your account…</div>;
}
