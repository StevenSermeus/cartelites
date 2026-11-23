export type ShareScope={assertActive:()=>void};
export type ShareIO={available:()=>Promise<boolean>;create:(directory:string)=>Promise<void>;write:(uri:string,content:string)=>Promise<void>;share:(uri:string)=>Promise<void>;remove:(directory:string)=>Promise<void>};
/** Only a caller-owned temporary directory is touched; bytes and exported basename stay unchanged. */
export async function shareScopedFile(scope:ShareScope,directory:string,filename:string,content:string,io:ShareIO) {
  scope.assertActive();const available=await io.available();scope.assertActive();
  if(!available)throw new Error('Le partage de fichiers est indisponible.');
  try{
    await io.create(directory);scope.assertActive();
    await io.write(directory+filename,content);scope.assertActive();
    await io.share(directory+filename);scope.assertActive();
  }finally{await io.remove(directory).catch(()=>undefined);}
}
