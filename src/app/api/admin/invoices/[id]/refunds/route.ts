import {currentUser,currentMembership,database,userHasPermission,jsonError,sameOrigin} from "@/lib/auth";
import {emitIntegrationEvent} from "@/lib/emit-integration-event";
export const runtime="nodejs";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);if(!membership||!(await userHasPermission(user.id,"payments.manage")))return jsonError("You do not have permission to record refunds.",403);
 try{
  const {id}=await params,body=await request.json(),paymentId=String(body.paymentId??"");
  const amount=Number(body.amount),method=String(body.method??"other"),reference=String(body.reference??"").trim().slice(0,120);
  const reason=String(body.reason??"").trim().slice(0,1000),idempotencyKey=String(body.idempotencyKey??"");
  if(!/^[0-9a-f-]{36}$/i.test(id)||!/^[0-9a-f-]{36}$/i.test(paymentId)||!/^[0-9a-f-]{36}$/i.test(idempotencyKey))return jsonError("Invalid invoice, payment or request key.");
  if(!Number.isFinite(amount)||amount<=0||amount>10000000||reason.length<3)return jsonError("Enter a valid refund amount and reason.");
  if(!["cash","bank_transfer","card","other"].includes(method))return jsonError("Select a valid refund method.");
  const {data,error}=await database().rpc("record_invoice_refund",{p_invoice_id:id,p_business_id:membership.business_id,p_actor_user_id:user.id,p_payment_id:paymentId,p_amount:amount,p_method:method,p_reference:reference||null,p_reason:reason,p_idempotency_key:idempotencyKey});
  if(error){if(error.code==="P0001")return jsonError(error.message??"This refund cannot be recorded.",409);if(error.code==="22023")return jsonError(error.message??"Enter a valid refund.",400);return jsonError("Could not record refund. No changes were made.",500);}
  const db=database();
  const {data:invoice}=await db.from("invoices").select("id,invoice_number,total,customer_id,user_id").eq("id",id).eq("business_id",membership.business_id).maybeSingle();
  let recipientEmail:string|null=null,recipientName:string|null=null;
  if(invoice?.user_id){const {data:u}=await db.from("users").select("email,full_name").eq("id",invoice.user_id).maybeSingle();recipientEmail=u?.email??null;recipientName=u?.full_name??null;}
  if(!recipientEmail&&invoice?.customer_id){const {data:customer}=await db.from("customers").select("email,full_name").eq("id",invoice.customer_id).eq("business_id",membership.business_id).maybeSingle();recipientEmail=customer?.email??null;recipientName=customer?.full_name??null;}
  if(recipientEmail&&invoice)await emitIntegrationEvent("payment.refunded",{
   recipient:{email:recipientEmail,firstName:recipientName},customer:{email:recipientEmail,name:recipientName},
   invoice:{id:invoice.id,number:invoice.invoice_number,total:invoice.total},refund:{paymentId,amount,method,reference,reason},
   business:{name:"Brandon RV"},refundedAt:new Date().toISOString()
  });
  return Response.json({...data,emailSent:!!recipientEmail});
 }catch{return jsonError("Could not record refund.",500);}
}
