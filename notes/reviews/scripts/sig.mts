import * as R from "../../../packages/room/src/crypto.ts";
import * as C from "../../../packages/client/src/keys.ts";
const td=new TextDecoder(); const h="sha256:"+"a".repeat(64);
console.log("room ", JSON.stringify(td.decode(R.signingBytes("artroom-entry-v1", R.payloadOf("artroom-entry-v1", h)))).slice(0,40));
console.log("client", JSON.stringify(td.decode(C.signingBytes("artroom-entry-v1", h))).slice(0,40));
const v={a:1,b:[1,"x"]};
console.log("envelope equal:", td.decode(R.signingBytes("artroom-envelope-v1", R.payloadOf("artroom-envelope-v1", v)))===td.decode(C.signingBytes("artroom-envelope-v1", v)));
