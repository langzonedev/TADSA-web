export const emptyFinanceStatus = Object.freeze({
  invoiceSentOn: '', invoiceNumber: '',
  reimbursedOn: '', paymentNumber: '',
  paidInFull: null, paidStatusOn: ''
});

const fail = message => { throw Object.assign(new Error(message), {status: 422}); };

export function validateFinanceStatus(details, now = new Date()) {
  const keys = Object.keys(emptyFinanceStatus);
  if (!details || typeof details !== 'object' || Array.isArray(details) ||
      Object.keys(details).length !== keys.length || !keys.every(key => Object.hasOwn(details, key))) {
    fail('Supply the invoice, reimbursement and paid-in-full fields.');
  }
  const today = new Intl.DateTimeFormat('en-CA', {timeZone: 'Australia/Adelaide'}).format(now);
  const result = {...details};
  for (const key of ['invoiceSentOn', 'reimbursedOn', 'paidStatusOn']) {
    const date = result[key];
    if (date === '') continue;
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        date < '1900-01-01' || date > today || !Number.isFinite(Date.parse(date)) ||
        new Date(date).toISOString().slice(0, 10) !== date) {
      fail('Enter a valid finance event date on or before today.');
    }
  }
  for (const key of ['invoiceNumber', 'paymentNumber']) {
    const reference = result[key];
    if (typeof reference !== 'string' || reference.length > 120 || /[\u0000-\u001f\u007f]/.test(reference)) {
      fail('Use an invoice or payment number of up to 120 characters without line breaks.');
    }
    result[key] = reference.trim();
  }
  if (Boolean(result.invoiceNumber) !== Boolean(result.invoiceSentOn)) fail('Record both the invoice sent date and the invoice number.');
  if (Boolean(result.paymentNumber) !== Boolean(result.reimbursedOn)) fail('Record both the reimbursement date and the payment number.');
  if (![null, true, false].includes(result.paidInFull) || (result.paidInFull !== null) !== Boolean(result.paidStatusOn)) {
    fail('Record Yes or No and a date together for Invoice paid in full.');
  }
  return result;
}

export function financeStatusCommand(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail('Supply a finance status record.');
  const {requestId, version, ...details} = input;
  if (typeof requestId !== 'string' || !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(requestId) ||
      !Number.isSafeInteger(version) || version < 1) fail('Supply a request identifier and the current project version.');
  return validateFinanceStatus(details);
}
