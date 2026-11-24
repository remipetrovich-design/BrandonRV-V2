import {randomUUID} from "node:crypto";
import {authorizePermission,database,jsonError,sameOrigin} from "@/lib/auth";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const BUCKET="mail-template-assets";
const MAX_BYTES=5*1024*1024;
const TYPES=new Set(["image/png","image/jpeg","image/gif","image/webp","image/svg+xml"]);
export async function POST(request:Request){
 if(!sameOrigin(request))return jsonError("Invalid request origin.",403);
 const access=await authorizePermission("integrations.manage");if(access.response)return access.response;
 try{
  const form=await request.formData(),file=form.get("file");
  if(!(file instanceof File))return jsonError("Choose an image to upload.",400);
  if(!TYPES.has(file.type))return jsonError("Supported image formats: PNG, JPEG, GIF, WebP and SVG.",415);
  if(file.size<=0||file.size>MAX_BYTES)return jsonError("Images must be between 1 byte and 5 MB.",413);
  const db=database(),storage=db.storage;
  const bucket=await storage.getBucket(BUCKET);
  if(bucket.error&&bucket.error.message?.toLowerCase().includes("not found")){
   const created=await storage.createBucket(BUCKET,{public:true,fileSizeLimit:MAX_BYTES,allowedMimeTypes:[...TYPES]});
   if(created.error)throw created.error;
  }else if(bucket.error)throw bucket.error;
  const ext=({ "image/png":"png","image/jpeg":"jpg","image/gif":"gif","image/webp":"webp","image/svg+xml":"svg"} as Record<string,string>)[file.type];
  const path=randomUUID()+"."+ext;
  const uploaded=await storage.from(BUCKET).upload(path,await file.arrayBuffer(),{contentType:file.type,upsert:false,cacheControl:"31536000"});
  if(uploaded.error)throw uploaded.error;
  const {data}=storage.from(BUCKET).getPublicUrl(path);
  return Response.json({url:data.publicUrl});
 }catch(error){return jsonError(error instanceof Error?error.message:"Image upload failed.",500);}
}
