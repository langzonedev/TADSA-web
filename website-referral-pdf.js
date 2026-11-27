import {isReferralChoice,readReferralRows,referralIdentityField,referralLabelKind} from './website-referral.js';

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
      (line===footer&&(/^(?:https?:\/\/|\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}$)/i.test(c.text))));
  })})).filter(line=>line.cells.length);
}

function labelAndValue(cell){
  const inline=/^([^:]{1,180}):\s*(\S.*)$/u.exec(cell.text);
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

const style=cell=>[cell.font,Math.round(cell.height),Math.round(cell.x/3)].join('/');

// Infer the template's typography from actual question/answer pairs. On a
// plain-text printout both use the same style: capitalisation and punctuation
// alone cannot distinguish a person's name or request from a new question.
function questionStyles(lines){
  const samples=new Map(),values=new Set();
  for(const [i,{cells}] of lines.entries()){
    const first=labelAndValue(cells[0]);
    if(first.kind!=='field'||first.value)continue;
    const following=cells.length===2?cells[1]:cells.length===1?lines[i+1]?.cells[0]:null;
    if(!following||labelAndValue(following).kind)continue;
    const key=style(cells[0]),valueStyle=style(following);
    const score=samples.get(key)||0;
    samples.set(key,score+(key===valueStyle?-1:1));
    values.add(valueStyle);
  }
  const headings=new Set([...samples].filter(([,score])=>score>0).map(([key])=>key));
  return {headings,values};
}

function layoutAnswers(lines){
  const rows=[];
  const {headings,values}=questionStyles(lines);
  let columns=[];
  for(const {cells} of lines){
    const labels=cells.map(cell=>{
      const label=labelAndValue(cell);
      if(!label.kind&&headings.has(style(cell))&&cell.text.length<=180)label.kind='field';
      return label;
    });
    // A literal answer may itself be a known field name. Read it as an
    // answer only where the source has established a distinct value style.
    const valueStyle=cell=>values.has(style(cell))&&!headings.has(style(cell));
    if(columns.length===1&&cells.length===1&&!columns[0].row[1]&&
      (isReferralChoice(columns[0].row[0],cells[0].text)||
        labels[0].kind==='field'&&headings.has(columns[0].labelStyle)&&valueStyle(cells[0])))labels[0].kind='';
    if(cells.length===2&&labels[0].kind==='field'&&!labels[0].value&&
      (!labels[1].kind||labels[1].kind==='field'&&headings.has(style(cells[0]))&&valueStyle(cells[1]))){
      // A heading beside an answer still under an active table column has
      // two plausible readings. Do not associate that value with either one.
      if(columns.length>1)throw Error(unclear);
      const row=[labels[0].label,cells[1].text];
      rows.push(row);
      columns=[{x:cells[1].x,row,labelStyle:style(cells[0]),last:cells[1]}];
      continue;
    }
    if(labels.some(label=>label.kind)){
      if(!labels.every(label=>label.kind))throw Error(unclear);
      columns=[];
      for(const [i,{kind,label,value}] of labels.entries()){
        const row=[label,value];rows.push(row);
        if(kind==='field')columns.push({x:cells[i].x,row,labelStyle:style(cells[i]),last:value?cells[i]:null});
      }
    }else if(columns.length){
      const values=new Map();
      for(const cell of cells){
        const index=columns.findLastIndex(col=>cell.x>=col.x-3);
        if(index<0||columns[index+1]&&cell.end>columns[index+1].x+3)throw Error(unclear);
        // A short answer below a centred heading can end before that heading
        // starts. Being somewhere to the right of the previous heading does
        // not establish a match; require alignment with the answer's column.
        if(columns.length>1&&cell.x-columns[index].x>Math.min(14,cell.height*1.4))throw Error(unclear);
        const entry=values.get(index);
        if(entry)entry.text+=' '+cell.text;
        else values.set(index,{first:cell,text:cell.text});
      }
      for(const [index,{first,text}] of values){
        const column=columns[index],{row,last}=column;
        let separator='\n';
        if(row[1]&&referralIdentityField(row[0])){
          // A name can wrap onto the next line; another unlabelled line may
          // be an unfamiliar question. Only join a clear value continuation.
          if(!headings.has(column.labelStyle)||!last||style(last)!==style(first)||
            first.y<=last.y||first.y-last.y>first.height*1.65)throw Error(unclear);
          separator=' ';
        }
        row[1]=[row[1],text.replace(/^[•▪]\s*/,'')].filter(Boolean).join(separator);
        column.last=first;
      }
    }
  }
  return readReferralRows(rows);
}

function readingRotation(items){
  // Page rotation is a viewer preference. Arrange answers in the orientation
  // of their printed text, including pages authored sideways and then rotated.
  const weights=[0,0,0,0];
  for(const {str,transform} of items){
    const quarterTurns=Math.atan2(transform[1],transform[0])/(Math.PI/2);
    const nearest=Math.round(quarterTurns);
    if(Math.abs(nearest-quarterTurns)<.08)weights[(nearest+4)%4]+=str.trim().length;
  }
  return weights.indexOf(Math.max(...weights))*90;
}

function printedBody(lines,height){
  const title=lines.findIndex(line=>line.y<height*.3&&line.cells.some(cell=>/^technical assistance project enquiry form$/i.test(cell.text)));
  const prefix=lines.slice(0,Math.max(title,0));
  if(prefix.some(line=>line.cells.some(cell=>/^ABN\b/i.test(cell.text)))){
    // In the office letterhead a generic "Email" belongs to the organisation.
    // Preserve any specifically labelled enquiry fields printed above the title.
    const firstField=prefix.findIndex(line=>line.cells.some(cell=>labelAndValue(cell).kind&&
      !/^(?:email|phone|address|name)\b/i.test(labelAndValue(cell).label)));
    lines=lines.slice(firstField<0?title:firstField);
  }
  return lines.map(line=>({...line,cells:line.cells.filter(cell=>{
    if(line.y<height*.3&&/^technical assistance project enquiry form$/i.test(cell.text))return false;
    return !(line.y<height*.045&&/^\d{1,4}[/.-]\d{1,2}[/.-]\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[AP]M)?$/i.test(cell.text));
  })})).filter(line=>line.cells.length);
}

