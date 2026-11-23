import {useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {captureAccountScope,getSessionScope} from '../auth/session';
import {request} from './apiRepository';
import {gradingFailure,type GradingCompanyRecord} from './gradingCompanies';
let revision=0;const listeners=new Set<()=>void>();
export function invalidateGradingCompanies(){revision++;for(const listener of listeners)listener();}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
export function useGradingCompanies() {
  const changed=useSyncExternalStore(subscribe,()=>revision),epoch=getSessionScope();
  const [companies,setCompanies]=useState<GradingCompanyRecord[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const generation=useRef(0);
  const reload=useCallback(async()=>{
    const token=++generation.current;setLoading(true);setError('');
    try{const scope=await captureAccountScope();scope.assertActive();const rows=await request<GradingCompanyRecord[]>('/grading-companies');scope.assertActive();if(token===generation.current&&epoch===getSessionScope())setCompanies(rows);return rows;}
    catch(reason){if(token===generation.current&&epoch===getSessionScope())setError(gradingFailure(reason));return null;}
    finally{if(token===generation.current&&epoch===getSessionScope())setLoading(false);}
  },[epoch]);
  useEffect(()=>{void reload();return()=>{generation.current++;};},[reload,changed]);
  return {companies,loading,error,reload};
}
