import {currentUser,currentMembership,database,userHasPermission,jsonError,sameOrigin} from "@/lib/auth";
import {emitIntegrationEvent} from "@/lib/emit-integration-event";
export const runtime="nodejs";

export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);
 if(!membership||(!(await userHasPermission(user.id,"invoices.view"))&&!(await userHasPermission(user.id,"payments.manage"))))return jsonError("You do not have permission to view invoice transactions.",403);
 const {id}=await params,db=database();
 const {data:invoice,error:invoiceError}=await db.from("invoices").select("id,invoice_number,status,total,amount_paid").eq("id",id).eq("business_id",membership.business_id).maybeSingle();
 if(invoiceError||!invoice)return jsonError("Invoice not found.",404);
 const [paymentsResult,refundsResult,creditsResult]=await Promise.all([
  db.from("payments").select("id,amount,method,reference,status,paid_at,payment_type").eq("invoice_id",id).eq("business_id",membership.business_id).order("paid_at",{ascending:false}),
  db.from("invoice_refunds").select("id,payment_id,amount,method,reference,reason,status,created_at").eq("invoice_id",id).eq("business_id",membership.business_id).order("created_at",{ascending:false}),
  db.from("invoice_credits").select("id,credit_number,amount,reason,status,created_at").eq("invoice_id",id).eq("business_id",membership.business_id).order("created_at",{ascending:false})
 ]);
 if(paymentsResult.error||refundsResult.error||creditsResult.error)return jsonError("Could not load invoice transactions.",500);
 const refunds=refundsResult.data??[],payments=(paymentsResult.data??[]).map(p=>{
  const refunded=refunds.filter(r=>r.payment_id===p.id&&r.status==="recorded").reduce((sum,r)=>sum+Number(r.amount),0);
  return {...p,refundedAmount:Number(refunded.toFixed(2)),availableToRefund:Number(Math.max(0,Number(p.amount)-refunded).toFixed(2))};
 });
 const creditTotal=Number((creditsResult.data??[]).filter(c=>c.status==="issued").reduce((sum,c)=>sum+Number(c.amount),0).toFixed(2));
 return Response.json({invoice,payments,refunds,credits:creditsResult.data??[],creditTotal,balance:Number((Number(invoice.total)-Number(invoice.amount_paid)-creditTotal).toFixed(2))});
}

export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);if(!membership||!(await userHasPermission(user.id,"payments.manage")))return jsonError("You do not have permission to record payments.",403);
 try{
  const {id}=await params,body=await request.json();
  const amount=Number(body.amount),method=String(body.method??"other"),reference=String(body.reference??"").trim().slice(0,120);
  const paymentType=String(body.paymentType??"part_payment"),idempotencyKey=String(body.idempotencyKey??"");
  if(!Number.isFinite(amount)||amount<=0||amount>10000000)return jsonError("Enter a valid payment amount.");
  if(!["cash","bank_transfer","card","other"].includes(method))return jsonError("Select a valid payment method.");
  if(!["deposit","part_payment","final_payment","other"].includes(paymentType)||!/^[0-9a-f-]{36}$/i.test(idempotencyKey))return jsonError("A valid payment type and request key are required.");
  const {data,error}=await database().rpc("record_invoice_payment_idempotent",{
   p_invoice_id:id,p_business_id:membership.business_id,p_actor_user_id:user.id,p_amount:amount,
   p_method:method,p_reference:reference||null,p_payment_type:paymentType,p_idempotency_key:idempotencyKey
  });
  if(error){if(error.code==="P0001")return jsonError(error.message??"This invoice cannot accept payment.",409);if(error.code==="22023")return jsonError(error.message??"Enter a valid payment.",400);return jsonError("Could not record payment. No changes were made.",500);}
  const db=database();
  const {data:invoice}=await db.from("invoices").select("id,invoice_number,total,amount_paid,customer_id,user_id").eq("id",id).eq("business_id",membership.business_id).maybeSingle();
  let recipientEmail:string|null=null,recipientName:string|null=null;
  if(invoice?.user_id){const {data:customerUser}=await db.from("users").select("email,full_name").eq("id",invoice.user_id).maybeSingle();recipientEmail=customerUser?.email??null;recipientName=customerUser?.full_name??null;}
  if(!recipientEmail&&invoice?.customer_id){const {data:customer}=await db.from("customers").select("email,full_name").eq("id",invoice.customer_id).eq("business_id",membership.business_id).maybeSingle();recipientEmail=customer?.email??null;recipientName=customer?.full_name??null;}
  if(recipientEmail&&invoice)await emitIntegrationEvent("payment.received",{
   recipient:{email:recipientEmail,firstName:recipientName},customer:{email:recipientEmail,name:recipientName},
   invoice:{id:invoice.id,number:invoice.invoice_number,total:invoice.total,amountPaid:invoice.amount_paid},
   payment:{amount,method,reference,paymentType},business:{name:"Brandon RV"},receivedAt:new Date().toISOString()
  });
  return Response.json({...data,emailSent:!!recipientEmail});
 }catch(error){console.error("Invoice payment recording failed.",error);return jsonError("Could not record payment.",500);}
}
