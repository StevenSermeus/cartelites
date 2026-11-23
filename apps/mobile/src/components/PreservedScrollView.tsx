import {useLayoutEffect,useRef,type ComponentProps,type ComponentRef} from 'react';
import {ScrollView} from 'react-native';
import {ScrollPositions,ScrollRestoration} from '../navigation/scrollPositions';

/** Restore this scene's own native node after layout, never the previous route's ref. */
export function PreservedScrollView({positionKey,active,positions,onActiveRef,...props}:ComponentProps<typeof ScrollView>&{
  positionKey:string;active:boolean;positions:ScrollPositions;onActiveRef:(node:ComponentRef<typeof ScrollView>)=>void;
}) {
  const node=useRef<ComponentRef<typeof ScrollView>>(null),restoration=useRef(new ScrollRestoration(positions,positionKey));
  const laidOut=useRef(false);
  const frame=useRef<ReturnType<typeof requestAnimationFrame>|undefined>(undefined);
  const activeRef=useRef(onActiveRef);activeRef.current=onActiveRef;
  function restore(){
    if(!active||!node.current||!laidOut.current)return;
    activeRef.current(node.current);
    const target=restoration.current.target();if(target===undefined)return;
    node.current.scrollTo({y:target,animated:false});
    if(frame.current!==undefined)cancelAnimationFrame(frame.current);
    frame.current=requestAnimationFrame(()=>{restoration.current.restored();});
  }
  useLayoutEffect(()=>{
    if(active){restoration.current.activate(positionKey);restore();}
    return()=>{if(frame.current!==undefined)cancelAnimationFrame(frame.current);};
  },[active,positionKey,positions]);
  return <ScrollView {...props} ref={node}
    onLayout={event=>{laidOut.current=true;restore();props.onLayout?.(event);}}
    onContentSizeChange={(width,height)=>{restore();props.onContentSizeChange?.(width,height);}}
    onScroll={event=>{restoration.current.record(event.nativeEvent.contentOffset.y,active);props.onScroll?.(event);}}
  />;
}
