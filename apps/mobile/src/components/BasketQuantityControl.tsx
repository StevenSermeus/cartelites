import {Pressable,Text,View} from 'react-native';
import {basketQuantity} from '../data/basketQuantity';
import {useTheme} from '../theme/ThemeProvider';
/** Both status labels and the stock's full digit width reserve space at the current Dynamic Type size. */
export function BasketQuantityControl({name,selected,value,maximum,onChange}:{name:string;selected:boolean;value?:string;maximum:number;onChange:(delta:1|-1)=>void}) {
  const {colors}=useTheme(),quantity=basketQuantity(selected,value,maximum);
  const labelStyle={color:colors.accent,fontSize:11,textAlign:'center' as const};
  return <View style={{minWidth:108,alignItems:'center',gap:4,flexShrink:0}}>
    <View style={{alignSelf:'stretch'}}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{opacity:0}}><Text style={labelStyle}>✓ Au panier</Text><Text style={[labelStyle,{position:'absolute'}]}>Ajouter</Text></View>
      <Text accessibilityLiveRegion="polite" style={[labelStyle,{position:'absolute',top:0,left:0,right:0}]}>{selected?'✓ Au panier':'Ajouter'}</Text>
    </View>
    <View style={{flexDirection:'row',alignItems:'center'}}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Retirer une unité de ${name}`} accessibilityState={{disabled:!quantity.canRemove}} disabled={!quantity.canRemove} onPress={event=>{event.stopPropagation();onChange(-1);}} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center',opacity:quantity.canRemove?1:0.4}}><Text style={{color:colors.accent,fontSize:24}}>−</Text></Pressable>
      <View style={{minWidth:24,alignItems:'center'}}>
        <Text accessible={false} accessibilityElementsHidden importantForAccessibility="no" style={{opacity:0,fontVariant:['tabular-nums']}}>{String(Math.max(maximum,1))}</Text>
        <Text accessibilityLabel={`Quantité au panier : ${quantity.label==='?'?'à corriger':quantity.label}`} style={{position:'absolute',color:colors.text,textAlign:'center',fontVariant:['tabular-nums']}}>{quantity.label}</Text>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ajouter une unité de ${name}`} accessibilityHint={!quantity.canAdd?'Tout le stock disponible est sélectionné.':undefined} accessibilityState={{disabled:!quantity.canAdd}} disabled={!quantity.canAdd} onPress={event=>{event.stopPropagation();onChange(1);}} style={{minWidth:44,minHeight:44,alignItems:'center',justifyContent:'center',opacity:quantity.canAdd?1:0.4}}><Text style={{color:colors.accent,fontSize:24}}>+</Text></Pressable>
    </View>
  </View>;
}
