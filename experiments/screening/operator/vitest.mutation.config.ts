import { defineConfig } from 'vitest/config';
import base from '../../../vitest.config';

const controls={
  authentication:"app.use('*',adminGate);",
  upload_limit:"if(size>OPERATOR_LIMITS.bodyBytes)throw new HTTPException(413,{message:'Screening operator request is too large.'});",
};
const mode=process.env.SCVD_OPERATOR_GUARD_MUTATION;
if(mode!=='authentication'&&mode!=='upload_limit')throw Error('Choose an explicit operator negative control');
const guard=controls[mode];
export default defineConfig({...base,plugins:[{
  name:'operator-negative-control',enforce:'pre',transform(code,id){
    if(!id.endsWith('/operator/gateway.ts'))return null;
    if(!code.includes(guard))throw Error('Negative-control target missing');
    return code.replace(guard,'');
  }
},...(base.plugins??[])]});
