import {spawn} from "node:child_process";
import {createInterface} from "node:readline";

export async function runCommand(command,args,{env=process.env,redact=[],write=(line)=>process.stdout.write(line)}={}){
 const child=spawn(command,args,{env,stdio:["inherit","pipe","pipe"]});
 const pipe=async(stream)=>{
  const lines=createInterface({input:stream,crlfDelay:Infinity});
  for await(const line of lines){
   let safe=line;
   for(const secret of redact){if(secret)safe=safe.replaceAll(secret,"[redacted]");}
   write(safe+"\n");
  }
 };
 const exit=new Promise((resolve,reject)=>{
  child.once("error",reject);
  child.once("close",code=>resolve(code??1));
 });
 const streams=Promise.all([pipe(child.stdout),pipe(child.stderr)]);
 const [code]=await Promise.all([exit,streams]);
 return code;
}
