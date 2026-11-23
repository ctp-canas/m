export function cors(request:Request){
  const accepted=(Deno.env.get('APP_ORIGINS')||'https://ctp-canas.github.io,http://127.0.0.1:4173,http://localhost:5173')
    .split(',').map(value=>value.trim());
  const origin=request.headers.get('origin')||'';
  return {
    allowed:!origin||accepted.includes(origin),
    headers:{
      'Access-Control-Allow-Origin':accepted.includes(origin)?origin:accepted[0],
      'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods':'POST, OPTIONS',
      'Content-Type':'application/json',
      'Cache-Control':'no-store',
      'Vary':'Origin',
    },
  };
}
