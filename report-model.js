const f=(key,label,type='text',options)=>({key,label,type,...(options?{options}: {})});
export const REPORT_DATASETS={
 organisations:{label:'Organisations',fields:[f('name','Organisation'),f('category','Category'),f('email','Email'),f('role','Organisation type'),f('description','Description')],defaultColumns:['name','category','email']},
 people:{label:'People',fields:[f('name','Name'),f('roles','Active role','role',['Client','Technician','Occupational therapist','Carer','Funder','Referrer','Administrator','Allied-health contact']),f('email','Email'),f('phone','Phone')],defaultColumns:['name','roles','email','phone']},
 projects:{label:'Projects',fields:[f('reference','Project number'),f('title','Project'),f('status','Status','text',['open','review','closed']),f('clientName','Client'),f('hoursWorked','Recorded hours','number'),f('hoursRemaining','Estimated hours remaining','number'),f('quoteTotal','Latest quote total ($)','number'),f('invoicedTotal','Total invoiced ($)','number')],defaultColumns:['reference','title','status','clientName','hoursWorked','quoteTotal']}
};
const op=(value,label)=>({value,label});
export const REPORT_OPERATORS={text:[op('eq','is'),op('ne','is not'),op('contains','contains'),op('is_empty','is blank'),op('is_not_empty','is not blank')],role:[op('eq','includes'),op('ne','does not include'),op('is_empty','is blank'),op('is_not_empty','is not blank')],number:[op('eq','equals'),op('ne','does not equal'),op('lt','is less than'),op('lte','is at most'),op('gt','is greater than'),op('gte','is at least'),op('is_empty','is blank'),op('is_not_empty','is not blank')]};
export const REPORT_PRESETS=[
 {label:'Government organisation emails',query:{dataset:'organisations',filters:[{field:'category',operator:'eq',value:'Government'}],columns:['name','category','email']}},
 {label:'Occupational therapists',query:{dataset:'people',filters:[{field:'roles',operator:'eq',value:'Occupational therapist'}],columns:['name','email','phone']}},
 {label:'Projects under 20 recorded hours',query:{dataset:'projects',filters:[{field:'hoursWorked',operator:'lt',value:20}],columns:['reference','title','status','hoursWorked']}},
 {label:'Projects quoted under $200',query:{dataset:'projects',filters:[{field:'quoteTotal',operator:'lt',value:200}],columns:['reference','title','status','quoteTotal']}}
];
function fail(message){const e=new Error(message);e.status=422;throw e;}
export function validateReportQuery(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['dataset','filters','columns','sort','offset','limit'].includes(k)))fail('Use the report fields provided.');
 const spec=Object.hasOwn(REPORT_DATASETS,input.dataset)?REPORT_DATASETS[input.dataset]:null;if(!spec)fail('Choose a report source.');
 const filters=input.filters??[],columns=input.columns??spec.defaultColumns,offset=input.offset??0,limit=input.limit??50,sort=input.sort??{field:spec.fields[0].key,direction:'asc'};
 if(!Array.isArray(columns)||!columns.length||columns.length>12||new Set(columns).size!==columns.length||columns.some(k=>!spec.fields.some(f=>f.key===k)))fail('Choose up to twelve available columns.');
 if(!Array.isArray(filters)||filters.length>8)fail('Use up to eight filters.');
 if(!Number.isSafeInteger(offset)||offset<0||offset>=10000||!Number.isSafeInteger(limit)||limit<1||limit>100||offset+limit>10000)fail('Use pages of up to 100 records within the first 10,000 results.');
 if(!sort||typeof sort!=='object'||Object.keys(sort).some(k=>!['field','direction'].includes(k))||!spec.fields.some(f=>f.key===sort.field)||!['asc','desc'].includes(sort.direction))fail('Choose an available sort column.');
 const checked=filters.map(filter=>{if(!filter||typeof filter!=='object'||Object.keys(filter).some(k=>!['field','operator','value'].includes(k)))fail('Use the available filter controls.');const field=spec.fields.find(f=>f.key===filter.field);if(!field||!REPORT_OPERATORS[field.type].some(o=>o.value===filter.operator))fail('Choose an available filter and comparison.');if(['is_empty','is_not_empty'].includes(filter.operator))return {field:field.key,operator:filter.operator};let value=filter.value;if(field.type==='number'){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1000000000)fail('Enter a valid number.');}else{if(typeof value!=='string'||!value.trim()||value.length>200||/[\x00-\x1f\x7f]/.test(value))fail('Enter filter text of up to 200 characters.');value=value.trim();if(field.type==='role'&&!field.options.includes(value))fail('Choose an available role.');}return {field:field.key,operator:filter.operator,value};});
 return {dataset:input.dataset,filters:checked,columns:[...columns],sort:{...sort},offset,limit};
}
const empty=v=>v===null||v===undefined||v===''||Array.isArray(v)&&!v.length;
export function applyReportQuery(rows,input){
 const q=validateReportQuery(input);if(rows.length>10000)fail('This device report is limited to 10,000 source records.');
 const matched=rows.filter(row=>q.filters.every(f=>{const v=row[f.field];if(f.operator==='is_empty')return empty(v);if(f.operator==='is_not_empty')return !empty(v);if(empty(v))return false;const a=typeof v==='string'?v.toLowerCase():v,b=typeof f.value==='string'?f.value.toLowerCase():f.value;if(Array.isArray(v)){const found=v.some(x=>x.toLowerCase()===b);return f.operator==='eq'?found:!found;}return ({eq:()=>a===b,ne:()=>a!==b,contains:()=>a.includes(b),lt:()=>a<b,lte:()=>a<=b,gt:()=>a>b,gte:()=>a>=b}[f.operator])();}));
 const value=r=>{const v=r[q.sort.field];return Array.isArray(v)?v.join(', '):typeof v==='string'?v.toLowerCase():v;};matched.sort((a,b)=>{const x=value(a),y=value(b);if(empty(x)!==empty(y))return empty(x)?1:-1;return (x<y?-1:x>y?1:0)*(q.sort.direction==='desc'?-1:1)||String(a.id).localeCompare(String(b.id));});
 return {columns:q.columns,rows:matched.slice(q.offset,q.offset+q.limit).map(r=>Object.fromEntries(['id',...q.columns].map(k=>[k,r[k]??null]))),offset:q.offset,limit:q.limit,hasMore:matched.length>q.offset+q.limit&&q.offset+q.limit<10000};
}
