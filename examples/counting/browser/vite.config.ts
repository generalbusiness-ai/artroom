import { defineConfig } from "vite";
const repository=new URL("../../../",import.meta.url).pathname;
const source=(path:string)=>`${repository}packages/${path}`;
export default defineConfig({root:new URL(".",import.meta.url).pathname,resolve:{alias:[
  {find:"@generalbusiness/artroom-client",replacement:source("client/src/index.ts")},
  {find:"@generalbusiness/artroom-bytes",replacement:source("bytes/src/index.ts")},
  {find:"@generalbusiness/artroom-contract",replacement:source("contract/src/index.ts")},
]},server:{host:"127.0.0.1",fs:{allow:[repository]}},build:{outDir:new URL("../browser-build/",import.meta.url).pathname,emptyOutDir:true}});
