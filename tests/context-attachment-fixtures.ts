import AdmZip from 'adm-zip';
import {Document,Paragraph,Packer,Table,TableRow,TableCell} from 'docx';
import ExcelJS from 'exceljs';

export async function sampleDocx(text='客户准入规则：重复信用代码阻止提交'){
 return Packer.toBuffer(new Document({sections:[{children:[new Paragraph(text),new Table({rows:[new TableRow({children:[new TableCell({children:[new Paragraph('风险等级')]}),new TableCell({children:[new Paragraph('审批人')]} )]}),new TableRow({children:[new TableCell({children:[new Paragraph('高风险')]}),new TableCell({children:[new Paragraph('风控')]} )]})]})]}]}));
}
export async function sampleXlsx(){const book=new ExcelJS.Workbook();const sheet=book.addWorksheet('销售表');sheet.addRow(['客户','数量']);sheet.addRow(['千禾',3]);sheet.getCell('C2').value={formula:'B2*2',result:6};return Buffer.from(await book.xlsx.writeBuffer());}
export function samplePptx(options:{external?:boolean;unsafe?:boolean;empty?:boolean}={}){
 const zip=new AdmZip();zip.addFile('[Content_Types].xml',Buffer.from('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'));
 zip.addFile('ppt/presentation.xml',Buffer.from('<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="second"/><p:sldId id="257" r:id="first"/></p:sldIdLst></p:presentation>'));
 zip.addFile('ppt/_rels/presentation.xml.rels',Buffer.from(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="first" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="second" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="${options.external?'https://example.invalid/slide.xml':'slides/slide2.xml'}"${options.external?' TargetMode="External"':''}/></Relationships>`));
 for(let n=1;n<=2;n++)zip.addFile(`ppt/slides/slide${n}.xml`,Buffer.from(`${options.unsafe?'<!DOCTYPE test [<!ENTITY unsafe "unsafe">]>':''}<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:p><a:r><a:t>${options.empty?'':n===1?'文件编号第一张，实际放第二页':'实际第一页：产品目标'}</a:t></a:r></a:p></p:sld>`));
 return zip.toBuffer();
}
export function samplePdf(text='Approval requires risk review'){
 const stream=text?`BT /F1 12 Tf 72 720 Td (${text}) Tj ET`:'q Q';const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Count 1 /Kids [3 0 R] >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',`<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'];let body='%PDF-1.4\n';const offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(body));body+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}const xref=Buffer.byteLength(body);body+=`xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(value=>String(value).padStart(10,'0')+' 00000 n ').join('\n')}\ntrailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return Buffer.from(body);
}
export function samplePng(){return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8/x8AAwMCAO+aLxQAAAAASUVORK5CYII=','base64');}
