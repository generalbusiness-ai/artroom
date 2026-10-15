/** Read-only page evidence. A match concerns rendered text at one observed published commit, never the push's outcome. */
import { expectedPage, type PageText, type ScopePointer, type Thing } from "../shelf.ts";
export type PublishedPage = { status:"matches"|"differs"; commit:string; url:string } | {status:"unreadable"; reason:string};
export async function readPage(origin: string, directory: string, thing: Thing, scope: ScopePointer, signal?: AbortSignal): Promise<PublishedPage> {
 const base = `${origin}/site/${encodeURIComponent(directory)}/`;
 try {
  const response=await fetch(`${base}HEAD/${thing.page.split("/").map(encodeURIComponent).join("/")}`,{cache:"no-store",redirect:"error",...(signal ? {signal} : {})});
  if(!response.ok) return {status:"unreadable",reason:`The published page could not be read (${response.status}).`};
  if(!response.headers.get("content-type")?.startsWith("text/html")) return {status:"unreadable",reason:"The site did not answer with a page."};
  const text=await response.text();
  if(text.length>128*1024) return {status:"unreadable",reason:"The published page is too large to compare."};
  // Template content stays inert: the site's styles and embedded resources never apply here.
  const template=document.createElement("template"); template.innerHTML=text;
  const doc=template.content, main=doc.querySelector("main"), commit=doc.querySelector("footer > code")?.textContent ?? "";
  if(!main || !/^[0-9a-f]{40}$/.test(commit)) return {status:"unreadable",reason:"The site did not identify the rendered commit."};
  const expected=expectedPage(thing,scope), children=[...main.children];
  const tags=children.map(c=>c.tagName).join(","), allowed=expected.description ? "H1,P,UL" : "H1,UL";
  const seen:PageText={title:main.querySelector("h1")?.textContent??"",description:main.querySelector("p")?.textContent??"",lines:[...main.querySelectorAll("ul > li")].map(li=>li.textContent??"")};
  const matches=tags===allowed && seen.title===expected.title && seen.description===expected.description && seen.lines.length===3 && seen.lines.every((line,i)=>line===expected.lines[i]);
  return {status:matches ? "matches" : "differs",commit,url:`${base}${commit}/${thing.page.split("/").map(encodeURIComponent).join("/")}`};
 }catch{return {status:"unreadable",reason:"The published page could not be read. Its status is unknown."};}
}
