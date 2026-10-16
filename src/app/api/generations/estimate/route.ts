import { readCredentials, credentialEncryptionKey } from "@/generation/server-credentials";
import { createPlatformClient } from "@/generation/platform";
import { validatePlane } from "@/generation/validate";
import { toPlatform } from "@/generation/to-platform";
import { priceFromResponse } from "@/generation/pricing";
import { signQuote } from "@/server/spend-quotes";
import { guardOrigin,limitCustomer,readJsonBody } from "@/server/request-guard";
import { routeError } from "@/server/route-error";
import { processMedia } from "@/film/server";

export const runtime="nodejs";
export const maxDuration=60;
export async function POST(request:Request) {
  try {
    guardOrigin(request);
    const credentials=await readCredentials();limitCustomer(credentials.apiKey,"estimate",90,600);
    const data=await readJsonBody(request);
    const count=data.count===undefined?1:Number(data.count);
    if(!Number.isInteger(count)||count<1||count>4)throw new Error("Choose between 1 and 4 requests.");
    const {path,body}=toPlatform(validatePlane(data.plane));
    const estimate=await createPlatformClient(credentials).estimate(path,body);
    const videoUrls=[...(typeof body.video_url==="string"?[body.video_url]:[]),...(Array.isArray(body.video_urls)?body.video_urls.filter((url):url is string=>typeof url==="string"):[])];
    let seconds=0;
    for(const url of [...new Set(videoUrls)]) {
      const result=await processMedia({mode:"inspect",clips:[{url,start:0,end:0}]});
      seconds+=result.metadata?.duration??0;
    }
    return Response.json(signQuote(credentialEncryptionKey(),credentials.apiKey,path,body,priceFromResponse(estimate,path,body,seconds),count));
  }catch(error){return routeError(error,"Could not estimate generation cost. No generation was submitted.");}
}
