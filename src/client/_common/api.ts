export const apiGetPath = (apiName: string, input: object) =>
  `/${apiName}?${encodeURIComponent(JSON.stringify(input))}`;
