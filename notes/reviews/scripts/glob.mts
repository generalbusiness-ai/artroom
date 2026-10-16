import * as P from "../../../packages/policy/src/glob.ts";
import * as R from "../../../packages/room/src/glob.ts";
for (const g of ["src/a**","**x/y","a/"+"b".repeat(300), "src/**", 7]) console.log(JSON.stringify(g).slice(0,20), "policy:",P.globProblem(g),"| room:",R.globProblem(g));
