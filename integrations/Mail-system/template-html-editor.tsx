"use client";

import {useEffect,useRef,useState} from "react";

type Props={value:string;onChange:(html:string)=>void;disabled?:boolean};
type Command={name:string;label:string;title:string;arg?:string};
const commands:Command[]=[
 {name:"bold",label:"B",title:"Bold"},{name:"italic",label:"I",title:"Italic"},{name:"underline",label:"U",title:"Underline"},
 {name:"strikeThrough",label:"S",title:"Strikethrough"},{name:"insertUnorderedList",label:"• List",title:"Bulleted list"},
 {name:"insertOrderedList",label:"1. List",title:"Numbered list"},{name:"indent",label:"Indent",title:"Indent"},
 {name:"outdent",label:"Outdent",title:"Outdent"},{name:"justifyLeft",label:"⇤",title:"Align left"},
 {name:"justifyCenter",label:"↔",title:"Align centre"},{name:"justifyRight",label:"⇥",title:"Align right"},
 {name:"justifyFull",label:"Justify",title:"Justify"},{name:"undo",label:"↶",title:"Undo"},
 {name:"redo",label:"↷",title:"Redo"},{name:"removeFormat",label:"Clear",title:"Clear formatting"}
];
const buttonStyle:React.CSSProperties={border:"1px solid #d5dbe3",background:"#fff",borderRadius:5,padding:"7px 9px",fontSize:12,cursor:"pointer",color:"#182230"};
export default function MailHtmlEditor({value,onChange,disabled=false}:Props){
 const editorRef=useRef<HTMLDivElement>(null),fileRef=useRef<HTMLInputElement>(null);
 const [sourceMode,setSourceMode]=useState(false),[source,setSource]=useState(value),[notice,setNotice]=useState("");
 useEffect(()=>{setSource(value);if(editorRef.current&&editorRef.current.innerHTML!==value)editorRef.current.innerHTML=value||"";},[value]);
 function sync(){const html=editorRef.current?.innerHTML||"";setSource(html);onChange(html);}
 function command(name:string,arg?:string){if(disabled||!editorRef.current)return;editorRef.current.focus();document.execCommand(name,false,arg);sync();}
 function insertHtml(html:string){if(disabled||!editorRef.current)return;editorRef.current.focus();document.execCommand("insertHTML",false,html);sync();}
 function safe(value:string){return value.replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
 function insertImage(url:string,alt=""){if(!/^https:\/\//i.test(url)){setNotice("Image URLs must use HTTPS.");return;}insertHtml('<img src="'+safe(url)+'" alt="'+safe(alt)+'" style="display:block;max-width:100%;height:auto;margin:12px 0" />');}
 async function upload(file?:File){if(!file)return;if(!file.type.startsWith("image/")){setNotice("Choose an image file.");return;}if(file.size>5*1024*1024){setNotice("Images must be 5 MB or smaller.");return;}setNotice("Uploading image…");try{const body=new FormData();body.append("file",file);const response=await fetch("/api/admin/mail-system/assets",{method:"POST",body});const data=await response.json();if(!response.ok)throw new Error(data.error||"Image upload failed.");insertImage(data.url,file.name);setNotice("Image uploaded and inserted.");}catch(error){setNotice(error instanceof Error?error.message:"Image upload failed.");}finally{if(fileRef.current)fileRef.current.value="";}}
 function promptLink(){const url=window.prompt("Enter an HTTPS link URL");if(url){if(!/^https:\/\//i.test(url)){setNotice("Links must use HTTPS.");return;}command("createLink",url);}}
 function promptImage(){const url=window.prompt("Enter an HTTPS image URL");if(url)insertImage(url);}
 function insertButton(){const label=window.prompt("Button text","View details");const url=window.prompt("Button destination (HTTPS URL)");if(label&&url&&/^https:\/\//i.test(url))insertHtml('<p style="margin:20px 0"><a href="'+safe(url)+'" style="display:inline-block;padding:12px 20px;background:#173b63;color:#ffffff;text-decoration:none;border-radius:5px;font-weight:600">'+safe(label)+'</a></p>');else if(url)setNotice("Button destinations must use HTTPS.");}
 function insertTable(){const rows=Math.max(1,Math.min(10,Number(window.prompt("Number of rows","2"))||2));const cols=Math.max(1,Math.min(6,Number(window.prompt("Number of columns","2"))||2));const cells=Array.from({length:rows},()=>"<tr>"+Array.from({length:cols},()=>'<td style="border:1px solid #d5dbe3;padding:8px">&nbsp;</td>').join("")+"</tr>").join("");insertHtml('<table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0"><tbody>'+cells+"</tbody></table><p></p>");}
 function selectCommand(name:string,value:string){command(name,value);}
 return <section className="mail-html-editor" aria-label="HTML email editor" style={{border:"1px solid #cbd3dd",borderRadius:8,overflow:"hidden",background:"#fff",color:"#172033"}}>
  <div style={{padding:9,display:"flex",flexWrap:"wrap",gap:6,borderBottom:"1px solid #dce2e9",background:"#f5f7fa"}}>
   <select aria-label="Text style" disabled={disabled||sourceMode} defaultValue="P" onChange={e=>selectCommand("formatBlock","<"+e.target.value.toLowerCase()+">")} style={buttonStyle}><option value="P">Paragraph</option><option value="H1">Heading 1</option><option value="H2">Heading 2</option><option value="H3">Heading 3</option><option value="BLOCKQUOTE">Quote</option><option value="PRE">Preformatted</option></select>
   <select aria-label="Font family" disabled={disabled||sourceMode} defaultValue="" onChange={e=>e.target.value&&selectCommand("fontName",e.target.value)} style={buttonStyle}><option value="">Font</option><option>Arial</option><option>Georgia</option><option>Tahoma</option><option>Verdana</option><option>Trebuchet MS</option><option>Times New Roman</option></select>
   <select aria-label="Font size" disabled={disabled||sourceMode} defaultValue="" onChange={e=>e.target.value&&selectCommand("fontSize",e.target.value)} style={buttonStyle}><option value="">Size</option><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">XL</option><option value="6">XXL</option></select>
   {commands.map(item=><button key={item.name} type="button" title={item.title} aria-label={item.title} disabled={disabled||sourceMode} onMouseDown={e=>e.preventDefault()} onClick={()=>command(item.name,item.arg)} style={buttonStyle}>{item.label}</button>)}
   <label title="Text colour" style={{...buttonStyle,display:"inline-flex",alignItems:"center",gap:5}}>Text <input type="color" aria-label="Text colour" disabled={disabled||sourceMode} onChange={e=>command("foreColor",e.target.value)} style={{width:22,height:20,border:0,padding:0}}/></label>
   <label title="Highlight colour" style={{...buttonStyle,display:"inline-flex",alignItems:"center",gap:5}}>Highlight <input type="color" aria-label="Highlight colour" disabled={disabled||sourceMode} defaultValue="#fff2a8" onChange={e=>command("hiliteColor",e.target.value)} style={{width:22,height:20,border:0,padding:0}}/></label>
   <button type="button" disabled={disabled||sourceMode} onMouseDown={e=>e.preventDefault()} onClick={promptLink} style={buttonStyle}>Insert link</button>
   <button type="button" disabled={disabled||sourceMode} onClick={promptImage} style={buttonStyle}>Image URL</button>
   <button type="button" disabled={disabled||sourceMode} onClick={()=>fileRef.current?.click()} style={buttonStyle}>Upload image</button>
   <button type="button" disabled={disabled||sourceMode} onClick={insertButton} style={buttonStyle}>Email button</button>
   <button type="button" disabled={disabled||sourceMode} onClick={insertTable} style={buttonStyle}>Table</button>
   <button type="button" disabled={disabled||sourceMode} onClick={()=>insertHtml("<hr style='border:0;border-top:1px solid #d5dbe3;margin:20px 0' />")} style={buttonStyle}>Divider</button>
   <button type="button" aria-pressed={sourceMode} onClick={()=>{if(!sourceMode){setSource(editorRef.current?.innerHTML||"");setSourceMode(true);}else{if(editorRef.current)editorRef.current.innerHTML=source;onChange(source);setSourceMode(false);}}} style={{...buttonStyle,background:sourceMode?"#e5edf7":"#fff"}}>{sourceMode?"Apply HTML":"HTML source"}</button>
   <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/gif,image/webp," hidden onChange={e=>void upload(e.target.files?.[0])}/>
  </div>
  {sourceMode?<textarea className="mail-html-editor__source" aria-label="HTML source" value={source} disabled={disabled} onChange={e=>{setSource(e.target.value);onChange(e.target.value);}} spellCheck={false} style={{display:"block",width:"100%",minHeight:420,padding:16,border:0,resize:"vertical",fontFamily:"monospace",fontSize:13,color:"#172033"}}/>:<div ref={editorRef} className="mail-html-editor__canvas" contentEditable={!disabled} suppressContentEditableWarning role="textbox" aria-label="Email HTML content" aria-multiline="true" onInput={sync} onBlur={sync} style={{minHeight:420,padding:24,outline:"none",lineHeight:1.6,color:"#202a38",fontFamily:"Arial,sans-serif",overflowWrap:"anywhere"}}/>}
  <div style={{padding:"8px 12px",display:"flex",justifyContent:"space-between",gap:8,flexWrap:"wrap",borderTop:"1px solid #dce2e9",background:"#f8fafc",fontSize:12,color:"#596579"}}><span>Rich HTML editor · formatting · colours · tables · buttons · images · raw HTML</span><span role="status">{notice}</span></div>
 </section>;
}
