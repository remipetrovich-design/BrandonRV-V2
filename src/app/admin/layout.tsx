import {redirect} from "next/navigation";
import type {ReactNode} from "react";
import {currentUser,currentMembership,userHasPermissions,database} from "@/lib/auth";
import {discoverIntegrations} from "@/lib/integration-registry";
import AdminShell,{type AdminNavGroup} from "@/components/admin-shell";
import "./admin-density.css";
import "./staff-panel-refresh.css";
export const dynamic="force-dynamic";

// One canonical destination per workflow. Intake sub-types are filters inside
// the Enquiries register rather than duplicate sidebar destinations.
const navigation:AdminNavGroup[]=[
 {title:"Operations",items:[
  {label:"Enquiries & requests",href:"/admin/enquiries",permission:"enquiries.view",icon:"inbox"},
  {label:"Quotes",href:"/admin/quotes",permission:"quotes.view",icon:"quote"},
  {label:"My Workcards",href:"/admin/my-workcards",permission:"jobs.view",icon:"jobs"},
  {label:"Workcard management",href:"/admin/jobs",permission:"jobs.manage",icon:"jobs"},
  {label:"Bookings & calendar",href:"/admin/appointments",permission:"appointments.view",icon:"calendar"}
 ]},
 {title:"Customers & vehicles",items:[
  {label:"Customers",href:"/admin/customers",permission:"customers.view",icon:"users"},
  {label:"Vehicles",href:"/admin/vehicles",permission:"vehicles.view",icon:"vehicle"}
 ]},
 {title:"Finance & purchasing",items:[
  {label:"Invoices & payments",href:"/admin/invoices",permission:"invoices.view",icon:"finance"},
  {label:"Business reports",href:"/admin/reports",permission:"reports.view",icon:"finance"},
  {label:"Expenses",href:"/admin/expenses",permission:"expenses.view",icon:"expense"},
  {label:"Suppliers",href:"/admin/suppliers",permission:"suppliers.view",icon:"supplier"},
  {label:"Supplier orders",href:"/admin/supplier-orders",permission:"suppliers.view",icon:"supplier"}
 ]},
 {title:"People & access",items:[
  {label:"Employees",href:"/admin/staff",permission:"staff.view",icon:"staff"},
  {label:"Workforce",href:"/admin/workforce",permission:"time.clock",icon:"calendar"},
 ]},
 {title:"Business setup",items:[
  {label:"Integrations",href:"/admin/integrations",permission:"integrations.manage",icon:"settings"},
  {label:"Services & scope",href:"/admin/services",permission:"business.settings.manage",icon:"services"},
  {label:"Service areas",href:"/admin/service-areas",permission:"business.settings.manage",icon:"location"},
  {label:"Website editor",href:"/admin/website",permission:"website.manage",icon:"website"},
  {label:"Settings",href:"/admin/settings",permission:"business.settings.manage",icon:"settings"},
  {label:"Deployment control",href:"/admin/deployment",permission:"deployment.manage",icon:"settings"}
 ]}
];
export default async function AdminLayout({children}:{children:ReactNode}) {
 const sessionStartedAt=Date.now();
 const user=await currentUser();
 console.info("[staff-portal-perf] stage=session elapsed_ms="+(Date.now()-sessionStartedAt));
 if(!user)redirect("/portal/sign-in");
 const permissionKeys=[...new Set([...navigation.flatMap(group=>group.items.map(item=>item.permission)),"quotes.manage","quotes.approve","jobs.complete","time.view","time.manage","time.clock","leave.view","leave.manage","payroll.view","payroll.manage","assets.view","assets.manage","onboarding.view","onboarding.manage","staff.manage","developer.deploy","developer.migrations.manage"])];
 const accessStartedAt=Date.now();
 const [membership,permitted]=await Promise.all([currentMembership(user.id),userHasPermissions(user.id,permissionKeys)]);
 console.info("[staff-portal-perf] stage=membership-permissions elapsed_ms="+(Date.now()-accessStartedAt));
 if(!membership)redirect("/portal");
 const workforcePermissions=["time.clock","time.view","time.manage","leave.view","leave.manage","payroll.view","payroll.manage","assets.view","assets.manage","onboarding.view","onboarding.manage","staff.manage","staff.view"];
 const canAccessWorkforce=workforcePermissions.some(permission=>permitted.has(permission));
 const canAccessStaff=permitted.has("staff.view")||permitted.has("staff.manage")||permitted.has("roles.manage");
 const canAccessDeployment=permitted.has("developer.deploy")||permitted.has("developer.migrations.manage");
 let integrationLinks:AdminNavGroup["items"]=[];
 if(permitted.has("integrations.manage")){
  const [manifests,{data:enabledRows,error:enabledError}]=await Promise.all([
   discoverIntegrations(),
   database().from("app_integrations").select("slug").eq("active",true)
  ]);
  if(!enabledError){
   const enabled=new Set((enabledRows??[]).map((row:{slug:string})=>row.slug));
   integrationLinks=manifests.filter(module=>module.adminPage==="admin-page.tsx"&&enabled.has(module.id))
    .map(module=>({label:module.name,href:"/admin/integrations/"+module.id,permission:"integrations.manage",icon:"settings"}));
  }
 }
 const dynamicNavigation=navigation.map(group=>group.title==="Business setup"?{
  ...group,items:group.items.flatMap(item=>item.href==="/admin/integrations"?[item,...integrationLinks]:[item])
 }:group);
 const groups=dynamicNavigation.map(group=>({...group,items:group.items.filter(item=>item.href==="/admin/deployment"?canAccessDeployment:item.href==="/admin/quotes"?(permitted.has("quotes.view")||permitted.has("quotes.manage")||permitted.has("quotes.approve")):item.href==="/admin/workforce"?canAccessWorkforce:item.href==="/admin/staff"?canAccessStaff:item.href==="/admin/my-workcards"?(permitted.has("jobs.view")||permitted.has("jobs.complete")):permitted.has(item.permission))})).filter(group=>group.items.length>0);
 const canSeeOverview=["enquiries.view","appointments.view","jobs.view","quotes.view","quotes.manage","quotes.approve","invoices.view","customers.view","vehicles.view"].some(permission=>permitted.has(permission));
 const employeeTools=["jobs.complete","time.view","time.manage","time.clock","leave.view","payroll.view","assets.view","onboarding.view"].some(permission=>permitted.has(permission));
 if(!canSeeOverview&&!groups.length&&!employeeTools)redirect("/portal");
 return <AdminShell userName={user.full_name||user.email} role={membership.role} groups={groups}>{children}</AdminShell>;
}
