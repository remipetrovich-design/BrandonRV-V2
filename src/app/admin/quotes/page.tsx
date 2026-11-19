import {redirect} from "next/navigation";
import Link from "next/link";
import {currentUser,currentMembership,database,userHasPermission} from "@/lib/auth";
import AdminCreateQuote from "@/components/admin-create-quote";
import AdminQuoteManagement from "@/components/admin-quote-management";
import AdminQuoteTools from "@/components/admin-quote-tools";
import QuoteApprovalOverride from "@/components/quote-approval-override";
import QuoteAcceptOnBehalf from "@/components/quote-accept-on-behalf";
export const dynamic="force-dynamic";
const money=(value:number)=>new Intl.NumberFormat("en-AU",{style:"currency",currency:"AUD"}).format(Number(value||0));
const pretty=(value:string)=>String(value??"").replaceAll("_"," ").replace(/\b\w/g,x=>x.toUpperCase());
export default async function AdminQuotesPage(){
 const user=await currentUser();if(!user)redirect("/portal/sign-in");
 const membership=await currentMembership(user.id);if(!membership)redirect("/portal");
 const [canViewQuotes,canManageQuotes,canApproveQuotes,canViewEnquiries]=await Promise.all([
  userHasPermission(user.id,"quotes.view"),userHasPermission(user.id,"quotes.manage"),userHasPermission(user.id,"quotes.approve"),userHasPermission(user.id,"enquiries.view")
 ]);
 if(!canViewQuotes&&!canManageQuotes&&!canApproveQuotes)redirect("/admin");
 const {data:quotes,error}=await database().from("quotes").select("id,quote_number,enquiry_id,revision_number,status,senior_approval_status,customer_approval_bypassed_at,customer_approval_bypass_reason,quote_kind,total,created_at,issue_date,expiry_date,enquiries!quotes_enquiry_id_fkey(id,request_number,contact_name,requested_service)").eq("business_id",membership.business_id).order("created_at",{ascending:false}).limit(200);
 return <main className="portal-page"><div className="shell portal-shell brv-admin-page-inner">
  <div className="portal-page-heading"><p className="eyebrow"><span className="eyebrow-line"/> COMMERCIAL WORKFLOW</p><h1>Quotes &amp; approvals.</h1><p>Prepare Jobcard-linked quotes, review revisions and track customer decisions. Each issued revision remains active until its approved replacement is issued.</p></div>
  {canManageQuotes&&<AdminCreateQuote/>}
  <section className="portal-panel"><div className="portal-panel-heading"><div><span className="panel-kicker">{quotes?.length??0} QUOTES</span><h2>Quote register</h2></div></div>
   {error?<p className="inline-notice" role="alert">Could not load quote records.</p>:quotes?.length?quotes.map(q=>{const enquiry=Array.isArray(q.enquiries)?q.enquiries[0]??null:q.enquiries;return <article className="brv-ticket-quote" key={q.id}>
    <div><strong>{q.quote_number} · Revision {q.revision_number}</strong><span>{pretty(q.quote_kind??"standard")} · {pretty(q.status)} · {money(q.total)}</span><small>{new Date(q.created_at).toLocaleDateString("en-AU")}{q.senior_approval_status?" · Senior review: "+pretty(q.senior_approval_status):""}</small>{q.customer_approval_bypassed_at&&<span className="inline-notice">Management bypassed customer approval · {q.customer_approval_bypass_reason}</span>}{enquiry&&<span>{enquiry.request_number} · {enquiry.contact_name} · {enquiry.requested_service}</span>}{canViewEnquiries&&enquiry&&<Link prefetch={false} className="text-link" href={"/admin/enquiries/"+enquiry.id}>Open linked Jobcard →</Link>}</div>
    {q.quote_kind!=="variation"&&canManageQuotes&&<AdminQuoteManagement quoteId={q.id}/>{q.status==="sent"&&q.quote_kind==="standard"&&<QuoteAcceptOnBehalf quoteId={q.id}/>}}
    {q.quote_kind!=="variation"&&canApproveQuotes&&<AdminQuoteTools quoteId={q.id} canIssue={canManageQuotes}/>}{q.status==="sent"&&q.quote_kind==="standard"&&!q.customer_approval_bypassed_at&&<QuoteApprovalOverride quoteId={q.id}/>}
   </article>}):<p className="panel-footnote">No quotes have been created yet. A quote is prepared from an active Quote Request Jobcard.</p>}
  </section>
 </div></main>;
}
