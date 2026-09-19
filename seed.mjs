// All identities and narratives are fictional, authored only for development.
export function seed() {
  const people = [
    ['person-1','Eleanor Walsh','Client'], ['person-2','Daniel Chen','Client'],
    ['person-3','James Whitfield','Technician'], ['person-4','Olivia Walsh','Carer'],
    ['person-5','Priya Raman','Allied-health contact'], ['person-6','Amira Hassan','Client'],
    ['person-7','Thomas Nguyen','Client'], ['person-8','Margaret Ellis','Client'],
    ['person-9','Peter Novak','Client'], ['person-10','Sofia Petrov','Client'],
    ['person-11','Grace Bennett','Client'], ['person-12','Louise Carter','Technician'],
    ['person-13','Michael Tan','Technician'], ['person-14','Anna Novak','Carer'],
    ['person-15','Leila Farouk','Allied-health contact']
  ].map(([id,name,role]) => ({ id,name,role,email: name.toLowerCase().replaceAll(' ','.')+'@example.invalid',phone:'Not recorded' }));
  const clients = ['person-1','person-2','person-6','person-7','person-8','person-9','person-10','person-11'].map((personId,i) => ({id:'client-'+(i+1),personId}));
  const definitions = [
    ['Adjustable art station','client-1','open','Technical','2026-09-23','An adjustable tabletop support to make painting and sketching more comfortable.',false,false,'person-3'],
    ['Garden tool support','client-1','review','Assessment','2026-09-21','Explore a lightweight tool support for raised-bed gardening. Assessment does not authorise fabrication.',true,false,'person-3'],
    ['Reading stand adaptation','client-2','closed','Technical','2026-09-15','A stable, adjustable reading stand for use at a favourite chair.',true,true,'person-12'],
    ['Kitchen workspace assessment','client-3','review','Assessment','2026-09-22','Review reach and positioning around a frequently used kitchen workspace.',false,false,'person-12'],
    ['Bicycle pedal adjustment','client-4','open','Technical','2026-09-25','Investigate an adjustable pedal attachment for a stationary exercise bicycle.',false,false,'person-13'],
    ['Easy-grip writing support','client-5','open','Technical','2026-09-24','Develop a comfortable support for everyday handwriting and correspondence.',false,false,'person-12'],
    ['Outdoor seating assessment','client-6','review','Assessment','2026-09-28','Assess the positioning and support needed to enjoy an outdoor seating area.',true,false,'person-13'],
    ['Music stand modification','client-7','open','Technical','2026-09-30','Adapt an existing stand so sheet music can be positioned within comfortable reach.',false,false,'person-3'],
    ['Tablet mounting bracket','client-8','open','Technical','2026-10-02','A removable tablet mount for a home workstation, with adjustable viewing angle.',false,false,'person-13'],
    ['Lightweight book holder','client-3','closed','Technical','2026-09-12','A portable holder designed for reading at a table.',true,true,'person-12'],
    ['Desk positioning review','client-6','open','Assessment','2026-10-05','Discuss and assess a comfortable arrangement for everyday desk activities.',false,false,'person-13'],
    ['Craft material organiser','client-8','closed','Technical','2026-09-10','An accessible arrangement for storing and selecting small craft materials.',true,false,'person-12']
  ];
  const projects = definitions.map((d,i) => ({id:'project-'+(i+1),reference:'2026-'+(181+i),clientId:d[1],title:d[0],status:d[2],kind:d[3],dueDate:d[4],openedAt:'2026-09-'+String(1+i).padStart(2,'0'),summary:d[5],feedbackRequired:d[6],invoiceRequired:d[7],version:1}));
  const relationships = definitions.map((d,i) => ({projectId:'project-'+(i+1),type:'person',id:d[8],role:'Technician'}));
  relationships.push(
    {projectId:'project-1',type:'person',id:'person-4',role:'Carer'},
    {projectId:'project-1',type:'person',id:'person-5',role:'Allied-health contact'},
    {projectId:'project-1',type:'organisation',id:'org-1',role:'Funder'},
    {projectId:'project-3',type:'organisation',id:'org-1',role:'Funder'},
    {projectId:'project-4',type:'person',id:'person-15',role:'Allied-health contact'},
    {projectId:'project-7',type:'person',id:'person-14',role:'Carer'},
    {projectId:'project-9',type:'organisation',id:'org-3',role:'Funder'}
  );
  return {people,clients,projects,relationships,audit:[],organisations:[
    {id:'org-1',name:'Westhaven Community Foundation',role:'Funder',description:'Community support for individually adapted equipment.'},
    {id:'org-2',name:'Harbour Allied Health',role:'Allied-health organisation',description:'Assessment and allied-health referral coordination.'},
    {id:'org-3',name:'Southern Access Network',role:'Funder',description:'Support for practical accessibility projects.'}
  ]};
}
