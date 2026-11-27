import {isReferralChoice,readReferralRows,referralLabelKind} from './website-referral.js';

// Mozilla PDF.js 6.5.438, from the official pdfjs-dist package. The display
// module and worker are self-hosted so that the device workspace works offline.
const maxFileBytes=10*1024*1024,maxPages=20,maxText=100000,maxItems=25000;
const unclear='The PDF layout could not be matched to one website enquiry. Paste the original website email instead.';

function pageLines(items,viewport,pageNo,pageCount){
  const positions=items.filter(item=>item.str?.trim()).map(item=>{
    const [x,y]=viewport.convertToViewportPoint(item.transform[4],item.transform[5]);
    return {x,y,width:item.width,height:item.height,font:item.fontName,text:item.str.trim()};
  }).sort((a,b)=>a.y-b.y||a.x-b.x);
  const lines=[];
  for(const part of positions){
    let line=lines.at(-1);
    if(!line||Math.abs(line.y-part.y)>Math.max(1,part.height*.22)){
      line={y:part.y,parts:[]};lines.push(line);
    }
    line.parts.push(part);
  }
  for(const line of lines){
    line.cells=[];
    for(const part of line.parts.sort((a,b)=>a.x-b.x)){
      const last=line.cells.at(-1),gap=last?part.x-last.end:0;
      if(!last||gap>Math.max(12,1.6*part.height)){
        line.cells.push({...part,end:part.x+part.width});
      }else{
        last.text+=(gap>part.height*.12?' ':'')+part.text;
        last.end=Math.max(last.end,part.x+part.width);
      }
    }
  }
  // Printed page numbers, dates and document titles repeat in the footer.
  // Keep ordinary client answers even when they are close to the page edge.
  const number=new RegExp('^(?:page\\s+)?'+pageNo+'\\s*(?:/|of)\\s*'+pageCount+'$','i');
  const isPageNumber=text=>number.test(text);
  const footer=lines.findLast(line=>line.y>viewport.height*.88&&line.cells.some(c=>isPageNumber(c.text)));
  if(!footer)return lines;
  return lines.map(line=>({...line,cells:line.cells.filter(c=>{
    if(Math.abs(line.y-footer.y)>Math.max(18,c.height*2))return true;
    return !(isPageNumber(c.text)||/^(?:technical assistance project enquiry(?: form)?|form)$/i.test(c.text)||
      (line===footer&&/^\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(c.text)));
  })})).filter(line=>line.cells.length);
}

function labelAndValue(cell){
  const inline=/^(.+?):\s+(.+)$/u.exec(cell.text);
  if(inline&&referralLabelKind(inline[1])==='field')return {label:inline[1],value:inline[2],kind:'field'};
  return {label:cell.text,value:'',kind:referralLabelKind(cell.text)};
}

function joinWrappedLabels(lines){
  for(let i=0;i<lines.length;i++){
    const first=lines[i].cells[0];
    if(lines[i].cells.length!==1||labelAndValue(first).kind)continue;
    let label=first.text;
    for(let j=i+1;j<Math.min(i+4,lines.length);j++){
      const next=lines[j].cells[0];
      if(lines[j].cells.length!==1||Math.abs(first.x-next.x)>3||next.font!==first.font||
        lines[j].y<=lines[j-1].y||lines[j].y-lines[j-1].y>first.height*1.8)break;
      label+=' '+next.text;
      if(referralLabelKind(label)){
        first.text=label;lines.splice(i+1,j-i);break;
      }
    }
  }
  return lines;
}