function emptyAnswerBands(body,pageHeight){
  // For stacked field layouts, a typed question followed directly by the next
  // question (or the page end) may have its answer embedded as an image.
  const bands=[];
  for(let i=0;i<body.length;i++){
    const {cells,y}=body[i];
    if(cells.length!==1)continue;
    const field=labelAndValue(cells[0]);
    if(field.kind!=='field'||field.value)continue;
    const next=body[i+1];
    if(!next||next.cells.some(cell=>labelAndValue(cell).kind))bands.push([y,next?.y??pageHeight]);
  }
  return bands;
}

async function checkForUnprintedAnswers(page,ops,body,viewport){
  // A scan can have selectable print headers or a filename caption without a
  // text layer for its answers. A genuinely blank duplex side may be skipped.
  const {fnArray,argsArray}=await page.getOperatorList();
  const imageOps=[ops.paintImageXObject,ops.paintInlineImageXObject,ops.paintImageMaskXObject,
    ops.paintImageMaskXObjectGroup,ops.paintInlineImageXObjectGroup,ops.paintImageXObjectRepeat,ops.paintImageMaskXObjectRepeat];
  const [x1,y1,x2,y2]=page.view,pageArea=Math.abs((x2-x1)*(y2-y1));
  const noAnswers=!body.some(line=>line.cells.some(cell=>labelAndValue(cell).kind==='field'));
  const empty=emptyAnswerBands(body,viewport.height);
  const scanMessage='A page has no readable text for some of its content. Paste the website email or use a text-based referral PDF.';
  let placement=new DOMMatrix();
  const saved=[];
  for(let i=0;i<fnArray.length;i++){
    const op=fnArray[i];
    if(op===ops.save||op===ops.paintFormXObjectBegin)saved.push(placement);
    if(op===ops.restore||op===ops.paintFormXObjectEnd)placement=saved.pop()??new DOMMatrix();
    const matrix=op===ops.transform?argsArray[i]:op===ops.paintFormXObjectBegin?argsArray[i]?.[0]:null;
    if(matrix)placement=placement.multiply(new DOMMatrix(matrix));
    if(imageOps.includes(op)){
      const {a,b,c,d,e,f}=placement;
      const [,centreY]=viewport.convertToViewportPoint(e+(a+c)/2,f+(b+d)/2);
      if(noAnswers||Math.abs(a*d-b*c)>pageArea*.45||
        empty.some(([start,end])=>centreY>start&&centreY<end))throw Error(scanMessage);
    }
    if(!body.length&&[ops.constructPath,ops.rawFillPath,ops.shadingFill].includes(op))throw Error(scanMessage);
  }
}

async function documentAnswers(task,ops){
  const doc=await task.promise;
  if(doc.numPages>maxPages)throw Error('Choose one referral PDF of up to 20 pages.');
  const {info}=await doc.getMetadata();
  if(info.IsAcroFormPresent||info.IsXFAPresent)throw Error('This PDF contains interactive form fields. Paste the website email or use a printed PDF with selectable answers.');
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
    const viewport=page.getViewport({scale:1,rotation:readingRotation(items)});
    const pageText=pageLines(items,viewport,pageNo,doc.numPages);
    const body=printedBody(pageText,viewport.height);
    await checkForUnprintedAnswers(page,ops,body,viewport);
    lines.push(...joinWrappedLabels(body));page.cleanup();
  }
  return layoutAnswers(lines);
}

export async function readReferralPdf(file){
  if(!file?.size||file.size>maxFileBytes)throw Error('Choose one non-empty referral PDF up to 10 MB.');
  const [header,trailer]=await Promise.all([file.slice(0,5).text(),file.slice(-1024).text()]);
  if(header!=='%PDF-'||!trailer.includes('%%EOF'))throw Error('Choose the original, complete referral PDF.');
  const {getDocument,PDFWorker,OPS}=await import('./assets/pdfjs/pdf.min.mjs');
  const data=new Uint8Array(await file.arrayBuffer());
  const port=new Worker(new URL('./assets/pdfjs/pdf.worker.min.mjs',import.meta.url),{type:'module'});
  const worker=PDFWorker.create({port});
  const task=getDocument({data,worker,disableWorkerRendering:true,disableFontFace:true,useSystemFonts:false,useWorkerFetch:false,
    useWasm:false,enableXfa:false,stopAtErrors:true,verbosity:0});
  let timeout;
  try{
    const reading=documentAnswers(task,OPS).finally(()=>task.destroy());
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
