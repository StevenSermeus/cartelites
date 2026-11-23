/** JSON decoding is asynchronous too: never apply a response to a newer session. */
export async function scopedJson<T>(response:Pick<Response,'json'>,scope:{assertActive:()=>void},fallback?:T):Promise<T> {
  let result:T;
  try {result=await response.json() as T;}
  catch(error){scope.assertActive();if(fallback===undefined)throw error;result=fallback;}
  scope.assertActive();return result;
}
