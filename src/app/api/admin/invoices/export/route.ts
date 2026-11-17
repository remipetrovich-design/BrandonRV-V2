import {currentUser,currentMembership,database,userHasPermission,jsonError} from "@/lib/auth";
export const runtime="nodejs";
function csv(value:unknown){const s=String(value??"");return '"'+s.replaceAll('"','""')+'"';}
export async function GET(){
 const user=await currentUser();if(!user)return jsonError("Not signed in.",401);
 const membership=await currentMembership(user.id);if(!membership||!(await userHasPermission(user.id,"invoices.view")))return jsonError("You do not have permission to export invoice records.",403);
 const db=database(),businessId=membership.business_id;
 const [invoiceResult,paymentResult,refundResult,creditResult]=await Promise.all([
  db.from("invoices").select("id,invoice_number,status,issue_date,due_date,total,amount_paid,customer_id,job_id").eq("business_id",businessId).order("created_at",{ascending:true}).limit(5000),
  db.from("payments").select("id,invoice_id,amount,method,reference,status,paid_at,payment_type").eq("business_id",businessId).order("paid_at",{ascending:true}).limit(10000),
  db.from("invoice_refunds").select("id,invoice_id,payment_id,amount,method,reference,reason,status,created_at").eq("business_id",businessId).order("created_at",{ascending:true}).limit(10000),
  db.from("invoice_credits").select("id,invoice_id,credit_number,amount,reason,status,created_at").eq("business_id",businessId).order("created_at",{ascending:true}).limit(10000)
 ]);
 if(invoiceResult.error||paymentResult.error||refundResult.error||creditResult.error)return jsonError("Could not prepare the invoice reconciliation export.",500);
 const invoices=invoiceResult.data??[],payments=paymentResult.data??[],refunds=refundResult.data??[],credits=creditResult.data??[];
 const customerIds=[...new Set(invoices.map(x=>x.customer_id).filter(Boolean))],jobIds=[...new Set(invoices.map(x=>x.job_id).filter(Boolean))];
 let customerRows:any[]=[];let jobRows:any[]=[];
 if(customerIds.length){const result=await db.from("customers").select("id,name,email").eq("business_id",businessId).in("id",customerIds);if(result.error)return jsonError("Could not load invoice customer details.",500);customerRows=result.data??[];}
 if(jobIds.length){const result=await db.from("jobs").select("id,job_number").eq("business_id",businessId).in("id",jobIds);if(result.error)return jsonError("Could not load Workcard reconciliation details.",500);jobRows=result.data??[];}
 const customers=new Map<string,any>(customerRows.map(x=>[x.id,x])),jobs=new Map<string,any>(jobRows.map(x=>[x.id,x]));
 const header=["Record Type","Invoice Number","Invoice Status","Issue Date","Due Date","Customer","Customer Email","Workcard","Invoice Total","Amount Paid (Net)","Credit Total","Outstanding Balance","Payment Reconciliation Variance","Transaction Date","Transaction Type","Transaction Amount","Method","Reference","Payment Type","Reason","Transaction Status","Transaction ID"];
 const rows=[header];
 for(const invoice of invoices){
  const ip=payments.filter(x=>x.invoice_id===invoice.id&&["recorded","refunded"].includes(x.status));
  const ir=refunds.filter(x=>x.invoice_id===invoice.id&&x.status==="recorded");
  const ic=credits.filter(x=>x.invoice_id===invoice.id&&x.status==="issued");
  const gross=ip.reduce((n,x)=>n+Number(x.amount),0),refunded=ir.reduce((n,x)=>n+Number(x.amount),0);
  const net=Number((gross-refunded).toFixed(2)),creditTotal=Number(ic.reduce((n,x)=>n+Number(x.amount),0).toFixed(2));
  const balance=Number((Number(invoice.total)-Number(invoice.amount_paid)-creditTotal).toFixed(2));
  const customer=customers.get(invoice.customer_id) as any,jobsRow=jobs.get(invoice.job_id) as any;
  rows.push(["INVOICE",invoice.invoice_number,invoice.status,invoice.issue_date,invoice.due_date,customer?.name,customer?.email,jobsRow?.job_number,invoice.total,invoice.amount_paid,creditTotal,balance,Number((Number(invoice.amount_paid)-net).toFixed(2)),"","","","","","","","",""].map(csv));
  for(const p of payments.filter(x=>x.invoice_id===invoice.id))rows.push(["PAYMENT",invoice.invoice_number,invoice.status,invoice.issue_date,invoice.due_date,customer?.name,customer?.email,jobsRow?.job_number,invoice.total,invoice.amount_paid,creditTotal,balance,"",p.paid_at,p.payment_type,p.amount,p.method,p.reference,p.payment_type,"",p.status,p.id].map(csv));
  for(const r of ir)rows.push(["REFUND",invoice.invoice_number,invoice.status,invoice.issue_date,invoice.due_date,customer?.name,customer?.email,jobsRow?.job_number,invoice.total,invoice.amount_paid,creditTotal,balance,"",r.created_at,"refund",r.amount,r.method,r.reference,"",r.reason,r.status,r.id].map(csv));
  for(const c of ic)rows.push(["CREDIT",invoice.invoice_number,invoice.status,invoice.issue_date,invoice.due_date,customer?.name,customer?.email,jobsRow?.job_number,invoice.total,invoice.amount_paid,creditTotal,balance,"",c.created_at,"credit",c.amount,"",c.credit_number,"",c.reason,c.status,c.id].map(csv));
 }
 const body=rows.map(row=>row.join(",")).join("\r\n");
 return new Response(body,{status:200,headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":"attachment; filename=\"brandonrv-invoice-reconciliation.csv\"","Cache-Control":"no-store"}});
}
