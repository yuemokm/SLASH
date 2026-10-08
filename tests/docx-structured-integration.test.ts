import test from 'node:test';
import assert from 'node:assert/strict';
import AdmZip from 'adm-zip';
import mammoth from 'mammoth';
import {Document,Paragraph,ImageRun,Packer} from 'docx';
import {extractOfficeText} from '../main/office-extraction.js';

function fixture(body:string){
 const zip=new AdmZip();
 zip.addFile('[Content_Types].xml',Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'));
 zip.addFile('_rels/.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'));
 zip.addFile('word/styles.xml',Buffer.from('<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>'));
 zip.addFile('word/_rels/document.xml.rels',Buffer.from('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="styles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'));
 zip.addFile('word/document.xml',Buffer.from(`<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`));
 return zip.toBuffer();
}
const paragraph=(text:string,style?:string)=>`<w:p>${style?`<w:pPr><w:pStyle w:val="${style}"/></w:pPr>`:''}<w:r><w:t>${text}</w:t></w:r></w:p>`;

test('registered-copy Office path validates and uses real Mammoth conversion to preserve headings and table column boundaries',async()=>{
 const bytes=fixture(paragraph('4 功能需求','Heading1')+paragraph('详细说明','Heading2')+'<w:tbl><w:tblGrid><w:gridCol/><w:gridCol/></w:tblGrid><w:tr><w:tc>'+paragraph('字段名称')+'</w:tc><w:tc>'+paragraph('默认值')+'</w:tc></w:tr><w:tr><w:tc>'+paragraph('门店')+'</w:tc><w:tc>'+paragraph('待确认')+'</w:tc></w:tr></w:tbl>'+paragraph('6 集成需求','Heading1')+paragraph('详细说明','Heading2'));
 const text=await extractOfficeText(bytes,'template.docx');
 assert.match(text,/# 4 功能需求\n\n## 详细说明/);
 const table=text.split('\n').filter(line=>line.startsWith('|'));
 assert.deepEqual(table.filter(line=>!line.includes('---')).map(line=>line.split('|').slice(1,-1)),[['字段名称','默认值'],['门店','待确认']]);
 assert.match(text,/# 6 集成需求\n\n## 详细说明/);
});

test('package validation runs before conversion and conversion forbids external/image reads and embedded style maps',async()=>{
 const original=mammoth.convertToHtml;let calls=0;
 mammoth.convertToHtml=async(input,options)=>{calls++;assert.equal(options?.externalFileAccess,false);assert.equal(options?.includeEmbeddedStyleMap,false);assert.ok(options?.convertImage);return{value:'<p>正文<img src="docx-image-omitted" /></p>',messages:[{type:'warning',message:'unknown style'}]};};
 try{
  await assert.rejects(extractOfficeText(Buffer.from('invalid'),'bad.docx'),/OFFICE_INVALID_PACKAGE/);assert.equal(calls,0);
  const text=await extractOfficeText(fixture(paragraph('x')),'good.docx');assert.equal(calls,1);assert.match(text,/图片省略/);assert.match(text,/unknown style/);
 }finally{mammoth.convertToHtml=original;}
});

test('actual embedded-image DOCX passes through the omission converter without reading or encoding image bytes',async()=>{
 const bytes=await Packer.toBuffer(new Document({sections:[{children:[new Paragraph({children:[new ImageRun({type:'png',data:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lX8AAAAASUVORK5CYII=','base64'),transformation:{width:1,height:1}})]})]}]}));
 const original=mammoth.images.imgElement;let omitted=0;
 mammoth.images.imgElement=converter=>original(async image=>{omitted++;const denied=async()=>{throw Error('IMAGE_READ_MUST_NOT_RUN');};return converter({...image,read:denied,readAsArrayBuffer:denied,readAsBase64String:denied,readAsBuffer:denied});});
 try{const text=await extractOfficeText(bytes,'image.docx');assert.equal(omitted,1);assert.match(text,/图片省略，未读取图片，未做 OCR/);assert.doesNotMatch(text,/data:image|base64|iVBOR/);}finally{mammoth.images.imgElement=original;}
});
