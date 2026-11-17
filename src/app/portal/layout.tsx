"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";
import {useState} from "react";
import PortalSidebar from "@/components/portal-sidebar";
import PortalAuthGuard from "@/components/portal-auth-guard";
export default function PortalLayout({children}:{children:React.ReactNode}) {
 const pathname=usePathname()??"";
 const [mobileNavOpen,setMobileNavOpen]=useState(false);
 const isAuthPage=["/portal/sign-in","/portal/register","/portal/verify-email","/portal/forgot-password","/portal/reset-password","/portal/accept-staff-invitation"].includes(pathname);
 return <div className="portal-page">
  <header className="portal-topbar"><div className="shell portal-topbar-inner">
   <Link href="/" className="brand" aria-label="Brandon RV website"><span className="brand-symbol"><img src="/brv-mark.webp" alt=""/></span><span className="brand-name"><strong>BRANDON <span>RV</span></strong><small>YOUR ACCOUNT</small></span></Link>
   {!isAuthPage&&<button type="button" className="portal-menu-toggle" aria-label={mobileNavOpen?"Close customer navigation":"Open customer navigation"} aria-expanded={mobileNavOpen} aria-controls="customer-portal-navigation" onClick={()=>setMobileNavOpen(value=>!value)}><span/><span/><span/></button>}
   <div className="portal-topbar-right">{!isAuthPage&&<span className="portal-account-label">BRANDON RV ACCOUNT</span>}{!isAuthPage&&<Link href="/admin" className="portal-workspace-link">Business workspace</Link>}<Link href="/">Back to website <span aria-hidden="true">↗</span></Link></div>
  </div></header>
  <PortalAuthGuard>{isAuthPage?<div className="portal-auth-layout">{children}</div>:<div className="shell portal-shell">{mobileNavOpen&&<button type="button" className="portal-nav-backdrop" aria-label="Close customer navigation" onClick={()=>setMobileNavOpen(false)}/>}<PortalSidebar isOpen={mobileNavOpen} onNavigate={()=>setMobileNavOpen(false)}/><main className="portal-main">{children}</main></div>}</PortalAuthGuard>
  <footer className="portal-footer"><div className="shell"><span>Brandon RV customer account</span><span>Your account and service records in one place.</span></div></footer>
 </div>;
}
