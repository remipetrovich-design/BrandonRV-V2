import {currentUser,currentMembership,database,userHasPermission,jsonError,sameOrigin} from "@/lib/auth";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();
 if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);
 if(!membership||!(await userHasPermission(user.id,"customers.manage")))return jsonError("You do not have permission to activate customer accounts.",403);
 const {id}=await params;
 if(!/^[0-9a-f-]{36}$/i.test(id))return jsonError("Customer not found.",404);
 const db=database(),businessId=membership.business_id;
 const {data:account,error:accountError}=await db.from("users").select("id,email,primary_group,status").eq("id",id).eq("business_id",businessId).eq("primary_group","customer").eq("status","unverified").maybeSingle();
 if(accountError||!account)return jsonError("Inactive customer account not found.",404);
 const activatedAt=new Date().toISOString();
 const {data:updated,error}=await db.from("users").update({status:"active",primary_group:"customer",updated_at:activatedAt}).eq("id",id).eq("primary_group","customer").eq("status","unverified").select("id").maybeSingle();
 if(error)return jsonError("Could not activate the customer account.",500);
 if(!updated)return jsonError("This account has already been activated or is unavailable.",409);
 const {error:auditError}=await db.from("audit_events").insert({business_id:businessId,actor_user_id:user.id,action:"customer.account_manually_activated",entity_type:"user",entity_id:id,details:{email:account.email,activated_at:activatedAt,activation_method:"manual",previous_status:account.status,new_status:"active"}});
 if(auditError)return jsonError("Customer account was activated, but the audit record could not be saved.",500);
 return Response.json({success:true,activatedAt});
}
