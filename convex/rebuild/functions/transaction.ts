import {mutation} from './itemActivity';
import type {ObjectType,PropertyValidators} from 'convex/values';
import {type MutationCtx} from './_generated/server';
/** Register a public operation and expose its typed handler for adapters in the
 * same Convex transaction. Nested calls never cross a transaction boundary. */
export function transaction<Fields extends PropertyValidators,Result>(definition:{args:Fields;handler:(ctx:MutationCtx,args:ObjectType<Fields>)=>Promise<Result>}){
 return Object.assign(mutation(definition),{run:definition.handler});
}
