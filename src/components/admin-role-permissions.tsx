"use client";
import {FormEvent,useEffect,useMemo,useState} from "react";
type Permission={permission_key:string;description:string};
type Role={id:string;name:string;description:string|null;is_system:boolean;permissions:string[]};
const order=["ceo_founder","website_development_specialist","senior_manager","general_manager","administrator","manager","office_manager","office_supervisor","office_admin","supervisor","team_leader","senior_apprentice","apprentice","trial_apprentice","customer"];
const sections:{title:string;description:string;prefixes?:string[];keys?:string[]}[]=[
 {title:"Approvals & overrides",description:"Independent review, scheduling restrictions and workflow exceptions.",keys:["quotes.approve_self_review","appointments.override_scheduling_restrictions"]},
 {title:"Customers & intake",description:"Customer records, vehicles, enquiries and submitted documents.",prefixes:["customers.","vehicles.","enquiries.","documents."]},
 {title:"Quotes, bookings & Workcards",description:"Quote preparation, approvals, appointment management and job execution.",prefixes:["quotes.","appointments.","jobs."]},
 {title:"Finance & purchasing",description:"Invoices, payments, expenses, reports, suppliers and assets.",prefixes:["invoices.","payments.","expenses.","reports.","suppliers.","assets."]},
 {title:"People & workforce",description:"Staff records, time, leave, payroll and onboarding.",prefixes:["staff.","time.","leave.","payroll.","onboarding."]},
 {title:"Business configuration",description:"Website, business settings, integrations and role administration.",prefixes:["website.","business.","settings.","roles."]},
 {title:"Developer controls",description:"Technical deployment and database migration operations.",prefixes:["developer."]}
];
const sectionFor=(key:string)=>sections.findIndex(section=>section.keys?.includes(key)||section.prefixes?.some(prefix=>key.startsWith(prefix)));
const protectedRoles=["customer","ceo_founder","website_development_specialist","senior_manager","owner","website_developer"];
const sortRoles=(roles:Role[])=>[...roles].sort((a,b)=>{const ai=order.indexOf(a.id),bi=order.indexOf(b.id);return (ai<0?99:ai)-(bi<0?99:bi)||a.name.localeCompare(b.name);});
export default function AdminRolePermissions(){
 const [roles,setRoles]=useState<Role[]>([]),[catalogue,setCatalogue]=useState<Permission[]>([]),[assignable,setAssignable]=useState<string[]>([]),[selected,setSelected]=useState(""),[checked,setChecked]=useState<string[]>([]),[search,setSearch]=useState(""),[name,setName]=useState(""),[description,setDescription]=useState(""),[notice,setNotice]=useState(""),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[showCreate,setShowCreate]=useState(false);
 const selectedRole=roles.find(role=>role.id===selected),locked=!!selectedRole&&protectedRoles.includes(selectedRole.id);
 async function load(preferred?:string){
  setLoading(true);
  try{
   const response=await fetch("/api/admin/roles",{cache:"no-store"}),data=await response.json();
   if(!response.ok)throw new Error(data.error??"Could not load roles and permissions.");
   const next=sortRoles((data.groups??[]).map((role:Role)=>({...role,permissions:role.permissions??[]})));
   setRoles(next);setCatalogue(data.permissions??[]);setAssignable(data.assignablePermissions??[]);
   const active=preferred&&next.some(role=>role.id===preferred)?preferred:(next.some(role=>role.id===selected)?selected:next[0]?.id??"");
   setSelected(active);setChecked(next.find(role=>role.id===active)?.permissions??[]);
  }catch(error){setNotice(error instanceof Error?error.message:"Could not load roles and permissions.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();},[]);
 function choose(id:string){setSelected(id);setChecked(roles.find(role=>role.id===id)?.permissions??[]);setSearch("");}
 function toggle(key:string){setChecked(current=>current.includes(key)?current.filter(item=>item!==key):[...current,key]);}
 function toggleSection(keys:string[],enabled:boolean){const allowed=keys.filter(key=>assignable.includes(key));setChecked(current=>enabled?[...new Set([...current,...allowed])]:current.filter(key=>!allowed.includes(key)));}
 async function save(){
  if(!selected)return;setBusy(true);setNotice("");
  try{
   const response=await fetch("/api/admin/roles",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({groupId:selected,permissions:checked})}),data=await response.json();
   if(!response.ok)throw new Error(data.error??"Could not save role permissions.");
   setNotice("Role permissions saved.");await load(selected);
  }catch(error){setNotice(error instanceof Error?error.message:"Could not save role permissions.");}
  finally{setBusy(false);}
 }
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();setBusy(true);setNotice("");
  try{
   const response=await fetch("/api/admin/roles",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,description,permissions:[]})}),data=await response.json();
   if(!response.ok)throw new Error(data.error??"Could not create role.");
   setName("");setDescription("");setShowCreate(false);setNotice("Role created. Configure its permissions.");await load(data.group.id);
  }catch(error){setNotice(error instanceof Error?error.message:"Could not create role.");}
  finally{setBusy(false);}
 }
 const filtered=catalogue.filter(permission=>!search||permission.permission_key.toLowerCase().includes(search.toLowerCase())||permission.description.toLowerCase().includes(search.toLowerCase()));
 const grouped=useMemo(()=>sections.map((section,index)=>({...section,items:filtered.filter(permission=>sectionFor(permission.permission_key)===index)})).filter(section=>section.items.length>0),[filtered]);
 const uncategorised=filtered.filter(permission=>sectionFor(permission.permission_key)<0);
 const enabled=checked.length,overrideCount=checked.filter(key=>key.includes("override")||key.includes("self_review")).length;
 return <section className="brv-role-manager" aria-label="User roles and permissions">
  <header className="brv-role-manager__header"><div><span className="panel-kicker">ACCESS CONTROL</span><h2>Roles & permissions</h2><p>Control what each staff role can view, manage, approve or override. Individual employee grants remain separate in the employee directory. You can delegate only permissions you currently hold.</p></div><div className="brv-role-manager__metrics"><span><strong>{roles.length}</strong><small>Roles</small></span><span><strong>{catalogue.length}</strong><small>Permissions</small></span><span><strong>{overrideCount}</strong><small>Overrides selected</small></span></div></header>
  <div className="brv-role-manager__toolbar"><label className="brv-role-manager__search">Find a permission<input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search permission keys or descriptions"/></label><button type="button" className="button button-secondary" onClick={()=>setShowCreate(value=>!value)}>{showCreate?"Close":"＋ Create role"}</button></div>
  {showCreate&&<form className="brv-role-create" onSubmit={create}><label>Role name<input value={name} onChange={event=>setName(event.target.value)} minLength={3} maxLength={50} required placeholder="e.g. Parts Coordinator"/></label><label>Description<input value={description} onChange={event=>setDescription(event.target.value)} maxLength={500} placeholder="What this role is responsible for"/></label><button className="button button-primary" disabled={busy}>Create role</button></form>}
  {notice&&<p className="inline-notice" role="status">{notice}</p>}
  {loading?<p className="panel-footnote">Loading role permissions…</p>:<div className="brv-role-manager__layout">
   <nav className="brv-role-manager__list" aria-label="Select a role"><div className="brv-role-manager__list-head"><strong>ROLE LIBRARY</strong><small>{roles.length} configured</small></div>{roles.map(role=><button type="button" key={role.id} className={"brv-role-choice"+(selected===role.id?" is-active":"")} aria-pressed={selected===role.id} onClick={()=>choose(role.id)}><span className="brv-role-choice__name">{role.name}</span><span className="brv-role-choice__meta">{role.is_system?"System role":"Custom role"} · {role.permissions.length} permissions</span>{protectedRoles.includes(role.id)&&<span className="brv-role-choice__lock">Protected</span>}</button>)}</nav>
   <div className="brv-role-manager__editor">{selectedRole?<><div className="brv-role-manager__role-head"><div><span className="panel-kicker">{selectedRole.is_system?"SYSTEM ROLE":"CUSTOM ROLE"}</span><h3>{selectedRole.name}</h3><p>{selectedRole.description??"No role description has been added."}</p></div><div className="brv-role-manager__counts"><strong>{enabled}<small>enabled</small></strong><strong>{catalogue.length?Math.round(enabled/catalogue.length*100):0}%<small>coverage</small></strong></div></div>
    {locked&&<div className="brv-role-manager__protected"><strong>{selectedRole.id==="customer"?"Permanent customer role":"Full application access"}</strong><p>{selectedRole.id==="customer"?"The customer role cannot be modified here.":"This role retains unrestricted application access. Developer-only deployment and migration permissions are separate and are assigned to Website Development Specialist."}</p></div>}
    {grouped.map(section=><section className="brv-permission-group" key={section.title}><header><div><h4>{section.title}</h4><p>{section.description}</p></div><div className="brv-permission-group__actions"><small>{section.items.filter(item=>checked.includes(item.permission_key)).length}/{section.items.length}</small><button type="button" disabled={locked||busy||!section.items.some(item=>assignable.includes(item.permission_key))} onClick={()=>toggleSection(section.items.map(item=>item.permission_key),true)}>Enable all</button><button type="button" disabled={locked||busy||!section.items.some(item=>assignable.includes(item.permission_key)&&checked.includes(item.permission_key))} onClick={()=>toggleSection(section.items.map(item=>item.permission_key),false)}>Clear</button></div></header><div className="brv-permission-group__items">{section.items.map(permission=><label className="brv-permission-item" key={permission.permission_key}><input type="checkbox" checked={checked.includes(permission.permission_key)} disabled={locked||!assignable.includes(permission.permission_key)} onChange={()=>toggle(permission.permission_key)}/><span><strong>{permission.permission_key}</strong><small>{permission.description}</small></span></label>)}</div></section>)}
    {uncategorised.length>0&&<section className="brv-permission-group"><header><div><h4>Other permissions</h4><p>Permissions not yet assigned to a category.</p></div></header><div className="brv-permission-group__items">{uncategorised.map(permission=><label className="brv-permission-item" key={permission.permission_key}><input type="checkbox" checked={checked.includes(permission.permission_key)} disabled={locked||!assignable.includes(permission.permission_key)} onChange={()=>toggle(permission.permission_key)}/><span><strong>{permission.permission_key}</strong><small>{permission.description}</small></span></label>)}</div></section>}
    {!locked&&<footer className="brv-role-manager__footer"><span>Changes apply to everyone assigned this role.</span><button type="button" className="button button-primary" disabled={busy} onClick={()=>void save()}>{busy?"Saving…":"Save role permissions →"}</button></footer>}
   </>:<p className="panel-footnote">No roles are available to manage.</p>}</div>
  </div>}
 </section>;
}
