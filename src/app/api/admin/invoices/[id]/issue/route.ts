import {currentUser,currentMembership,database,userHasPermission,jsonError,sameOrigin} from "@/lib/auth";
import {emitIntegrationEvent} from "@/lib/emit-integration-event";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);if(!membership||!(await userHasPermission(user.id,"invoices.manage")))return jsonError("You do not have permission to issue invoices.",403);
 const {id}=await params;if(!/^[0-9a-f-]{36}$/i.test(id))return jsonError("Invalid invoice ID.");
 const {data,error}=await database().rpc("issue_invoice",{p_invoice_id:id,p_business_id:membership.business_id,p_actor_user_id:user.id});
 if(error){if(error.code==="P0002")return jsonError(error.message??"Invoice not found.",404);if(error.code==="P0001")return jsonError(error.message??"Invoice is not ready to issue.",409);return jsonError("Could not issue invoice. No changes were made.",500);}
 const db=database();
 const {data:invoice}=await db.from("invoices").select("id,invoice_number,total,due_date,customer_id,user_id").eq("id",id).eq("business_id",membership.business_id).maybeSingle();
 let recipientEmail:string|null=null,recipientName:string|null=null;
 if(invoice?.user_id){const {data:customerUser}=await db.from("users").select("email,full_name").eq("id",invoice.user_id).maybeSingle();recipientEmail=customerUser?.email??null;recipientName=customerUser?.full_name??null;}
 if(!recipientEmail&&invoice?.customer_id){const {data:customer}=await db.from("customers").select("email,full_name").eq("id",invoice.customer_id).eq("business_id",membership.business_id).maybeSingle();recipientEmail=customer?.email??null;recipientName=customer?.full_name??null;}
 if(recipientEmail&&invoice)await emitIntegrationEvent("invoice.issued",{
  recipient:{email:recipientEmail,firstName:recipientName},customer:{email:recipientEmail,name:recipientName},
  invoice:{id:invoice.id,number:invoice.invoice_number,total:invoice.total,dueDate:invoice.due_date,status:"issued"},
  business:{name:"Brandon RV"},issuedAt:new Date().toISOString()
 });
 return Response.json({...data,emailSent:!!recipientEmail});
}
