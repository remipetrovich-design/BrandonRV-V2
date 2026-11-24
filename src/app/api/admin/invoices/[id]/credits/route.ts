import {currentUser,currentMembership,database,userHasPermission,jsonError,sameOrigin} from "@/lib/auth";
import {emitIntegrationEvent} from "@/lib/emit-integration-event";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);if(!membership||!(await userHasPermission(user.id,"invoices.manage")))return jsonError("You do not have permission to issue credit notes.",403);
 try{
  const {id}=await params,body=await request.json(),amount=Number(body.amount);
  const reason=String(body.reason??"").trim().slice(0,1000),idempotencyKey=String(body.idempotencyKey??"");
  if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f-]{36}$/i.test(idempotencyKey))return jsonError("Invalid invoice or request key.");
  if(!Number.isFinite(amount)||amount<=0||amount>10000000||reason.length<3)return jsonError("Enter a valid credit amount and reason.");
  const {data,error}=await database().rpc("record_invoice_credit",{p_invoice_id:id,p_business_id:membership.business_id,p_actor_user_id:user.id,p_amount:amount,p_reason:reason,p_idempotency_key:idempotencyKey});
  if(error){if(error.code==="P0001")return jsonError(error.message??"This credit cannot be issued.",409);if(error.code==="22023")return jsonError(error.message??"Enter a valid credit.",400);return jsonError("Could not issue credit note. No changes were made.",500);}
  const db=database();
  const {data:invoice}=await db.from("invoices").select("id,invoice_number,total,customer_id,user_id").eq("id",id).eq("business_id",membership.business_id).maybeSingle();
  let recipientEmail:string|null=null,recipientName:string|null=null;
  if(invoice?.user_id){const {data:u}=await db.from("users").select("email,full_name").eq("id",invoice.user_id).maybeSingle();recipientEmail=u?.email??null;recipientName=u?.full_name??null;}
  if(!recipientEmail&&invoice?.customer_id){const {data:customer}=await db.from("customers").select("email,full_name").eq("id",invoice.customer_id).eq("business_id",membership.business_id).maybeSingle();recipientEmail=customer?.email??null;recipientName=customer?.full_name??null;}
  if(recipientEmail&&invoice)await emitIntegrationEvent("invoice.credit_issued",{
   recipient:{email:recipientEmail,firstName:recipientName},customer:{email:recipientEmail,name:recipientName},
   invoice:{id:invoice.id,number:invoice.invoice_number,total:invoice.total},credit:{amount,reason},
   business:{name:"Brandon RV"},issuedAt:new Date().toISOString()
  });
  return Response.json({...data,emailSent:!!recipientEmail});
 }catch{return jsonError("Could not issue credit note.",500);}
}
