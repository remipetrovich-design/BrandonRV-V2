import {authorizePermission,database,jsonError,sameOrigin,userHasPermission} from "@/lib/auth";
import {isUuid} from "@/lib/api-validation.mjs";
export const runtime="nodejs";

export async function GET(){
 const access=await authorizePermission("expenses.view");if(access.response)return access.response;
 const db=database(),businessId=access.membership!.business_id;
 const canManage=await userHasPermission(access.user!.id,"expenses.manage");
 const [expenses,suppliers,jobs,orders]=await Promise.all([
  db.from("expenses").select("id,job_id,supplier_id,supplier_order_id,category,description,amount_ex_tax,tax_amount,total,expense_date,receipt_storage_path,entered_by,approved_by,approved_at,created_at,supplier:suppliers!expenses_supplier_id_fkey(id,name),job:jobs!expenses_job_id_fkey(id,job_number,title),supplierOrder:supplier_orders!expenses_supplier_order_id_fkey(id,order_number,status,total)").eq("business_id",businessId).order("expense_date",{ascending:false}).order("created_at",{ascending:false}).limit(250),
  canManage?db.from("suppliers").select("id,name").eq("business_id",businessId).eq("is_active",true).order("name"):Promise.resolve({data:[],error:null}),
  canManage?db.from("jobs").select("id,job_number,title,status").eq("business_id",businessId).order("created_at",{ascending:false}).limit(100):Promise.resolve({data:[],error:null}),
  canManage?db.from("supplier_orders").select("id,order_number,status,total,supplier_id,job_id").eq("business_id",businessId).in("status",["ordered","part_received","received"]).order("created_at",{ascending:false}).limit(100):Promise.resolve({data:[],error:null})
 ]);
 if(expenses.error||suppliers.error||jobs.error||orders.error)return jsonError("Could not load the expense register.",500);
 const records=await Promise.all((expenses.data??[]).map(async expense=>{
  if(!expense.receipt_storage_path)return {...expense,receipt_url:null};
  const {data}=await db.storage.from("brandon-rv-private").createSignedUrl(expense.receipt_storage_path,300);
  return {...expense,receipt_url:data?.signedUrl??null};
 }));
 return Response.json({expenses:records,suppliers:suppliers.data??[],jobs:jobs.data??[],supplierOrders:orders.data??[],canManage});
}

export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("expenses.manage");if(access.response)return access.response;
 try{
  const body=await request.json(),category=String(body.category??"").trim(),description=String(body.description??"").trim();
  const amount=Number(body.amountExTax),tax=Number(body.taxAmount),total=Number(body.total),date=String(body.expenseDate??"");
  const jobId=body.jobId?String(body.jobId):null,supplierId=body.supplierId?String(body.supplierId):null,orderId=body.supplierOrderId?String(body.supplierOrderId):null;
  if(category.length<2||category.length>80||description.length<3||description.length>500)return jsonError("Enter a category and description.");
  if(![amount,tax,total].every(Number.isFinite)||amount<0||tax<0||total<=0||Math.abs(total-Math.round((amount+tax)*100)/100)>0.005)return jsonError("The total must equal the ex-tax amount plus tax.");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||Number.isNaN(Date.parse(date+"T00:00:00Z")))return jsonError("Enter a valid expense date.");
  if((jobId&&!isUuid(jobId))||(supplierId&&!isUuid(supplierId))||(orderId&&!isUuid(orderId)))return jsonError("Choose valid linked records.");
  const {data,error}=await database().rpc("create_expense",{
   p_business_id:access.membership!.business_id,p_actor_user_id:access.user!.id,p_job_id:jobId,
   p_supplier_id:supplierId,p_supplier_order_id:orderId,p_category:category,p_description:description,
   p_amount_ex_tax:amount,p_tax_amount:tax,p_total:total,p_expense_date:date
  });
  if(error){if(["P0001","P0002"].includes(error.code))return jsonError(error.message??"The selected linked record is not valid.",409);if(error.code==="22023")return jsonError(error.message??"Check the expense details.");return jsonError("Could not record the expense. No changes were made.",500);}
  return Response.json(data,{status:201});
 }catch(error){console.error("Expense creation failed.",error);return jsonError("Could not record the expense.",500);}
}

export async function PATCH(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("expenses.manage");if(access.response)return access.response;
 try{
  const body=await request.json(),id=String(body.id??"");
  if(!isUuid(id)||typeof body.approved!=="boolean")return jsonError("Choose an expense and approval decision.");
  const {data,error}=await database().rpc("review_expense",{p_business_id:access.membership!.business_id,p_expense_id:id,p_actor_user_id:access.user!.id,p_approved:body.approved});
  if(error){if(error.code==="P0002")return jsonError("Expense not found.",404);if(error.code==="P0001")return jsonError(error.message??"This expense cannot be approved.",409);return jsonError("Could not update expense approval.",500);}
  return Response.json(data);
 }catch{return jsonError("Could not update expense approval.",500);}
}
