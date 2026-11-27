export function validAttachmentName(name){
  return typeof name==='string'&&Boolean(name.trim())&&name.length<=180&&
    !/[\\/<>:"|?*\u0000-\u001f\u007f]/.test(name)&&!/[. ]$/.test(name)&&!name.startsWith('.');
}
