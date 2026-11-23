import test from 'node:test';
import assert from 'node:assert/strict';
import {loadAuthAvailability} from '../src/data/authAvailability';
test('registration reflects the selected instance explicit policy',async()=>{
 for(const signupEnabled of [false,true])assert.equal(await loadAuthAvailability(async()=>({ok:true,json:async()=>({authenticated:false,signupEnabled})})),signupEnabled);
});
test('unavailable and malformed status never enables registration',async()=>{
 await assert.rejects(loadAuthAvailability(async()=>({ok:false,json:async()=>({signupEnabled:true})})),/connexion reste possible/);
 for(const body of [null,{}, {signupEnabled:'true'},{signupEnabled:1}])await assert.rejects(loadAuthAvailability(async()=>({ok:true,json:async()=>body})),/invalide/);
 await assert.rejects(loadAuthAvailability(async()=>{throw new Error('Network unavailable');}),/Network unavailable/);
});
