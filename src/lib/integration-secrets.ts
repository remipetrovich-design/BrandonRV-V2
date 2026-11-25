import "server-only";
import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";

function configuredKeys(){
 const current=process.env.INTEGRATIONS_ENCRYPTION_KEY;
 if(!current)throw new Error("INTEGRATIONS_ENCRYPTION_KEY is not configured.");
 const previous=(process.env.INTEGRATIONS_ENCRYPTION_KEY_PREVIOUS??"").split(",").map(value=>value.trim()).filter(Boolean);
 return [current,...previous].map(value=>createHash("sha256").update(value).digest());
}
export function encryptIntegrationSecrets(value:Record<string,string>){
 const [activeKey]=configuredKeys();
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",activeKey,iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
export function decryptIntegrationSecrets(value:string):Record<string,string>{
 if(!value)return {};
 const [version,iv,tag,payload]=value.split(".");
 if(version!=="v1"||!iv||!tag||!payload)throw new Error("Stored integration secret is invalid.");
 const ivBytes=Buffer.from(iv,"base64url"),tagBytes=Buffer.from(tag,"base64url"),payloadBytes=Buffer.from(payload,"base64url");
 for(const candidate of configuredKeys()){
  try{
   const decipher=createDecipheriv("aes-256-gcm",candidate,ivBytes);
   decipher.setAuthTag(tagBytes);
   const decoded=Buffer.concat([decipher.update(payloadBytes),decipher.final()]).toString("utf8");
   const parsed=JSON.parse(decoded);
   if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("Invalid secret payload.");
   return parsed as Record<string,string>;
  }catch{}
 }
 throw new Error("Stored integration credentials could not be decrypted. Set the original INTEGRATIONS_ENCRYPTION_KEY or re-enter every secret field to replace the saved credentials.");
}
