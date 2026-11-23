export const artworkSlots=['header','footer'] as const;
export type ArtworkSlot=typeof artworkSlots[number];
export type ArtworkMode='default'|'hidden'|'custom';
export type LocalArtworkChoice={mode:'default'|'hidden'}|{mode:'custom';dataUrl:string};
export type LocalReportArtwork=Partial<Record<ArtworkSlot,LocalArtworkChoice>>;
export const artworkLabels={header:'Imagen de encabezado',footer:'Imagen de pie de página'};
export const artworkFiles={header:'encabezado.png',footer:'pie.png'};
export const maxArtworkBytes=2*1024*1024;

export function artworkMime(bytes:Uint8Array){
  const png=[137,80,78,71,13,10,26,10];
  if(bytes.length>=24&&png.every((byte,i)=>bytes[i]===byte))return 'image/png';
  if(bytes.length>=4&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  throw Error('Seleccione una imagen PNG o JPEG válida.');
}

export async function validateArtworkFile(file:File){
  if(!file.size||file.size>maxArtworkBytes)throw Error('La imagen debe pesar entre 1 byte y 2 MB.');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const mime=artworkMime(bytes);
  if(file.type&&file.type!==mime)throw Error('El tipo del archivo no coincide con su contenido.');
  let bitmap:ImageBitmap;
  try{bitmap=await createImageBitmap(file)}
  catch{throw Error('El navegador no pudo abrir la imagen seleccionada.')}
  try{
    if(!bitmap.width||!bitmap.height||bitmap.width>4096||bitmap.height>4096){
      throw Error('La imagen debe medir como máximo 4096 × 4096 píxeles.');
    }
  }finally{bitmap.close()}
  return mime;
}

export function fileAsDataUrl(file:File,mime:string){
  return new Promise<string>((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(String(reader.result).replace(/^data:[^;]*;/,`data:${mime};`));
    reader.onerror=()=>reject(Error('No se pudo leer la imagen.'));
    reader.readAsDataURL(file);
  });
}
export function localArtworkBytes(dataUrl:string){
  const content=/^data:image\/(?:png|jpeg);base64,([a-z0-9+/=]+)$/i.exec(dataUrl);
  if(!content||content[1].length>Math.ceil(maxArtworkBytes/3)*4)throw Error('La imagen institucional guardada no es válida.');
  const bytes=Uint8Array.from(atob(content[1]),value=>value.charCodeAt(0));
  if(bytes.length>maxArtworkBytes)throw Error('La imagen institucional guardada supera 2 MB.');
  artworkMime(bytes);
  return bytes;
}
