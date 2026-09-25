import {applyLifecycle} from './lifecycle-model.js';
import {createProfileDetails} from './profile-details-model.js';

// Authored fiction. Fixed reporting months make expected outcomes reproducible;
// the calendar alone is anchored to the week in which a fresh workspace opens.
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
export function enrichSeed(data, asOf='2026-09-25') {
  Object.assign(data,{contacts:[],calendars:{},credentials:{},profileDetails:{},lifecycles:{},operations:{},statusEvents:[],projectAdminDetails:{},projectFeedback:{},workPlans:{}});
  for(const [i,p] of data.people.entries()) {
    p.phone=`0000 ${String(i+1).padStart(6,'0')}`;
    const details=createProfileDetails();
    Object.assign(details.contact,{mobilePhone:p.phone,preferredPhone:'mobile',language:'English',addressLine1:`${i+1} Fictional Example Lane`,suburb:'Example suburb',state:'SA',postcode:'5000',organisationId:p.id==='person-5'||p.id==='person-15'?'org-2':''});
    data.profileDetails[p.id]={personId:p.id,version:1,...details};
  }
  // Existing allied-health contacts remain their recorded type; the added OT is
  // explicitly typed so role-filtered linking exercises have a valid choice.
  data.people.push({id:'person-16',name:'Robin Example',role:'Occupational therapist',email:'robin.example@example.invalid',phone:'0000 000016'},{id:'person-17',name:'Alex Sample',role:'Referrer',email:'alex.sample@example.invalid',phone:'0000 000017'},{id:'person-18',name:'Morgan Example',role:'Administrator',email:'morgan.example@example.invalid',phone:'0000 000018'});
  for(const [i,c] of data.clients.entries()) {
    const representative=i%3===0?'person-4':i%3===1?'person-14':null;
    const address=`${101+i} Fictional Client Avenue, Example suburb SA 5000`;
    c.details={reference:`CL-${c.id.slice(7)}`,residentialAddress:address,workAddress:i%2?`${201+i} Fictional Workshop Road, Example suburb SA 5000`:address,sameAsResidential:i%2===0,preferredContact:representative?'representative':'client',representativePersonId:representative,contactNeeds:i%2?'Email first; arrange a suitable call time.':'Speak directly with the client and allow time for questions.'};
    for(const [personId,role] of [['person-16','Occupational therapist'],...(representative?[[representative,'Carer']]:[]),...(i%2?[['person-17','Referrer']]:[])])data.contacts.push({clientId:c.id,personId,role,active:true});
  }
  data.organisations.forEach((o,i)=>Object.assign(o,{category:i===1?'Health service':'Community funding',email:`organisation.${i+1}@example.invalid`}));
  for(const p of data.projects){
    data.projectAdminDetails[p.id]={programme:'TAD',coordinatorAccountId:'',followUpOn:'',enquirySource:'Synthetic historical example'};
    data.statusEvents.push({id:p.id,fromStatus:null,toStatus:'open',at:p.openedAt+'T02:00:00.000Z'});
    // These examples intentionally retain the legacy workflow. No closure date
    // or hours are invented from their due dates; reporting exposes the gap.
  }
  const monday=new Date(asOf+'T00:00:00Z');monday.setUTCDate(monday.getUTCDate()-(monday.getUTCDay()+6)%7);
  const day=offset=>new Date(monday.valueOf()+offset*86400000).toISOString().slice(0,10);
  for(const [i,id]of ['person-3','person-12','person-13'].entries()) {
    const p=data.people.find(p=>p.id===id);p.technician={availability:i===1?'limited':'available',skills:i===0?['Woodworking','Metalwork','Assessment']:i===1?['Sewing','Woodworking','Assessment']:['Metalwork','Electronics','Assessment']};
    Object.assign(data.profileDetails[id].capabilities,{visitClients:'yes',drives:i===1?'no':'yes',vehicle:i===1?'Travels with another technician':'Fictional workshop vehicle',interests:i===1?'Textile adaptations':'Custom equipment and practical repairs',equipment:i===1?[]:['Bandsaw','Wood lathe'],equipmentNotes:'Synthetic capability example; confirm suitability for each project.'});
    data.calendars[id]={personId:id,version:1,baseAddress:`${301+i} Fictional Workshop Road`,suburb:'Example suburb',postcode:'5000',serviceAreas:[['western','metro'],['southern'],['eastern','adelaide-hills']][i],entries:[0,1].map(w=>({id:uuid(100+i*2+w),version:1,startDate:day(w*7),endDate:day(w*7+6),status:[['available','limited'],['limited','unavailable'],['unavailable','available']][i][w],note:'Fictional weekly availability for operator testing.'}))};
    data.credentials[id]={personId:id,version:1,qualifications:[{title:'Synthetic workshop qualification',issuer:'Example training provider',expiresOn:''}],safetyTraining:[{title:'Synthetic workshop safety induction',issuer:'Example training provider',expiresOn:'2027-09-30'}],clearances:[{title:'Synthetic clearance example',issuer:'Example screening provider',expiresOn:i===0?new Date(Date.parse(asOf+'T00:00:00Z')+7*86400000).toISOString().slice(0,10):i===1?'2026-08-31':'2027-09-30'}],notes:'Fictional test records only; not verified qualifications or clearance evidence.'};
  }
  const stages=['enquiry','assessment','quote','peer_review','client_acceptance','finance_clearance','work','hold','finance_finalisation','closed','closed','cancelled'];
  stages.forEach((target,i)=>{
    const id=`project-${13+i}`,date=i===9?'2026-08-20':'2026-09-20',at=date+'T02:00:00.000Z',programme=i>=9?'FW':'TAD',clientId=`client-${i%8+1}`;
    const project={id,reference:`2026-${193+i}`,clientId,title:`Practice: ${target.replaceAll('_',' ')}${i===9?' — August':i===10?' — September':''}`,status:target==='closed'?'closed':'open',kind:'Technical',dueDate:'2026-10-02',openedAt:date,summary:'Fictional guided workflow example for operator practice.',feedbackRequired:target==='closed',invoiceRequired:i>=8,version:1};data.projects.push(project);
    data.relationships.push({projectId:id,type:'person',id:'person-3',role:'Technician'});
    data.relationships.push({projectId:id,type:'person',id:'person-16',role:'Occupational therapist'},{projectId:id,type:'person',id:'person-17',role:'Referrer'});
    const agreedFunding=['finance_clearance','work','hold','finance_finalisation','closed','cancelled'].includes(target);
    project.coordination={technicianId:'person-3',technicianIds:['person-3'],requiredSkills:['Assessment'],fundingStatus:agreedFunding?'organisation':'unknown',payerId:agreedFunding?'org-1':null,fundingNotes:agreedFunding?'Fictional funder contribution agreed for the full quote.':''};
    if(agreedFunding)data.relationships.push({projectId:id,type:'organisation',id:'org-1',role:'Funder'});
    data.projectAdminDetails[id]={programme,coordinatorAccountId:'',followUpOn:target==='enquiry'?new Date(Date.parse(asOf+'T00:00:00Z')+7*86400000).toISOString().slice(0,10):'',enquirySource:'Synthetic operator practice'};
    let state=null;const context={at,actor:{id:null,displayName:'Synthetic fixture author',role:'administrator'},projectStatus:'open',programme};
    const act=(action,values)=>{state=applyLifecycle(state,action,values,context);};act('begin',{});
    if(target!=='enquiry')act('assessmentDecision',{required:true,reason:'Synthetic assessment recommended at enquiry.'});
    if(!['enquiry','assessment'].includes(target))act('assessmentComplete',{notes:'Fictional measurements and access needs reviewed.'});
    const lines=[{type:'labour',description:'Synthetic fitting labour',quantityMilli:2000,unitPriceCents:5000},{type:'materials',description:'Synthetic adaptation materials',quantityMilli:1000,unitPriceCents:2500}];
    if(!['enquiry','assessment','quote'].includes(target))act('quote',{lines,notes:'Fictional estimate for testing.'});
    if(!['enquiry','assessment','quote','peer_review'].includes(target)){act('peerReview',{quoteVersion:1,reviewerId:'person-12',approved:true,notes:'Fictional independent technical review.'});act('issueQuote',{quoteVersion:1,sentOn:date});}
    if(!['enquiry','assessment','quote','peer_review','client_acceptance'].includes(target))act('acceptQuote',{quoteVersion:1,acceptedBy:'Fictional client',reference:'Synthetic acceptance',date});
    if(['work','hold','finance_finalisation','closed','cancelled'].includes(target)){act('financeClearance',{quoteVersion:1,status:target==='finance_finalisation'?'exempt':'paid',reference:target==='finance_finalisation'?'Synthetic pre-work payment exemption':'Synthetic external Finance confirmation',notes:target==='finance_finalisation'?'Fictional authorised exemption allowed work before payment. Final draft is now due and has no receipt.':'Test evidence only; external clearance and internal receipt are separate records.',confirmedOn:date});act('work',{status:'in_progress',notes:'Fictional workshop activity.'});}
    if(['finance_finalisation','closed'].includes(target)){act('work',{status:'complete',notes:'Fictional adaptation completed.',...(programme==='FW'?{deliveredOn:date,deliveredQuantity:1}:{})});act('signoff',{acceptedBy:'Fictional client',reference:'Synthetic sign-off',signedOn:date,notes:'Test evidence only.'});act('costReturn',{lines,notes:'Fictional actual costs.'});}
    if(target==='closed'){act('financeFinalise',{reference:'Synthetic Finance finalisation',confirmedOn:date,notes:'Fictional reconciled example.'});act('close',{reason:'Synthetic completed project.'});}
    if(target==='cancelled')act('cancel',{reason:'Synthetic client cancellation before delivery.',cancelledQuantity:1});
    data.lifecycles[id]=state;
    data.operations[id]={actualMinutes:['work','hold','finance_finalisation','closed'].includes(target)?120:0,remainingMinutes:['finance_finalisation','closed','cancelled'].includes(target)?0:120,fundingContributors:agreedFunding?[{type:'organisation',id:'org-1',amountCents:12500}]:[],assessmentComplete:!!state.assessment,workApproved:!!state.financeClearance&&target!=='hold'&&target!=='cancelled',approvedBy:state.financeClearance&&target!=='hold'?'person-18':'',approvedOn:state.financeClearance&&target!=='hold'?date:'',fundingExceptionReason:'',onHold:target==='hold',clientStopped:target==='hold',resumeClientConsent:false,reviewRequired:target==='hold',notes:[{id:uuid(600+i),text:target==='hold'?'Fictional client requested a pause. Obtain renewed client consent and administrator approval before resuming.':target==='finance_finalisation'?'Fictional work and sign-off complete. Draft remains unpaid; record receipt and external Finance finalisation before closure.':`Fictional practice case prepared at ${target.replaceAll('_',' ')}. Review the next action before continuing.`,at,actor:'Synthetic fixture author'}],invoices:[]};
    data.statusEvents.push({id,fromStatus:null,toStatus:'open',at});
    if(target==='closed'||target==='finance_finalisation'){
      if(target==='closed')data.statusEvents.push({id,fromStatus:'open',toStatus:'closed',at});
      const client=data.people.find(p=>p.id===data.clients.find(c=>c.id===clientId).personId),invoiceId=uuid(300+i);
      data.operations[id].invoices.push({id:invoiceId,number:`SYNTHETIC-${i}`,at,snapshot:{projectReference:project.reference,projectTitle:project.title,clientName:client.name,payerName:data.organisations[0].name,payerType:'organisation',payerId:'org-1',milestone:'final',billingMode:'nominated',lines:[{description:'Synthetic service charge',quantityMilli:1000,unitPriceCents:10000,amountCents:10000,category:'service_charge'},{description:'Synthetic materials',quantityMilli:1000,unitPriceCents:2500,amountCents:2500,category:'other'}],totalCents:12500,subtotalCents:12500,gstCents:0,invoiceDate:date,billingAddress:'Fictional funder office, Example suburb SA 5000',documentLabel:'Draft invoice — tax treatment unconfirmed',businessSettingsVersion:1,business:{issuerName:'Synthetic fixture issuer',abn:'',address:'1 Fictional Example Lane, Example suburb SA 5000',contact:'fixture.issuer@example.invalid',paymentTerms:'Synthetic practice only',bankDetails:'',gstMode:'unconfirmed',gstRateBps:1000,gstConfirmed:false},readinessWarnings:['Synthetic historical draft; not an official invoice.','Not ready to issue: tax treatment is unconfirmed; no GST has been calculated.']}});
      data.workPlans[id]={payments:target==='closed'?[{id:uuid(400+i),invoiceId,amountCents:12500,receivedOn:date,reference:'Synthetic receipt',at}]:[]};
    }
    if(target==='closed'){
      data.projectFeedback[id]=[{id:uuid(500+i),recordedOn:date,comments:'Fictional client confirmed the adaptation met the agreed purpose.',followUpRequired:'no',completed:true,at,actor:{id:null,displayName:'Synthetic fixture author'}}];
    }
  });
  return data;
}
