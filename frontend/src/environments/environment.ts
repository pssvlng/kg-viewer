export const environment = {
  production: false,
  // Empty string = relative URLs (/api/...) — works in both environments:
  //   • Production: nginx reverse proxy routes /api/ to the backend container
  //   • Development: Angular dev server proxies /api/ via proxy.conf.json
  apiUrl: ''
};