function layoutAnswers(lines){
  const rows=[];
  // An unrecognised heading using the template's label typeface and inset can
  // be offered for review using the same mapping as a renamed email question.
  const styles=new Set();
  const style=cell=>[cell.font,Math.round(cell.height),Math.round(cell.x/3)].join('/');
  for(const line of lines)for(const cell of line.cells){
    if(labelAndValue(cell).kind==='field')styles.add(style(cell));
  }
  let columns=[];
  for(const {cells} of lines){
    const labels=cells.map(cell=>{
      const label=labelAndValue(cell);
      if(!label.kind&&styles.has(style(cell))&&cell.text.length<=180&&
        (/\?$/.test(cell.text)||/^[^a-z]*[A-Z]{2}[^a-z]*$/.test(cell.text)))label.kind='field';
      return label;
    });
    if(columns.length===1&&cells.length===1&&!columns[0].row[1]&&isReferralChoice(columns[0].row[0],cells[0].text))labels[0].kind='';
    if(labels.some(label=>label.kind)){
      if(!labels.every(label=>label.kind))throw Error(unclear);
      columns=[];
      for(const [i,{kind,label,value}] of labels.entries()){
        const row=[label,value];rows.push(row);
        if(kind==='field')columns.push({x:cells[i].x,row});
      }
    }else if(columns.length){
      const values=new Map();
      for(const cell of cells){
        const index=columns.findLastIndex(col=>cell.x>=col.x-3);
        if(index<0||columns[index+1]&&cell.end>columns[index+1].x+3)throw Error(unclear);
        values.set(index,[values.get(index),cell.text].filter(Boolean).join(' '));
      }
      for(const [index,text] of values){
        const row=columns[index].row;
        row[1]=[row[1],text.replace(/^[•▪]\s*/,'')].filter(Boolean).join('\n');
      }
    }
  }
  return readReferralRows(rows);
}

async function documentAnswers(task){
  const doc=await task.promise;
  if(doc.numPages>maxPages)throw Error('Choose one referral PDF of up to 20 pages.');
  const lines=[];
  let length=0,count=0;
  for(let pageNo=1;pageNo<=doc.numPages;pageNo++){
    const page=await doc.getPage(pageNo),items=[];
    const stream=page.streamTextContent().getReader();
    try{
      for(;;){
        const {done,value}=await stream.read();
        if(done)break;
        for(const item of value.items){
          if(typeof item.str!=='string')continue;
          count++;length+=item.str.length;
          if(count>maxItems||length>maxText)throw Error('This PDF contains too much text for one website enquiry.');
          items.push(item);
        }
      }
    }finally{stream.releaseLock();}
    const viewport=page.getViewport({scale:1});
    const pageText=pageLines(items,viewport,pageNo,doc.numPages);
    const title=pageText.findIndex(line=>line.y<viewport.height*.3&&line.cells.length===1&&/^technical assistance project enquiry form$/i.test(line.cells[0].text));
    const body=pageText.slice(title+1);
    if(!body.length)throw Error('A page has no readable text. Paste the website email or use a text-based referral PDF.');
    lines.push(...joinWrappedLabels(body));page.cleanup();
  }
  return layoutAnswers(lines);
}

export async function readReferralPdf(file){
  if(!file?.size||file.size>maxFileBytes)throw Error('Choose one non-empty referral PDF up to 10 MB.');
  const [header,trailer]=await Promise.all([file.slice(0,5).text(),file.slice(-1024).text()]);
  if(header!=='%PDF-'||!trailer.includes('%%EOF'))throw Error('Choose the original, complete referral PDF.');
  const {getDocument,PDFWorker}=await import('./assets/pdfjs/pdf.min.mjs');
  const data=new Uint8Array(await file.arrayBuffer());
  const port=new Worker(new URL('./assets/pdfjs/pdf.worker.min.mjs',import.meta.url),{type:'module'});
  const worker=PDFWorker.create({port});
  const task=getDocument({data,worker,disableWorkerRendering:true,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,
    useWasm:false,enableXfa:false,stopAtErrors:true,verbosity:0});
  let timeout;
  try{
    const reading=documentAnswers(task).finally(()=>task.destroy());
    return await Promise.race([reading,new Promise((_,reject)=>{
      timeout=setTimeout(()=>reject(Error('The PDF took too long to read. Paste the website email instead.')),20000);
      port.addEventListener('error',()=>reject(Error('The PDF reader could not start. Reload the app or paste the website email.')),{once:true});
    })]);
  }catch(error){
    if(error.name==='PasswordException')throw Error('The PDF is password-protected. Choose an unlocked copy or paste the website email.');
    if(['InvalidPDFException','UnknownErrorException','FormatError'].includes(error.name))throw Error('This PDF could not be read. Choose the original referral PDF or paste the website email.');
    throw error;
  }finally{
    clearTimeout(timeout);
    // This read owns its dedicated worker. Terminating it also bounds work on
    // a stalled document, and releases the PDF bytes after review is prepared.
    worker.destroy();port.terminate();
  }
}
