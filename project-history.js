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
  if(present(history.sourceStatus))panel.append(node('p','Source status: '+display(history.sourceStatus)));
  panel.append(node('p','Earlier project information is kept for reference. Current work follows this application’s workflow.','field-help'));
  facts(panel,[['Historical review date',history.reviewDate],['Historical coordinator',history.coordinator],['Source cost estimate',history.costEstimate],['Source estimate date',history.costEstimateDate]]);
  if(present(history.costEstimate))panel.append(node('p','The source estimate is shown as recorded. It is not a current quote or a recorded payment.','field-help'));
  const work=node('section',null,'project-historical-work');
  work.append(node('h3','Assessment and technical history'));
  if(!Array.isArray(history.work)||!history.work.length)work.append(node('p','No linked assessment or technical history is available in this import.','muted'));
  else for(const [index,record] of history.work.entries()){
    const item=node('details',null,'care-details project-history-entry');
    item.append(node('summary','Historical work '+(index+1)+' · Reference '+display(record.reference)+' · Source type '+display(record.type)));
    facts(item,[['Source project reference',record.reference],['Source work type',record.type],['Source work status',record.status],['Recorded hours',record.hours]]);
    work.append(item);
  }
  panel.append(work,node('p','Source work types and statuses are shown as recorded. Earlier approvals and receipts do not authorise new work. Files held separately, including SharePoint documents, are not included by this database import.','field-help'));
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
