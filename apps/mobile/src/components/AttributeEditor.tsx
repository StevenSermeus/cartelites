import {useRef} from 'react';
import {Pressable,Text,View} from 'react-native';
import type {AttributeRow} from '../data/productAttributes';
import {useTheme} from '../theme/ThemeProvider';
import {Field} from './Field';
export function AttributeEditor({title,description,rows,onChange}:{title:string;description:string;rows:AttributeRow[];onChange:(rows:AttributeRow[])=>void}) {
 const {colors}=useTheme();const next=useRef(0);
 return <View style={{gap:10,padding:14,borderRadius:16,backgroundColor:colors.surface}}>
  <Text accessibilityRole="header" style={{color:colors.text,fontWeight:'600'}}>{title}</Text>
  <Text style={{color:colors.secondary}}>{description}</Text>
  {rows.map((row,index)=><View key={row.id} style={{gap:8,borderTopWidth:0.5,borderColor:colors.border,paddingTop:10}}>
   <Field label={`${title} · nom ${index+1}`} value={row.name} maxLength={60} onChangeText={name=>onChange(rows.map(current=>current.id===row.id?{...current,name}:current))}/>
   <Field label={`${title} · valeur ${index+1}`} value={row.value} maxLength={500} multiline onChangeText={value=>onChange(rows.map(current=>current.id===row.id?{...current,value}:current))}/>
   <Pressable accessibilityRole="button" accessibilityLabel={`Retirer la propriété ${row.name||index+1}`} onPress={()=>onChange(rows.filter(current=>current.id!==row.id))} style={{minHeight:44,justifyContent:'center'}}><Text style={{color:colors.danger}}>Retirer cette propriété</Text></Pressable>
  </View>)}
  <Pressable accessibilityRole="button" accessibilityLabel={`${title} : ajouter une propriété (${rows.length}/20)`} accessibilityState={{disabled:rows.length>=20}} disabled={rows.length>=20} onPress={()=>onChange([...rows,{id:`new:${next.current++}`,name:'',value:''}])} style={{minHeight:44,justifyContent:'center',opacity:rows.length>=20?0.5:1}}><Text style={{color:colors.accent}}>Ajouter une propriété ({rows.length}/20)</Text></Pressable>
 </View>;
}
