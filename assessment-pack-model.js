export const assessmentDocx='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const hasFields=(value,fields)=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).length===fields.length&&fields.every(key=>Object.hasOwn(value,key));
const generatedFile=value=>hasFields(value,['name','mime','dataBase64'])&&value.mime===assessmentDocx;

export function validateAssessmentPack(input){
 const fail=message=>{throw Object.assign(Error(message),{status:422});};
 if(!hasFields(input,['requestId','version','instructions','reportTemplateRevision','requestFile','reportFile'])||
    !Number.isSafeInteger(input.version)||input.version<1||!Number.isSafeInteger(input.reportTemplateRevision)||input.reportTemplateRevision<0)
  fail('Supply the current project and assessment report template versions.');
 if(typeof input.instructions!=='string'||!input.instructions.trim()||input.instructions.length>2000)
  fail('Enter assessment instructions of up to 2,000 characters.');
 if(!generatedFile(input.requestFile))fail('Save the assessment request as a Word document.');
 if(input.reportTemplateRevision===0&&!generatedFile(input.reportFile))fail('Include the editable assessment report form.');
 if(input.reportTemplateRevision>0&&input.reportFile!==null)fail('Use the saved office report template for the selected revision.');
}
