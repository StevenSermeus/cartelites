import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAuthStatus} from '../src/lib/authStatus';

test('only an explicit valid signed-out status clears identity; incomplete/outage payloads are retryable failures',()=>{
  for(const value of [null,{}, {error:'AUTH_SERVICE_UNAVAILABLE'}, {authenticated:true,signupEnabled:false}, {authenticated:true,signupEnabled:true,accountId:''}, {authenticated:false}, {authenticated:'false',signupEnabled:false}])assert.throws(()=>parseAuthStatus(value),/session invalide/);
  assert.deepEqual(parseAuthStatus({authenticated:true,signupEnabled:false,accountId:'account-a'}),{authenticated:true,signupEnabled:false,accountId:'account-a'});
  assert.deepEqual(parseAuthStatus({authenticated:false,signupEnabled:true,accountId:'stale-account'}),{authenticated:false,signupEnabled:true});
});
