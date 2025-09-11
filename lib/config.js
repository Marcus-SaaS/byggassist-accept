export const getBaseUrl = () => {
  return process.env.UPSTREAM_BASE || 'https://preview--bygg-assist-78c09474.base44.app';
};

export const isValidToken = (token) => {
  return typeof token === 'string' && 
         token.length > 10 && 
         token.startsWith('quote_') &&
         /^quote_[a-zA-Z0-9_-]+$/.test(token);
};
