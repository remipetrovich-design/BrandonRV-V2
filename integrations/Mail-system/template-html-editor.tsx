"use client";

import {useEffect,useRef,useState} from "react";

type Props={value:string;onChange:(html:string)=>void;disabled?:boolean};
const commands:[string,string,string][]=[
 ["bold","B","Bold"],["italic","I","Italic"],["underline","U","Underline"],
 ["insertUnorderedList","• List","Bulleted list"],["insertOrderedList","1. List","Numbered list"],
 ["formatBlock","H2","Heading"],["justifyLeft","⇤","Align left"],["justifyCenter","↔","Align centre"],["justifyRight","⇥","Align right"]
];

export default function MailHtmlEditor({value,onChange,disabled=false}:Props){
 const editorRef=useRef<HTMLDivElement>(null),fileRef=useRef<HTMLInputElement>(null);
 const [sourceMode,setSourceMode]=useState(false),[source,setSource]=useState(value),[notice,setNotice]=useState("");
 useEffect(()=>{setSource(value);if(editorRef.current&&editorRef.current.innerHTML!==value)editorRef.current.innerHTML=value||"";},[value]);
 function sync(){const html=editorRef.current?.innerHTML||"";setSource(html);onChange(html);}
 function command(name:string,arg?:string){if(disabled||!editorRef.current)return;editorRef.current.focus();document.execCommand(name,false,arg);sync();}
 function insertImage(url:string,alt=""){if(!editorRef.current)return;editorRef.current.focus();document.execCommand("insertHTML",false,'<img src="'+url.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'" alt="'+alt.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'" style="max-width:100%;height:auto" />');sync();}
 async function upload(file?:File){if(!file)return;if(!file.type.startsWith("image/")){setNotice("Choose an image file.");return;}if(file.size>5*1024*1024){setNotice("Images must be 5 MB or smaller.");return;}setNotice("Uploading image…");try{const body=new FormData();body.append("file",file);const response=await fetch("/api/admin/mail-system/assets",{method:"POST",body});const data=await response.json();if(!response.ok)throw new Error(data.error||"Image upload failed.");insertImage(data.url,file.name);setNotice("Image inserted.");}catch(error){setNotice(error instanceof Error?error.message:"Image upload failed.");}finally{if(fileRef.current)fileRef.current.value="";}}
 function insertLink(){const url=window.prompt("Link URL");if(url)command("createLink",url);}
 function insertImageUrl(){const url=window.prompt("Image URL (HTTPS)");if(url&&/^https:\/\//i.test(url))insertImage(url);else if(url)setNotice("Use an HTTPS image URL.");}
 return <section className="mail-html-editor" aria-label="HTML email editor">
  <div className="mail-html-editor__toolbar" style={{display:"flex",gap:6,flexWrap:"wrap",padding:10,border:"1px solid #d9e0ea",borderRadius:"8px 8px 0 0",background:"#f5f7fa"}}>
   {commands.map(([name,label,title])=><button key={name} style={{minWidth:34,padding:"7px 10px",border:"1px solid #d0d7e2",borderRadius:6,background:"#fff",cursor:"pointer"}} type="button" title={title} aria-label={title} disabled={disabled||sourceMode} onMouseDown={e=>e.preventDefault()} onClick={()=>command(name,name==="formatBlock"?"<h2>":undefined)}>{label}</button>)}
   <button style={{padding:"7px 10px",border:"1px solid #d0d7e2",borderRadius:6,background:"#fff"}} type="button" disabled={disabled||sourceMode} onMouseDown={e=>e.preventDefault()} onClick={insertLink}>Link</button>
   <button style={{padding:"7px 10px",border:"1px solid #d0d7e2",borderRadius:6,background:"#fff"}} type="button" disabled={disabled||sourceMode} onMouseDown={e=>e.preventDefault()} onClick={insertImageUrl}>Image URL</button>
   <button style={{padding:"7px 10px",border:"1px solid #d0d7e2",borderRadius:6,background:"#fff"}} type="button" disabled={disabled||sourceMode} onClick={()=>fileRef.current?.click()}>Upload image</button>
   <button style={{padding:"7px 10px",border:"1px solid #d0d7e2",borderRadius:6,background:"#fff"}} type="button" aria-pressed={sourceMode} onClick={()=>{if(!sourceMode){setSource(editorRef.current?.innerHTML||"");setSourceMode(true);}else{if(editorRef.current)editorRef.current.innerHTML=source;onChange(source);setSourceMode(false);}}}>{sourceMode?"Apply HTML":"HTML source"}</button>
   <input ref={fileRef} type="file" accept="image/*" hidden onChange={e=>void upload(e.target.files?.[0])}/>
  </div>
  {sourceMode?<textarea style={{width:"100%",minHeight:360,padding:14,border:"1px solid #d9e0ea",borderRadius:"0 0 8px 8px",fontFamily:"monospace",fontSize:13}} className="mail-html-editor__source" aria-label="HTML source" value={source} disabled={disabled} onChange={e=>setSource(e.target.value)} spellCheck={false}/>:<div style={{minHeight:360,padding:18,border:"1px solid #d9e0ea",borderTop:0,borderRadius:"0 0 8px 8px",background:"#fff",color:"#172033",outline:"none",overflow:"auto"}} ref={editorRef} className="mail-html-editor__canvas" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-label="Email HTML content" aria-multiline="true" onInput={sync} onBlur={sync}/>}
  <div className="mail-html-editor__footer" style={{display:"flex",justifyContent:"space-between",gap:12,padding:"8px 2px",fontSize:12,color:"#667085"}}><span>Rich HTML · images · links · formatting · lists</span><span role="status">{notice}</span></div>
 </section>;
}
