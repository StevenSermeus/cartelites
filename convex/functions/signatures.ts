import { v } from 'convex/values';
export const signatureValidator = v.array(v.array(v.array(v.number())));
export { validSignature } from '../../packages/domain/src/signature';
