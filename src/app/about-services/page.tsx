import type {Metadata} from "next";
import Link from "next/link";
import PublicSiteBuilder from "@/components/public-site-builder";
import {getPublishedServices,getPublishedServiceAreas,getPublishedSitePage,contentText} from "@/lib/public-site";
export const dynamic="force-dynamic";
export const metadata:Metadata={title:"About & Services",description:"Learn about Brandon RV's mobile caravan and motorhome interior repair and accessory assessments around Tamworth, NSW."};
export default async function AboutServicesPage(){
 const [about,servicesPage,published,areas]=await Promise.all([getPublishedSitePage("about"),getPublishedSitePage("services"),getPublishedServices(),getPublishedServiceAreas()]);
 const hasAboutBuilder=Boolean(about?.content?.builder);const hasServicesBuilder=Boolean(servicesPage?.content?.builder);
 const intro=contentText(about?.content,"intro","Brandon RV provides mobile caravan and motorhome interior repair and accessory assessments around Tamworth, NSW. Each request is checked for scope and suitability before work is offered.");
 const aboutTitle=about?.title??"Experience that understands your setup.";
 const serviceIntro=contentText(servicesPage?.content,"intro","The service list is being finalised. Only services approved for launch will be listed here. Contact Brandon RV to request an assessment.");
 const serviceTitle=contentText(servicesPage?.content,"hero_title","Suitable work, clearly scoped.");
 const items=published.map((item,index)=>({number:String(index+1).padStart(2,"0"),title:item.name,description:item.description??"Contact Brandon RV to discuss this service.",scope_notes:item.scope_notes,price:item.pricing_label||(item.price_from!==null?"From $"+Number(item.price_from).toFixed(2)+" AUD":"")}));
 const aboutWords=aboutTitle.split(/\s+/);const serviceWords=serviceTitle.split(/\s+/);
 const aboutSection=hasAboutBuilder
  ? <PublicSiteBuilder data={about!.content.builder} services={published} areas={areas}/>
  : <><section className="page-hero"><div className="shell"><p className="eyebrow"><span className="eyebrow-line"/> ABOUT BRANDON RV</p><h1>{aboutWords.slice(0,-2).join(" ")} <em>{aboutWords.slice(-2).join(" ")}</em></h1><p>{intro}</p></div></section>
    <section className="content-section"><div className="shell about-grid"><aside className="about-aside"><strong>From Factory Experience to Repairs On The Go.</strong><p>Interior repairs and accessories · Tamworth NSW</p></aside><div className="about-copy"><h2>A practical approach to interior repairs and accessories.</h2><p>Brandon RV brings practical caravan and motorhome industry experience to suitable non-structural interior repair and accessory work.</p><p>Tell us what you need, provide the vehicle details and photographs where possible, and we will assess scope and suitability before discussing the next step.</p></div></div></section></>;
 const servicesSection=hasServicesBuilder
  ? <PublicSiteBuilder data={servicesPage!.content.builder} services={published} areas={areas}/>
  : <section className="content-section brv-combined-services"><div className="shell"><div className="section-heading"><div><p className="eyebrow"><span className="eyebrow-line"/> OUR SERVICES</p><h2>{serviceWords.slice(0,-2).join(" ")} <em>{serviceWords.slice(-2).join(" ")}</em></h2></div><p className="section-lead">{serviceIntro}</p></div>
    {items.length?<div className="detail-list">{items.map(item=><article className="detail-item" key={item.number}><span>{item.number}</span><h2>{item.title}</h2><p>{item.description}</p>{item.price&&<strong className="service-price">{item.price}</strong>}{item.scope_notes&&<small className="service-scope-note">{item.scope_notes}</small>}</article>)}</div>:<p>Service information is being finalised. Send an assessment request and we will confirm whether the job is suitable.</p>}
    <div className="section-link-row"><Link href="/request-quote" className="text-link">Ask about a job <span aria-hidden="true">→</span></Link></div></div></section>;
 return <main>{aboutSection}{servicesSection}</main>;
}
