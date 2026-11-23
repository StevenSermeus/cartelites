import test from 'node:test';
import assert from 'node:assert/strict';
import {gradingDraft,gradingPayload,gradingFailure,type GradingCompanyRecord} from '../src/data/gradingCompanies';
const company:GradingCompanyRecord={_id:'editable-company',name:'Société libre',revision:7,abbreviation:'SL',website:'https://example.test/grading'};
test('renaming and archiving preserve editable dictionary metadata and exact optimistic revision',()=>{
 const renamed=gradingPayload({...gradingDraft(company),name:' Nouveau nom '},company);
 assert.deepEqual(renamed,{name:'Nouveau nom',abbreviation:'SL',website:company.website,expectedRevision:7,archived:false});
 assert.deepEqual(gradingPayload(gradingDraft(company),company,true),{...renamed,name:company.name,archived:true});
 assert.equal(gradingPayload(gradingDraft({...company,archivedAt:123}),{...company,archivedAt:123}).archived,true);
 assert.equal(gradingPayload(gradingDraft({...company,archivedAt:123}),{...company,archivedAt:123},false).archived,false);
});
test('dictionary accepts arbitrary names without enums and validates website/revision before mutations',()=>{
 assert.equal(gradingPayload({name:'Nouvel atelier 2026',abbreviation:'',website:''}).name,'Nouvel atelier 2026');
 for(const website of ['http://example.test','javascript:alert(1)','https://bad host.test'])assert.throws(()=>gradingPayload({...gradingDraft(company),website}),/HTTPS/);
 assert.throws(()=>gradingPayload({...gradingDraft(company),name:'   '}),/nom/);
 assert.throws(()=>gradingPayload(gradingDraft(company),{...company,revision:0}),/Version/);
 assert.match(gradingFailure(Object.assign(new Error('server'),{code:'REVISION_CONFLICT'})),/saisie est conservée/);
});
