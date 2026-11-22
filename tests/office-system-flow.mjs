/** Actual system provider conversions and resource/error boundaries on s390x. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync,mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const source=resolve(process.argv[2]),fixtures=resolve(process.argv[3]);
const {createSystemConverter}=await import(pathToFileURL(join(source,'packages/document/office-kit/src/system-libreoffice.ts')));
const output=mkdtempSync(join(fixtures,'outputs-')),tests=[];
const converter=await createSystemConverter({timeoutMs:120000,maxArchiveEntries:10000,maxUncompressedBytes:262144000});
try{
 for(const extension of ['docx','xlsx','pptx']){
  const pdf=join(output,extension+'.pdf'),result=await converter.render({inputPath:join(fixtures,'test.'+extension),outputPath:pdf});
  assert.ok(result.pageCount>0);assert.equal(readFileSync(pdf).subarray(0,5).toString(),'%PDF-');
  const text=spawnSync('/usr/bin/pdftotext',[pdf,'-'],{encoding:'utf8'});assert.equal(text.status,0);
  assert.match(text.stdout,extension==='xlsx'?/42/:extension==='pptx'?/PPTX_TRUE_TEST/:/DSH s390x Office/);
  tests.push(extension+'-actual-PDF-and-text');
 }
 const recalc=join(output,'recalculated.xlsx');await converter.recalculate({inputPath:join(fixtures,'test.xlsx'),outputPath:recalc});
 const check=spawnSync('/usr/bin/python3',['-c',"import sys,zipfile;z=zipfile.ZipFile(sys.argv[1]);s=z.read('xl/worksheets/sheet1.xml');assert b'<v>42</v>' in s,s",recalc],{encoding:'utf8'});assert.equal(check.status,0,check.stderr);tests.push('XLSX-formula-cache-recalculated');
 const csv=join(output,'selected.csv');await converter.convert({inputPath:join(fixtures,'test.xlsx'),outputPath:csv,sheet:'Data'});assert.match(readFileSync(csv,'utf8'),/42/);tests.push('XLSX-sheet-selection-to-CSV');
 const images=await converter.renderImages({inputPath:join(fixtures,'test.docx'),outputDir:join(output,'images'),pages:[1],dpi:96});assert.ok(images.images[0].width>0);tests.push('DOCX-real-PNG');
 const existing=join(output,'existing.pdf');writeFileSync(existing,'PRESERVE');await assert.rejects(converter.render({inputPath:join(fixtures,'test.docx'),outputPath:existing}));assert.equal(readFileSync(existing,'utf8'),'PRESERVE');tests.push('existing-output-preserved');
 const abort=new AbortController(),cancelled=join(output,'cancelled.pdf');const task=converter.render({inputPath:join(fixtures,'test.docx'),outputPath:cancelled},abort.signal);setTimeout(()=>abort.abort(),200);await assert.rejects(task);assert.ok(!existsSync(cancelled));tests.push('abort-awaits-process-and-cleans-output');
 await assert.rejects(converter.renderImages({inputPath:join(fixtures,'test.docx'),outputDir:join(output,'oversize'),dpi:600,maxPixels:1}));assert.ok(!existsSync(join(output,'oversize')));tests.push('raster-pixel-limit');
 const limited=await createSystemConverter({maxArchiveEntries:1});try{await assert.rejects(limited.render({inputPath:join(fixtures,'test.docx'),outputPath:join(output,'zip-limit.pdf')}));tests.push('archive-entry-limit')}finally{await limited.dispose()}
 console.log(JSON.stringify({world:'IBM-native',architecture:process.arch,provider:'system-LibreOffice+Poppler',tests,status:'passed'}));
}finally{await converter.dispose();rmSync(output,{recursive:true,force:true})}
