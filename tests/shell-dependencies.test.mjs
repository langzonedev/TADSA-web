import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('every local module import is included in the offline application shell',async()=>{
 const root=new URL('../',import.meta.url),worker=await readFile(new URL('sw.js',root),'utf8');
 const shell=JSON.parse(worker.match(/const SHELL=(\[[^\n]+\]);/)[1]);
 const urls=new Set(shell.map(path=>new URL(path,root).href));
 for(const path of shell.filter(path=>/\.m?js$/.test(path))){
  const url=new URL(path,root),source=await readFile(url,'utf8');
  for(const match of source.matchAll(/(?:\bfrom\s*|\bimport\s*\(?\s*)['"](\.[^'"]+)['"]/g)){
   assert.ok(urls.has(new URL(match[1],url).href),`${path} imports ${match[1]}, which is missing from the offline shell`);
  }
 }
});
