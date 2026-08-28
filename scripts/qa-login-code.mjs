export const qaLoginCode = process.env.DEV_QA_LOGIN_CODE || '481927';

if (!/^\d{6}$/.test(qaLoginCode)) {
  throw new Error('DEV_QA_LOGIN_CODE must contain exactly six digits');
}
