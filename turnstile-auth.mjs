/* Lazily run Cloudflare Turnstile for email OTP operations only.
   The public sitekey is not a secret. Supabase Auth must separately enable
   server-side CAPTCHA verification with the private Turnstile secret.
   Until that configuration is enabled, these tokens are not enforced. */
export const TURNSTILE_SITE_KEY="0x4AAAAAAFzzVZBEpyH7q3YR";
const TURNSTILE_SCRIPT="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let sdkPromise=null;
function getTurnstile(){
 if(!TURNSTILE_SITE_KEY||typeof document==="undefined")return Promise.resolve(null);
 if(globalThis.turnstile)return Promise.resolve(globalThis.turnstile);
 if(sdkPromise)return sdkPromise;
 sdkPromise=new Promise(resolve=>{
  const script=document.createElement("script");
  let done=false;
  const finish=value=>{if(done)return;done=true;clearTimeout(timeout);resolve(value)};
  const timeout=setTimeout(()=>finish(null),6000);
  script.src=TURNSTILE_SCRIPT;script.async=true;
  script.onload=()=>finish(globalThis.turnstile||null);
  script.onerror=()=>finish(null);
  document.head.append(script);
 });
 return sdkPromise;
}
export async function getEmailCaptchaToken(){
 const sdk=await getTurnstile();
 if(!sdk)return null;
 return new Promise(resolve=>{
  const container=document.createElement("div");
  container.className="oghep-turnstile-slot";
  container.setAttribute("aria-label","Security verification");
  document.body.append(container);
  let widget=null,finished=false;
  const finish=token=>{
   if(finished)return;
   finished=true;clearTimeout(timer);
   try{if(widget!==null)sdk.remove(widget)}catch{}
   container.remove();
   resolve(typeof token==="string"&&token?token:null);
  };
  const timer=setTimeout(()=>finish(null),12000);
  try{
   widget=sdk.render(container,{
    sitekey:TURNSTILE_SITE_KEY,
    execution:"execute",
    appearance:"interaction-only",
    callback:finish,
    "error-callback":()=>finish(null),
    "expired-callback":()=>finish(null),
    "timeout-callback":()=>finish(null)
   });
   if(widget===undefined||widget===null)finish(null);
   else sdk.execute(widget);
  }catch{finish(null)}
 });
}
