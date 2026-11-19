import {notFound,redirect} from "next/navigation";
import Link from "next/link";
import {currentUser,currentMembership,database,userHasPermission} from "@/lib/auth";
import AdminEnquiryEditor from "@/components/admin-enquiry-editor";
import AdminAccessDenied from "@/components/admin-access-denied";
export const dynamic="force-dynamic";
export default async function AdminEnquiryDetail({params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user)redirect("/portal/sign-in");
 const membership=await currentMembership(user.id);if(!membership)redirect("/portal");if(!(await userHasPermission(user.id,"enquiries.view")))return <AdminAccessDenied resource="this Jobcard"/>;
 const {id}=await params;
 const [{data:item},canManageEnquiries,canManageQuotes,canApproveQuotes,canManageJobs,canManageBookings,canViewBookings,canAssignJobs]=await Promise.all([
  database().from("enquiries").select("id,request_number,request_type,contact_name,email,created_at,status").eq("id",id).eq("business_id",membership.business_id).maybeSingle(),
  userHasPermission(user.id,"enquiries.manage"),userHasPermission(user.id,"quotes.manage"),userHasPermission(user.id,"quotes.approve"),userHasPermission(user.id,"jobs.manage"),userHasPermission(user.id,"appointments.manage"),userHasPermission(user.id,"appointments.view"),userHasPermission(user.id,"jobs.assign")
 ]);
 if(!item)notFound();
 return <main className="portal-page"><div className="shell portal-shell" style={{display:"block",maxWidth:1500}}>
  <div className="portal-page-heading"><p className="eyebrow"><span className="eyebrow-line"/> CUSTOMER WORKSPACE</p><h1>{item.request_number}</h1><p>{item.request_type.replaceAll("_"," ")} · {item.contact_name} · {item.email}</p><Link href="/admin/enquiries" className="text-link">← Back to all enquiries</Link></div>
  <AdminEnquiryEditor enquiryId={item.id} requestType={item.request_type} canManageEnquiries={canManageEnquiries} canManageQuotes={canManageQuotes} canApproveQuotes={canApproveQuotes} canManageJobs={canManageJobs} canManageBookings={canManageBookings} canViewBookings={canViewBookings||canManageBookings} canAssignJobs={canAssignJobs}/>
 </div></main>;
}
