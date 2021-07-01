// Escape some chars to allow insertion into CSS `url()`.
export const apiGetPath = (apiName: string, input: object) =>
  `/${apiName}?${encodeURIComponent(JSON.stringify(input)).replace(
    /[(')]/g,
    (paren) => "%" + paren.charCodeAt(0).toString(16)
  )}`;
