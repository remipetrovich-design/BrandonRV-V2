import {notFound} from "next/navigation";
import JobcardDetailPage from "../page";
export const dynamic="force-dynamic";
const tabs=["request","quotes","work-progress","messages"] as const;
export default async function JobcardTabPage({params,searchParams}:{params:Promise<{id:string;tab:string}>;searchParams?:Promise<{notice?:string}>}){
 const {id,tab}=await params;
 if(!tabs.includes(tab as typeof tabs[number]))notFound();
 return JobcardDetailPage({params:Promise.resolve({id}),searchParams,tab});
}
