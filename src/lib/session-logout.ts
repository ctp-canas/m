type StoragePort=Pick<Storage,'getItem'|'setItem'|'removeItem'>;

export function authStorageKey(url:string){
  return `sb-${new URL(url).hostname.split('.')[0]}-auth-token`;
}

// A late refresh must not restore credentials after an explicit sign-out.
export function createSessionStorage(key:string,backing:()=>StoragePort){
  let blocked=false;
  const fallback=new Map<string,string>();
  const storage={
    getItem(name:string){
      if(blocked)return null;
      try{return backing().getItem(name)}catch{return fallback.get(name)??null}
    },
    setItem(name:string,value:string){
      if(blocked)return;
      try{backing().setItem(name,value)}catch{fallback.set(name,value)}
    },
    removeItem(name:string){
      fallback.delete(name);
      try{backing().removeItem(name)}catch{/* Storage can be unavailable in private browsing. */}
    },
  };
  return {...storage,forget(){
    blocked=true;
    [key,`${key}-code-verifier`,`${key}-user`].forEach(storage.removeItem);
    fallback.clear();
  }};
}

type LogoutAuth={signOut:(options:{scope:'local'})=>Promise<unknown>};
export async function finishSessionLogout(auth:LogoutAuth,forget:()=>void,returnToLogin:()=>void,timeout=4000){
  let timer:ReturnType<typeof setTimeout>|undefined;
  try{
    await Promise.race([
      Promise.resolve().then(()=>auth.signOut({scope:'local'})).catch(()=>undefined),
      new Promise<void>(resolve=>{timer=setTimeout(resolve,timeout)}),
    ]);
  }finally{
    clearTimeout(timer);
    forget();
    returnToLogin();
  }
}
