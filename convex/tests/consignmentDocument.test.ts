import assert from 'node:assert/strict';
import test from 'node:test';
import { brand } from '../../branding/brand';
import { legal } from '../../branding/legal';
import { createConsignmentDocumentPdf } from '../../packages/domain/src/consignmentDocument';
test('multi-page restitution retains all inventory and one signature page with valid byte offsets', () => {
 const pdf=createConsignmentDocumentPdf({title:'Bon de restitution',reference:'RET-1',occurredAt:1795000000000,client:{name:'Clément'},lines:Array.from({length:30},(_,i)=>({label:`Article unique ${i}`,detail:'État intact, restitution sans vente'})),totals:[],notes:['Aucun versement.'],signatureRequired:true},{width:1,height:1,jpegHex:'ffd8ffd9'},{brand,legal});
 const text=[...pdf.matchAll(/<([0-9a-f]+)> Tj/g)].map(m=>Buffer.from(m[1],'hex').toString('latin1')).join('\n');
 for(let i=0;i<30;i++)assert.ok(text.includes(`Article unique ${i}`));
 assert.equal(text.match(/BOUTIQUE/g)?.length,1);
 assert.equal(text.match(/DÉPOSANT/g)?.length,1);
 assert.equal(Buffer.byteLength(pdf),pdf.length);
 assert.equal(pdf.slice(Number(pdf.match(/startxref\n(\d+)/)?.[1]),Number(pdf.match(/startxref\n(\d+)/)?.[1])+4),'xref');
});
