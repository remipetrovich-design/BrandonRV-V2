import "server-only";
import {createCipheriv,createDecipheriv,createHash,randomBytes} from "node:crypto";
const key=()=>{const secret=process.env.INTEGRATIONS_ENCRYPTION_KEY;if(!secret)throw new Error("INTEGRATIONS_ENCRYPTION_KEY is not configured.");return createHash("sha256").update(secret).digest();};
export function encryptIntegrationSecrets(value:Record<string,string>){
 const iv=randomBytes(12),cipher=createCipheriv("aes-256-gcm",key(),iv);
 const encrypted=Buffer.concat([cipher.update(JSON.stringify(value),"utf8"),cipher.final()]);
 return ["v1",iv.toString("base64url"),cipher.getAuthTag().toString("base64url"),encrypted.toString("base64url")].join(".");
}
export function decryptIntegrationSecrets(value:string):Record<string,string>{
 if(!value)return {};
 const [version,iv,tag,payload]=value.split(".");
 if(version!=="v1"||!iv||!tag||!payload)throw new Error("Stored integration secret is invalid.");
 const decipher=createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64url"));
 decipher.setAuthTag(Buffer.from(tag,"base64url"));
 return JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload,"base64url")),decipher.final()]).toString("utf8"));
}
