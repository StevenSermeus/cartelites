/** Back changes only the visible step; caller-owned inputs and queued operations stay untouched. */
export function creationBackTarget(step:number,busy:boolean,committed=false):{kind:'blocked'}|{kind:'close'}|{kind:'step';step:number} {
  if(busy)return {kind:'blocked'};
  if(committed||step<=0)return {kind:'close'};
  return {kind:'step',step:step-1};
}
