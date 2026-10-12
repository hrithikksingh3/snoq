import { env } from '../config/env.js';

export async function sendSms(to:string, body:string){
  if(!env.TWILIO_ACCOUNT_SID||!env.TWILIO_AUTH_TOKEN||!env.TWILIO_FROM_NUMBER)throw Object.assign(new Error('SMS delivery is not configured'),{status:503});
  const auth=Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64'); const form=new URLSearchParams({To:to,From:env.TWILIO_FROM_NUMBER,Body:body});
  const response=await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`,{method:'POST',headers:{Authorization:`Basic ${auth}`,'Content-Type':'application/x-www-form-urlencoded'},body:form,signal:AbortSignal.timeout(15_000)});
  if(!response.ok)throw Object.assign(new Error('SMS provider rejected the message'),{status:502});
}
