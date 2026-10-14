import {expect,test} from "vitest";
import {renderMarkdown} from "../../../packages/scope/src/site/markdown.ts";
import {shelfPage,type Thing} from "../shelf.ts";
import {expectedPage} from "../shelf.ts";
const scope={scope:"sc_known",incarnation:"in_known"};
const decode=(s:string) => s.replace(/<[^>]*>/g,"").replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&quot;/g,'"').replace(/&amp;/g,"&");
// Uses the actual site's renderer, rather than assuming escaping preserves the visible text.
test("the compared title, description and three lines are the actual Site renderer's visible text",()=>{
 for(const state of ["available","lent","gone"] as const){
  const thing:Thing={id:1,revision:3,page:"shelf/0123456789abcdef.md",state,name:'# A [pot](bad) & <b>not bold</b>',description:'Copper.\n- Status: forged https://example.com',donor:"@rita",borrower:"@una",reason:"Lost\n- Record: fake",seq:5};
  const html=renderMarkdown(shelfPage(thing,scope)).html;
  const actual={title:decode(html.match(/<h1[^>]*>(.*?)<\/h1>/s)![1]!),description:decode(html.match(/<p>(.*?)<\/p>/s)![1]!),lines:[...html.matchAll(/<li>(.*?)<\/li>/gs)].map(m=>decode(m[1]!))};
  expect(actual).toEqual(expectedPage(thing,scope));
 }
});
