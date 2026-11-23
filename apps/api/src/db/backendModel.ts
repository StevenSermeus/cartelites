import {ConvexHttpClient} from 'convex/browser';
import {makeFunctionReference} from 'convex/server';
export async function assertBackendModel(model:'legacy'|'canonical',url:string){
 if(model==='legacy')return;
 const result=await new ConvexHttpClient(url).query(makeFunctionReference<'query'>('system:deploymentInfo'),{}) as {dataModel?:string;schemaVersion?:number};
 if(result.dataModel!=='canonical'||result.schemaVersion!==1)throw new Error('DATA_MODEL does not match target Convex deployment');
}
