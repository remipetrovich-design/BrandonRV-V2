import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
import {isUuid} from "@/lib/api-validation.mjs";
export const runtime="nodejs";
const bucket="brandon-rv-private";
const allowedTypes:Record<string,string>={"application/pdf":"pdf","image/jpeg":"jpg","image/png":"png","image/webp":"webp"};
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("expenses.manage");if(access.response)return access.response;
 const {id}=await params;if(!isUuid(id))return jsonError("Expense not found.",404);
 try{
  const form=await request.formData(),file=form.get("file");
  if(!(file instanceof File))return jsonError("Choose a receipt file.");
  const extension=allowedTypes[file.type];if(!extension)return jsonError("Receipts must be PDF, JPEG, PNG or WebP files.");
  if(file.size<1||file.size>10*1024*1024)return jsonError("Receipt files must be no larger than 10 MB.");
  const db=database(),businessId=access.membership!.business_id;
  const {data:expense,error:lookupError}=await db.from("expenses").select("id,receipt_storage_path").eq("id",id).eq("business_id",businessId).maybeSingle();
  if(lookupError||!expense)return jsonError("Expense not found.",404);
  const path=businessId+"/expenses/"+id+"/"+crypto.randomUUID()+"."+extension;
  const {error:uploadError}=await db.storage.from(bucket).upload(path,await file.arrayBuffer(),{contentType:file.type,upsert:false});
  if(uploadError)return jsonError("Could not upload the receipt.",500);
  const {error:saveError}=await db.rpc("set_expense_receipt_path",{p_business_id:businessId,p_expense_id:id,p_actor_user_id:access.user!.id,p_storage_path:path});
  if(saveError){await db.storage.from(bucket).remove([path]);return jsonError("Could not attach the receipt to this expense.",500);}
  if(expense.receipt_storage_path)await db.storage.from(bucket).remove([expense.receipt_storage_path]);
  const {data:signed}=await db.storage.from(bucket).createSignedUrl(path,300);
  return Response.json({success:true,receiptUrl:signed?.signedUrl??null});
 }catch(error){console.error("Expense receipt upload failed.",error);return jsonError("Could not upload the receipt.",500);}
}
