import {node,link,action} from './project-care.js';

const present=value=>value!==null&&value!==undefined&&value!=='';
const display=value=>present(value)?String(value):'Not recorded';
function facts(parent,rows){
  const list=node('dl',null,'review-list');
  for(const [label,value] of rows)list.append(node('dt',label),node('dd',display(value)));
  parent.append(list);
}

// Render the server's bounded projection, never an archived source payload.
// Historical status/costs do not change modern workflow or payment decisions.
export function renderProjectHistory(parent,project,options={}){
  const history=project.historicalContext;
  if(!history||history.format!=='tadsa-project-historical-context-v1')return null;
  const panel=node('section',null,'panel project-historical-context');
  panel.append(node('h2','Imported project history'));
  const request=node('section',null,'project-history-request');
  request.append(node('h3','Work requested'),node('p',present(project.summary)?project.summary:'No work description was recorded in the imported project. Check the retained source or ask someone familiar with this job.','project-history-description'));
  panel.append(request);
  if(present(history.sourceStatus))panel.append(node('p','Source status: '+display(history.sourceStatus)));
  panel.append(node('p','Earlier project information is kept for reference. Current work follows this application’s workflow.','field-help'));
  const work=node('section',null,'project-historical-work');
  work.append(node('h3','Assessment and technical history'));
  if(!Array.isArray(history.work)||!history.work.length)work.append(node('p','No linked assessment or technical history is available in this import.','muted'));
  else {
    const table=node('table',null,'project-history-work-table'),head=node('thead'),titles=node('tr'),body=node('tbody');
    for(const label of ['Work reference','Work type','Historical status','Recorded hours'])titles.append(node('th',label));
    head.append(titles);table.append(head,body);const scroll=node('div',null,'project-history-table-scroll');scroll.append(table);work.append(scroll);
    let shown=0;
    const more=action('Show more historical work',()=>appendBatch());
    function appendBatch(){
      for(const record of history.work.slice(shown,shown+20)){
        const row=node('tr');for(const value of [record.reference,record.type,record.status,record.hours])row.append(node('td',display(value)));body.append(row);
      }
      shown=Math.min(shown+20,history.work.length);more.hidden=shown>=history.work.length;
      more.textContent='Show more historical work ('+shown+' of '+history.work.length+' shown)';
    }
    appendBatch();work.append(more);
  }
  panel.append(work,node('p','Source work types and statuses are shown as recorded. Earlier approvals and receipts do not authorise new work. Files held separately, including SharePoint documents, are not included by this database import.','field-help'));
  const metadata=node('details',null,'care-details project-history-metadata');
  metadata.append(node('summary','Historical dates, coordinator and estimate'));
  facts(metadata,[['Historical review date',history.reviewDate],['Historical coordinator',history.coordinator],['Source cost estimate',history.costEstimate],['Source estimate date',history.costEstimateDate]]);
  if(present(history.costEstimate))metadata.append(node('p','The source estimate is shown as recorded. It is not a current quote or a recorded payment.','field-help'));
  panel.append(metadata);
  if(history.pendingParties?.length){
    const parties=node('section',null,'project-historical-parties');
    parties.append(node('h3','Historical relationships awaiting classification'),node('p','These exact source references are retained as history. Confirm the person or organisation before selecting them for new work or as an invoice payer.','field-help'));
    for(const party of history.pendingParties)facts(parties,[[party.role,party.label??'Source name needs review'],['Review needed',party.reason==='organisation-conversion-required'?'Organisation destination needs review':'Person or organisation classification needed']]);
    panel.append(parties);
  }
  const actions=node('div',null,'actions');
  if(typeof project.clientId==='string'&&/^client-\d+$/.test(project.clientId))actions.append(link('New project for this client','new-project/'+project.clientId));
  if(typeof options.openWorkflow==='function')actions.append(action('Review continuation workflow',options.openWorkflow));
  panel.append(actions,node('p',project.status==='closed'?'To continue this closed project, deliberately reopen it through project Details, then review its workflow. Its existing number and imported history stay with it.':'To continue this same job, review its workflow and fill in the current details and evidence it needs. For new work, create a new project for the existing client.','field-help'));
  parent.append(panel);
  return panel;
}
