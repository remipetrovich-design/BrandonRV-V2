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
  <div className="mail-html-editor__toolbar">
   {commands.map(([name,label,title])=><button key={name} type="button" title={title} aria-label={title} disabled={disabled||sourceMode} onMouseDown={e=>e.preventDefault()} onClick={()=>command(name,name==="formatBlock"?"<h2>":undefined)}>{label}</button>)}
   <button type="button" disabled={disabled||sourceMode} onMouseDown={e=>e.preventDefault()} onClick={insertLink}>Link</button>
   <button type="button" disabled={disabled||sourceMode} onMouseDown={e=>e.preventDefault()} onClick={insertImageUrl}>Image URL</button>
   <button type="button" disabled={disabled||sourceMode} onClick={()=>fileRef.current?.click()}>Upload image</button>
   <button type="button" aria-pressed={sourceMode} onClick={()=>{if(!sourceMode){setSource(editorRef.current?.innerHTML||"");setSourceMode(true);}else{if(editorRef.current)editorRef.current.innerHTML=source;onChange(source);setSourceMode(false);}}}>{sourceMode?"Apply HTML":"HTML source"}</button>
   <input ref={fileRef} type="file" accept="image/*" hidden onChange={e=>void upload(e.target.files?.[0])}/>
  </div>
  {sourceMode?<textarea className="mail-html-editor__source" aria-label="HTML source" value={source} disabled={disabled} onChange={e=>setSource(e.target.value)} spellCheck={false}/>:<div ref={editorRef} className="mail-html-editor__canvas" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-label="Email HTML content" aria-multiline="true" onInput={sync} onBlur={sync}/>}
  <div className="mail-html-editor__footer"><span>Rich HTML · images · links · formatting · lists</span><span role="status">{notice}</span></div>
 </section>;
}
