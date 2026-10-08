import {validateLifecycleState} from './lifecycle-validation.js';
import {fail} from './device-model.mjs';
export function validateLifecycleBackup(state){try{return validateLifecycleState(state);}catch(error){fail(error.message);}}
