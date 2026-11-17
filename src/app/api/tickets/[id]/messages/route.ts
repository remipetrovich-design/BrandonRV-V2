import {currentUser,currentMembership,database,userHasPermission,jsonError,sameOrigin,digest} from "@/lib/auth";
export const runtime="nodejs";
const bucket="brandon-rv-private";
const allowedTypes=new Set(["image/jpeg","image/png","image/webp","application/pdf"]);
async function accessFor(request:Request,id:string){
 const db=database();const {data:enquiry,error}=await db.from("enquiries").select("id,business_id,user_id,customer_id,contact_name,email,request_type,guest_access_token_hash,guest_access_expires_at").eq("id",id).maybeSingle();
 if(error||!enquiry||!["public_enquiry","general_enquiry","customer_enquiry","quote_request"].includes(enquiry.request_type))return {db,enquiry:null,mode:null as string|null,user:null};
 const user=await currentUser(),staffRequested=new URL(request.url).searchParams.get("view")==="staff";
 if(user&&staffRequested){const membership=await currentMembership(user.id);if(membership?.business_id===enquiry.business_id&&(await userHasPermission(user.id,"enquiries.view")))return {db,enquiry,mode:"staff",user};}
 if(user&&enquiry.user_id===user.id)return {db,enquiry,mode:"customer",user};
 if(user){const membership=await currentMembership(user.id);if(membership?.business_id===enquiry.business_id&&(await userHasPermission(user.id,"enquiries.view")))return {db,enquiry,mode:"staff",user};}
 const token=new URL(request.url).searchParams.get("guestToken")??request.headers.get("x-guest-access-token")??"";
 if(!enquiry.user_id&&token&&enquiry.guest_access_token_hash===digest(token)&&enquiry.guest_access_expires_at&&Date.parse(enquiry.guest_access_expires_at)>Date.now())return {db,enquiry,mode:"guest",user:null};
 return {db,enquiry:null,mode:null,user};
}
async function withAttachments(db:any,messages:any[]){
 const ids=messages.map(message=>message.id);if(!ids.length)return messages;
 const {data:files}=await db.from("ticket_message_attachments").select("id,message_id,file_name,mime_type,size_bytes,storage_path,created_at").in("message_id",ids);
 const grouped=new Map<string,any[]>();
 for(const file of files??[]){const {data:signed}=await db.storage.from(bucket).createSignedUrl(file.storage_path,300);const list=grouped.get(file.message_id)??[];list.push({id:file.id,file_name:file.file_name,mime_type:file.mime_type,size_bytes:file.size_bytes,url:signed?.signedUrl??null});grouped.set(file.message_id,list);}
 return messages.map(message=>({...message,attachments:grouped.get(message.id)??[]}));
}
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){
 const {id}=await params;const access=await accessFor(request,id);if(!access.enquiry||!access.mode)return jsonError("Ticket not found or access expired.",404);
 let query=access.db.from("customer_messages").select("id,sender_type,sender_user_id,guest_name,message,is_internal,created_at").eq("enquiry_id",id).order("created_at",{ascending:true});
 if(access.mode!=="staff")query=query.eq("is_internal",false);
 const {data,error}=await query;if(error)return jsonError("Could not load ticket messages.",500);
 return Response.json({messages:await withAttachments(access.db,data??[]),mode:access.mode,viewerUserId:access.user?.id??null});
}
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const {id}=await params,access=await accessFor(request,id);if(!access.enquiry||!access.mode)return jsonError("Ticket not found or access expired.",404);
 if(access.mode==="staff"&&(!access.user||!(await userHasPermission(access.user.id,"enquiries.manage"))))return jsonError("You do not have permission to reply to this ticket.",403);
 let body:any={},files:File[]=[];
 try{
  const contentType=request.headers.get("content-type")??"";
  if(contentType.includes("multipart/form-data")){const form=await request.formData();body.message=form.get("message")??"";body.isInternal=form.get("isInternal")==="true";files=form.getAll("files").filter((value):value is File=>value instanceof File&&value.size>0);}
  else body=await request.json();
  const message=String(body.message??"").trim(),isInternal=access.mode==="staff"&&body.isInternal===true;
  if(message.length>5000||(!message&&!files.length))return jsonError("Enter a message up to 5,000 characters or attach a file.");
  if(files.length>5||files.some(file=>!allowedTypes.has(file.type)||file.size>10*1024*1024))return jsonError("Attach up to five JPEG, PNG, WebP or PDF files under 10 MB each.");
  const enquiry=access.enquiry,user=access.user;
  const {data:record,error}=await access.db.from("customer_messages").insert({business_id:enquiry.business_id,customer_id:enquiry.user_id??null,user_id:enquiry.user_id??null,enquiry_id:enquiry.id,sender_type:access.mode==="staff"?"staff":"customer",sender_user_id:user?.id??null,guest_name:access.mode==="guest"?enquiry.contact_name:null,guest_email:access.mode==="guest"?enquiry.email:null,message:message||"Attachment",is_internal:isInternal}).select("id,sender_type,sender_user_id,guest_name,message,is_internal,created_at").single();
  if(error||!record)return jsonError("Could not send your message.",500);
  const uploaded:string[]=[];
  for(const file of files){
   const safeName=file.name.replace(/[^a-zA-Z0-9._-]/g,"_").slice(-100)||"attachment";
   const path=enquiry.business_id+"/enquiries/"+enquiry.id+"/messages/"+record.id+"/"+crypto.randomUUID()+"-"+safeName;
   const {error:uploadError}=await access.db.storage.from(bucket).upload(path,file,{contentType:file.type,upsert:false});
   if(uploadError){await access.db.storage.from(bucket).remove(uploaded);await access.db.from("customer_messages").delete().eq("id",record.id);return jsonError("Could not upload message attachments. The message was rolled back.",500);}
   uploaded.push(path);
   const {error:insertError}=await access.db.from("ticket_message_attachments").insert({business_id:enquiry.business_id,enquiry_id:enquiry.id,message_id:record.id,storage_path:path,file_name:file.name.slice(0,180),mime_type:file.type,size_bytes:file.size,uploaded_by:user?.id??null});
   if(insertError){await access.db.storage.from(bucket).remove(uploaded);await access.db.from("ticket_message_attachments").delete().eq("message_id",record.id);await access.db.from("customer_messages").delete().eq("id",record.id);return jsonError("Could not save attachment details. The message was rolled back.",500);}
  }
  await access.db.from("audit_events").insert({business_id:enquiry.business_id,actor_user_id:user?.id??null,action:isInternal?"ticket.internal_note_added":"ticket.message_sent",entity_type:"enquiry",entity_id:enquiry.id,details:{message_id:record.id,attachment_count:files.length}});
  const [messageRecord]=await withAttachments(access.db,[record]);
  return Response.json({message:messageRecord},{status:201});
 }catch{return jsonError("Could not send your message.",500);}
}